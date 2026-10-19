"""
Monitor API — öffentliche + Admin-Endpunkte (Multi-Profil)
"""
import json
import re
import secrets
import uuid
from ninja import Router, File, Form
from ninja.files import UploadedFile
from django.db import transaction
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.utils.text import slugify

from core.auth import keycloak_auth
from ninja.errors import HttpError
from . import push
from .models import (
    DisplayView, Announcement, MediaFile, Screen, Exam, WebUntisLink,
    DisplayEvent, DisplayEventScreen, ExamTemplate, MonitorSettings,
    validate_rotation_items,
)


def _log_audit(request, action, detail='', via_token=False):
    """Schreibt in den globalen Audit-Log (core.audit → inventar.AuditLog)."""
    from core.audit import log as _corelog
    low = action.lower()
    if 'deaktiv' in low or ' aus' in low:
        a = 'status_geaendert'
    elif 'aktiv' in low or ' an' in low:
        a = 'aktiviert'
    else:
        a = 'status_geaendert'
    name = f"{action}: {detail}" if detail else action
    _corelog(request, a, 'monitor', 0, name, {'via': 'token'} if via_token else None)
from .schemas import (
    DisplayViewSchema, DisplayViewUpdateSchema,
    DisplayViewListSchema, DisplayViewCreateSchema,
    AnnouncementSchema, AnnouncementCreateSchema,
    MediaFileSchema, OnAirSchema, EmergencySchema, LegacyEmergencySchema, DisplayViewVersionSchema,
    ScreenListSchema, ScreenCreateSchema, ScreenUpdateSchema,
    ExamSchema, ExamCreateSchema, ExamUpdateSchema,
    WebUntisLinkSchema, WebUntisLinkCreateSchema,
    DisplayEventSchema, DisplayEventCreateSchema, DisplayEventUpdateSchema,
    ExamTemplateSchema, ExamTemplateCreateSchema,
    MonitorSettingsSchema, MonitorSettingsUpdateSchema,
)
from . import display, media, oepnv
from .display import _fetch_disruptions  # Admin-Störungsliste; Datenquellen liegen in display.py
from .consumers import push_power_to_all
from .permissions import _require_perm
from .api_setup import setup_router

monitor_router = Router(tags=["Monitor"])
# Ferien, Notfall-Vorlagen, "bis Tagesende aus"
monitor_router.add_router("", setup_router)

_HEX_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


def _clamp_int(v, lo, hi):
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return None


def _validate_view_data(data: dict, own_id=None, current_kind=None) -> dict:
    """Serverseitige Validierung/Sanitisierung der Ansicht-Update-Daten.
    Klemmt Zahlenbereiche, prüft Zeitfenster und Rotationseinträge."""
    for key, lo, hi in [
        ('split_left_percent', 20, 80), ('split_percent', 20, 80),
        ('webuntis_zoom', 25, 400),
    ]:
        if key in data and data[key] is not None:
            c = _clamp_int(data[key], lo, hi)
            if c is not None:
                data[key] = c
    # Zeitplan: Beginn < Ende erzwingen
    if 'schedule' in data and isinstance(data['schedule'], list):
        for e in data['schedule']:
            if isinstance(e, dict):
                start, end = e.get('from'), e.get('until')
                if start and end and str(start) >= str(end):
                    raise HttpError(422, f"Zeitfenster ungültig: {start} muss vor {end} liegen")
    # Leere Liste ist nur bei Rotations-Ansichten ein Fehler; andere Ansichten tragen sie mit.
    kind = data.get('kind', current_kind)
    if 'rotation_items' in data and (data['rotation_items'] or kind == 'rotation'):
        try:
            data['rotation_items'] = validate_rotation_items(data['rotation_items'], own_id=own_id)
        except ValueError as e:
            raise HttpError(422, str(e))
    return data


def _validate_exam_data(data: dict) -> dict:
    """Klausur-Daten prüfen: Zeitraum Beginn<Ende, split_percent, Hex-Farbe."""
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


# ═══ Öffentlicher Endpunkt (kein Auth) ═══════════════════════════

