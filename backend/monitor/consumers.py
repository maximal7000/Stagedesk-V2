"""
WebSocket Consumer für Raspberry Pi HDMI-CEC Power-Steuerung
============================================================

Jeder Pi verbindet sich mit:
  ws://t410.de/ws/monitor/pi/<slug>/

Der Consumer:
  - Sendet sofort den aktuellen power-Befehl nach Connect
  - Hat einen 30 s Tick-Loop, der den Power-State neu auswertet und nur
    bei Änderung pushed (damit Zeitplan-Übergänge bei stehender Verbindung
    durchschlagen)
  - Hat einen 60 s Heartbeat: schickt {type:"ping"}, erwartet pong; bricht
    nach 90 s ohne pong die Verbindung ab (tote Verbindungen erkennen)
  - Empfängt CEC-Status- und pong-Updates vom Pi
  - Ermöglicht push_power_to_bildschirm() aus anderen Modulen, um bei
    Config-Änderungen einen sofortigen Push auszulösen
"""

import asyncio
import json
import time
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.utils import timezone


TICK_INTERVAL = 30   # Power-Status alle 30s neu auswerten
PING_INTERVAL = 60   # Heartbeat-ping alle 60s
PONG_TIMEOUT = 90    # >90s ohne pong → Verbindung kappen


def _group_name(slug: str) -> str:
    return f"bildschirm_{slug}"


def push_power_to_bildschirm(slug: str, power: bool = None) -> None:
    """Aus synchronem Django-Code: Power-Befehl an alle verbundenen Pi-Sockets
    eines Bildschirms senden. Wenn `power` None ist, wertet der Consumer beim
    Empfang selbst aus — das ist sicherer, weil der Server immer den
    aktuellen Sollzustand kennt."""
    layer = get_channel_layer()
    if not layer:
        return
    async_to_sync(layer.group_send)(_group_name(slug), {
        "type": "power_command",
        "power": power,  # None → Consumer fragt DB neu
    })


class BildschirmPiConsumer(AsyncWebsocketConsumer):
    """WebSocket-Endpunkt für den Raspberry Pi.  URL: /ws/monitor/pi/<slug>/"""

    async def connect(self):
        self.slug = self.scope["url_route"]["kwargs"]["slug"]
        self.group_name = _group_name(self.slug)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        self._last_power = None
        self._last_pong = time.time()

        # Initialen Power-State senden
        await self._send_current_power()
        # Background-Tasks starten
        self._tick_task = asyncio.create_task(self._tick_loop())
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def disconnect(self, close_code):
        for attr in ('_tick_task', '_heartbeat_task'):
            t = getattr(self, attr, None)
            if t:
                t.cancel()
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, ValueError):
            return

        msg_type = data.get("type")
        if msg_type == "cec_status":
            status = data.get("status", "unknown")[:20]
            await self._save_cec_status(status)
            await self.send(json.dumps({"type": "ack", "cec_status": status}))
        elif msg_type == "pong":
            self._last_pong = time.time()
        elif msg_type == "ping":
            # Pi schickt selbst ping → mit pong antworten (manche Clients machen das so)
            await self.send(json.dumps({"type": "pong"}))
            self._last_pong = time.time()

    # ── Background-Tasks ──────────────────────────────────────────────

    async def _tick_loop(self):
        """Alle TICK_INTERVAL Sekunden den Soll-Power-State neu auswerten und
        bei Änderung pushen. So springt der Pi automatisch in den nächsten
        Zeitplan-Slot, auch wenn er stundenlang verbunden bleibt."""
        try:
            while True:
                await asyncio.sleep(TICK_INTERVAL)
                power = await self._get_power_state()
                if power != self._last_power:
                    await self._send_power(power)
        except asyncio.CancelledError:
            return

    async def _heartbeat_loop(self):
        """Alle PING_INTERVAL Sekunden ping schicken, alle PONG_TIMEOUT
        Sekunden prüfen ob pong angekommen ist."""
        try:
            while True:
                await asyncio.sleep(PING_INTERVAL)
                # Wenn pong zu lange her: Verbindung gilt als tot
                if time.time() - self._last_pong > PONG_TIMEOUT:
                    try:
                        await self.close(code=4001)
                    except Exception:
                        pass
                    return
                try:
                    await self.send(json.dumps({"type": "ping"}))
                except Exception:
                    return
        except asyncio.CancelledError:
            return

    # ── Push-Helpers ─────────────────────────────────────────────────

    async def _send_current_power(self):
        power = await self._get_power_state()
        await self._send_power(power)

    async def _send_power(self, power: bool):
        try:
            await self.send(json.dumps({"type": "power_command", "power": bool(power)}))
            self._last_power = bool(power)
        except Exception:
            pass

    # ── Channel-Layer Handler (von push_power_to_bildschirm aufgerufen) ──

    async def power_command(self, event):
        """Externer Push (z.B. nach Config-Änderung im Admin). Wenn power
        explizit gesetzt ist, das nehmen — sonst frisch aus DB lesen."""
        if event.get("power") is None:
            power = await self._get_power_state()
        else:
            power = bool(event["power"])
        await self._send_power(power)

    # ── DB-Helfer ────────────────────────────────────────────────────

    @database_sync_to_async
    def _get_power_state(self) -> bool:
        from .models import Bildschirm
        try:
            bs = Bildschirm.objects.get(slug=self.slug)
            return bs.get_power_state()
        except Bildschirm.DoesNotExist:
            return True

    @database_sync_to_async
    def _save_cec_status(self, status: str) -> None:
        from .models import Bildschirm
        try:
            bs = Bildschirm.objects.get(slug=self.slug)
            bs.cec_status = status
            bs.cec_status_zeit = timezone.now()
            bs.save(update_fields=["cec_status", "cec_status_zeit", "aktualisiert_am"])
        except Bildschirm.DoesNotExist:
            pass
