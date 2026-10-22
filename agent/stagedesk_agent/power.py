"""Logic ported from scripts/stagedesk-power*.py. Status texts: "an", "standby", "aus", "Fehler: <Text>"."""
import glob
import logging
import os
import re
import socket
import threading
import time
from functools import reduce

log = logging.getLogger("stagedesk_agent.power")
KIOSK_USER = "pi"
RUNTIME_DIR = "/run/user/1000"
CEC_CLIENT = ["cec-client", "-s", "-d", "1"]
SICP_ATTEMPTS = 7


class PowerError(Exception):
    pass


def wayland_command(args, root="/"):
    sockets = sorted(os.path.basename(p) for p in glob.glob(os.path.join(root, RUNTIME_DIR.lstrip("/"), "wayland-*"))
                     if not p.endswith(".lock"))
    display = sockets[0] if sockets else "wayland-0"
    return ["env", f"XDG_RUNTIME_DIR={RUNTIME_DIR}", f"WAYLAND_DISPLAY={display}"] + list(args)


def _text(value, default):
    return str(value) if value not in (None, "") else default


class PowerController:
    """`set` and `status` never raise; they return a status text."""

    def __init__(self, config, runner, sleep=time.sleep):
        self.config = config if isinstance(config, dict) else {}
        self.runner = runner
        self.sleep = sleep

    def set(self, on):
        try:
            return self._set(bool(on))
        except Exception as exc:
            log.warning("power: %s", exc)
            return f"Fehler: {exc}"

    def status(self):
        try:
            return self._status()
        except Exception as exc:
            log.warning("power status: %s", exc)
            return f"Fehler: {exc}"

    def stop(self):
        pass

    def _set(self, on):
        raise NotImplementedError

    def _status(self):
        raise NotImplementedError

    def _check(self, result, what):
        if result.code != 0:
            raise PowerError((result.err or result.out).strip() or f"{what} endete mit Code {result.code}")
        return result


class CecPower(PowerController):
    def __init__(self, config, runner, **kw):
        super().__init__(config, runner, **kw)
        self.device = _text(self.config.get("cec_device"), "0")

    def _cec(self, command):
        result = self.runner.run(CEC_CLIENT, timeout=20, input=f"{command}\n")
        # Like the legacy scripts: cec-client often exits non-zero although it worked.
        # Only a missing binary or a timeout is a failure.
        if result.code in (124, 127):
            raise PowerError((result.err or result.out).strip() or f"cec-client endete mit Code {result.code}")
        return result

    def _set(self, on):
        self._cec(f"on {self.device}" if on else f"standby {self.device}")
        return "an" if on else "standby"

    def _status(self):
        out = self._cec(f"pow {self.device}").out
        if "power status: on" in out:
            return "an"
        if "power status: standby" in out:
            return "standby"
        raise PowerError("CEC-Status nicht lesbar")


class HdmiPower(PowerController):
    def __init__(self, config, runner, watchdog_interval=3, **kw):
        super().__init__(config, runner, **kw)
        self.output = _text(self.config.get("output"), "HDMI-A-1")
        self._want_off = False
        self._interval = watchdog_interval
        self._stop = threading.Event()
        self._lock = threading.Lock()
        threading.Thread(target=self._watchdog, daemon=True, name="hdmi-watchdog").start()

    def _wlr(self, flag):
        args = wayland_command(["wlr-randr", "--output", self.output, flag])
        return self._check(self.runner.run(args, timeout=10, user=KIOSK_USER), "wlr-randr")

    def _watchdog(self):
        # cage turns a switched-off output back on after a while; keep asserting --off while off is wanted.
        while not self._stop.wait(self._interval):
            with self._lock:
                if self._want_off and not self._stop.is_set():
                    try:
                        self._wlr("--off")
                    except Exception as exc:
                        log.warning("hdmi watchdog: %s", exc)

    def _set(self, on):
        with self._lock:
            self._want_off = not on
            self._wlr("--on" if on else "--off")
        return "an" if on else "aus"

    def _status(self):
        return "aus" if self._want_off else "an"  # the wanted state; the hardware flaps

    def stop(self):
        self._stop.set()


class HybridPower(PowerController):
    """CEC standby does not work on this panel, so off goes via SICP over TCP."""

    def __init__(self, config, runner, connect=socket.create_connection, **kw):
        super().__init__(config, runner, **kw)
        self.connect = connect
        self.ip = self.config.get("display_ip")
        self.port = int(_text(self.config.get("display_port"), "5000"))
        self.monitor_id = int(_text(self.config.get("monitor_id"), "0"))
        self.cec = CecPower(self.config, runner, **kw)

    def _frame(self, data):
        packet = [0xA6, self.monitor_id, 0, 0, 0, len(data) + 2, 0x01] + list(data)
        packet.append(reduce(lambda a, b: a ^ b, packet, 0))
        return bytes(packet)

    def _sicp(self, data, timeout=2):
        try:
            sock = self.connect((self.ip, self.port), timeout=timeout)
            try:
                sock.sendall(self._frame(data))
                try:
                    return sock.recv(64)
                except socket.timeout:
                    return b""
            finally:
                sock.close()
        except OSError:
            return None

    def _need_ip(self):
        if not self.ip:
            raise PowerError("display_ip fehlt in der Power-Konfiguration")

    def _set(self, on):
        self._need_ip()
        if on:
            for _ in range(2):
                self.cec._cec(f"on {self.cec.device}")
                self.sleep(1)
                self.cec._cec("as")
                self.sleep(1)
            return "an"
        for attempt in range(SICP_ATTEMPTS):
            if self._sicp([0x18, 0x01]) is not None:
                return "standby"
            if attempt < SICP_ATTEMPTS - 1:
                self.sleep(1)
        raise PowerError(f"Display {self.ip}:{self.port} per SICP nicht erreichbar")

    def _status(self):
        self._need_ip()
        reply = self._sicp([0x19])
        if reply is None:
            return "standby"  # the NIC is off in standby
        i = reply.find(b"\x19")
        if 0 <= i < len(reply) - 1 and reply[i + 1] == 1:
            return "standby"
        return "an"


class DdcPower(PowerController):
    def __init__(self, config, runner, **kw):
        super().__init__(config, runner, **kw)
        self.vcp_on = _text(self.config.get("vcp_on"), "01")
        self.vcp_off = _text(self.config.get("vcp_off"), "04")
        self._on = True

    def _set(self, on):
        value = self.vcp_on if on else self.vcp_off
        result = None
        for attempt in range(2):  # DDC is slow and sometimes flaky
            result = self.runner.run(["ddcutil", "setvcp", "D6", value], timeout=15)
            if result.code == 0:
                self._on = on
                return "an" if on else "aus"
            if attempt == 0:
                self.sleep(1)
        self._check(result, "ddcutil")

    def _status(self):
        return "an" if self._on else "aus"


METHODS = {"cec": CecPower, "hdmi": HdmiPower, "hybrid": HybridPower, "ddc": DdcPower}


def make_power(method, config, runner, **options):
    try:
        cls = METHODS[method]
    except KeyError:
        raise ValueError(f"unbekannte Power-Methode: {method}") from None
    accepted = {"sleep"}
    if cls is HdmiPower:
        accepted.add("watchdog_interval")
    if cls is HybridPower:
        accepted.add("connect")
    return cls(config, runner, **{k: v for k, v in options.items() if k in accepted})