def _display_key_ok(request, screen, key):
    """Vertretungsdaten nur mit Schlüssel des Bildschirms oder angemeldet mit monitor.view (Spec §4.1).
    Ein ungültiger Login führt nie zu 401: /display bleibt öffentlich."""
    if screen and key and secrets.compare_digest(key.encode(), screen.access_key.encode()):
        return True
    if not request.headers.get('Authorization', '').startswith('Bearer '):
        return False
    try:
        auth = keycloak_auth(request)
        if not auth:
            return False
        request.auth = auth
        _require_perm(request, 'monitor.view')
        return True
    except Exception:
        return False


@monitor_router.get("/display")
def get_display_data(request, view: str = None, screen: str = None,
                     profil: str = None, bildschirm: str = None,
                     key: str = None, preview: str = None):
    """Öffentlicher Endpunkt: Display-Vertrag (display.build_payload).
    Die alten Query-Namen `profil` und `bildschirm` gelten weiter (Kiosk-URLs)."""
    now = timezone.now()
    if preview:
        entry = display.load_preview(preview)
        if entry is None:
            raise HttpError(404, "Die Vorschau ist abgelaufen. Bitte die Vorschau neu öffnen.")
        screen_obj = Screen.objects.filter(id=entry['screen_id']).first() if entry.get('screen_id') else None
        return display.build_payload(screen_obj, display.draft_view(entry['view']), key_ok=True, now=now)

    screen_slug = screen or bildschirm
    screen_obj = None
    if screen_slug:
        screen_obj = Screen.objects.filter(slug=screen_slug).first()
        if screen_obj is None:
            return display.build_payload(None, None, key_ok=False, now=now)
        view_obj = screen_obj.get_active_view()
    else:
        view_obj = DisplayView.get(slug=view or profil)
    key_ok = _display_key_ok(request, screen_obj, key)
    return display.build_payload(screen_obj, view_obj, key_ok=key_ok, now=now)


@monitor_router.get("/clock")
def get_clock_data(request):
    """Schlanker öffentlicher Endpunkt für externe Uhr-/Status-Displays:
    ON-AIR-Status + nächste Veranstaltungen. Kein Login nötig.
    Die Antwortform bleibt für externe Aufrufer unverändert."""
    now = timezone.now()
    settings = MonitorSettings.load()

    from veranstaltung.models import Veranstaltung
    upcoming = (Veranstaltung.objects
                .exclude(status='abgesagt')
                .filter(datum_bis__gte=now)
                .order_by('datum_von')[:5])
    events = [{
        'titel': v.titel,
        'ort': v.ort or '',
        'datum_von': v.datum_von,
        'datum_bis': v.datum_bis,
        'status': v.effektiv_status,
        'ist_laufend': v.effektiv_status == 'laufend',
    } for v in upcoming]

    return {
        'on_air': settings.on_air_active,
        'on_air_text': settings.on_air_text,
        'veranstaltungen': events,
    }


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


@monitor_router.post("/on-air", response={200: dict, 401: dict, 403: dict})
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
        _require_perm(request, 'monitor.onair')
    except HttpError as e:
        return 403, {"success": False, "message": e.message}
    _set_on_air(payload.on_air)
    _log_audit(request, 'ON AIR ' + ('an' if payload.on_air else 'aus'))
    return 200, {"success": True, "on_air": payload.on_air}


# ═══ Notfall Endpunkt (Token-Auth) ═══════════════════════════════

@monitor_router.post("/emergency", response={200: dict, 401: dict, 403: dict})
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
        _require_perm(request, 'monitor.emergency')
    except HttpError as e:
        return 403, {"success": False, "message": e.message}
    _set_emergency(payload.active, payload.text, payload.note)
    _log_audit(request, 'Notfall ' + ('an' if payload.active else 'aus'), payload.text if payload.active else '')
    return 200, {"success": True}


# ═══ Admin: Profile ══════════════════════════════════════════════

@monitor_router.get("/views", response=list[DisplayViewListSchema], auth=keycloak_auth)
def list_views(request):
    _require_perm(request, 'monitor.view')
    return DisplayView.objects.filter(deleted_at__isnull=True).order_by('sort_order', 'name')


