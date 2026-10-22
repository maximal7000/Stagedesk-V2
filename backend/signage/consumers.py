"""
WebSocket Consumer für Raspberry Pi HDMI-CEC Power-Steuerung
============================================================

Jeder Pi verbindet sich mit:
  ws://t410.de/ws/signage/pi/<slug>/  (old: /ws/monitor/pi/<slug>/)

Der Consumer:
  - Sendet sofort den aktuellen power-Befehl nach Connect
  - Hat einen 30 s Tick-Loop, der den Power-State neu auswertet und nur
    bei Änderung pushed (damit Zeitplan-Übergänge bei stehender Verbindung
    durchschlagen)
  - Hat einen 60 s Heartbeat: schickt {type:"ping"}, erwartet pong; bricht
    nach 90 s ohne pong die Verbindung ab (tote Verbindungen erkennen)
  - Empfängt CEC-Status- und pong-Updates vom Pi
  - Mit Geräte-Token (Header Authorization: Bearer ...) gilt das volle
    Agent-Protokoll (hello, command, telemetry, update_gate ...); ohne Token
    bleibt der Altbetrieb (power_command, cec_status, ping/pong)
  - Ermöglicht push_power_to_screen() aus anderen Modulen, um bei
    Config-Änderungen einen sofortigen Push auszulösen
"""

import asyncio
import json
import logging
import time
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.utils import timezone


logger = logging.getLogger(__name__)

TICK_INTERVAL = 30   # Power-Status alle 30s neu auswerten
PING_INTERVAL = 60   # Heartbeat-ping alle 60s
PONG_TIMEOUT = 90    # >90s ohne pong → Verbindung kappen
TELEMETRY_INTERVAL = 30  # Telemetrie höchstens alle 30s speichern
_monotonic = time.monotonic


def _group_name(slug: str) -> str:
    return f"screen_{slug}"


def push_power_to_screen(slug: str, power: bool = None) -> None:
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


def push_power_to_all() -> None:
    """Alle Bildschirme neu auswerten lassen (Notfall, Ferien, "bis Tagesende aus")."""
    from .models import Screen
    for slug in Screen.objects.values_list('slug', flat=True):
        try:
            push_power_to_screen(slug)
        except Exception:
            # Der gespeicherte Zustand gilt trotzdem; der 30-s-Tick des Consumers holt ihn nach.
            logger.exception("Power-Push an %s fehlgeschlagen", slug)


