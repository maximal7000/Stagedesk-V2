#!/usr/bin/env python3
"""
Stagedesk Power Control — WebSocket Client (Hybrid)
Display: iiyama-Signage LE5540UHS.
  AUS  -> SICP über LAN (Port 5000)     [CEC-Standby geht bei dem Panel nicht]
  AN   -> HDMI-CEC 'on 0' + 'as'        [SICP/WOL weckt nicht, da NIC im Standby aus]
Status-Heartbeat alle STATUS_INTERVAL Sekunden.
"""

import json
import time
import socket
import functools
import subprocess
import threading
import logging
import signal
import sys
from websocket import WebSocketApp, WebSocketConnectionClosedException

# ─── Konfiguration ────────────────────────────────────────────────
WS_URL       = "wss://stagedesk.t410.de/ws/monitor/pi/<SLUG>/"
DISPLAY_IP   = "192.168.100.2"
DISPLAY_PORT = 5000
MONITOR_ID   = 0
CEC_DEVICE   = "0"
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


class Display:
    """AUS per SICP/LAN, AN per HDMI-CEC."""

    def __init__(self):
        self._last = "unknown"

    def _frame(self, data):
        p = [0xA6, MONITOR_ID, 0, 0, 0, len(data) + 2, 0x01] + list(data)
        p.append(functools.reduce(lambda a, c: a ^ c, p, 0))
        return bytes(p)

    def _sicp(self, data, timeout=2):
        try:
            s = socket.create_connection((DISPLAY_IP, DISPLAY_PORT), timeout=timeout)
            s.sendall(self._frame(data))
            try:
                r = s.recv(64)
            except socket.timeout:
                r = b""
            s.close()
            return r
        except OSError:
            return None

    def _cec(self, cmd):
        subprocess.run(f"echo '{cmd}' | cec-client -s -d 1", shell=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def power_off(self):
        log.info("SICP → Display AUS")
        for n in range(1, 8):
            if self._sicp([0x18, 0x01]) is not None:
                self._last = "standby"
                log.info(f"AUS gesendet (Versuch {n})")
                return
            time.sleep(1)
        log.error("AUS: kein SICP-Connect möglich")

    def power_on(self):
        log.info("CEC → Display AN (on 0 + as)")
        for _ in range(2):
            self._cec("on 0"); time.sleep(1)
            self._cec("as");   time.sleep(1)
        self._last = "on"

    def get_power_status(self) -> str:
        r = self._sicp([0x19])
        if r is None:
            self._last = "standby"
        else:
            i = r.find(b"\x19")
            if i >= 0 and i + 1 < len(r) and r[i + 1] == 1:
                self._last = "standby"
            else:
                self._last = "on"
        return self._last

    def stop(self):
        pass


tv = Display()


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
        """Meldet den Ist-Status regelmäßig, auch ohne Schaltbefehl."""
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
        elif data.get("type") == "ack":
            log.debug(f"ACK erhalten: {data.get('cec_status')}")

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
        tv.stop()
        if self.ws:
            self.ws.close()
        sys.exit(0)


if __name__ == "__main__":
    client = PiClient()
    signal.signal(signal.SIGTERM, client.stop)
    signal.signal(signal.SIGINT, client.stop)
    client.run_forever()