@monitor_router.post("/views", auth=keycloak_auth)
def create_view(request, payload: DisplayViewCreateSchema):
    _require_perm(request, 'monitor.setup')
    slug = slugify(payload.slug or payload.name) or uuid.uuid4().hex[:8]

    # Slug-Kollision vermeiden
    base_slug = slug
    counter = 1
    while DisplayView.objects.filter(slug=slug).exists():
        slug = f"{base_slug}-{counter}"
        counter += 1

    if payload.clone_from_id:
        # Von bestehendem Profil klonen
        source = get_object_or_404(DisplayView, id=payload.clone_from_id)
        source.pk = None
        source.name = payload.name
        source.slug = slug
        source.is_default = False
        source.kind = payload.kind
        source.api_token = uuid.uuid4().hex
        source.save()
        push.notify_changed_on_commit()
        return {'id': source.id, 'name': source.name, 'slug': source.slug}
    else:
        view = DisplayView(
            name=payload.name,
            slug=slug,
            is_default=False,
            kind=payload.kind,
        )
        view.save()
        push.notify_changed_on_commit()
        return {'id': view.id, 'name': view.name, 'slug': view.slug}


@monitor_router.delete("/views/{int:id}", auth=keycloak_auth)
def delete_view(request, id: int):
    _require_perm(request, 'monitor.setup')
    view = get_object_or_404(DisplayView, id=id)
    if view.is_default:
        return {"success": False, "message": "Standard-Profil kann nicht gelöscht werden"}
    view.deleted_at = timezone.now()
    view.save(update_fields=['deleted_at', 'updated_at'])
    push.notify_changed_on_commit()
    return {"success": True}


# ═══ Admin: Config ════════════════════════════════════════════════

@monitor_router.get("/config", response=DisplayViewSchema, auth=keycloak_auth)
def get_view(request, view_id: int = None):
    _require_perm(request, 'monitor.view')
    if view_id:
        return get_object_or_404(DisplayView, id=view_id)
    return DisplayView.get()


@monitor_router.get("/disruptions", auth=keycloak_auth)
def list_disruptions(request, view_id: int = None):
    """Admin: alle aktuellen Störungen (aller Quellen) mit hidden-Flag zum Ausblenden."""
    _require_perm(request, 'monitor.view')
    view = get_object_or_404(DisplayView, id=view_id) if view_id else DisplayView.get()
    hidden = set(view.transit_disruption_hidden or [])
    out = []
    for s in _fetch_disruptions(view):
        out.append({
            'id': s.get('id'), 'source': s.get('source'), 'kind': s.get('kind'),
            'title': s.get('title'), 'text': (s.get('text') or '')[:160],
            'lines': s.get('lines', []), 'from': s.get('from', ''), 'until': s.get('until', ''),
            'has_image': bool(s.get('image')), 'hidden': s.get('id') in hidden,
        })
    return out


_VERSION_DENY = {'id', 'api_token', 'slug', 'created_at', 'updated_at'}


def _snapshot_view(view):
    """Aktuellen Zustand als Version sichern; nur die letzten 15 behalten."""
    from .models import DisplayViewVersion
    try:
        data = json.loads(json.dumps(DisplayViewSchema.from_orm(view).dict(), default=str))
        data.pop('api_token', None)
        DisplayViewVersion.objects.create(view=view, data=data)
        old_ids = list(DisplayViewVersion.objects.filter(view=view).values_list('id', flat=True)[15:])
        if old_ids:
            DisplayViewVersion.objects.filter(id__in=old_ids).delete()
    except Exception:
        pass  # Versionierung darf das Speichern nie blockieren


@monitor_router.put("/config", response=DisplayViewSchema, auth=keycloak_auth)
def update_view(request, payload: DisplayViewUpdateSchema, view_id: int = None):
    _require_perm(request, 'monitor.setup')
    if view_id:
        view = get_object_or_404(DisplayView, id=view_id)
    else:
        view = DisplayView.get()

    _snapshot_view(view)  # Zustand vor der Änderung sichern

    data = payload.dict(exclude_unset=True)
    data = _validate_view_data(data, own_id=view.id, current_kind=view.kind)

    # FK-Felder separat behandeln
    for fk_key in ('webuntis_link_id', 'webuntis_link_next_day_id'):
        if fk_key in data:
            val = data.pop(fk_key)
            setattr(view, fk_key, val if val else None)

    for key, value in data.items():
        setattr(view, key, value)
    # ÖPNV-/Störungs-Cache verwerfen, damit Änderungen sofort greifen
    view.transit_cache_at = None
    view.transit_disruption_cache_at = None
    view.save()
    push.notify_changed_on_commit()
    return view


