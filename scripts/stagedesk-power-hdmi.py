#!/usr/bin/env python3
"""
Stagedesk Power Control — WebSocket Client (HDMI-DPMS + Watchdog)
Schaltet den HDMI-Ausgang des Pi an/aus (wlr-randr unter cage) und meldet den
Status. cage aktiviert einen abgeschalteten Ausgang nach kurzer Zeit von selbst
wieder — daher hält ein Watchdog den Ausgang aus, solange 'aus' gewünscht ist.
"""

import os
import glob
import json
import time
import subprocess
import threading
import logging
import signal
import sys
from websocket import WebSocketApp, WebSocketConnectionClosedException

# ─── Konfiguration ────────────────────────────────────────────────
WS_URL      = "wss://stagedesk.t410.de/ws/monitor/pi/<SLUG>/"
OUTPUT      = "HDMI-A-1"
RUNTIME_DIR = "/run/user/1000"
WATCHDOG_INTERVAL = 3      # s — Re-Assert von --off solange 'aus' gewünscht
STATUS_INTERVAL = 60
RECONNECT_DELAY_MIN = 5
RECONNECT_DELAY_MAX = 60
# ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler("/var/log/stagedesk-power.log"),
              logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("stagedesk")


class HdmiDisplay:
    """Schaltet den HDMI-Ausgang per wlr-randr; Watchdog hält 'aus' stabil."""

    def __init__(self):
        self._want = "on"      # gewünschter Zustand: 'on' | 'standby'
        threading.Thread(target=self._watchdog, daemon=True).start()

    def _env(self):
        e = dict(os.environ)
        e["XDG_RUNTIME_DIR"] = RUNTIME_DIR
        socks = [os.path.basename(s) for s in glob.glob(f"{RUNTIME_DIR}/wayland-*")
                 if not s.endswith(".lock")]
        e["WAYLAND_DISPLAY"] = socks[0] if socks else "wayland-0"
        return e

    def _wlr(self, *args):
        try:
            subprocess.run(["wlr-randr", *args], env=self._env(),
                           capture_output=True, text=True, timeout=10)
        except Exception as e:
            log.error(f"wlr-randr Fehler: {e}")

    def _watchdog(self):
        # Solange 'aus' gewünscht ist, den Ausgang immer wieder abschalten
        # (cage re-aktiviert ihn sonst nach ~15s von selbst).
        while True:
            if self._want == "standby":
                self._wlr("--output", OUTPUT, "--off")
            time.sleep(WATCHDOG_INTERVAL)

    def power_on(self):
        log.info("HDMI-Ausgang AN")
        self._want = "on"
        self._wlr("--output", OUTPUT, "--on")

    def power_off(self):
        log.info("HDMI-Ausgang AUS")
        self._want = "standby"
        self._wlr("--output", OUTPUT, "--off")

    def get_power_status(self) -> str:
        # Gewünschten (stabilen) Zustand melden — die Hardware flappt sonst.
        return self._want

    def stop(self):
        pass


tv = HdmiDisplay()


class PiClient:
    def __init__(self):
        self.ws = None
        self.reconnect_delay = RECONNECT_DELAY_MIN
        self.running = True
        self._lock = threading.Lock()
        threading.Thread(target=self._heartbeat, daemon=True).start()

    def send_status(self):
        status = tv.get_power_status()
        with self._lock:
            if self.ws:
                try:
                    self.ws.send(json.dumps({"type": "cec_status", "status": status}))
                    log.info(f"Status gemeldet: {status}")
                except WebSocketConnectionClosedException:
                    pass

    def _heartbeat(self):
        while self.running:
            time.sleep(STATUS_INTERVAL)
            try:
                self.send_status()
            except Exception:
                pass

    def on_open(self, ws):
        log.info(f"Verbunden mit {WS_URL}")
        self.reconnect_delay = RECONNECT_DELAY_MIN
        self.send_status()

    def on_message(self, ws, message):
        try:
            data = json.loads(message)
        except json.JSONDecodeError:
            return
        if data.get("type") == "power_command":
            power = data.get("power", True)
            log.info(f"Power-Befehl empfangen: {'AN' if power else 'AUS'}")
            current = tv.get_power_status()
            if power and current != "on":
                tv.power_on()
            elif not power and current != "standby":
                tv.power_off()
            else:
                log.info("Kein Schaltvorgang nötig")
            self.send_status()

    def on_error(self, ws, error):
        log.error(f"WebSocket-Fehler: {error}")

    def on_close(self, ws, code, msg):
        log.warning(f"Verbindung getrennt (Code: {code})")

    def run_forever(self):
        while self.running:
            self.ws = WebSocketApp(WS_URL, on_open=self.on_open, on_message=self.on_message,
                                   on_error=self.on_error, on_close=self.on_close)
            self.ws.run_forever(ping_interval=30, ping_timeout=10)
            if not self.running:
                break
            log.info(f"Reconnect in {self.reconnect_delay}s ...")
            time.sleep(self.reconnect_delay)
            self.reconnect_delay = min(self.reconnect_delay * 2, RECONNECT_DELAY_MAX)

    def stop(self, *_):
        log.info("Beende stagedesk-power ...")
        self.running = False
        if self.ws:
            self.ws.close()
        sys.exit(0)


if __name__ == "__main__":
    client = PiClient()
    signal.signal(signal.SIGTERM, client.stop)
    signal.signal(signal.SIGINT, client.stop)
    client.run_forever()
