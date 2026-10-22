"""Globale Einstellungen, ON AIR, Notfall und WebUntis-Link-Bibliothek."""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Router
from ninja.errors import HttpError

from core.auth import keycloak_auth
from .. import push
from ..consumers import push_power_to_all
from ..models import DisplayView, MonitorSettings, WebUntisLink
from ..permissions import _log_audit, _require_perm
from ..schemas import (
    EmergencySchema, MonitorSettingsSchema, MonitorSettingsUpdateSchema, OnAirSchema,
    WebUntisLinkCreateSchema, WebUntisLinkSchema,
)
from ..validation import validate_settings_device_data, validate_settings_light_times

router = Router(tags=["Monitor"])


# ═══ ON AIR Endpunkt (Token-Auth) ════════════════════════════════

def _set_on_air(active: bool):
    settings = MonitorSettings.load()
    settings.on_air_active = active
    settings.on_air_since = timezone.now() if active else None
    settings.save(update_fields=['on_air_active', 'on_air_since'])
    push.notify_changed_on_commit()


def _set_emergency(active: bool, text: str, note: str):
    """Notfall setzen und alle Bildschirme neu schalten (Notfall schaltet ein, Spec §3.2)."""
    settings = MonitorSettings.load()
    settings.emergency_active = active
    settings.emergency_text = text
    settings.emergency_note = note
    settings.emergency_since = timezone.now() if active else None
    settings.save(update_fields=['emergency_active', 'emergency_text', 'emergency_note', 'emergency_since'])
    push.notify_changed_on_commit()
    push_power_to_all()


@router.post("/on-air", response={200: dict, 401: dict, 403: dict})
def toggle_on_air(request, payload: OnAirSchema):
    """ON AIR Status ändern (global, MonitorSettings)"""
    # Erst per Token prüfen
    token = request.headers.get('X-Monitor-Token', '')
    if token:
        if DisplayView.objects.filter(api_token=token).exists():
            _set_on_air(payload.on_air)
            _log_audit(request, 'ON AIR ' + ('an' if payload.on_air else 'aus'), via_token=True)
            return 200, {"success": True, "on_air": payload.on_air}
        return 401, {"success": False, "message": "Ungültiges Token"}

    auth_result = keycloak_auth(request)
    if not auth_result:
        return 401, {"success": False, "message": "Nicht autorisiert"}
    request.auth = auth_result
    try:
        _require_perm(request, 'signage.onair')
    except HttpError as e:
        return 403, {"success": False, "message": e.message}
    _set_on_air(payload.on_air)
    _log_audit(request, 'ON AIR ' + ('an' if payload.on_air else 'aus'))
    return 200, {"success": True, "on_air": payload.on_air}


# ═══ Notfall Endpunkt (Token-Auth) ═══════════════════════════════

@router.post("/emergency", response={200: dict, 401: dict, 403: dict})
def toggle_emergency(request, payload: EmergencySchema):
    """Notfall-Meldung aktivieren/deaktivieren (global, MonitorSettings)"""
    token = request.headers.get('X-Monitor-Token', '')
    if token:
        if DisplayView.objects.filter(api_token=token).exists():
            _set_emergency(payload.active, payload.text, payload.note)
            _log_audit(request, 'Notfall ' + ('an' if payload.active else 'aus'), payload.text if payload.active else '', via_token=True)
            return 200, {"success": True}
        return 401, {"success": False, "message": "Ungültiges Token"}

    auth_result = keycloak_auth(request)
    if not auth_result:
        return 401, {"success": False, "message": "Nicht autorisiert"}
    request.auth = auth_result
    try:
        _require_perm(request, 'signage.emergency')
    except HttpError as e:
        return 403, {"success": False, "message": e.message}
    _set_emergency(payload.active, payload.text, payload.note)
    _log_audit(request, 'Notfall ' + ('an' if payload.active else 'aus'), payload.text if payload.active else '')
    return 200, {"success": True}


# ═══ Admin: WebUntis-Link-Bibliothek ═════════════════════════════

@router.get("/webuntis-links", response=list[WebUntisLinkSchema], auth=keycloak_auth)
def list_webuntis_links(request):
    _require_perm(request, 'signage.view')
    return WebUntisLink.objects.all()


@router.post("/webuntis-links", response=WebUntisLinkSchema, auth=keycloak_auth)
def create_webuntis_link(request, payload: WebUntisLinkCreateSchema):
    _require_perm(request, 'signage.setup')
    link = WebUntisLink.objects.create(**payload.dict())
    push.notify_changed_on_commit()
    return link


@router.put("/webuntis-links/{id}", response=WebUntisLinkSchema, auth=keycloak_auth)
def update_webuntis_link(request, id: int, payload: WebUntisLinkCreateSchema):
    _require_perm(request, 'signage.setup')
    link = get_object_or_404(WebUntisLink, id=id)
    for key, value in payload.dict().items():
        setattr(link, key, value)
    link.save()
    push.notify_changed_on_commit()
    return link


@router.delete("/webuntis-links/{id}", auth=keycloak_auth)
def delete_webuntis_link(request, id: int):
    _require_perm(request, 'signage.setup')
    get_object_or_404(WebUntisLink, id=id).delete()
    push.notify_changed_on_commit()
    return {"success": True}


# ═══ Admin: Globale Einstellungen (Wetter/WebUntis-Zugang) ═══════

ON_AIR_SETTINGS_FIELDS = {'on_air_text', 'on_air_animation', 'on_air_show_clock'}
SETTINGS_SECRET_FIELDS = ('webuntis_password', 'weather_api_key')


@router.get("/settings", response=MonitorSettingsSchema, auth=keycloak_auth)
def get_settings(request):
    _require_perm(request, 'signage.view')
    return MonitorSettings.load()


@router.put("/settings", response=MonitorSettingsSchema, auth=keycloak_auth)
def update_settings(request, payload: MonitorSettingsUpdateSchema):
    # On-Air-Darstellung gehört zum Recht onair, alles andere zu setup (Spec §4.5).
    data = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    # Zugangsdaten sind write-only: leer heißt unverändert, geleert wird nur über *_clear (Ruling R22)
    for secret in SETTINGS_SECRET_FIELDS:
        if not data.get(secret):
            data.pop(secret, None)
        if data.pop(f'{secret}_clear', False):
            data[secret] = ''
    if not data or set(data) - ON_AIR_SETTINGS_FIELDS:
        _require_perm(request, 'signage.setup')
    if set(data) & ON_AIR_SETTINGS_FIELDS:
        _require_perm(request, 'signage.onair')
    validate_settings_device_data(data)
    settings = MonitorSettings.load()
    validate_settings_light_times(data, settings.light_from, settings.light_until)
    for key, value in data.items():
        setattr(settings, key, value)
    settings.save()
    push.notify_changed_on_commit()
    return settings