@monitor_router.get("/config/versions", response=list[DisplayViewVersionSchema], auth=keycloak_auth)
def list_view_versions(request, view_id: int):
    _require_perm(request, 'monitor.view')
    from .models import DisplayViewVersion
    return list(DisplayViewVersion.objects.filter(view_id=view_id)[:15])


@monitor_router.post("/config/restore", response=DisplayViewSchema, auth=keycloak_auth)
def restore_view_version(request, version_id: int):
    _require_perm(request, 'monitor.setup')
    from .models import DisplayViewVersion
    version = get_object_or_404(DisplayViewVersion, id=version_id)
    view = version.view
    _snapshot_view(view)  # aktuellen Stand vor dem Zurücksetzen ebenfalls sichern
    for key, value in (version.data or {}).items():
        if key in _VERSION_DENY or not hasattr(view, key):
            continue
        try:
            setattr(view, key, value)
        except Exception:
            continue
    view.save()
    push.notify_changed_on_commit()
    return view


@monitor_router.post("/config/regenerate-token", auth=keycloak_auth)
def regenerate_token(request, view_id: int = None):
    _require_perm(request, 'monitor.setup')
    if view_id:
        view = get_object_or_404(DisplayView, id=view_id)
    else:
        view = DisplayView.get()
    view.api_token = uuid.uuid4().hex
    view.save(update_fields=['api_token', 'updated_at'])
    return {"api_token": view.api_token}


# ═══ Admin: Dateien (Upload/Manage) ══════════════════════════════

@monitor_router.get("/files", response=list[MediaFileSchema], auth=keycloak_auth)
def list_files(request, kind: str = None):
    _require_perm(request, 'monitor.view')
    qs = MediaFile.objects.filter(deleted_at__isnull=True)
    if kind:
        qs = qs.filter(kind=kind)
    return qs


@monitor_router.post("/files", auth=keycloak_auth)
def upload_file(request, file: UploadedFile = File(...), name: str = Form(""), kind: str = Form("image")):
    _require_perm(request, 'monitor.media')
    if file.size > media.MAX_BYTES:
        raise HttpError(422, "Datei zu groß: höchstens 50 MB.")
    obj = MediaFile.objects.create(
        name=name or file.name,
        file=file,
        kind=kind,
        status='processing',
    )
    transaction.on_commit(lambda: media.render_async(obj.id))
    return {
        'id': obj.id, 'name': obj.name, 'kind': obj.kind,
        'file_url': obj.file.url, 'sort_order': obj.sort_order,
        'status': obj.status, 'page_count': obj.page_count, 'error': obj.error,
    }


@monitor_router.get("/files/{id}", auth=keycloak_auth)
def get_file(request, id: int):
    _require_perm(request, 'monitor.view')
    obj = get_object_or_404(MediaFile, id=id)
    used_in = [
        {'view_id': v.id, 'name': v.name}
        for v in DisplayView.objects.filter(deleted_at__isnull=True)
        if id in (v.media_items or [])
    ]
    return {
        'id': obj.id, 'name': obj.name, 'kind': obj.kind,
        'file_url': obj.file.url if obj.file else '', 'sort_order': obj.sort_order,
        'created_at': obj.created_at,
        'status': obj.status, 'page_count': obj.page_count, 'error': obj.error,
        'pages': [
            {'index': p.index, 'url': p.image.url, 'width': p.width,
             'height': p.height, 'orientation': p.orientation}
            for p in obj.pages.all()
        ],
        'used_in': used_in,
    }


@monitor_router.delete("/files/{id}", auth=keycloak_auth)
def delete_file(request, id: int):
    _require_perm(request, 'monitor.media')
    d = get_object_or_404(MediaFile, id=id)
    # Soft-Delete → Papierkorb (Datei bleibt für Wiederherstellung erhalten)
    d.deleted_at = timezone.now()
    d.save(update_fields=['deleted_at'])
    push.notify_changed_on_commit()
    return {"success": True}


