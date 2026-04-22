"""
WebSocket Consumer für Raspberry Pi HDMI-CEC Power-Steuerung
============================================================

Jeder Pi verbindet sich mit:
  ws://t410.de/ws/monitor/pi/<slug>/

Der Consumer:
  - Sendet sofort den aktuellen power-Befehl nach Connect
  - Empfängt CEC-Status-Updates vom Pi
  - Ermöglicht dem Admin, per Channel-Layer einen Befehl zu pushen
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone


class BildschirmPiConsumer(AsyncWebsocketConsumer):
    """
    WebSocket-Endpunkt für den Raspberry Pi.
    URL: /ws/monitor/pi/<slug>/
    """

    async def connect(self):
        self.slug = self.scope["url_route"]["kwargs"]["slug"]
        self.group_name = f"bildschirm_{self.slug}"

        # Pi der Gruppe für diesen Bildschirm beitreten
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Direkt nach Connect: aktuellen Soll-Zustand senden
        power = await self.get_power_state()
        await self.send(json.dumps({
            "type": "power_command",
            "power": power,
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        """Pi sendet CEC-Status: {"type": "cec_status", "status": "on"|"standby"|"unknown"}"""
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, ValueError):
            return

        if data.get("type") == "cec_status":
            status = data.get("status", "unknown")[:20]
            await self.save_cec_status(status)
            # Quittierung an Pi
            await self.send(json.dumps({"type": "ack", "cec_status": status}))

    # ── Channel-Layer Handler (werden von außen aufgerufen) ──────────

    async def power_command(self, event):
        """Wird vom Admin/API per channel_layer.group_send() ausgelöst."""
        await self.send(json.dumps({
            "type": "power_command",
            "power": event["power"],
        }))

    # ── DB-Helfer ────────────────────────────────────────────────────

    @database_sync_to_async
    def get_power_state(self):
        from .models import Bildschirm
        try:
            bs = Bildschirm.objects.get(slug=self.slug)
            return bs.get_power_state()
        except Bildschirm.DoesNotExist:
            return True  # Fallback: an

    @database_sync_to_async
    def save_cec_status(self, status):
        from .models import Bildschirm
        try:
            bs = Bildschirm.objects.get(slug=self.slug)
            bs.cec_status = status
            bs.cec_status_zeit = timezone.now()
            bs.save(update_fields=["cec_status", "cec_status_zeit", "aktualisiert_am"])
        except Bildschirm.DoesNotExist:
            pass
