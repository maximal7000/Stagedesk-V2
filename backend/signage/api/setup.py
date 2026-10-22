from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Router
from ninja.errors import HttpError

from core.auth import keycloak_auth
from .. import display, push, webuntis
from ..permissions import _require_perm
from ..consumers import push_power_to_all
from ..models import DisplayView, EmergencyTemplate, HolidayPeriod, Screen
from ..power import next_on_time
from ..validation import validate_view_data
from ..schemas import (
    EmergencyTemplateCreateSchema, EmergencyTemplateSchema,
    HolidayPeriodCreateSchema, HolidayPeriodSchema, ScreenSelectionSchema, ViewPreviewSchema,
)

router = Router()


def _validate_holiday(payload: HolidayPeriodCreateSchema):
    if payload.end_date < payload.start_date:
        raise HttpError(422, "Das Enddatum liegt vor dem Startdatum. Bitte das Enddatum anpassen.")


@router.get("/holidays", response=list[HolidayPeriodSchema], auth=keycloak_auth)
def list_holidays(request):
    _require_perm(request, 'signage.power')
    return HolidayPeriod.objects.all()


@router.post("/holidays", response=HolidayPeriodSchema, auth=keycloak_auth)
def create_holiday(request, payload: HolidayPeriodCreateSchema):
    _require_perm(request, 'signage.power')
    _validate_holiday(payload)
    holiday = HolidayPeriod.objects.create(**payload.dict())
    push.notify_changed_on_commit()
    push_power_to_all()
    return holiday


@router.put("/holidays/{id}", response=HolidayPeriodSchema, auth=keycloak_auth)
def update_holiday(request, id: int, payload: HolidayPeriodCreateSchema):
    _require_perm(request, 'signage.power')
    _validate_holiday(payload)
    holiday = get_object_or_404(HolidayPeriod, id=id)
    for key, value in payload.dict().items():
        setattr(holiday, key, value)
    holiday.save()
    push.notify_changed_on_commit()
    push_power_to_all()
    return holiday


@router.delete("/holidays/{id}", auth=keycloak_auth)
def delete_holiday(request, id: int):
    _require_perm(request, 'signage.power')
    get_object_or_404(HolidayPeriod, id=id).delete()
    push.notify_changed_on_commit()
    push_power_to_all()
    return {"success": True}


@router.get("/emergency-templates", response=list[EmergencyTemplateSchema], auth=keycloak_auth)
def list_emergency_templates(request):
    _require_perm(request, 'signage.emergency')
    return EmergencyTemplate.objects.all()


@router.post("/emergency-templates", response=EmergencyTemplateSchema, auth=keycloak_auth)
def create_emergency_template(request, payload: EmergencyTemplateCreateSchema):
    _require_perm(request, 'signage.emergency')
    return EmergencyTemplate.objects.create(**payload.dict())


@router.put("/emergency-templates/{id}", response=EmergencyTemplateSchema, auth=keycloak_auth)
def update_emergency_template(request, id: int, payload: EmergencyTemplateCreateSchema):
    _require_perm(request, 'signage.emergency')
    template = get_object_or_404(EmergencyTemplate, id=id)
    for key, value in payload.dict().items():
        setattr(template, key, value)
    template.save()
    return template


@router.delete("/emergency-templates/{id}", auth=keycloak_auth)
def delete_emergency_template(request, id: int):
    _require_perm(request, 'signage.emergency')
    get_object_or_404(EmergencyTemplate, id=id).delete()
    return {"success": True}


def _selected_screens(payload: ScreenSelectionSchema):
    screens = Screen.objects.all()
    if payload.screen_ids:
        screens = screens.filter(id__in=payload.screen_ids)
    return screens


@router.post("/screens/power-off-today", auth=keycloak_auth)
def power_off_today(request, payload: ScreenSelectionSchema):
    """Sets off_until to the start of the next schedule window."""
    _require_perm(request, 'signage.power')
    now = timezone.now()
    result = {}
    for screen in _selected_screens(payload):
        screen.off_until = next_on_time(screen, now)
        screen.save(update_fields=['off_until', 'updated_at'])
        result[str(screen.id)] = screen.off_until.isoformat()
    push.notify_changed_on_commit()
    push_power_to_all()
    return {"off_until": result}


@router.delete("/screens/power-off-today", auth=keycloak_auth)
def undo_power_off_today(request, payload: ScreenSelectionSchema):
    _require_perm(request, 'signage.power')
    _selected_screens(payload).update(off_until=None, updated_at=timezone.now())
    push.notify_changed_on_commit()
    push_power_to_all()
    return {"success": True}


@router.post("/webuntis/check", auth=keycloak_auth)
def check_webuntis(request):
    """Re-detect the source. Only yes/no per path and the source, no data."""
    _require_perm(request, 'signage.setup')
    result = webuntis.check()
    push.notify_changed_on_commit()
    return result


@router.post("/views/preview", auth=keycloak_auth)
def create_view_preview(request, payload: ViewPreviewSchema):
    """Stores the draft (nothing is saved) and returns a token for GET /display?preview=."""
    _require_perm(request, 'signage.setup')
    draft = payload.view.dict(exclude_unset=True)
    saved = None
    if draft.get('id'):
        saved = DisplayView.objects.filter(id=draft['id'], deleted_at__isnull=True).first()
        if saved is None:
            raise HttpError(404, "Die Ansicht existiert nicht mehr. Bitte die Seite neu laden.")
    # Validate as on save: a broken draft is a 422 with a message, not a 500 when displayed
    draft = validate_view_data(draft, own_id=saved.id if saved else None,
                               current_kind=saved.kind if saved else None)
    if payload.screen_id and not Screen.objects.filter(id=payload.screen_id).exists():
        raise HttpError(404, "Der Bildschirm existiert nicht mehr. Bitte einen anderen wählen.")
    return {'token': display.store_preview(draft, payload.screen_id)}