# ═══ Admin: Papierkorb (Soft-Delete) ═════════════════════════════

@monitor_router.get("/trash", auth=keycloak_auth)
def get_trash(request):
    _require_perm(request, 'monitor.view')
    views = [
        {'id': c.id, 'name': c.name, 'deleted_at': c.deleted_at}
        for c in DisplayView.objects.filter(deleted_at__isnull=False).order_by('-deleted_at')
    ]
    media = [
        {'id': d.id, 'name': d.name, 'kind': d.kind, 'deleted_at': d.deleted_at}
        for d in MediaFile.objects.filter(deleted_at__isnull=False).order_by('-deleted_at')
    ]
    return {'views': views, 'media': media}


@monitor_router.post("/trash/restore", auth=keycloak_auth)
def restore_trash(request, kind: str, id: int):
    _require_perm(request, 'monitor.media' if kind == 'media' else 'monitor.setup')
    if kind == 'view':
        obj = get_object_or_404(DisplayView, id=id)
        obj.deleted_at = None
        obj.save(update_fields=['deleted_at', 'updated_at'])
    elif kind == 'media':
        obj = get_object_or_404(MediaFile, id=id)
        obj.deleted_at = None
        obj.save(update_fields=['deleted_at'])
    else:
        raise HttpError(400, "Unbekannte Art")
    push.notify_changed_on_commit()
    return {"success": True}


@monitor_router.delete("/trash/purge", auth=keycloak_auth)
def purge_trash(request, kind: str, id: int):
    _require_perm(request, 'monitor.media' if kind == 'media' else 'monitor.setup')
    if kind == 'view':
        obj = get_object_or_404(DisplayView, id=id, deleted_at__isnull=False)
        obj.delete()
    elif kind == 'media':
        obj = get_object_or_404(MediaFile, id=id, deleted_at__isnull=False)
        if obj.file:
            obj.file.delete(save=False)
        obj.delete()
    else:
        raise HttpError(400, "Unbekannte Art")
    push.notify_changed_on_commit()
    return {"success": True}


# ═══ Admin: Ankündigungen ═════════════════════════════════════════

@monitor_router.get("/announcements", response=list[AnnouncementSchema], auth=keycloak_auth)
def list_announcements(request):
    _require_perm(request, 'monitor.view')
    return Announcement.objects.all()


@monitor_router.post("/announcements", response=AnnouncementSchema, auth=keycloak_auth)
def create_announcement(request, payload: AnnouncementCreateSchema):
    _require_perm(request, 'monitor.exams')
    announcement = Announcement.objects.create(**payload.dict())
    push.notify_changed_on_commit()
    return announcement


@monitor_router.put("/announcements/{id}", response=AnnouncementSchema, auth=keycloak_auth)
def update_announcement(request, id: int, payload: AnnouncementCreateSchema):
    _require_perm(request, 'monitor.exams')
    a = get_object_or_404(Announcement, id=id)
    for key, value in payload.dict().items():
        setattr(a, key, value)
    a.save()
    push.notify_changed_on_commit()
    return a


@monitor_router.delete("/announcements/{id}", auth=keycloak_auth)
def delete_announcement(request, id: int):
    _require_perm(request, 'monitor.exams')
    a = get_object_or_404(Announcement, id=id)
    a.delete()
    push.notify_changed_on_commit()
    return {"success": True}


# ═══ Admin: WebUntis-Link-Bibliothek ═════════════════════════════

@monitor_router.get("/webuntis-links", response=list[WebUntisLinkSchema], auth=keycloak_auth)
def list_webuntis_links(request):
    _require_perm(request, 'monitor.view')
    return WebUntisLink.objects.all()


@monitor_router.post("/webuntis-links", response=WebUntisLinkSchema, auth=keycloak_auth)
def create_webuntis_link(request, payload: WebUntisLinkCreateSchema):
    _require_perm(request, 'monitor.setup')
    link = WebUntisLink.objects.create(**payload.dict())
    push.notify_changed_on_commit()
    return link


