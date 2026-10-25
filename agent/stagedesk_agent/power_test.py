import json
import logging
import threading
from datetime import datetime

log = logging.getLogger("stagedesk_agent.power_test")
TIMER_KEY = "power_test"


class PowerTest:
    """Switches the display off with the method under test and back on with the same method after N seconds.

    `power_lock` is the agent's (non-reentrant) lock that serializes all display access; it is held only
    while switching, never while calling `defer` or `on_finished`."""

    def __init__(self, power_factory, runner, defer, on_finished, power_lock=None):
        self.power_factory = power_factory
        self.runner = runner
        self.defer = defer
        self.on_finished = on_finished
        self.power_lock = power_lock or threading.Lock()
        self._lock = threading.Lock()
        self._controller = None
        self._token = None

    @property
    def active(self):
        with self._lock:
            return self._controller is not None

    def start(self, method, config, seconds):
        with self._lock:
            if self._controller is not None:
                return False, "Es läuft schon ein Test."
            try:
                controller = self.power_factory(method, config, self.runner)
            except Exception as exc:
                return False, str(exc)
            try:
                with self.power_lock:
                    status = controller.set(False)
            except Exception as exc:
                status = exc
            if isinstance(status, Exception) or str(status).startswith("Fehler"):
                controller.stop()
                return False, str(status)
            self._controller = controller
            token = self._token = object()
            off_at = datetime.now().astimezone().isoformat(timespec="seconds")
        self.defer(seconds, lambda: self._finish(token), key=TIMER_KEY)
        return True, json.dumps({"off_at": off_at, "seconds": seconds})

    def end(self):
        with self._lock:
            if self._controller is None:
                return True, "Kein Test aktiv"
            token = self._token
        self.defer(0, lambda: self._finish(token), key=TIMER_KEY)
        return True, "Bildschirm wird eingeschaltet"

    def _finish(self, token):
        with self._lock:
            # A timer of an earlier test may still fire after its replacement was scheduled.
            if self._controller is None or token is not self._token:
                return
            controller, self._controller, self._token = self._controller, None, None
            try:
                with self.power_lock:
                    status = controller.set(True)
                log.info("power test finished: %s", status)
            except Exception:
                log.exception("power test: switching on failed")
            finally:
                controller.stop()
        self.on_finished()
