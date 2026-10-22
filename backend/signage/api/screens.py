"""Bildschirme: Verwaltung, Power-Status und CEC-Meldung für Pi-Skripte."""
import logging
import uuid

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from ninja import Router
from ninja.errors import HttpError

from core.auth import keycloak_auth
from .. import devices, push
from ..models import Device, generate_access_key, Screen
from ..permissions import _require_perm
from ..schemas import ScreenCreateSchema, ScreenListSchema, ScreenUpdateSchema
from ..validation import validate_screen_device_data, validate_screen_schedule

logger = logging.getLogger(__name__)

router = Router(tags=["Monitor"])


# ═══ Bildschirm: Power-Status (öffentlich, kein Auth) ═════════════

@router.get("/screen/power")
def get_screen_power(request, slug: str):
    """Öffentlicher Endpunkt: Soll der Bildschirm gerade an sein?
    Wird vom Raspberry Pi per Cronjob gepollt. Die Antwortschlüssel folgen
    den neuen Feldnamen."""
    try:
        screen = Screen.objects.get(slug=slug)
        return {
            'slug': screen.slug,
            'power': screen.get_power_state(),
            # Alte Form für Pi-Skripte: Zeilen mit Standard-Ansicht als Einschaltzeiten
            'power_schedule': [{'days': row.get('days', []), 'from': row.get('from', ''),
                                'until': row.get('until', '')}
                               for row in (screen.schedule or []) if isinstance(row, dict) and not row.get('view_id')],
            # Der Ferienmodus-Schalter ist entfallen (jetzt power_mode='manual_off'); Schlüssel bleibt für Pi-Skripte.
            'holiday_mode': False,
            'power_exceptions': screen.power_exceptions,
            'cec_status': screen.cec_status,
            'cec_status_at': screen.cec_status_at,
        }
    except Screen.DoesNotExist:
        return {'slug': slug, 'power': True, 'error': 'Bildschirm nicht gefunden'}


@router.post("/screen/cec-status")
def report_cec_status(request, slug: str, status: str):
    """Öffentlicher Endpunkt: Pi meldet den tatsächlichen CEC-Status zurück.
    status: 'on', 'standby', 'unknown'"""
    try:
        screen = Screen.objects.get(slug=slug)
        screen.cec_status = status[:20]
        screen.cec_status_at = timezone.now()
        screen.save(update_fields=['cec_status', 'cec_status_at', 'updated_at'])
        return {'success': True, 'slug': screen.slug, 'cec_status': screen.cec_status}
    except Screen.DoesNotExist:
        return {'success': False, 'error': 'Bildschirm nicht gefunden'}


# ═══ Admin: Bildschirme ═══════════════════════════════════════════

def _hide_key_without_setup(request, screens):
    """access_key gibt den Vertretungsplan frei: nur mit signage.setup ausliefern.
    Leert nur das Attribut der Antwort-Objekte, gespeichert wird nichts."""
    try:
        _require_perm(request, 'signage.setup')
    except HttpError:
        for screen in screens:
            screen.access_key = ''
    return screens


@router.get("/screens", response=list[ScreenListSchema], auth=keycloak_auth)
def list_screens(request):
    _require_perm(request, 'signage.view')
    return _hide_key_without_setup(request, list(Screen.objects.all()))


@router.post("/screens", auth=keycloak_auth)
def create_screen(request, payload: ScreenCreateSchema):
    _require_perm(request, 'signage.setup')
    slug = slugify(payload.slug or payload.name) or uuid.uuid4().hex[:8]
    base_slug = slug
    counter = 1
    while Screen.objects.filter(slug=slug).exists():
        slug = f"{base_slug}-{counter}"
        counter += 1
    screen = Screen.objects.create(
        name=payload.name,
        slug=slug,
        default_view_id=payload.default_view_id,
    )
    push.notify_changed_on_commit()
    return {'id': screen.id, 'name': screen.name, 'slug': screen.slug}


