"""
WebSocket-Consumer für Live-Updates einer Anwesenheitsliste.

Ein Client, der eine Liste anschaut, verbindet sich mit
  ws://.../ws/anwesenheit/<liste_id>/
und bekommt jede Status-Änderung (Teilnehmer, Termin-Anwesenheit, Aufgabe,
Notiz, Hinzufügen/Entfernen) als JSON gepusht.

Das Backend ruft `broadcast_anwesenheit_update(liste_id, payload)` aus den
ändernden Endpoints — damit muss kein einzelner Endpoint Channels kennen.
"""

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


def liste_group_name(liste_id: int) -> str:
    return f"anwesenheit_liste_{liste_id}"


def broadcast_anwesenheit_update(liste_id: int, event_type: str = "update", data: dict | None = None) -> None:
    """Aus synchronem Code (Ninja-Endpoint) eine Liste-Aktualisierung an alle
    abonnierten Clients schicken. event_type ist frei (z.B. 'status',
    'teilnehmer_added', 'aufgabe', 'note'); der Frontend-Client lädt aktuell
    immer die ganze Liste neu — Payload ist nur Hinweis."""
    layer = get_channel_layer()
    if not layer:
        return
    async_to_sync(layer.group_send)(
        liste_group_name(liste_id),
        {"type": "liste_update", "event": event_type, "data": data or {}},
    )


class AnwesenheitConsumer(AsyncWebsocketConsumer):
    """URL: /ws/anwesenheit/<liste_id>/"""

    async def connect(self):
        try:
            self.liste_id = int(self.scope["url_route"]["kwargs"]["liste_id"])
        except (KeyError, ValueError):
            await self.close(code=4400)
            return
        self.group_name = liste_group_name(self.liste_id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        # Clients pushen aktuell nichts hoch; ignorieren.
        return

    async def liste_update(self, event):
        await self.send(json.dumps({
            "type": "update",
            "event": event.get("event", "update"),
            "data": event.get("data", {}),
        }))
