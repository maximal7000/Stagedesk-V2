"""
Monitor API, Geräte-Router: Kopplung per Code, Entkoppeln, Token zurückziehen.

Wird in api.py per monitor_router.add_router("", devices_router) eingebunden.
Die beiden agent/pair-Routen sind öffentlich (auth=None): der Agent hat vor der Kopplung keinen Token.
"""
import io
import secrets
import uuid

from django.core.cache import cache
from django.conf import settings
from django.core.files.base import ContentFile
from django.http import Http404, HttpResponse
from django.utils import timezone
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from ninja import File, Form, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from core.auth import keycloak_auth
from . import agent_package, devices, push
from .models import Device, DeviceCommand, DeviceEvent, MonitorSettings, Screen
from .permissions import _require_perm
from .schemas import (
    DeviceCommandCreateSchema, DeviceCommandSchema, DeviceEventSchema, DevicePairSchema, DeviceSchema,
    PairPollSchema, PairStartSchema)

devices_router = Router()

MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024
PNG_MAGIC = b'\x89PNG\r\n\x1a\n'
POWER_COMMANDS = {'power_on', 'power_off'}
REDACTED_KEYS = {'serial', 'ip', 'mac'}

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


@devices_router.get("/agent/install.sh", auth=None)
def agent_install_script(request):
    """Installationsskript mit eingesetzter Server-URL; öffentlich, enthält keine Geheimnisse."""
    try:
        text = agent_package.install_script_path().read_text(encoding="utf-8")
    except OSError:
        raise Http404("Das Installationsskript fehlt auf dem Server.")
    text = text.replace("__STAGEDESK_SERVER__", settings.PUBLIC_BASE_URL)
    return HttpResponse(text, content_type="text/plain; charset=utf-8")


@devices_router.get("/agent/version", auth=None)
def agent_version(request):
    version, sha256 = agent_package.agent_package_info()
    return {"version": version, "sha256": sha256}


@devices_router.get("/agent/stagedesk-agent-{version}.tar.gz", auth=None)
def agent_tarball(request, version: str):
    current, _ = agent_package.agent_package_info()
    if version != current:
        raise Http404("Diese Agent-Version wird nicht ausgeliefert.")
    response = HttpResponse(agent_package.build_package(), content_type="application/gzip")
    response["Content-Disposition"] = f'attachment; filename="stagedesk-agent-{version}.tar.gz"'
    return response


def _failed_key(request) -> str:
    return f"monitor:pair-fail:{request.auth.get('sub', '')}"


def _unique_slug(name: str) -> str:
    base = slugify(name) or uuid.uuid4().hex[:8]
    slug, counter = base, 1
    while Screen.objects.filter(slug=slug).exists():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _can(request, code: str) -> bool:
    try:
        _require_perm(request, code)
        return True
    except HttpError:
        return False


def _redact(value):
    """Seriennummer, IP und MAC (auch verschachtelt) auf null setzen."""
    if isinstance(value, dict):
        return {k: (None if k in REDACTED_KEYS else _redact(v)) for k, v in value.items()}
    return value


def device_row(device, screen, cfg, now, can_see_ids: bool) -> dict:
    status, text = devices.device_status(device, screen, cfg, now)
    telemetry = device.last_telemetry or {}
    return {
        'id': device.id, 'screen_id': screen.id if screen else None,
        'serial': device.serial if can_see_ids else None, 'model': device.model,
        'status': status, 'status_text': text, 'agent_version': device.agent_version,
        'last_seen_at': device.last_seen_at, 'token_created_at': device.token_created_at,
        'revoked_at': device.revoked_at, 'created_at': device.created_at,
        'telemetry': telemetry if can_see_ids else _redact(telemetry),
        'warnings': device.active_warnings or [],
        'last_screenshot_url': device.last_screenshot.url if device.last_screenshot else None,
        'last_screenshot_at': device.last_screenshot_at, 'legacy': False,
    }


def _legacy_row(screen, cfg, now) -> dict:
    status, text = devices.device_status(None, screen, cfg, now)
    return {'id': None, 'screen_id': screen.id, 'serial': None, 'model': '', 'status': status,
            'status_text': text, 'agent_version': '', 'last_seen_at': screen.cec_status_at,
            'token_created_at': None, 'revoked_at': None, 'created_at': None, 'telemetry': {},
            'warnings': [], 'last_screenshot_url': None, 'last_screenshot_at': None, 'legacy': True}