@monitor_router.put("/webuntis-links/{id}", response=WebUntisLinkSchema, auth=keycloak_auth)
def update_webuntis_link(request, id: int, payload: WebUntisLinkCreateSchema):
    _require_perm(request, 'monitor.setup')
    link = get_object_or_404(WebUntisLink, id=id)
    for key, value in payload.dict().items():
        setattr(link, key, value)
    link.save()
    push.notify_changed_on_commit()
    return link


@monitor_router.delete("/webuntis-links/{id}", auth=keycloak_auth)
def delete_webuntis_link(request, id: int):
    _require_perm(request, 'monitor.setup')
    get_object_or_404(WebUntisLink, id=id).delete()
    push.notify_changed_on_commit()
    return {"success": True}


# ═══ Admin: ÖPNV Stationssuche ═══════════════════════════════════

@monitor_router.get("/transit/search", auth=keycloak_auth)
def search_transit_stops(request, q: str = "", results: int = 10,
                         use_db: bool = True, use_nahsh: bool = True):
    """Stationen für ÖPNV-Abfahrtsmonitor suchen"""
    _require_perm(request, 'monitor.setup')
    if len(q) < 2:
        return []
    return oepnv.search_stations(q, results=min(results, 20),
                                 use_db=use_db, use_nahsh=use_nahsh)


# ═══ Bildschirm: Power-Status (öffentlich, kein Auth) ═════════════

@monitor_router.get("/screen/power")
def get_screen_power(request, slug: str):
    """Öffentlicher Endpunkt: Soll der Bildschirm gerade an sein?
    Wird vom Raspberry Pi per Cronjob gepollt. Die Antwortschlüssel folgen
    den neuen Feldnamen."""
    try:
        screen = Screen.objects.get(slug=slug)
        return {
            'slug': screen.slug,
            'power': screen.get_power_state(),
            'power_schedule': screen.power_schedule,
            # Der Ferienmodus-Schalter ist entfallen (jetzt power_mode='manual_off'); Schlüssel bleibt für Pi-Skripte.
            'holiday_mode': False,
            'power_exceptions': screen.power_exceptions,
            'cec_status': screen.cec_status,
            'cec_status_at': screen.cec_status_at,
        }
    except Screen.DoesNotExist:
        return {'slug': slug, 'power': True, 'error': 'Bildschirm nicht gefunden'}


@monitor_router.post("/screen/cec-status")
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

@monitor_router.get("/screens", response=list[ScreenListSchema], auth=keycloak_auth)
def list_screens(request):
    _require_perm(request, 'monitor.view')
    return Screen.objects.all()


@monitor_router.post("/screens", auth=keycloak_auth)
def create_screen(request, payload: ScreenCreateSchema):
    _require_perm(request, 'monitor.setup')
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


SCREEN_POWER_FIELDS = {'power_mode', 'power_schedule', 'power_exceptions', 'off_during_holidays', 'off_until'}


@monitor_router.put("/screens/{int:id}", response=ScreenListSchema, auth=keycloak_auth)
def update_screen(request, id: int, payload: ScreenUpdateSchema):
    # Power-Felder gehören zum Recht power, alles andere zu setup (Spec §3.5).
    data = payload.dict(exclude_unset=True)
    if not data or set(data) - SCREEN_POWER_FIELDS:
        _require_perm(request, 'monitor.setup')
    if set(data) & SCREEN_POWER_FIELDS:
        _require_perm(request, 'monitor.power')
    screen = get_object_or_404(Screen, id=id)
    if 'default_view_id' in data:
        val = data.pop('default_view_id')
        screen.default_view_id = val if val else None
    if 'override_view_id' in data:
        val = data.pop('override_view_id')
        screen.override_view_id = val if val else None
    # Power-relevante Felder erkennen, damit wir den Pi sofort informieren
    power_changed = bool(SCREEN_POWER_FIELDS & set(data.keys()))
    for key, value in data.items():
        setattr(screen, key, value)
    screen.save()
    push.notify_changed_on_commit()
    if power_changed:
        from .consumers import push_power_to_screen
        push_power_to_screen(screen.slug)
    return screen


@monitor_router.delete("/screens/{int:id}", auth=keycloak_auth)
def delete_screen(request, id: int):
    _require_perm(request, 'monitor.setup')
    screen = get_object_or_404(Screen, id=id)
    screen.delete()
    push.notify_changed_on_commit()
    return {"success": True}


