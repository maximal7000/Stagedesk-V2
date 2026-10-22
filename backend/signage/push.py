"""Errors in the channel layer (e.g. Redis unreachable) are only logged: saving must never end
in a 500. The display polls on its fallback interval anyway."""
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
    """None = all screens."""
    if screen_slugs is None:
        _send(ALL_GROUP, "display_changed")
        return
    for slug in screen_slugs:
        _send(group_name(slug), "display_changed")


def notify_reload(slug: str) -> None:
    _send(group_name(slug), "display_reload")


def notify_changed_on_commit(screen_slugs=None) -> None:
    transaction.on_commit(lambda: notify_changed(screen_slugs))


def device_group(device_id: int) -> str:
    return f"device_{device_id}"


def close_device_sockets(device) -> None:
    """Code 4003, handled by the consumer."""
    try:
        layer = get_channel_layer()
        if not layer:
            return
        async_to_sync(layer.group_send)(
            device_group(device.id), {"type": "device_close", "code": 4003})
    except Exception:
        logger.exception("Schließen der Geräte-Verbindung %s fehlgeschlagen", device.id)


def push_device_hello(screen) -> None:
    from .models import Device
    device_id = Device.objects.filter(screen=screen).values_list('id', flat=True).first()
    if device_id is None:
        return
    try:
        layer = get_channel_layer()
        if not layer:
            return
        async_to_sync(layer.group_send)(device_group(device_id), {"type": "device_hello"})
    except Exception:
        logger.exception("Hello-Push an Gerät %s fehlgeschlagen", device_id)


def push_device_command(command) -> None:
    """Call after the commit. Without a connection it stays `pending` and goes out on connect."""
    try:
        layer = get_channel_layer()
        if not layer:
            return
        async_to_sync(layer.group_send)(
            device_group(command.device_id), {"type": "device_command", "id": command.id})
    except Exception:
        logger.exception("Befehls-Push an Gerät %s fehlgeschlagen", command.device_id)
