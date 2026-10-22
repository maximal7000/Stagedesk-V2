import re

from django.shortcuts import get_object_or_404
from ninja import Router
from ninja.errors import HttpError

from core.auth import keycloak_auth
from .. import push
from ..models import Announcement, DisplayEvent, DisplayEventScreen, Exam, ExamTemplate, Screen
from ..permissions import _log_audit, _require_perm
from ..schemas import (
    AnnouncementCreateSchema, AnnouncementSchema, DisplayEventCreateSchema, DisplayEventSchema,
    DisplayEventUpdateSchema, ExamCreateSchema, ExamSchema, ExamTemplateCreateSchema,
    ExamTemplateSchema, ExamUpdateSchema,
)

router = Router(tags=["Monitor"])


_HEX_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


def _clamp_int(v, lo, hi):
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return None


def _validate_exam_data(data: dict) -> dict:
    start, end = data.get('active_from'), data.get('active_until')
    if start and end and start >= end:
        raise HttpError(422, "Klausur: Ende muss nach dem Beginn liegen")
    if 'split_percent' in data and data['split_percent'] is not None:
        c = _clamp_int(data['split_percent'], 20, 80)
        if c is not None:
            data['split_percent'] = c
    if data.get('color') and not _HEX_RE.match(str(data['color'])):
        data.pop('color')
    return data


@router.get("/announcements", response=list[AnnouncementSchema], auth=keycloak_auth)
def list_announcements(request):
    _require_perm(request, 'signage.view')
    return Announcement.objects.all()


@router.post("/announcements", response=AnnouncementSchema, auth=keycloak_auth)
def create_announcement(request, payload: AnnouncementCreateSchema):
    _require_perm(request, 'signage.exams')
    announcement = Announcement.objects.create(**payload.dict())
    push.notify_changed_on_commit()
    return announcement


@router.put("/announcements/{id}", response=AnnouncementSchema, auth=keycloak_auth)
def update_announcement(request, id: int, payload: AnnouncementCreateSchema):
    _require_perm(request, 'signage.exams')
    a = get_object_or_404(Announcement, id=id)
    for key, value in payload.dict().items():
        setattr(a, key, value)
    a.save()
    push.notify_changed_on_commit()
    return a


@router.delete("/announcements/{id}", auth=keycloak_auth)
def delete_announcement(request, id: int):
    _require_perm(request, 'signage.exams')
    a = get_object_or_404(Announcement, id=id)
    a.delete()
    push.notify_changed_on_commit()
    return {"success": True}


@router.get("/exams", response=list[ExamSchema], auth=keycloak_auth)
def list_exams(request):
    _require_perm(request, 'signage.view')
    return list(Exam.objects.prefetch_related('screens').all())


@router.post("/exams", response=ExamSchema, auth=keycloak_auth)
def create_exam(request, payload: ExamCreateSchema):
    _require_perm(request, 'signage.exams')
    data = payload.dict()
    _validate_exam_data(data)
    screen_ids = data.pop('screen_ids', [])
    exam = Exam.objects.create(**data)
    if screen_ids:
        exam.screens.set(Screen.objects.filter(id__in=screen_ids))
    push.notify_changed_on_commit()
    return exam


@router.put("/exams/{id}", response=ExamSchema, auth=keycloak_auth)
def update_exam(request, id: int, payload: ExamUpdateSchema):
    _require_perm(request, 'signage.exams')
    exam = get_object_or_404(Exam, id=id)
    data = payload.dict(exclude_unset=True)
    _validate_exam_data(data)
    screen_ids = data.pop('screen_ids', None)
    for key, value in data.items():
        setattr(exam, key, value)
    exam.save()
    if screen_ids is not None:
        exam.screens.set(Screen.objects.filter(id__in=screen_ids))
    push.notify_changed_on_commit()
    return exam