@monitor_router.post("/screens/{int:id}/reload", auth=keycloak_auth)
def reload_screen(request, id: int):
    """Fordert einen Neuladen der Ansicht auf dem Display an (das Display pollt reload_requested_at)."""
    _require_perm(request, 'monitor.setup')
    screen = get_object_or_404(Screen, id=id)
    screen.reload_requested_at = timezone.now()
    screen.save(update_fields=['reload_requested_at'])
    slug = screen.slug
    transaction.on_commit(lambda: push.notify_reload(slug))
    return {"success": True}


# ═══ Klausuren ════════════════════════════════════════════════════

@monitor_router.get("/exams", response=list[ExamSchema], auth=keycloak_auth)
def list_exams(request):
    _require_perm(request, 'monitor.view')
    return list(Exam.objects.prefetch_related('screens').all())


@monitor_router.post("/exams", response=ExamSchema, auth=keycloak_auth)
def create_exam(request, payload: ExamCreateSchema):
    _require_perm(request, 'monitor.exams')
    data = payload.dict()
    _validate_exam_data(data)
    screen_ids = data.pop('screen_ids', [])
    exam = Exam.objects.create(**data)
    if screen_ids:
        exam.screens.set(Screen.objects.filter(id__in=screen_ids))
    push.notify_changed_on_commit()
    return exam


@monitor_router.put("/exams/{id}", response=ExamSchema, auth=keycloak_auth)
def update_exam(request, id: int, payload: ExamUpdateSchema):
    _require_perm(request, 'monitor.exams')
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


@monitor_router.delete("/exams/{id}", auth=keycloak_auth)
def delete_exam(request, id: int):
    _require_perm(request, 'monitor.exams')
    exam = get_object_or_404(Exam, id=id)
    exam.delete()
    push.notify_changed_on_commit()
    return {"success": True}


# ═══ Admin: Events (aktivierbare Modi) ═══════════════════════════

def _apply_event_assignments(event, assignments):
    """Setzt die Bildschirm→Profil-Zuweisungen eines Events neu."""
    event.assignments.all().delete()
    for a in assignments or []:
        d = a if isinstance(a, dict) else a.dict()
        if d.get('screen_id') and d.get('view_id'):
            DisplayEventScreen.objects.create(
                event=event, screen_id=d['screen_id'], view_id=d['view_id'])


@monitor_router.get("/events", response=list[DisplayEventSchema], auth=keycloak_auth)
def list_events(request):
    _require_perm(request, 'monitor.view')
    return DisplayEvent.objects.all()


@monitor_router.post("/events", response=DisplayEventSchema, auth=keycloak_auth)
def create_event(request, payload: DisplayEventCreateSchema):
    _require_perm(request, 'monitor.exams')
    data = payload.dict()
    assignments = data.pop('assignments', [])
    event = DisplayEvent.objects.create(**data)
    _apply_event_assignments(event, assignments)
    push.notify_changed_on_commit()
    return event


@monitor_router.put("/events/{id}", response=DisplayEventSchema, auth=keycloak_auth)
def update_event(request, id: int, payload: DisplayEventUpdateSchema):
    _require_perm(request, 'monitor.exams')
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


@monitor_router.delete("/events/{id}", auth=keycloak_auth)
def delete_event(request, id: int):
    _require_perm(request, 'monitor.exams')
    get_object_or_404(DisplayEvent, id=id).delete()
    push.notify_changed_on_commit()
    return {"success": True}


@monitor_router.post("/events/{id}/activate", response=DisplayEventSchema, auth=keycloak_auth)
def activate_event(request, id: int):
    _require_perm(request, 'monitor.exams')
    event = get_object_or_404(DisplayEvent, id=id)
    event.is_active = True
    event.save(update_fields=['is_active'])
    push.notify_changed_on_commit()
    _log_audit(request, 'Event aktiviert', event.name)
    return event


@monitor_router.post("/events/{id}/deactivate", response=DisplayEventSchema, auth=keycloak_auth)
def deactivate_event(request, id: int):
    _require_perm(request, 'monitor.exams')
    event = get_object_or_404(DisplayEvent, id=id)
    event.is_active = False
    event.save(update_fields=['is_active'])
    push.notify_changed_on_commit()
    _log_audit(request, 'Event deaktiviert', event.name)
    return event


