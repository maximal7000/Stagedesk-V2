"""
Monitor API, zweiter Router: Ferien, Notfall-Vorlagen, "bis Tagesende aus", WebUntis-Test, Vorschau.

Wird in api.py per monitor_router.add_router("", setup_router) eingebunden.
"""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Router
from ninja.errors import HttpError

from core.auth import keycloak_auth
from . import display, webuntis
from .permissions import _require_perm
from .consumers import push_power_to_all
from .models import DisplayView, EmergencyTemplate, HolidayPeriod, Screen
from .power import next_on_time
from .schemas import (
    EmergencyTemplateCreateSchema, EmergencyTemplateSchema,
    HolidayPeriodCreateSchema, HolidayPeriodSchema, ScreenSelectionSchema, ViewPreviewSchema,
)

setup_router = Router()


# ═══ Ferienzeiträume ══════════════════════════════════════════════

def _validate_holiday(payload: HolidayPeriodCreateSchema):
    if payload.end_date < payload.start_date:
        raise HttpError(422, "Das Enddatum liegt vor dem Startdatum. Bitte das Enddatum anpassen.")


@setup_router.get("/holidays", response=list[HolidayPeriodSchema], auth=keycloak_auth)
def list_holidays(request):
    _require_perm(request, 'monitor.power')
    return HolidayPeriod.objects.all()


@setup_router.post("/holidays", response=HolidayPeriodSchema, auth=keycloak_auth)
def create_holiday(request, payload: HolidayPeriodCreateSchema):
    _require_perm(request, 'monitor.power')
    _validate_holiday(payload)
    holiday = HolidayPeriod.objects.create(**payload.dict())
    push_power_to_all()
    return holiday


@setup_router.put("/holidays/{id}", response=HolidayPeriodSchema, auth=keycloak_auth)
def update_holiday(request, id: int, payload: HolidayPeriodCreateSchema):
    _require_perm(request, 'monitor.power')
    _validate_holiday(payload)
    holiday = get_object_or_404(HolidayPeriod, id=id)
    for key, value in payload.dict().items():
        setattr(holiday, key, value)
    holiday.save()
    push_power_to_all()
    return holiday


@setup_router.delete("/holidays/{id}", auth=keycloak_auth)
def delete_holiday(request, id: int):
    _require_perm(request, 'monitor.power')
    get_object_or_404(HolidayPeriod, id=id).delete()
    push_power_to_all()
    return {"success": True}


# ═══ Notfall-Vorlagen ═════════════════════════════════════════════

@setup_router.get("/emergency-templates", response=list[EmergencyTemplateSchema], auth=keycloak_auth)
def list_emergency_templates(request):
    _require_perm(request, 'monitor.emergency')
    return EmergencyTemplate.objects.all()


@setup_router.post("/emergency-templates", response=EmergencyTemplateSchema, auth=keycloak_auth)
def create_emergency_template(request, payload: EmergencyTemplateCreateSchema):
    _require_perm(request, 'monitor.emergency')
    return EmergencyTemplate.objects.create(**payload.dict())


@setup_router.put("/emergency-templates/{id}", response=EmergencyTemplateSchema, auth=keycloak_auth)
def update_emergency_template(request, id: int, payload: EmergencyTemplateCreateSchema):
    _require_perm(request, 'monitor.emergency')
    template = get_object_or_404(EmergencyTemplate, id=id)
    for key, value in payload.dict().items():
        setattr(template, key, value)
    template.save()
    return template


@setup_router.delete("/emergency-templates/{id}", auth=keycloak_auth)
def delete_emergency_template(request, id: int):
    _require_perm(request, 'monitor.emergency')
    get_object_or_404(EmergencyTemplate, id=id).delete()
    return {"success": True}


# ═══ "Bis Tagesende aus" ══════════════════════════════════════════

def _selected_screens(payload: ScreenSelectionSchema):
    screens = Screen.objects.all()
    if payload.screen_ids:
        screens = screens.filter(id__in=payload.screen_ids)
    return screens


@setup_router.post("/screens/power-off-today", auth=keycloak_auth)
def power_off_today(request, payload: ScreenSelectionSchema):
    """Setzt off_until auf den Beginn des nächsten Zeitplan-Fensters (Spec §3.2)."""
    _require_perm(request, 'monitor.power')
    now = timezone.now()
    result = {}
    for screen in _selected_screens(payload):
        screen.off_until = next_on_time(screen, now)
        screen.save(update_fields=['off_until', 'updated_at'])
        result[str(screen.id)] = screen.off_until.isoformat()
    push_power_to_all()
    return {"off_until": result}


@setup_router.delete("/screens/power-off-today", auth=keycloak_auth)
def undo_power_off_today(request, payload: ScreenSelectionSchema):
    """Rückgängig: off_until wieder leeren."""
    _require_perm(request, 'monitor.power')
    _selected_screens(payload).update(off_until=None, updated_at=timezone.now())
    push_power_to_all()
    return {"success": True}


# ═══ WebUntis ═════════════════════════════════════════════════════

@setup_router.post("/webuntis/check", auth=keycloak_auth)
def check_webuntis(request):
    """Quelle neu erkennen (Spec §4.3). Nur Ja/Nein pro Weg und die Quelle, keine Daten."""
    _require_perm(request, 'monitor.setup')
    return webuntis.check()


# ═══ Vorschau ═════════════════════════════════════════════════════

@setup_router.post("/views/preview", auth=keycloak_auth)
def create_view_preview(request, payload: ViewPreviewSchema):
    """Entwurf ablegen (nichts wird gespeichert) → Token für GET /display?preview= (Spec §4.5)."""
    _require_perm(request, 'monitor.setup')
    draft = payload.view.dict(exclude_unset=True)
    if draft.get('id') and not DisplayView.objects.filter(id=draft['id'], deleted_at__isnull=True).exists():
        raise HttpError(404, "Die Ansicht existiert nicht mehr. Bitte die Seite neu laden.")
    if payload.screen_id and not Screen.objects.filter(id=payload.screen_id).exists():
        raise HttpError(404, "Der Bildschirm existiert nicht mehr. Bitte einen anderen wählen.")
    return {'token': display.store_preview(draft, payload.screen_id)}
