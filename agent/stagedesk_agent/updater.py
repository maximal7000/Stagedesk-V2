"""apt updates inside the update window and the daily reboot, both guarded by the server's gate."""
import json
import logging
import re
import threading
import time
from datetime import datetime, timezone

log = logging.getLogger("stagedesk_agent.updater")
TOTAL_LIMIT = 60 * 60
GATE_TIMEOUT = 30
UPDATE_CMD = ("apt-get", "update")
UPGRADE_CMD = ("env", "DEBIAN_FRONTEND=noninteractive", "LANG=C", "apt-get", "-y",
               "-o", "Dpkg::Options::=--force-confold", "full-upgrade")
_COUNT = re.compile(r"(\d+) upgraded, (\d+) newly installed")
NO_ANSWER = "Keine Antwort vom Server"


class Updater:
    def __init__(self, paths, runner, send, gate_timeout=GATE_TIMEOUT, clock=time.monotonic):
        self.paths, self.runner, self.send = paths, runner, send
        self.gate_timeout, self.clock = gate_timeout, clock
        self._lock = threading.Lock()  # one update at a time
        self._gate_lock = threading.Lock()
        self._gate_event = None
        self._gate_reply = None

    # gate: request/response over the agent's connection; on_gate is called from the reader thread

    def on_gate(self, message):
        event = self._gate_event
        if event is not None and not event.is_set():
            self._gate_reply = (bool(message.get("allowed")), str(message.get("reason") or ""))
            event.set()

    def gate(self):
        """(allowed, reason). No answer or no connection means not allowed."""
        with self._gate_lock:
            event = self._gate_event = threading.Event()
            self._gate_reply = None
            if not self.send({"type": "update_gate_request"}):
                return False, "Keine Verbindung zum Server"
            if not event.wait(self.gate_timeout) or self._gate_reply is None:
                return False, NO_ANSWER
            return self._gate_reply

    # update

    def run(self, manual=False):
        if not self._lock.acquire(blocking=False):
            text = "Ein Update läuft bereits"
            return {"ok": False, "text": text} if manual else {"skipped": text}
        try:
            if not manual:
                allowed, reason = self.gate()
                if not allowed:
                    return {"skipped": reason or "Update gesperrt"}
            return self._apply(manual)
        finally:
            self._lock.release()

    def _apt(self, args, deadline):
        remaining = deadline - self.clock()
        if remaining <= 0:
            return None
        return self.runner.run(list(args), timeout=remaining)

    def _apply(self, manual):
        deadline = self.clock() + TOTAL_LIMIT
        packages, error = 0, None
        for args in (UPDATE_CMD, UPGRADE_CMD):
            result = self._apt(args, deadline)
            if result is None or result.code == 124:
                error = "Zeitlimit von 60 Minuten überschritten, Paketquellen und Netz prüfen"
            elif result.code != 0:
                error = (result.err or result.out).strip()[-300:] or f"apt-get endete mit Code {result.code}"
            elif args is UPGRADE_CMD:
                match = _COUNT.search(result.out)
                packages = int(match.group(1)) + int(match.group(2)) if match else 0
            if error:
                break
        needs_reboot = error is None and self.paths.reboot_required.exists()
        reboot = False
        if needs_reboot and not manual:
            reboot, _ = self.gate()
        now = datetime.now(timezone.utc).isoformat()
        self._write_state(now, error)
        self.send({"type": "update_result", "at": now, "packages": packages, "rebooted": reboot, "error": error})
        if reboot:
            self.runner.run(["systemctl", "reboot"], timeout=30)
        if error:
            return {"ok": False, "text": f"Update fehlgeschlagen: {error}"}
        text = f"Update abgeschlossen: {packages} Pakete"
        if needs_reboot and not reboot:
            text += ". Neustart nötig"
        return {"ok": True, "text": text, "packages": packages, "rebooted": reboot}

    def _write_state(self, now, error):
        state = {"last_at": now, "last_ok": error is None, "last_error": error, "pending_packages": 0}
        try:
            self.paths.state_dir.mkdir(parents=True, exist_ok=True)
            self.paths.update_state.write_text(json.dumps(state), encoding="utf-8")
        except OSError:
            log.exception("update state could not be written")

    def daily_reboot(self):
        allowed, reason = self.gate()
        if not allowed:
            return {"skipped": reason or "Neustart gesperrt"}
        self.runner.run(["systemctl", "reboot"], timeout=30)
        return {"rebooted": True}
