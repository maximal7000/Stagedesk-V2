#!/usr/bin/env python3
"""
Stagedesk HDMI-CEC Power Control — WebSocket Client
"""

import json
import subprocess
import threading
import time
import logging
import signal
import sys
from websocket import WebSocketApp, WebSocketConnectionClosedException

# ─── Konfiguration ────────────────────────────────────────────────
WS_URL = "wss://stagedesk.t410.de/ws/monitor/pi/mensa/"
CEC_DEVICE = "0"
STATUS_INTERVAL = 60
RECONNECT_DELAY_MIN = 5
RECONNECT_DELAY_MAX = 60
# ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("/var/log/stagedesk-power.log"),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger("stagedesk")


class CecDaemon:
    """
    Hält cec-client dauerhaft am Leben.
    Status-Abfragen laufen ebenfalls über denselben Prozess
    damit der Port nicht blockiert wird.
    """

    def __init__(self):
        self._proc: subprocess.Popen | None = None
        self._lock = threading.Lock()
        self._last_status = "unknown"
        self._start()

    def _start(self):
        try:
            self._proc = subprocess.Popen(
                ["cec-client", "-d", "1"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                bufsize=1,
            )
            # Ausgabe-Thread: liest stdout und merkt sich letzten Power-Status
            t = threading.Thread(target=self._read_output, daemon=True)
            t.start()
            time.sleep(2)
            log.info("CEC-Daemon gestartet")
        except Exception as e:
            log.error(f"CEC-Daemon Start fehlgeschlagen: {e}")
            self._proc = None

    def _read_output(self):
        """Liest cec-client Ausgabe und extrahiert Power-Status."""
        try:
            for line in self._proc.stdout:
                line = line.strip()
                if not line:
                    continue
                # cec-client gibt z.B. "power status: on" aus
                if "power status: on" in line:
                    self._last_status = "on"
                    log.debug(f"CEC Status aus Daemon: on")
                elif "power status: standby" in line:
                    self._last_status = "standby"
                    log.debug(f"CEC Status aus Daemon: standby")
        except Exception:
            pass

    def _ensure_running(self):
        if self._proc is None or self._proc.poll() is not None:
            log.warning("CEC-Daemon neu starten...")
            self._start()

    def _send(self, cmd: str):
        """Rohen Befehl an cec-client schicken."""
        with self._lock:
            self._ensure_running()
            if self._proc and self._proc.stdin:
                try:
                    self._proc.stdin.write(cmd + "\n")
                    self._proc.stdin.flush()
                except Exception as e:
                    log.error(f"CEC-Sende-Fehler: {e}")
                    self._proc = None

    def get_power_status(self) -> str:
        """Power-Status abfragen — über den laufenden Daemon."""
        self._send(f"pow {CEC_DEVICE}")
        time.sleep(3)  # Antwort abwarten
        log.info(f"CEC-Status: {self._last_status}")
        return self._last_status

    def power_on(self):
        log.info("CEC → TV einschalten")
        self._send(f"on {CEC_DEVICE}")
        time.sleep(2)

    def power_off(self):
        log.info("CEC → TV Standby")
        self._send(f"standby {CEC_DEVICE}")
        time.sleep(2)

    def stop(self):
        if self._proc:
            self._proc.terminate()


cec = CecDaemon()


class PiClient:
    def __init__(self):
        self.ws: WebSocketApp | None = None
        self.last_status_report = 0
        self.reconnect_delay = RECONNECT_DELAY_MIN
        self.running = True

    def send_status(self):
        status = cec.get_power_status()
        if self.ws:
            try:
                self.ws.send(json.dumps({"type": "cec_status", "status": status}))
                log.info(f"Status gemeldet: {status}")
                self.last_status_report = time.time()
            except WebSocketConnectionClosedException:
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

        msg_type = data.get("type")

        if msg_type == "power_command":
            power = data.get("power", True)
            log.info(f"Power-Befehl empfangen: {'AN' if power else 'AUS'}")
            current = cec.get_power_status()

            if power and current != "on":
                cec.power_on()
            elif not power and current != "standby":
                cec.power_off()
            else:
                log.info("Kein Schaltvorgang nötig")

            self.send_status()

        elif msg_type == "ack":
            log.debug(f"ACK erhalten: {data.get('cec_status')}")

    def on_error(self, ws, error):
        log.error(f"WebSocket-Fehler: {error}")

    def on_close(self, ws, close_status_code, close_msg):
        log.warning(f"Verbindung getrennt (Code: {close_status_code})")

    def run_forever(self):
        while self.running:
            self.ws = WebSocketApp(
                WS_URL,
                on_open=self.on_open,
                on_message=self.on_message,
                on_error=self.on_error,
                on_close=self.on_close,
            )
            self.ws.run_forever(ping_interval=30, ping_timeout=10)

            if not self.running:
                break

            log.info(f"Reconnect in {self.reconnect_delay}s ...")
            time.sleep(self.reconnect_delay)
            self.reconnect_delay = min(self.reconnect_delay * 2, RECONNECT_DELAY_MAX)

    def stop(self, *_):
        log.info("Beende stagedesk-power ...")
        self.running = False
        cec.stop()
        if self.ws:
            self.ws.close()
        sys.exit(0)


if __name__ == "__main__":
    client = PiClient()
    signal.signal(signal.SIGTERM, client.stop)
    signal.signal(signal.SIGINT, client.stop)
    client.run_forever()