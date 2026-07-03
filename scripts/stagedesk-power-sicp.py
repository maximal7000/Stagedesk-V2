#!/usr/bin/env python3
"""
Stagedesk Power Control — WebSocket Client
Schaltet ein iiyama-Signage-Display (SICP über LAN->RS232) an/aus.
Verbindung: Pi eth0 <-> Display LAN-Port, Display-OSD: "RS232 routing = LAN->RS232".
"""

import json
import time
import socket
import logging
import signal
import sys
from websocket import WebSocketApp, WebSocketConnectionClosedException

# ─── Konfiguration ────────────────────────────────────────────────
WS_URL       = "wss://stagedesk.t410.de/ws/monitor/pi/<SLUG>/"
DISPLAY_IP   = "192.168.100.2"    # feste IP des Displays (OSD -> Static IP)
DISPLAY_PORT = 5000               # LAN->RS232 / SICP-Port
MONITOR_ID   = 0                  # Monitor-ID im OSD (Standard 0)
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


class SicpDisplay:
    """Steuert das Display per SICP über TCP (LAN->RS232)."""

    def __init__(self):
        self._last = "unknown"

    def _build(self, data):
        pkt = [0xA6, MONITOR_ID, 0x00, 0x00, 0x00, len(data) + 2, 0x01] + list(data)
        x = 0
        for b in pkt:
            x ^= b
        pkt.append(x)
        return bytes(pkt)

    def _send(self, data, timeout=4):
        """Frame senden, Antwort zurückgeben. None = Verbindung fehlgeschlagen."""
        frame = self._build(data)
        try:
            with socket.create_connection((DISPLAY_IP, DISPLAY_PORT), timeout=timeout) as s:
                s.sendall(frame)
                s.settimeout(timeout)
                try:
                    return s.recv(64)
                except socket.timeout:
                    return b""
        except OSError as e:
            log.error(f"SICP-Verbindung fehlgeschlagen ({DISPLAY_IP}:{DISPLAY_PORT}): {e}")
            return None

    def power_on(self):
        log.info("SICP → TV einschalten")
        if self._send([0x18, 0x02]) is not None:
            self._last = "on"

    def power_off(self):
        log.info("SICP → TV Standby")
        if self._send([0x18, 0x01]) is not None:
            self._last = "standby"

    def get_power_status(self) -> str:
        """Power-Status abfragen (SICP get-power 0x19)."""
        reply = self._send([0x19])
        if reply:
            i = reply.find(b"\x19")
            if i >= 0 and i + 1 < len(reply):
                v = reply[i + 1]
                if v == 0x02:
                    self._last = "on"
                elif v == 0x01:
                    self._last = "standby"
        log.info(f"Power-Status: {self._last}")
        return self._last

    def stop(self):
        pass


tv = SicpDisplay()


class PiClient:
    def __init__(self):
        self.ws: WebSocketApp | None = None
        self.last_status_report = 0
        self.reconnect_delay = RECONNECT_DELAY_MIN
        self.running = True

    def send_status(self):
        status = tv.get_power_status()
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
            current = tv.get_power_status()

            if power and current != "on":
                tv.power_on()
            elif not power and current != "standby":
                tv.power_off()
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
        tv.stop()
        if self.ws:
            self.ws.close()
        sys.exit(0)


if __name__ == "__main__":
    client = PiClient()
    signal.signal(signal.SIGTERM, client.stop)
    signal.signal(signal.SIGINT, client.stop)
    client.run_forever()
