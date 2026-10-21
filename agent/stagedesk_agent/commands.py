"""Server commands: execute one and return (ok, text). The caller sends the command_result."""
import logging
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .power import KIOSK_USER, wayland_command

log = logging.getLogger("stagedesk_agent.commands")
MAX_SCREENSHOT = 15 * 1024 * 1024
SCREENSHOT_PATH = Path("/tmp/sd-shot.png")
LOCAL_URL = "http://127.0.0.1:8765/"
DEFAULT_OUTPUT = "HDMI-A-1"
REBOOT_DELAY = 3
PATTERN_SECONDS = 60
UPLOAD_TIMEOUT = 60


class PlaceholderUpdater:
    """Stands in until the real updater is wired in."""

    def run(self, manual=False):
        return {"ok": False, "text": "Updates folgen mit dem nächsten Agent-Update"}


def upload_screenshot(server, token, png, opener=urllib.request.urlopen):
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"screenshot.png\"\r\n"
            "Content-Type: image/png\r\n\r\n").encode() + png + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        f"{server.rstrip('/')}/api/monitor/agent/screenshot", data=body, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with opener(request, timeout=UPLOAD_TIMEOUT) as response:
            if 200 <= getattr(response, "status", 200) < 300:
                return True, "Screenshot hochgeladen"
            return False, f"Upload fehlgeschlagen (HTTP {response.status})"
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return False, "Upload abgelehnt: Token ungültig, Gerät neu koppeln"
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
    defer: Callable[[float, Callable], Any]  # run fn after the result was sent
    upload: Callable = upload_screenshot
    screenshot_path: Path = field(default=SCREENSHOT_PATH)


def _reload(ctx):
    # The server also reloads the display over its WebSocket; the agent cannot see that connection.
    # So: restart the kiosk only when it is evidently dead, otherwise report success.
    display = (ctx.last_telemetry() or {}).get("display") or {}
    if not ctx.kiosk.is_running() or display.get("browser_running") is False:
        return (True, "Browser neu gestartet") if ctx.kiosk.restart() else (False, "Browser-Neustart fehlgeschlagen, Dienst stagedesk-kiosk prüfen")
    return True, "Neu geladen"


def _restart_browser(ctx):
    if ctx.kiosk.restart():
        return True, "Browser neu gestartet"
    return False, "Browser-Neustart fehlgeschlagen, Dienst stagedesk-kiosk prüfen"


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


def _screenshot(ctx):
    path = ctx.screenshot_path
    path.unlink(missing_ok=True)
    try:
        args = wayland_command(["grim", "-o", _output(ctx.config), str(path)], ctx.config.paths.root)
        result = ctx.runner.run(args, timeout=30, user=KIOSK_USER)
        if result.code != 0:
            return False, f"grim fehlgeschlagen: {(result.err or result.out).strip() or result.code}"
        try:
            size = path.stat().st_size
            if size > MAX_SCREENSHOT:
                return False, "Screenshot ist größer als 15 MB und wurde nicht hochgeladen"
            png = path.read_bytes()
        except OSError as exc:
            return False, f"Screenshot nicht lesbar: {exc}"
        return ctx.upload(ctx.config.server, ctx.config.token, png)
    finally:
        path.unlink(missing_ok=True)


def _test_pattern(ctx):
    display = (ctx.last_telemetry() or {}).get("display") or {}
    ctx.pages.show_test_pattern(ctx.config.slug or "Bildschirm", display.get("resolution") or "Auflösung unbekannt",
                                PATTERN_SECONDS)
    ctx.set_kiosk(LOCAL_URL)
    ctx.defer(PATTERN_SECONDS, lambda: ctx.config.kiosk_url and ctx.set_kiosk(ctx.config.kiosk_url))
    return True, f"Testbild für {PATTERN_SECONDS} Sekunden"


HANDLERS = {
    "reload": _reload,
    "restart_browser": _restart_browser,
    "power_on": lambda ctx: _power(ctx, True),
    "power_off": lambda ctx: _power(ctx, False),
    "reboot": _reboot,
    "update_now": _update_now,
    "screenshot": _screenshot,
    "test_pattern": _test_pattern,
}


def execute(cmd, ctx):
    handler = HANDLERS.get(cmd.get("kind"))
    if handler is None:
        return False, "Unbekannter Befehl"
    try:
        return handler(ctx)
    except Exception as exc:
        log.exception("command %s failed", cmd.get("kind"))
        return False, f"Fehler: {exc}"
