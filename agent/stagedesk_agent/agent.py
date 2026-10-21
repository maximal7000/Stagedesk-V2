"""Wires pairing, connection and local pages together."""
import json
import logging
import queue
import signal
import threading
from datetime import datetime, timezone
from urllib.parse import urlencode

from . import telemetry
from .self_update import SelfUpdater
from .timers import write_timers
from .updater import Updater
from .commands import CommandContext, PlaceholderUpdater, execute
from .config import Config
from .connection import Connection
from .kiosk import Kiosk
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
                 kiosk=None, updater=None, timer_factory=threading.Timer, self_updater=None, timer_writer=None):
        self.config = config
        self.pages = pages
        self.kiosk = kiosk
        self.kiosk_set_url = kiosk_set_url or (kiosk.apply if kiosk else (lambda url: None))
        self.updater = updater or PlaceholderUpdater()  # main() wires the real Updater
        self.self_updater = self_updater
        self.timer_writer = timer_writer
        self._agent_updated = None
        self._outages_seen = 0
        self._update_requested = False
        self._reboot_requested = False
        self._signal_wake = threading.Event()
        self.timer_factory = timer_factory
        self.last_telemetry = None
        self._command_queue = queue.Queue()
        self._command_worker = None
        self._after_ack = []
        self._timers = []
        self._keyed_timers = {}
        self._timer_lock = threading.Lock()
        self.pairing_factory = pairing_factory or self._default_pairing
        self.connection_factory = connection_factory or (
            lambda cfg, om, af: Connection(cfg, om, af, stop_event=self.stop_event))
        self.runner = runner or Runner()
        self.power_factory = power_factory
        self.collect = collect
        self.telemetry_interval = telemetry_interval
        self._telemetry_wake = threading.Event()  # of the current run; set after a hello was applied
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
        """Remember the URL only after it was applied, so a failed switch is retried by the next call."""
        if url == self._kiosk_url:
            return
        try:
            self.kiosk_set_url(url)
        except Exception:
            log.exception("kiosk update failed")
            return
        if self.kiosk is not None and self.kiosk.pending_restart:
            log.warning("kiosk restart failed, will retry")
            return
        self._kiosk_url = url

    def request_stop(self):
        """Signal-safe: only sets the event (no locks, no I/O). The watcher thread does the closing."""
        self.stop_event.set()

    def start_stop_watcher(self):
        def watch():
            self.stop_event.wait()
            self.stop()
        threading.Thread(target=watch, daemon=True, name="stop-watcher").start()

    def request_update(self):
        """Signal-safe (SIGUSR1): only sets a flag and an event; the signal watcher enqueues the work."""
        self._update_requested = True
        self._signal_wake.set()

    def request_daily_reboot(self):
        """Signal-safe (SIGUSR2), like request_update."""
        self._reboot_requested = True
        self._signal_wake.set()

    def start_signal_watcher(self):
        def watch():
            while not self.stop_event.is_set():
                self._signal_wake.wait()
                self._signal_wake.clear()
                if self.stop_event.is_set():
                    return
                update = self._update_requested
                self._update_requested = False  # reset right after reading, so a new signal is not lost
                reboot = self._reboot_requested
                self._reboot_requested = False
                if update:
                    self._enqueue_command(self._auto_update)
                if reboot:
                    self._enqueue_command(self._daily_reboot)
        threading.Thread(target=watch, daemon=True, name="signals").start()

    def _auto_update(self):
        if not self.config.auto_updates:
            return
        log.info("update window: %s", self.updater.run(manual=False))

    def _daily_reboot(self):
        if not self.config.daily_reboot:
            return
        log.info("daily reboot: %s", self.updater.daily_reboot())

    def stop(self):
        self.stop_event.set()
        self._signal_wake.set()
        for part in (self.pairing, self.connection):
            if part:
                part.stop()
        self._drop_power_jobs()
        self._drop_command_jobs()
        with self._power_lock:
            if self._power:
                self._power.stop()

    def _drop_power_jobs(self):
        try:
            while True:
                self._power_queue.get_nowait()
        except queue.Empty:
            pass
        self._power_queue.put(None)  # wakes the worker, which then exits

    # commands

    def _drop_command_jobs(self):
        try:
            while True:
                self._command_queue.get_nowait()
        except queue.Empty:
            pass
        self._command_queue.put(None)
        with self._timer_lock:
            timers, self._timers, self._keyed_timers = list(self._timers), [], {}
        for timer in timers:
            timer.cancel()

    def _enqueue_command(self, message):
        """Commands run in order on their own worker (updates and screenshots take long)."""
        if self.stop_event.is_set():
            return
        if self._command_worker is None:
            self._command_worker = threading.Thread(target=self._command_loop, daemon=True, name="commands")
            self._command_worker.start()
        self._command_queue.put(message)

    def _command_loop(self):
        while True:
            message = self._command_queue.get()
            if message is None or self.stop_event.is_set():
                return
            try:
                if callable(message):
                    message()  # internal job (signals, hello maintenance)
                else:
                    self._run_command(message)
            except Exception:
                log.exception("command failed")

    def _defer(self, delay, fn, key=None):
        self._after_ack.append((delay, fn, key))

    def _context(self):
        return CommandContext(
            config=self.config, kiosk=self.kiosk, pages=self.pages, runner=self.runner, updater=self.updater,
            apply_power=self._apply_power, last_telemetry=lambda: self.last_telemetry,
            set_kiosk=self._set_kiosk, defer=self._defer)

    def _run_command(self, message):
        self._after_ack = []
        ok, text = execute(message, self._context())
        if not self.send({"type": "command_result", "id": message.get("id"), "ok": ok, "text": text}):
            log.warning("command_result for command %s could not be sent", message.get("id"))
        # Deferred work (reboot, back from the test pattern) starts only after the result was sent.
        for delay, fn, key in self._after_ack:
            self._start_timer(delay, fn, key)
        self._after_ack = []

    def _start_timer(self, delay, fn, key):
        if self.stop_event.is_set():
            return
        holder = []

        def run():
            try:
                fn()
            finally:
                self._forget_timer(holder[0])
        timer = self.timer_factory(delay, run)
        holder.append(timer)
        timer.daemon = True
        with self._timer_lock:
            previous = self._keyed_timers.pop(key, None) if key else None
            self._timers.append(timer)
            if key:
                self._keyed_timers[key] = timer
        if previous is not None:
            previous.cancel()
            self._forget_timer(previous)
        timer.start()

    def _forget_timer(self, timer):
        with self._timer_lock:
            if timer in self._timers:
                self._timers.remove(timer)
            for key, value in list(self._keyed_timers.items()):
                if value is timer:
                    del self._keyed_timers[key]

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
        if self.stop_event.is_set():
            return
        if self._power_worker is None:
            self._power_worker = threading.Thread(target=self._power_loop, daemon=True, name="power")
            self._power_worker.start()
        self._power_queue.put(job)

    def _power_loop(self):
        while True:
            job = self._power_queue.get()
            if job is None or self.stop_event.is_set():
                return
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
        self.last_telemetry = data
        updated = self._agent_updated
        sent = self.send({"type": "telemetry", **data, **({"agent_updated": updated} if updated else {})})
        if sent and updated and self._agent_updated is updated:
            self._agent_updated = None  # reported once
        self.send({"type": "power_status", "status": status})
        return sent

    def _connected(self):
        check = getattr(self.connection, "is_connected", None)
        return True if check is None else check()

    def _telemetry_loop(self, ended, wake):
        """Send after each hello, then every interval while connected. Offline: no collecting at all."""
        while not ended.is_set() and not self.stop_event.is_set():
            triggered = wake.wait(self.telemetry_interval)
            if ended.is_set() or self.stop_event.is_set():
                return
            if triggered:
                wake.clear()
            elif not self._connected():
                continue
            try:
                self._send_telemetry()
            except Exception:
                log.exception("telemetry failed")

    def on_message(self, message):
        kind = message.get("type")
        if kind == "hello":
            self.config.apply_hello(message)
            outages = getattr(self.connection, "outages", 0)
            recovered = outages > self._outages_seen
            self._outages_seen = outages
            url_before = self._kiosk_url
            if self.config.kiosk_url:
                self._set_kiosk(self.config.kiosk_url)
            if recovered and self.kiosk is not None and self._kiosk_url == url_before:
                # Replaces the old netwatch cron job: the browser may show an error page from the outage.
                self._enqueue_command(self.kiosk.restart)
            target = (self.config.power_method, json.loads(json.dumps(self.config.power_config, default=str)))
            wake = self._telemetry_wake

            def apply_hello():
                self._rebuild_power(target)
                wake.set()  # telemetry and power_status now come from the new controller
            self._enqueue_power(apply_hello)
            if self.self_updater or self.timer_writer:
                self._enqueue_command(lambda: self._after_hello(message))
        elif kind == "update_gate":
            gate = getattr(self.updater, "on_gate", None)
            if gate:
                gate(message)
        elif kind == "command":
            self._enqueue_command(message)
        elif kind == "power_command":
            self._enqueue_power(lambda: self._on_power_command(message))

    def _after_hello(self, hello):
        """Confirm a self-update, rewrite the update timers, then look for a newer agent version."""
        wake = self._telemetry_wake
        if self.self_updater:
            try:
                event = self.self_updater.confirm()
                if event:
                    self._agent_updated = event
                    wake.set()
            except Exception:
                log.exception("update confirmation failed")
        if self.timer_writer:
            try:
                self.timer_writer(self.config.update_window, self.config.auto_updates, self.config.daily_reboot,
                                  self.runner, self.config.paths)
            except Exception:
                log.exception("writing timers failed")
        if self.self_updater:
            try:
                result = self.self_updater.check(hello)
                if result:
                    log.info("self update: %s", result)
            except Exception:
                log.exception("self update failed")

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
        self._outages_seen = 0
        ended = threading.Event()
        wake = self._telemetry_wake = threading.Event()
        threading.Thread(target=self._telemetry_loop, args=(ended, wake), daemon=True, name="telemetry").start()
        try:
            self.connection.run_forever()
        finally:
            ended.set()
            wake.set()

    def run(self):
        self.start_stop_watcher()
        self.start_signal_watcher()
        while not self._stopped:
            self.run_once()


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    # SIGUSR1/2 would kill the process by default: catch them before anything slow starts.
    early = {"update": False, "reboot": False}
    signal.signal(signal.SIGUSR1, lambda *_: early.__setitem__("update", True))
    signal.signal(signal.SIGUSR2, lambda *_: early.__setitem__("reboot", True))
    paths = Paths()
    config = Config.load(paths)
    pages = LocalPages()
    runner = Runner()
    agent = Agent(config, pages, runner=runner, kiosk=Kiosk(runner, paths),
                  self_updater=SelfUpdater(paths, runner, config.server), timer_writer=write_timers)
    agent.updater = Updater(paths, runner, agent.send)
    signal.signal(signal.SIGTERM, lambda *_: agent.request_stop())
    signal.signal(signal.SIGUSR1, lambda *_: agent.request_update())
    signal.signal(signal.SIGUSR2, lambda *_: agent.request_daily_reboot())
    if early["update"]:
        agent.request_update()
    if early["reboot"]:
        agent.request_daily_reboot()
    pages.start()
    try:
        agent.run()
    except KeyboardInterrupt:
        agent.request_stop()
        agent.stop()
    finally:
        pages.stop()