@devices_router.get("/devices", response=list[DeviceSchema], auth=keycloak_auth)
def list_devices(request):
    _require_perm(request, 'monitor.view')
    can_see_ids = _can(request, 'monitor.devices')
    cfg, now = MonitorSettings.load(), timezone.now()
    active = list(Device.objects.filter(revoked_at__isnull=True).select_related('screen'))
    rows = [device_row(d, d.screen, cfg, now, can_see_ids) for d in active]
    # Altes Skript: Verbindung ohne Token (cec_status_at jung), kein Gerät am Bildschirm
    screens = Screen.objects.filter(cec_status_at__gte=now - devices.ONLINE_WINDOW).exclude(
        id__in=[d.screen_id for d in active if d.screen_id])
    rows += [_legacy_row(s, cfg, now) for s in screens]
    return rows


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
    return device_row(device, screen, MonitorSettings.load(), timezone.now(), True)


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


def _author(request):
    auth = request.auth or {}
    name = auth.get('name') or auth.get('preferred_username') or auth.get('sub', '')
    return auth.get('sub', ''), name


@devices_router.post("/devices/{int:id}/commands", response=DeviceCommandSchema, auth=keycloak_auth)
def create_device_command(request, id: int, payload: DeviceCommandCreateSchema):
    _require_perm(request, 'monitor.devices')
    if payload.kind in POWER_COMMANDS:
        _require_perm(request, 'monitor.power')
    device = get_object_or_404(Device.objects.select_related('screen'), id=id)
    if device.revoked_at is not None or device.screen is None:
        raise HttpError(409, "Das Gerät ist nicht mehr gekoppelt. Bitte den Bildschirm neu koppeln.")
    user_id, user_name = _author(request)
    command = devices.create_command(device, payload.kind, user_id, user_name)
    transaction.on_commit(lambda: push.push_device_command(command))
    if payload.kind == 'reload':
        slug = device.screen.slug
        transaction.on_commit(lambda: push.notify_reload(slug))
    return command


@devices_router.get("/devices/{int:id}/commands/{int:cid}", response=DeviceCommandSchema, auth=keycloak_auth)
def get_device_command(request, id: int, cid: int):
    _require_perm(request, 'monitor.devices')
    device = get_object_or_404(Device, id=id)
    devices.expire_old_commands(device)
    return get_object_or_404(DeviceCommand, id=cid, device=device)


@devices_router.get("/screens/{int:id}/events", response=list[DeviceEventSchema], auth=keycloak_auth)
def list_screen_events(request, id: int, kind: str = '', limit: int = 100):
    _require_perm(request, 'monitor.devices')
    get_object_or_404(Screen, id=id)
    qs = DeviceEvent.objects.filter(screen_id=id)
    if kind:
        qs = qs.filter(kind=kind)
    return list(qs.order_by('-created_at', '-id')[:max(1, min(limit, 500))])


def _agent_device(request):
    header = request.headers.get('Authorization', '')
    token = header[7:].strip() if header[:7].lower() == 'bearer ' else ''
    device = Device.for_token(token)
    if device is None:
        raise HttpError(401, "Das Gerät ist nicht angemeldet. Bitte den Bildschirm neu koppeln.")
    return device


@devices_router.post("/agent/screenshot", auth=None)
def upload_screenshot(request, file: UploadedFile = File(...), command_id: int = Form(None)):
    device = _agent_device(request)
    if file.size > MAX_SCREENSHOT_BYTES:
        raise HttpError(413, "Der Screenshot ist größer als 15 MB.")
    data = file.read()
    if not data.startswith(PNG_MAGIC):
        raise HttpError(422, "Der Screenshot ist kein PNG-Bild.")
    try:
        from PIL import Image
        Image.open(io.BytesIO(data)).verify()
    except Exception:
        raise HttpError(422, "Der Screenshot ist kein gültiges PNG-Bild.")
    old = device.last_screenshot
    old_name = old.name if old else ''
    # Zufälliger Name: die Datei liegt unter /media/ und soll nicht erratbar sein.
    device.last_screenshot.save(f"{device.id}-{secrets.token_hex(12)}.png", ContentFile(data), save=False)
    device.last_screenshot_at = timezone.now()
    device.save(update_fields=['last_screenshot', 'last_screenshot_at'])
    if old_name and old_name != device.last_screenshot.name:
        device.last_screenshot.storage.delete(old_name)
    qs = DeviceCommand.objects.filter(device=device, kind='screenshot', status__in=['pending', 'sent'])
    command = qs.filter(pk=command_id).first() if command_id else qs.order_by('-created_at').first()
    if command is not None:
        devices.finish_command(device, command.id, True, 'Screenshot gespeichert')
    return {"success": True}
