import json
import logging
import os
import re

log = logging.getLogger("stagedesk_agent.kiosk")
SERVICE = "stagedesk-kiosk"
# kiosk.sh hands these to wlr-randr before Chromium starts.
OUTPUT_MODE = re.compile(r"^\d{3,5}x\d{3,5}(@\d{1,3}(\.\d{1,6})?)?$")
OUTPUT_TRANSFORMS = ("normal", "90", "180", "270")
# Chromium ignores --disable-features=Translate for the bubble on German pages with an English UI;
# the policy holds.
BROWSER_POLICY = {"TranslateEnabled": False}


class Kiosk:
    def __init__(self, runner, paths):
        self.runner = runner
        self.paths = paths
        self.pending_restart = False  # a written URL whose restart failed; the next apply retries
        self.output = ("", "normal")

    def set_output(self, mode, transform):
        """Malformed values fall back to automatic; the next apply writes them."""
        mode = mode if isinstance(mode, str) and OUTPUT_MODE.match(mode) else ""
        transform = transform if transform in OUTPUT_TRANSFORMS else "normal"
        self.output = (mode, transform)

    def ensure_browser_policy(self):
        """Return True when the policy file was written; Chromium reads it at its next start."""
        target = self.paths.browser_policy
        content = json.dumps(BROWSER_POLICY, indent=2) + "\n"
        try:
            if target.read_text(encoding="utf-8") == content:
                return False
        except OSError:
            pass
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(target.name + ".tmp")
        tmp.write_text(content, encoding="utf-8")
        os.chmod(tmp, 0o644)
        os.replace(tmp, target)
        return True

    def _current(self):
        try:
            return self.paths.kiosk_env.read_text(encoding="utf-8")
        except OSError:
            return None

    def apply(self, url):
        """Return False when URL and output are unchanged and no restart is pending."""
        if "\n" in url or "\r" in url:
            raise ValueError("Kiosk-URL enthält einen Zeilenumbruch")
        mode, transform = self.output
        content = f"KIOSK_URL={url}\n"
        if mode:
            content += f"OUTPUT_MODE={mode}\n"
        if transform != "normal":
            content += f"OUTPUT_TRANSFORM={transform}\n"
        if self._current() == content and not self.pending_restart:
            return False
        if self._current() != content:
            self._write(content)
        return self.restart()

    def _write(self, content):
        target = self.paths.kiosk_env
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(target.name + ".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.chmod(tmp, 0o600)
        os.replace(tmp, target)

    def restart(self):
        result = self.runner.run(["systemctl", "restart", SERVICE], timeout=30)
        self.pending_restart = result.code != 0
        if result.code != 0:
            log.warning("kiosk restart failed: %s", (result.err or result.out).strip())
        return result.code == 0

    def is_running(self):
        result = self.runner.run(["systemctl", "is-active", SERVICE], timeout=10)
        return result.code == 0 and result.out.strip() == "active"
