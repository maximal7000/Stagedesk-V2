import datetime
import json
import logging
import os
import stat
import threading
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Callable

from .power import KIOSK_USER, METHODS, wayland_command
from .power_probe import probe

log = logging.getLogger("stagedesk_agent.commands")
MAX_SCREENSHOT = 15 * 1024 * 1024
SCREENSHOT_NAME = "sd-shot.png"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
LOCAL_URL = "http://127.0.0.1:8765/"
DEFAULT_OUTPUT = "HDMI-A-1"
REBOOT_DELAY = 3
PATTERN_SECONDS = 60
POWER_TEST_SECONDS = 15
POWER_TEST_RANGE = range(5, 61)
UPLOAD_TIMEOUT = 60


class PlaceholderUpdater:
    def run(self, manual=False):
        return {"ok": False, "text": "Updates folgen mit dem nächsten Agent-Update"}


def upload_screenshot(server, token, png, opener=urllib.request.urlopen):
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"screenshot.png\"\r\n"
            "Content-Type: image/png\r\n\r\n").encode() + png + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        f"{server.rstrip('/')}/api/signage/agent/screenshot", data=body, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with opener(request, timeout=UPLOAD_TIMEOUT) as response:
            if 200 <= getattr(response, "status", 200) < 300:
                return True, "Screenshot hochgeladen"
            return False, f"Upload fehlgeschlagen (HTTP {response.status})"
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return False, "Upload abgelehnt: Token ungültig"
        if exc.code == 413:
            return False, "Upload abgelehnt: Bild größer als 15 MB"
        return False, f"Upload fehlgeschlagen (HTTP {exc.code})"
    except (urllib.error.URLError, OSError) as exc:
        return False, f"Upload fehlgeschlagen: {getattr(exc, 'reason', exc)}"


@dataclass
class CommandContext:
    config: Any
    kiosk: Any
    pages: Any
    runner: Any
    updater: Any
    apply_power: Callable[[bool], str]
    last_telemetry: Callable[[], dict]
    set_kiosk: Callable[[str], Any]
    defer: Callable[..., Any]  # defer(delay, fn, key=None): run fn after the result was sent; same key replaces
    upload: Callable = upload_screenshot
    screenshot_path: Any = None  # default: <runtime dir of pi>/sd-shot.png
    power_lock: Any = field(default_factory=threading.Lock)  # the agent's lock around all display access
    power_test: Any = None
    params: dict = field(default_factory=dict)


def _reload(ctx):
    # The server also reloads the display over its WebSocket; the agent cannot see that connection.
    # So: restart the kiosk only when it is evidently dead, otherwise report success.
    display = (ctx.last_telemetry() or {}).get("display") or {}
    if not ctx.kiosk.is_running() or display.get("browser_running") is False:
        return (True, "Browser neu gestartet") if ctx.kiosk.restart() else (False, "Browser-Neustart fehlgeschlagen (stagedesk-kiosk)")
    return True, "Neu geladen"


def _restart_browser(ctx):
    if ctx.kiosk.restart():
        return True, "Browser neu gestartet"
    return False, "Browser-Neustart fehlgeschlagen (stagedesk-kiosk)"


def _power(ctx, on):
    status = ctx.apply_power(on)
    if str(status).startswith("Fehler"):
        return False, str(status)
    return True, f"Bildschirm: {status}"


def _reboot(ctx):
    def do_reboot():
        result = ctx.runner.run(["systemctl", "reboot"], timeout=30)
        if result.code != 0:
            log.error("reboot failed: %s", (result.err or result.out).strip())
    ctx.defer(REBOOT_DELAY, do_reboot)
    return True, f"Pi startet in {REBOOT_DELAY} Sekunden neu"


def _update_now(ctx):
    try:
        result = ctx.updater.run(manual=True)
    except Exception as exc:
        log.exception("manual update failed")
        return False, f"Update fehlgeschlagen: {exc}"
    return bool(result.get("ok")), str(result.get("text") or "")


