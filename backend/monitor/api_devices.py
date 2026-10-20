"""
Monitor API, Geräte-Router: Kopplung per Code, Entkoppeln, Token zurückziehen.

Wird in api.py per monitor_router.add_router("", devices_router) eingebunden.
Die beiden agent/pair-Routen sind öffentlich (auth=None): der Agent hat vor der Kopplung keinen Token.
"""
import uuid

from django.core.cache import cache
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from ninja import Router
from ninja.errors import HttpError

from core.auth import keycloak_auth
from . import devices
from .models import Device, Screen
from .permissions import _require_perm
from .schemas import DevicePairSchema, DeviceSchema, PairPollSchema, PairStartSchema

devices_router = Router()

MAX_FAILED_ATTEMPTS = 5
ATTEMPT_WINDOW = 60  # Sekunden


@devices_router.post("/agent/pair/start", auth=None)
def pair_start(request, payload: PairStartSchema):
    req, pairing_id = devices.start_pairing(payload.serial.strip(), payload.model.strip())
    return {"code": req.code, "pairing_id": pairing_id, "expires_at": req.expires_at}


@devices_router.post("/agent/pair/poll", auth=None, response={200: dict, 202: dict, 404: dict, 410: dict})
def pair_poll(request, payload: PairPollSchema):
    try:
        result = devices.poll_pairing(payload.pairing_id)
    except LookupError:
        return 404, {"detail": "Der Kopplungscode ist unbekannt oder abgelaufen."}
    except devices.PairingGone:
        return 410, {"detail": "Die Zugangsdaten wurden bereits abgeholt."}
    if result is None:
        return 202, {"status": "waiting"}
    return 200, {"status": "paired", "token": result["token"],
                 "slug": result["slug"], "key": result["key"]}


def _failed_key(request) -> str:
    return f"monitor:pair-fail:{request.auth.get('sub', '')}"


def _unique_slug(name: str) -> str:
    base = slugify(name) or uuid.uuid4().hex[:8]
    slug, counter = base, 1
    while Screen.objects.filter(slug=slug).exists():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


@devices_router.post("/devices/pair", response=DeviceSchema, auth=keycloak_auth)
def pair_device(request, payload: DevicePairSchema):
    _require_perm(request, 'monitor.devices')
    key = _failed_key(request)
    if cache.get(key, 0) >= MAX_FAILED_ATTEMPTS:
        raise HttpError(429, "Zu viele Versuche. Bitte eine Minute warten.")
    if payload.screen_id is None and payload.new_screen is None:
        raise HttpError(422, "Bitte einen Bildschirm wählen oder einen neuen anlegen.")
    code = payload.code.replace(' ', '')
    with transaction.atomic():
        if payload.screen_id is not None:
            screen = get_object_or_404(Screen, id=payload.screen_id)
        else:
            screen = Screen.objects.create(name=payload.new_screen.name.strip(),
                                           location=payload.new_screen.location.strip(),
                                           slug=_unique_slug(payload.new_screen.name))
        try:
            device = devices.confirm_pairing(code, screen)
        except devices.InvalidPairingCode:
            transaction.set_rollback(True)  # neu angelegten Bildschirm wieder verwerfen
            cache.add(key, 0, ATTEMPT_WINDOW)
            try:
                cache.incr(key)
            except ValueError:
                cache.set(key, 1, ATTEMPT_WINDOW)
            raise HttpError(400, "Der Code ist ungültig oder abgelaufen. Den Code auf dem Bildschirm prüfen.")
    return device


@devices_router.post("/devices/{int:id}/unpair", auth=keycloak_auth)
def unpair_device(request, id: int):
    _require_perm(request, 'monitor.devices')
    devices.unpair(get_object_or_404(Device, id=id))
    return {"success": True}


@devices_router.post("/devices/{int:id}/revoke", auth=keycloak_auth)
def revoke_device(request, id: int):
    _require_perm(request, 'monitor.devices')
    devices.revoke_token(get_object_or_404(Device, id=id))
    return {"success": True}
