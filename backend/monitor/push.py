"""
Änderungs-Push an die Anzeige (WebSocket-Gruppen display_<slug> und display_all).

Fehler im Channel-Layer (z.B. Redis nicht erreichbar) werden nur protokolliert:
ein Speichern darf deswegen nie mit 500 enden. Die Anzeige holt sich die Daten
ohnehin im Rückfall-Intervall selbst.
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

logger = logging.getLogger(__name__)

ALL_GROUP = "display_all"


def group_name(slug: str) -> str:
    return f"display_{slug}"


def _send(group: str, message_type: str) -> None:
    try:
        layer = get_channel_layer()
        if not layer:
            return
        async_to_sync(layer.group_send)(group, {"type": message_type})
    except Exception:
        logger.exception("Display-Push an %s fehlgeschlagen", group)


def notify_changed(screen_slugs=None) -> None:
    """Die Anzeige soll neu laden. None = alle Bildschirme."""
    if screen_slugs is None:
        _send(ALL_GROUP, "display_changed")
        return
    for slug in screen_slugs:
        _send(group_name(slug), "display_changed")


def notify_reload(slug: str) -> None:
    """Die Seite des Bildschirms komplett neu laden lassen."""
    _send(group_name(slug), "display_reload")


def notify_changed_on_commit(screen_slugs=None) -> None:
    """Wie notify_changed, aber erst nach erfolgreichem Commit."""
    transaction.on_commit(lambda: notify_changed(screen_slugs))


def device_group(device_id: int) -> str:
    return f"device_{device_id}"


def close_device_sockets(device) -> None:
    """Offene WebSocket-Verbindungen des Geräts schließen lassen (Code 4003, behandelt der Consumer)."""
    try:
        layer = get_channel_layer()
        if not layer:
            return
        async_to_sync(layer.group_send)(
            device_group(device.id), {"type": "device_close", "code": 4003})
    except Exception:
        logger.exception("Schließen der Geräte-Verbindung %s fehlgeschlagen", device.id)