@router.delete("/exams/{id}", auth=keycloak_auth)
def delete_exam(request, id: int):
    _require_perm(request, 'signage.exams')
    exam = get_object_or_404(Exam, id=id)
    exam.delete()
    push.notify_changed_on_commit()
    return {"success": True}


def _apply_event_assignments(event, assignments):
    event.assignments.all().delete()
    for a in assignments or []:
        d = a if isinstance(a, dict) else a.dict()
        if d.get('screen_id') and d.get('view_id'):
            DisplayEventScreen.objects.create(
                event=event, screen_id=d['screen_id'], view_id=d['view_id'])


@router.get("/events", response=list[DisplayEventSchema], auth=keycloak_auth)
def list_events(request):
    _require_perm(request, 'signage.view')
    return DisplayEvent.objects.all()


@router.post("/events", response=DisplayEventSchema, auth=keycloak_auth)
def create_event(request, payload: DisplayEventCreateSchema):
    _require_perm(request, 'signage.exams')
    data = payload.dict()
    assignments = data.pop('assignments', [])
    event = DisplayEvent.objects.create(**data)
    _apply_event_assignments(event, assignments)
    push.notify_changed_on_commit()
    return event


@router.put("/events/{id}", response=DisplayEventSchema, auth=keycloak_auth)
def update_event(request, id: int, payload: DisplayEventUpdateSchema):
    _require_perm(request, 'signage.exams')
    event = get_object_or_404(DisplayEvent, id=id)
    data = payload.dict(exclude_unset=True)
    assignments = data.pop('assignments', None)
    for key, value in data.items():
        setattr(event, key, value)
    event.save()
    if assignments is not None:
        _apply_event_assignments(event, assignments)
    push.notify_changed_on_commit()
    return event


@router.delete("/events/{id}", auth=keycloak_auth)
def delete_event(request, id: int):
    _require_perm(request, 'signage.exams')
    get_object_or_404(DisplayEvent, id=id).delete()
    push.notify_changed_on_commit()
    return {"success": True}


@router.post("/events/{id}/activate", response=DisplayEventSchema, auth=keycloak_auth)
def activate_event(request, id: int):
    _require_perm(request, 'signage.exams')
    event = get_object_or_404(DisplayEvent, id=id)
    event.is_active = True
    event.save(update_fields=['is_active'])
    push.notify_changed_on_commit()
    _log_audit(request, 'Event aktiviert', event.name)
    return event


@router.post("/events/{id}/deactivate", response=DisplayEventSchema, auth=keycloak_auth)
def deactivate_event(request, id: int):
    _require_perm(request, 'signage.exams')
    event = get_object_or_404(DisplayEvent, id=id)
    event.is_active = False
    event.save(update_fields=['is_active'])
    push.notify_changed_on_commit()
    _log_audit(request, 'Event deaktiviert', event.name)
    return event


@router.get("/exam-templates", response=list[ExamTemplateSchema], auth=keycloak_auth)
def list_exam_templates(request):
    _require_perm(request, 'signage.view')
    return ExamTemplate.objects.all()


@router.post("/exam-templates", response=ExamTemplateSchema, auth=keycloak_auth)
def create_exam_template(request, payload: ExamTemplateCreateSchema):
    _require_perm(request, 'signage.exams')
    template = ExamTemplate.objects.create(**payload.dict())
    push.notify_changed_on_commit()
    return template


@router.put("/exam-templates/{id}", response=ExamTemplateSchema, auth=keycloak_auth)
def update_exam_template(request, id: int, payload: ExamTemplateCreateSchema):
    _require_perm(request, 'signage.exams')
    template = get_object_or_404(ExamTemplate, id=id)
    for key, value in payload.dict().items():
        setattr(template, key, value)
    template.save()
    push.notify_changed_on_commit()
    return template


@router.delete("/exam-templates/{id}", auth=keycloak_auth)
def delete_exam_template(request, id: int):
    _require_perm(request, 'signage.exams')
    get_object_or_404(ExamTemplate, id=id).delete()
    push.notify_changed_on_commit()
    return {"success": True}
