"""WebSocket-Consumer für Aufgaben-Vollbild-Anzeige. Sendet bei jedem
Update einen Reload-Hinweis an alle verbundenen Monitore."""
import json
from channels.generic.websocket import AsyncWebsocketConsumer


class AufgabenConsumer(AsyncWebsocketConsumer):
    """URL: /ws/aufgaben/"""

    GROUP = 'aufgaben'

    async def connect(self):
        await self.channel_layer.group_add(self.GROUP, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.GROUP, self.channel_name)

    async def receive(self, text_data):
        return

    async def aufgaben_update(self, event):
        await self.send(json.dumps({"type": "update"}))
