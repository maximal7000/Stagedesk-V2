"""Wires pairing, connection and local pages together."""
import json
import logging
import queue
import signal
import threading
from datetime import datetime, timezone
from urllib.parse import urlencode

from . import telemetry
from .config import Config
from .connection import Connection
from .local_pages import LocalPages
from .pairing import PairingClient
from .paths import Paths
from .power import make_power
from .runner import Runner
from .telemetry import read_cpu_serial, read_model

log = logging.getLogger("stagedesk_agent")
LOCAL_URL = "http://127.0.0.1:8765/"


def read_identity(paths):
    """(serial, model) of this Raspberry Pi; 'unknown' when not readable."""
    return read_cpu_serial(paths) or "unknown", read_model(paths) or "unknown"


class Agent:
    def __init__(self, config, pages, kiosk_set_url=None, pairing_factory=None, connection_factory=None,
                 runner=None, power_factory=make_power, collect=telemetry.collect, telemetry_interval=60,
                 telemetry_retry=1):
        self.config = config
        self.pages = pages
        self.kiosk_set_url = kiosk_set_url or (lambda url: None)
        self.pairing_factory = pairing_factory or self._default_pairing
        self.connection_factory = connection_factory or (
            lambda cfg, om, af: Connection(cfg, om, af, stop_event=self.stop_event))
        self.runner = runner or Runner()
        self.power_factory = power_factory
        self.collect = collect
        self.telemetry_interval = telemetry_interval
        self.telemetry_retry = telemetry_retry
        self._telemetry_wake = threading.Event()  # set by hello: send telemetry now
        self._power_queue = queue.Queue()
        self._power_worker = None
        self.state = "pairing" if not config.token else "connecting"
        self.pairing = None
        self.connection = None
        # Set from the SIGTERM handler and shared with Connection/PairingClient, so a stop request is
        # never lost between a check and the creation of the next part.
        self.stop_event = threading.Event()
        self._kiosk_url = None
        self._power = None
        self._power_key = None
        self._power_error = None
        self._power_target = None
        self._power_lock = threading.Lock()

    @property
    def _stopped(self):
        return self.stop_event.is_set()

    def _default_pairing(self, cfg):
        serial, model = read_identity(cfg.paths)
        return PairingClient(cfg, serial=serial, model=model, stop_event=self.stop_event)

    def _set_kiosk(self, url):
        if url != self._kiosk_url:
            self._kiosk_url = url
            self.kiosk_set_url(url)

    def request_stop(self):
        """Signal-safe: only sets the event (no locks, no I/O). The watcher thread does the closing."""
        self.stop_event.set()

    def start_stop_watcher(self):
        def watch():
            self.stop_event.wait()
            self.stop()
        threading.Thread(target=watch, daemon=True, name="stop-watcher").start()

    def stop(self):
        self.stop_event.set()
        for part in (self.pairing, self.connection):
            if part:
                part.stop()
        with self._power_lock:
            if self._power:
                self._power.stop()

    def send(self, msg):
        return bool(self.connection and self.connection.send(msg))

    # power

    def _power_controller(self, target=None):
        """Controller for the last applied (method, config); rebuilt when it changes. Hold _power_lock.

        `target` comes from a hello job, so queued commands see the config of their time, not a later one."""
        if target is not None:
            self._power_target = target
        elif self._power_target is None:
            self._power_target = (self.config.power_method, self.config.power_config)
        method, config = self._power_target
        key = (method, json.dumps(config, sort_keys=True, default=str))
        if key != self._power_key:
            if self._power:
                self._power.stop()
            self._power, self._power_error = None, None
            try:
                self._power = self.power_factory(method, config or {}, self.runner)
            except Exception as exc:
                log.warning("power setup failed: %s", exc)
                self._power_error = f"Fehler: {exc}"
            self._power_key = key
        return self._power

    def _power_status(self):
        with self._power_lock:
            controller = self._power_controller()
            return controller.status() if controller else self._power_error

    def _apply_power(self, on):
        with self._power_lock:
            controller = self._power_controller()
            if controller is None:
                return self._power_error
            current = controller.status()
            if (on and current == "an") or (not on and current in ("standby", "aus")):
                return current  # already in the wanted state
            return controller.set(on)

    def _enqueue_power(self, job):
        """Power work runs on one worker thread (in order), so the reader keeps answering pings."""
        if self._power_worker is None:
            self._power_worker = threading.Thread(target=self._power_loop, daemon=True, name="power")
            self._power_worker.start()
        self._power_queue.put(job)

    def _power_loop(self):
        while True:
            job = self._power_queue.get()
            try:
                job()
            except Exception:
                log.exception("power job failed")

    def _rebuild_power(self, target):
        with self._power_lock:
            self._power_controller(target)

    def _on_power_command(self, message):
        status = self._apply_power(bool(message.get("power", True)))
        self.send({"type": "power_status", "status": status})

    # telemetry

    def _send_telemetry(self):
        status = self._power_status()
        data = self.collect(self.runner, self.config.paths, datetime.now(timezone.utc), power_status=status)
        sent = self.send({"type": "telemetry", **data})
        self.send({"type": "power_status", "status": status})
        return sent

    def _telemetry_loop(self, ended):
        while not ended.is_set() and not self.stop_event.is_set():
            wait = self.telemetry_interval
            try:
                if not self._send_telemetry():
                    wait = self.telemetry_retry  # no transport yet (or just lost): try again soon
            except Exception:
                log.exception("telemetry failed")
            if self._telemetry_wake.wait(wait):  # hello: the server is ready, send right away
                self._telemetry_wake.clear()
                continue
            # waiting is cut short when the connection ends
            if ended.is_set():
                break

    def on_message(self, message):
        kind = message.get("type")
        if kind == "hello":
            self.config.apply_hello(message)
            if self.config.kiosk_url:
                self._set_kiosk(self.config.kiosk_url)
            target = (self.config.power_method, json.loads(json.dumps(self.config.power_config, default=str)))
            self._enqueue_power(lambda: self._rebuild_power(target))
            self._telemetry_wake.set()
        elif kind == "power_command":
            self._enqueue_power(lambda: self._on_power_command(message))

    def on_auth_failed(self):
        log.warning("token rejected, starting pairing again")
        self.state = "pairing"

    def run_once(self):
        """One phase: pairing if there is no token, otherwise the connection until it ends."""
        if self._stopped:
            return
        if not self.config.token:
            self.state = "pairing"
            self._set_kiosk(LOCAL_URL)
            self.pairing = self.pairing_factory(self.config)
            paired = self.pairing.run(on_code=self.pages.show_code, on_unreachable=self.pages.show_no_server)
            if not paired:
                return
            self.pages.show_none()
            self.state = "connecting"
            return
        self.state = "connecting"
        if not self.config.kiosk_url and self.config.slug and self.config.key:
            query = urlencode({"screen": self.config.slug, "key": self.config.key})
            self.config.kiosk_url = f"{self.config.server.rstrip('/')}/monitor?{query}"
            self.config.save()
        if self.config.kiosk_url:
            self._set_kiosk(self.config.kiosk_url)
        self.connection = self.connection_factory(self.config, self.on_message, self.on_auth_failed)
        ended = threading.Event()
        threading.Thread(target=self._telemetry_loop, args=(ended,), daemon=True, name="telemetry").start()
        try:
            self.connection.run_forever()
        finally:
            ended.set()
            self._telemetry_wake.set()

    def run(self):
        self.start_stop_watcher()
        while not self._stopped:
            self.run_once()


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    paths = Paths()
    config = Config.load(paths)
    pages = LocalPages()
    pages.start()
    agent = Agent(config, pages)
    signal.signal(signal.SIGTERM, lambda *_: agent.request_stop())
    try:
        agent.run()
    except KeyboardInterrupt:
        agent.request_stop()
        agent.stop()
    finally:
        pages.stop()