def _output(config):
    power_config = config.power_config if isinstance(config.power_config, dict) else {}
    return str(power_config.get("output") or DEFAULT_OUTPUT)


def _read_screenshot(path):
    """pi controls the directory, so never follow links or open pipes."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError as exc:
        return None, f"Screenshot nicht lesbar: {exc.strerror or exc}"
    with os.fdopen(fd, "rb") as handle:
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
            return None, "Screenshot ist keine normale Datei und wurde nicht hochgeladen"
        data = handle.read(MAX_SCREENSHOT + 1)
    if len(data) > MAX_SCREENSHOT:
        return None, "Screenshot ist größer als 15 MB und wurde nicht hochgeladen"
    if not data.startswith(PNG_MAGIC):
        return None, "Screenshot ist kein PNG und wurde nicht hochgeladen"
    return data, None


def _screenshot(ctx):
    path = Path(ctx.screenshot_path or ctx.config.paths.runtime_dir / SCREENSHOT_NAME)
    path.unlink(missing_ok=True)
    try:
        args = wayland_command(["grim", "-o", _output(ctx.config), str(path)], ctx.config.paths.root)
        result = ctx.runner.run(args, timeout=30, user=KIOSK_USER)
        if result.code != 0:
            return False, f"grim fehlgeschlagen: {(result.err or result.out).strip() or result.code}"
        png, error = _read_screenshot(path)
        if error:
            return False, error
        return ctx.upload(ctx.config.server, ctx.config.token, png)
    finally:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


def _test_pattern(ctx):
    display = (ctx.last_telemetry() or {}).get("display") or {}
    ctx.pages.show_test_pattern(ctx.config.slug or "Bildschirm", display.get("resolution") or "Auflösung unbekannt",
                                PATTERN_SECONDS)
    ctx.set_kiosk(LOCAL_URL)

    def back():
        if ctx.config.kiosk_url:
            ctx.set_kiosk(ctx.config.kiosk_url)
        else:
            ctx.pages.show_none()  # no real URL yet: stay on the (now empty) local status page
    ctx.defer(PATTERN_SECONDS, back, key="test_pattern")
    return True, f"Testbild für {PATTERN_SECONDS} Sekunden"


def _power_probe(ctx):
    power_config = ctx.config.power_config if isinstance(ctx.config.power_config, dict) else {}
    with ctx.power_lock:
        result = probe(ctx.runner, power_config, root=ctx.config.paths.root)
    result["checked_at"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    return True, json.dumps(result, ensure_ascii=False)


def _power_test(ctx):
    method = ctx.params.get("method")
    config = ctx.params.get("config")
    config = {} if config is None else config
    seconds = ctx.params.get("seconds", POWER_TEST_SECONDS)
    if (method not in METHODS or not isinstance(config, dict) or type(seconds) is not int
            or seconds not in POWER_TEST_RANGE):
        return False, "Ungültige Testparameter"
    return ctx.power_test.start(method, config, seconds)


def _power_test_end(ctx):
    return ctx.power_test.end()


HANDLERS = {
    "reload": _reload,
    "restart_browser": _restart_browser,
    "power_on": lambda ctx: _power(ctx, True),
    "power_off": lambda ctx: _power(ctx, False),
    "reboot": _reboot,
    "update_now": _update_now,
    "screenshot": _screenshot,
    "test_pattern": _test_pattern,
    "power_probe": _power_probe,
    "power_test": _power_test,
    "power_test_end": _power_test_end,
}


def execute(cmd, ctx):
    handler = HANDLERS.get(cmd.get("kind"))
    if handler is None:
        return False, "Unbekannter Befehl"
    try:
        params = cmd.get("params")
        return handler(replace(ctx, params=params if isinstance(params, dict) else {}))
    except Exception as exc:
        log.exception("command %s failed", cmd.get("kind"))
        return False, f"Fehler: {exc}"
