"""Kiosk control: the URL lives in kiosk.env, stagedesk-kiosk.service (cage + Chromium as pi) shows it."""
import logging
import os

log = logging.getLogger("stagedesk_agent.kiosk")
SERVICE = "stagedesk-kiosk"


class Kiosk:
    def __init__(self, runner, paths):
        self.runner = runner
        self.paths = paths

    def _current(self):
        try:
            return self.paths.kiosk_env.read_text(encoding="utf-8")
        except OSError:
            return None

    def apply(self, url):
        """Write the URL and restart the kiosk, only when the URL changed. True when it restarted."""
        if "\n" in url or "\r" in url:
            raise ValueError("Kiosk-URL enthält einen Zeilenumbruch")
        content = f"KIOSK_URL={url}\n"
        if self._current() == content:
            return False
        target = self.paths.kiosk_env
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(target.name + ".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.chmod(tmp, 0o600)
        os.replace(tmp, target)
        self.restart()
        return True

    def restart(self):
        result = self.runner.run(["systemctl", "restart", SERVICE], timeout=30)
        if result.code != 0:
            log.warning("kiosk restart failed: %s", (result.err or result.out).strip())
        return result.code == 0

    def is_running(self):
        result = self.runner.run(["systemctl", "is-active", SERVICE], timeout=10)
        return result.code == 0 and result.out.strip() == "active"