# ═══ Admin: Klausur-Vorlagen ═════════════════════════════════════

@monitor_router.get("/exam-templates", response=list[ExamTemplateSchema], auth=keycloak_auth)
def list_exam_templates(request):
    _require_perm(request, 'monitor.view')
    return ExamTemplate.objects.all()


@monitor_router.post("/exam-templates", response=ExamTemplateSchema, auth=keycloak_auth)
def create_exam_template(request, payload: ExamTemplateCreateSchema):
    _require_perm(request, 'monitor.exams')
    template = ExamTemplate.objects.create(**payload.dict())
    push.notify_changed_on_commit()
    return template


@monitor_router.put("/exam-templates/{id}", response=ExamTemplateSchema, auth=keycloak_auth)
def update_exam_template(request, id: int, payload: ExamTemplateCreateSchema):
    _require_perm(request, 'monitor.exams')
    template = get_object_or_404(ExamTemplate, id=id)
    for key, value in payload.dict().items():
        setattr(template, key, value)
    template.save()
    push.notify_changed_on_commit()
    return template


@monitor_router.delete("/exam-templates/{id}", auth=keycloak_auth)
def delete_exam_template(request, id: int):
    _require_perm(request, 'monitor.exams')
    get_object_or_404(ExamTemplate, id=id).delete()
    push.notify_changed_on_commit()
    return {"success": True}


# ═══ Admin: Globale Einstellungen (Wetter/WebUntis-Zugang) ═══════

ON_AIR_SETTINGS_FIELDS = {'on_air_text', 'on_air_animation', 'on_air_show_clock'}


@monitor_router.get("/settings", response=MonitorSettingsSchema, auth=keycloak_auth)
def get_settings(request):
    _require_perm(request, 'monitor.view')
    return MonitorSettings.load()


@monitor_router.put("/settings", response=MonitorSettingsSchema, auth=keycloak_auth)
def update_settings(request, payload: MonitorSettingsUpdateSchema):
    # On-Air-Darstellung gehört zum Recht onair, alles andere zu setup (Spec §4.5).
    data = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if not data or set(data) - ON_AIR_SETTINGS_FIELDS:
        _require_perm(request, 'monitor.setup')
    if set(data) & ON_AIR_SETTINGS_FIELDS:
        _require_perm(request, 'monitor.onair')
    settings = MonitorSettings.load()
    for key, value in data.items():
        setattr(settings, key, value)
    settings.save()
    push.notify_changed_on_commit()
    return settings


# ═══ Legacy aliases (ATEM, Pi scripts) ═══════════════════════════
# Nur für Aufrufer außerhalb dieses Repos. Die Aliase rufen die neuen
# Funktionen auf, damit Token- und Keycloak-Prüfung identisch bleiben.

@monitor_router.post("/onair", response={200: dict, 401: dict, 403: dict})
def legacy_toggle_on_air(request, payload: OnAirSchema):
    return toggle_on_air(request, payload)


@monitor_router.post("/notfall", response={200: dict, 401: dict, 403: dict})
def legacy_toggle_emergency(request, payload: LegacyEmergencySchema):
    return toggle_emergency(request, EmergencySchema(active=payload.aktiv, text=payload.text))


@monitor_router.get("/bildschirm/power")
def legacy_get_screen_power(request, slug: str):
    """Alte Antwortform für Pi-Skripte, die vor der Umbenennung installiert wurden."""
    result = get_screen_power(request, slug)
    if 'power_schedule' not in result:
        return result  # Fehlerantwort: unverändert
    return {
        'slug': result['slug'],
        'power': result['power'],
        'power_zeitplan': result['power_schedule'],
        'ferien_modus': result['holiday_mode'],
        'power_ausnahmen': result['power_exceptions'],
        'cec_status': result['cec_status'],
        'cec_status_zeit': result['cec_status_at'],
    }


@monitor_router.post("/bildschirm/cec-status")
def legacy_report_cec_status(request, slug: str, status: str):
    return report_cec_status(request, slug, status)