class ScreenPiConsumer(AsyncWebsocketConsumer):
    """WebSocket-Endpunkt für den Raspberry Pi.  URL: /ws/signage/pi/<slug>/ (old: /ws/monitor/…)"""

    def _bearer_token(self):
        for name, value in self.scope.get("headers", []):
            if name.lower() == b"authorization":
                text = value.decode("latin-1").strip()
                if text[:7].lower() == "bearer ":
                    return text[7:].strip()
        return ""

    async def connect(self):
        self.slug = self.scope["url_route"]["kwargs"]["slug"]
        self.group_name = _group_name(self.slug)
        self.device = None
        self.device_group_name = None
        self._last_telemetry_save = None
        self._last_power = None
        self._last_pong = time.time()

        token = self._bearer_token()
        if token:
            device = await self._device_for_token(token)
            if device is None or device.screen is None or device.screen.slug != self.slug:
                await self.accept()
                await self.close(code=4003)
                return
            self.device = device
        elif await self._require_token():
            await self.accept()
            await self.close(code=4001)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        if self.device is not None:
            from . import push
            self.device_group_name = push.device_group(self.device.id)
            await self.channel_layer.group_add(self.device_group_name, self.channel_name)
        await self.accept()

        if self.device is not None:
            await self._touch_device()
            hello = await self._hello()
            if hello is None:
                await self.close(code=4003)
                return
            await self.send(json.dumps(hello))
        # Initialen Power-State senden
        await self._send_current_power()
        if self.device is not None:
            for message in await self._pending_commands():
                await self.send(json.dumps(message))
        # Background-Tasks starten
        self._tick_task = asyncio.create_task(self._tick_loop())
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def disconnect(self, close_code):
        for attr in ('_tick_task', '_heartbeat_task'):
            t = getattr(self, attr, None)
            if t:
                t.cancel()
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if getattr(self, "device_group_name", None):
            await self.channel_layer.group_discard(self.device_group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, ValueError):
            return
        if not isinstance(data, dict):
            return

        msg_type = data.get("type")
        if self.device is not None:
            await self._touch_device()
            if await self._receive_device(msg_type, data):
                return
        if msg_type == "cec_status":
            status = str(data.get("status", "unknown"))[:20]
            await self._save_cec_status(status)
            await self.send(json.dumps({"type": "ack", "cec_status": status}))
        elif msg_type == "pong":
            self._last_pong = time.time()
        elif msg_type == "ping":
            # Pi schickt selbst ping → mit pong antworten (manche Clients machen das so)
            await self.send(json.dumps({"type": "pong"}))
            self._last_pong = time.time()

    async def _receive_device(self, msg_type, data) -> bool:
        """Agent-Nachrichten; True, wenn behandelt."""
        if msg_type == "telemetry":
            # Das Selbst-Update wird einmal gemeldet; die Drosselung darf es nicht verschlucken.
            event = data.get("agent_updated")
            if event is None and isinstance(data.get("data"), dict):
                event = data["data"].get("agent_updated")
            if event is not None:
                await self._record_agent_update(event)
            now = _monotonic()
            if self._last_telemetry_save is None or now - self._last_telemetry_save >= TELEMETRY_INTERVAL:
                self._last_telemetry_save = now
                payload = data.get("data")
                if not isinstance(payload, dict):
                    payload = {k: v for k, v in data.items() if k != "type"}
                await self._store_telemetry(payload)
        elif msg_type == "command_result":
            if isinstance(data.get("id"), int):
                await self._finish_command(data["id"], bool(data.get("ok")), data.get("text", ""))
        elif msg_type == "update_result":
            await self._record_update_result(data)
        elif msg_type == "update_gate_request":
            allowed, reason = await self._update_gate()
            answer = {"type": "update_gate", "allowed": allowed, "reason": reason}
            if "id" in data:
                answer["id"] = data["id"]  # lets the agent match the answer to its request
            await self.send(json.dumps(answer))
        elif msg_type == "power_status":
            await self._save_cec_status(str(data.get("status", "unknown"))[:20])
        else:
            return False
        return True

    # ── Background-Tasks ──────────────────────────────────────────────

    async def _tick_loop(self):
        """Alle TICK_INTERVAL Sekunden den Soll-Power-State neu auswerten und
        bei Änderung pushen. So springt der Pi automatisch in den nächsten
        Zeitplan-Slot, auch wenn er stundenlang verbunden bleibt."""
        try:
            while True:
                await asyncio.sleep(TICK_INTERVAL)
                power = await self._get_power_state()
                if power is not None and power != self._last_power:
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
        if power is not None:
            await self._send_power(power)

    async def _send_power(self, power: bool):
        try:
            await self.send(json.dumps({"type": "power_command", "power": bool(power)}))
            self._last_power = bool(power)
        except Exception:
            pass

    # ── Channel-Layer Handler (von push_power_to_screen aufgerufen) ──

    async def power_command(self, event):
        """Externer Push (z.B. nach Config-Änderung im Admin). Wenn power
        explizit gesetzt ist, das nehmen — sonst frisch aus DB lesen."""
        if event.get("power") is None:
            power = await self._get_power_state()
        else:
            power = bool(event["power"])
        if power is not None:
            await self._send_power(power)

    async def device_close(self, event):
        """Token zurückgezogen oder Gerät entkoppelt (push.close_device_sockets)."""
        await self.close(code=event.get("code", 4003))

    async def device_hello(self, event):
        """Konfiguration hat sich geändert: hello neu senden."""
        if self.device is None:
            return
        payload = await self._hello()
        if payload is None:
            await self.close(code=4003)
            return
        await self.send(json.dumps(payload))

    async def device_command(self, event):
        """Neuer Befehl (push.push_device_command)."""
        if self.device is None:
            return
        message = await self._claim_command(event.get("id"))
        if message:
            await self.send(json.dumps(message))

    # ── DB-Helfer ────────────────────────────────────────────────────

    @database_sync_to_async
    def _device_for_token(self, token):
        from .models import Device
        device = Device.for_token(token)
        if device is None:
            return None
        return Device.objects.select_related('screen').get(pk=device.pk)

    @database_sync_to_async
    def _require_token(self) -> bool:
        from .models import MonitorSettings
        return MonitorSettings.objects.filter(pk=1, require_device_token=True).exists()

    @database_sync_to_async
    def _touch_device(self) -> None:
        from .models import Device
        Device.objects.filter(pk=self.device.pk).update(last_seen_at=timezone.now())

    @database_sync_to_async
    def _hello(self):
        from . import devices
        from .models import Device
        device = Device.objects.select_related('screen').filter(
            pk=self.device.pk, revoked_at__isnull=True).first()
        if device is None or device.screen is None:
            return None
        self.device = device
        return devices.hello_payload(device)

    @database_sync_to_async
    def _pending_commands(self):
        from . import devices
        return devices.send_pending_commands(self.device)

    @database_sync_to_async
    def _claim_command(self, command_id):
        from . import devices
        return devices.claim_command(self.device, command_id)

    @database_sync_to_async
    def _finish_command(self, command_id, ok, text):
        from . import devices
        devices.finish_command(self.device, command_id, ok, text)

    @database_sync_to_async
    def _store_telemetry(self, payload):
        from . import devices
        devices.store_telemetry(self.device, payload)

    @database_sync_to_async
    def _record_agent_update(self, event):
        from . import devices
        devices.record_agent_update(self.device, event)

    @database_sync_to_async
    def _record_update_result(self, data):
        from . import devices
        devices.record_update_result(self.device, data)

    @database_sync_to_async
    def _update_gate(self):
        from . import devices
        from .models import DeviceEvent
        screen = self.device.screen
        allowed, reason = devices.update_gate(screen, timezone.now())
        if not allowed:
            DeviceEvent.objects.create(device=self.device, screen=screen, kind='update',
                                       text=f'Update oder Neustart verschoben: {reason}'[:300])
        return allowed, reason

    @database_sync_to_async
    def _get_power_state(self):
        """Soll-Zustand des Bildschirms; None, wenn er nicht mehr existiert (nichts schalten)."""
        from .models import Screen
        try:
            screen = Screen.objects.get(slug=self.slug)
            return screen.get_power_state()
        except Screen.DoesNotExist:
            return None

    @database_sync_to_async
    def _save_cec_status(self, status: str) -> None:
        from .models import Screen
        try:
            screen = Screen.objects.get(slug=self.slug)
            screen.cec_status = status
            screen.cec_status_at = timezone.now()
            screen.save(update_fields=["cec_status", "cec_status_at", "updated_at"])
        except Screen.DoesNotExist:
            pass


class DisplayConsumer(AsyncWebsocketConsumer):
    """WebSocket-Endpunkt der Anzeige (öffentlich, nur Hinweise).  URL: /ws/signage/display/<slug>/ (old: /ws/monitor/…)

    Sendet nur {"type":"changed"} bzw. {"type":"reload"}; Daten holt die Anzeige per HTTP.
    Eingehende Nachrichten werden ignoriert."""

    async def connect(self):
        from . import push
        slug = self.scope["url_route"]["kwargs"]["slug"]
        self.groups_joined = [push.group_name(slug), push.ALL_GROUP]
        for group in self.groups_joined:
            await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        for group in getattr(self, "groups_joined", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        return

    async def display_changed(self, event):
        await self.send(json.dumps({"type": "changed"}))

    async def display_reload(self, event):
        await self.send(json.dumps({"type": "reload"}))
