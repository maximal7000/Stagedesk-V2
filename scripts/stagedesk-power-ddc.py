#!/usr/bin/env python3
"""
Stagedesk Power Control — WebSocket Client (DDC/CI)
Schaltet den Monitor direkt per DDC/CI (VCP D6) an/aus — über die HDMI-
Datenleitung, unabhängig von cage/Kiosk. Für Monitore ohne CEC, die DDC/CI
Power-Steuerung beherrschen (z.B. ASUS VA249). Kein Flackern, cage unberührt.

Voraussetzung:  sudo apt install ddcutil ; User in Gruppe 'i2c' ;
                Modul i2c-dev geladen (echo i2c-dev > /etc/modules-load.d/i2c-dev.conf).
Prüfen:         ddcutil detect   und   ddcutil getvcp D6
"""

import json
import time
import subprocess
import threading
import logging
import signal
import sys
from websocket import WebSocketApp, WebSocketConnectionClosedException

# ─── Konfiguration ────────────────────────────────────────────────
WS_URL       = "wss://stagedesk.t410.de/ws/monitor/pi/<SLUG>/"
VCP_POWER    = "D6"        # VCP-Code "Power mode"
VAL_ON       = "01"        # 01 = On
VAL_OFF      = "04"        # 04 = Off (DPMS off). Falls Aufwecken zickt: "02" (Standby)
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


class DdcDisplay:
    """Schaltet den Monitor per DDC/CI (ddcutil setvcp D6)."""

    def __init__(self):
        self._want = "on"

    def _ddc(self, value):
        for _ in range(2):     # DDC ist langsam/gelegentlich zickig
            try:
                r = subprocess.run(["ddcutil", "setvcp", VCP_POWER, value],
                                   capture_output=True, text=True, timeout=15)
                if r.returncode == 0:
                    return True
            except Exception as e:
                log.error(f"ddcutil Fehler: {e}")
            time.sleep(1)
        log.error(f"ddcutil setvcp {VCP_POWER} {value} fehlgeschlagen")
        return False

    def power_on(self):
        log.info("DDC/CI → Monitor AN")
        self._want = "on"
        self._ddc(VAL_ON)

    def power_off(self):
        log.info("DDC/CI → Monitor AUS")
        self._want = "standby"
        self._ddc(VAL_OFF)

    def get_power_status(self) -> str:
        return self._want

    def stop(self):
        pass


tv = DdcDisplay()


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