# Felder, die ins `hello` des Geräte-Agenten gehören (Kiosk-URL, Power-Methode, Updates)
AGENT_HELLO_FIELDS = {'slug', 'power_method', 'power_config', 'auto_updates', 'update_window', 'daily_reboot'}
SCREEN_POWER_FIELDS = {'power_mode', 'schedule', 'power_exceptions', 'off_during_holidays', 'off_until'}
# Geräte-Felder gehören zum Recht devices (Spec §3.4)
NON_NULL_DEVICE_FIELDS = ('power_method', 'auto_updates', 'daily_reboot')
# Felder, die nie leer sind: ein ausdrückliches null gilt als nicht gesendet
NON_NULL_SCREEN_FIELDS = NON_NULL_DEVICE_FIELDS + ('color_scheme',)
SCREEN_DEVICE_FIELDS = {'power_method', 'power_config', 'auto_updates', 'update_window', 'daily_reboot'}


@router.put("/screens/{int:id}", response=ScreenListSchema, auth=keycloak_auth)
def update_screen(request, id: int, payload: ScreenUpdateSchema):
    # Power-Felder gehören zum Recht power, alles andere zu setup (Spec §3.5).
    data = payload.dict(exclude_unset=True)
    if not data or set(data) - SCREEN_POWER_FIELDS - SCREEN_DEVICE_FIELDS:
        _require_perm(request, 'signage.setup')
    if set(data) & SCREEN_POWER_FIELDS:
        _require_perm(request, 'signage.power')
    if set(data) & SCREEN_DEVICE_FIELDS:
        _require_perm(request, 'signage.devices')
    screen = get_object_or_404(Screen, id=id)
    # Ein ausdrückliches null hieße "leeren"; diese Felder sind nie leer, also wie nicht gesendet behandeln.
    for key in NON_NULL_SCREEN_FIELDS:
        if key in data and data[key] is None:
            del data[key]
    validate_screen_device_data(data, screen.power_method, screen.power_config)
    if 'schedule' in data:
        data['schedule'] = validate_screen_schedule(data['schedule'] or [])
    if 'default_view_id' in data:
        val = data.pop('default_view_id')
        screen.default_view_id = val if val else None
    if 'override_view_id' in data:
        val = data.pop('override_view_id')
        screen.override_view_id = val if val else None
    # Power-relevante Felder erkennen, damit wir den Pi sofort informieren
    power_changed = bool(SCREEN_POWER_FIELDS & set(data.keys()))
    hello_changed = bool(AGENT_HELLO_FIELDS & set(data.keys()))
    for key, value in data.items():
        setattr(screen, key, value)
    screen.save()
    push.notify_changed_on_commit()
    if hello_changed:
        transaction.on_commit(lambda: push.push_device_hello(screen))
    if power_changed:
        from ..consumers import push_power_to_screen
        try:
            push_power_to_screen(screen.slug)
        except Exception:
            # wie push_power_to_all: gespeichert ist gespeichert, der 30-s-Tick holt den Zustand nach
            logger.exception("Power-Push an %s fehlgeschlagen", screen.slug)
    return _hide_key_without_setup(request, [screen])[0]


@router.delete("/screens/{int:id}", auth=keycloak_auth)
def delete_screen(request, id: int):
    _require_perm(request, 'signage.setup')
    screen = get_object_or_404(Screen, id=id)
    with transaction.atomic():
        device = Device.objects.filter(screen=screen).first()
        if device is not None:
            devices.unpair(device)  # Token zurückziehen und Verbindung schließen, sonst bleibt das Gerät aktiv
        screen.delete()
    push.notify_changed_on_commit()
    return {"success": True}


@router.post("/screens/{int:id}/reload", auth=keycloak_auth)
def reload_screen(request, id: int):
    """Fordert einen Neuladen der Ansicht auf dem Display an (das Display pollt reload_requested_at)."""
    _require_perm(request, 'signage.setup')
    screen = get_object_or_404(Screen, id=id)
    screen.reload_requested_at = timezone.now()
    screen.save(update_fields=['reload_requested_at'])
    slug = screen.slug
    transaction.on_commit(lambda: push.notify_reload(slug))
    return {"success": True}


@router.post("/screens/{int:id}/regenerate-key", response=ScreenListSchema, auth=keycloak_auth)
def regenerate_screen_key(request, id: int):
    """Neuer access_key; die alte Kiosk-URL bekommt danach keine Vertretungsdaten mehr."""
    _require_perm(request, 'signage.setup')
    screen = get_object_or_404(Screen, id=id)
    screen.access_key = generate_access_key()
    screen.save(update_fields=['access_key', 'updated_at'])
    push.notify_changed_on_commit([screen.slug])
    transaction.on_commit(lambda: push.push_device_hello(screen))
    return screen
