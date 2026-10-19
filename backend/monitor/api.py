"""
Monitor API — öffentliche + Admin-Endpunkte (Multi-Profil)
"""
import json
import re
import uuid
import urllib.request
import urllib.parse
from ninja import Router, File, Form
from ninja.files import UploadedFile
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.utils.text import slugify

from core.auth import keycloak_auth
from users.api import is_admin
from users.models import UserProfile
from ninja.errors import HttpError
from .models import (
    DisplayView, Announcement, MediaFile, Screen, Exam, WebUntisLink,
    DisplayEvent, DisplayEventScreen, ExamTemplate, MonitorSettings,
    validate_rotation_items,
)


def _require_perm(request, code: str):
    """Admin oder Permission. Wirft 403 wenn nichts davon passt."""
    if is_admin(request):
        return
    kid = request.auth.get('sub', '') if request.auth else ''
    if kid:
        try:
            if UserProfile.objects.get(keycloak_id=kid).has_permission(code, False):
                return
        except UserProfile.DoesNotExist:
            pass
    raise HttpError(403, "Keine Berechtigung")


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
from . import oepnv
from .consumers import push_power_to_all

monitor_router = Router(tags=["Monitor"])

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


def _fetch_weather(view):
    """Wetter von OpenWeatherMap holen und cachen (15 Min)"""
    settings = MonitorSettings.load()
    api_key = settings.weather_api_key or view.weather_api_key   # global hat Vorrang
    if not view.show_weather or not view.weather_city or not api_key:
        return None

    # Cache noch gültig?
    if view.weather_cache and view.weather_cache_at:
        age = (timezone.now() - view.weather_cache_at).total_seconds()
        if age < 900:
            return view.weather_cache

    try:
        url = (
            f"https://api.openweathermap.org/data/2.5/weather"
            f"?q={urllib.parse.quote(view.weather_city)}"
            f"&appid={api_key}"
            f"&units=metric&lang=de"
        )
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read())

        weather = {
            'temperature': round(data['main']['temp'], 1),
            'feels_like': round(data['main']['feels_like'], 1),
            'description': data['weather'][0]['description'].capitalize(),
            'icon': data['weather'][0]['icon'],
            'humidity': data['main']['humidity'],
            'city': data['name'],
        }
        view.weather_cache = weather
        view.weather_cache_at = timezone.now()
        view.save(update_fields=['weather_cache', 'weather_cache_at', 'updated_at'])
        return weather
    except Exception:
        return view.weather_cache or None


def _fetch_transit(view):
    """ÖPNV-Abfahrten holen und cachen (2 Min, bei Fehler 1 Min Pause)"""
    # Immer laden bei Ansichtsart 'departures', sonst nur wenn Widget aktiv
    if view.kind != 'departures' and not view.show_transit:
        return None
    if not view.transit_stops:
        return None

    # Cache noch gültig? (1 Minute, bei Fehler auch 1 Min Pause)
    if view.transit_cache_at:
        age = (timezone.now() - view.transit_cache_at).total_seconds()
        if view.transit_cache and age < 60:
            return view.transit_cache
        # Auch bei leerem Cache: min. 60s warten (verhindert API-Spam bei Fehlern)
        if age < 60:
            return view.transit_cache

    try:
        result = oepnv.fetch_departures(
            stops=view.transit_stops,
            duration=view.transit_duration,
            max_per_stop=view.transit_max_departures,
            show_bus=view.transit_show_bus,
            show_rail=view.transit_show_rail,
            show_long_distance=view.transit_show_long_distance,
            use_db=view.transit_source_db,
            use_nahsh=view.transit_source_nahsh,
            show_via=view.transit_show_via,
            strike_lines=view.transit_strike_lines if view.transit_strike_active else None,
            strike_types=view.transit_strike_types if view.transit_strike_active else None,
        )
        view.transit_cache = result
        view.transit_cache_at = timezone.now()
        view.save(update_fields=['transit_cache', 'transit_cache_at', 'updated_at'])
        return result
    except Exception as e:
        print(f"ÖPNV-Fehler: {e}")
        # Auch bei Fehler Timestamp setzen → nächster Retry frühestens in 60s
        view.transit_cache_at = timezone.now()
        view.save(update_fields=['transit_cache_at', 'updated_at'])
        return view.transit_cache or None


def _fetch_disruptions(view):
    """Störungen/Baumaßnahmen (Bahn: NAH.SH · Bus: SWL · manuell), gecacht 5 Min."""
    if view.kind != 'departures' and not view.show_transit:
        return []
    # Nur wenn mind. eine Quelle aktiv ist
    if not (view.transit_disruption_rail or view.transit_disruption_bus or (view.transit_disruption_manual or [])):
        return []
    # Cache 5 Min (Störungen ändern sich langsam)
    if view.transit_disruption_cache_at:
        age = (timezone.now() - view.transit_disruption_cache_at).total_seconds()
        if age < 300:
            return view.transit_disruption_cache or []
    result = []
    all_sources_ok = True
    try:
        if view.transit_disruption_rail:
            rail = oepnv.fetch_disruptions_nahsh(view.transit_disruption_rail_lines or None)
            all_sources_ok = all_sources_ok and bool(rail)
            result += rail
        if view.transit_disruption_bus:
            bus = oepnv.fetch_disruptions_swl(view.transit_disruption_bus_lines or None)
            all_sources_ok = all_sources_ok and bool(bus)
            result += bus
    except Exception as e:
        all_sources_ok = False
        print(f"Störungs-Fehler: {e}")
    # Manuelle Meldungen voranstellen
    for m in (view.transit_disruption_manual or []):
        if isinstance(m, dict) and (m.get('title') or m.get('text')):
            result.insert(0, {
                # Hash-Eingabe bleibt bei der alten Quellkennung 'manuell', damit ausgeblendete
                # Meldungen (transit_disruption_hidden) ausgeblendet bleiben (Spec §5.4).
                'id': oepnv._disruption_id('manuell', m.get('title'), m.get('text')),
                'source': 'manual', 'kind': 'disruption',
                'title': m.get('title') or 'Hinweis', 'text': m.get('text') or '',
                'lines': [], 'from': '', 'until': '',
                'all_lines': False, 'image': m.get('image') or '', 'stops': [], 'suggestion': '',
                'highlighted': bool(m.get('highlighted')),
            })
    # Ausblend-Liste auto-bereinigen: nur IDs behalten, die noch existieren.
    # Nur wenn jede aktive Quelle Daten geliefert hat; ein Ausfall (fehlender Token,
    # Netzwerkfehler) darf keine Ausblendungen dauerhaft löschen.
    if all_sources_ok:
        current_ids = {s.get('id') for s in result}
        hidden = [h for h in (view.transit_disruption_hidden or []) if h in current_ids]
    else:
        hidden = list(view.transit_disruption_hidden or [])
    fields = ['transit_disruption_cache', 'transit_disruption_cache_at', 'updated_at']
    if hidden != (view.transit_disruption_hidden or []):
        view.transit_disruption_hidden = hidden
        fields.append('transit_disruption_hidden')
    view.transit_disruption_cache = result
    view.transit_disruption_cache_at = timezone.now()
    view.save(update_fields=fields)
    return result


# ═══ Öffentlicher Endpunkt (kein Auth) ═══════════════════════════

def _legacy_reload_key(now) -> str:
    """ISO-Zeit auf die Minute abgerundet. Schon geladene Pis mit altem JS
    laden sich neu, sobald sich dieser Wert ändert (Spec 6.3)."""
    return now.replace(second=0, microsecond=0).isoformat()


@monitor_router.get("/display")
def get_display_data(request, view: str = None, screen: str = None,
                     profil: str = None, bildschirm: str = None):
    """Öffentlicher Endpunkt: Alle Daten für das Monitor-Display.
    Die alten Query-Namen `profil` und `bildschirm` gelten weiter (Kiosk-URLs)."""
    screen_slug = screen or bildschirm
    view_slug = view or profil
    screen = None
    if screen_slug:
        try:
            screen = Screen.objects.get(slug=screen_slug)
            view = screen.get_active_view()
        except Screen.DoesNotExist:
            view = DisplayView.get(slug=view_slug)
    else:
        view = DisplayView.get(slug=view_slug)
    now = timezone.now()

    # Aktive Klausur (pro Bildschirm)
    exam = None
    if screen:
        k = screen.get_active_exam()
        if k:
            k_link = k.webuntis_link.url if k.webuntis_link else ''
            exam = {
                'title': k.title, 'text': k.text,
                'color': k.color, 'active_until': k.active_until,
                'display_mode': k.display_mode,
                'split_side': k.split_side,
                'split_percent': k.split_percent,
                'webuntis_url': k_link,
            }

    # Ankündigungen: nur aktive + im Zeitfenster
    announcements = []
    for a in Announcement.objects.filter(is_active=True):
        if a.active_from and now < a.active_from:
            continue
        if a.active_until and now > a.active_until:
            continue
        announcements.append({
            'id': a.id, 'title': a.title, 'text': a.text,
            'priority': a.priority, 'is_active': a.is_active,
            'active_from': a.active_from, 'active_until': a.active_until,
            'created_at': a.created_at,
        })

    # Veranstaltungen: nächste 7 Tage + aktuell laufende
    events = []
    if view.show_events:
        from veranstaltung.models import Veranstaltung
        in_seven_days = now + timezone.timedelta(days=7)
        upcoming = Veranstaltung.objects.filter(
            status__in=['bestaetigt', 'laufend'],
            datum_bis__gte=now,
            datum_von__lte=in_seven_days,
        ).order_by('datum_von')[:10]

        for v in upcoming:
            is_running = v.status == 'laufend' or (
                v.datum_von and v.datum_bis and v.datum_von <= now <= v.datum_bis
            )
            events.append({
                'id': v.id, 'name': v.titel, 'location': v.ort or '',
                'date_from': v.datum_von, 'date_until': v.datum_bis,
                'status': v.status, 'is_running': is_running,
            })

    # Dateien
    files = []
    for d in MediaFile.objects.all():
        files.append({
            'id': d.id, 'name': d.name, 'kind': d.kind,
            'file_url': d.file.url if d.file else '',
            'sort_order': d.sort_order,
        })

    # Wetter
    weather = _fetch_weather(view)

    # ÖPNV Abfahrten
    departures = _fetch_transit(view)
    # Ausgeblendete Störungen nicht ans Display schicken
    _hidden = set(view.transit_disruption_hidden or [])
    disruptions = [s for s in _fetch_disruptions(view) if s.get('id') not in _hidden]

    # Ansicht (sensitive Felder entfernen)
    view_data = DisplayViewSchema.from_orm(view).dict()
    view_data['api_token'] = ''
    view_data['weather_api_key'] = ''
    view_data['webuntis_url_resolved'] = view.get_webuntis_url()
    view_data['webuntis_url_next_day_resolved'] = view.get_webuntis_url_next_day()

    # On-Air und Notfall sind global (MonitorSettings). Den vollständigen Vertrag baut display.py.
    settings = MonitorSettings.load()
    on_air = {
        'active': settings.on_air_active, 'since': settings.on_air_since,
        'text': settings.on_air_text, 'animation': settings.on_air_animation,
        'show_clock': settings.on_air_show_clock,
    }
    emergency = {
        'active': settings.emergency_active, 'since': settings.emergency_since,
        'text': settings.emergency_text, 'note': settings.emergency_note,
    }

    return {
        'config': view_data,
        'announcements': announcements,
        'events': events,
        'files': files,
        'weather': weather,
        'departures': departures,
        'disruptions': disruptions,
        'on_air': on_air,
        'emergency': emergency,
        'exam': exam,
        'reload_requested_at': (screen.reload_requested_at.isoformat()
                                if (screen and screen.reload_requested_at) else None),
        # TODO(step-b): remove legacy reload key
        'neu_laden_zeit': _legacy_reload_key(now),
    }


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


def _set_emergency(active: bool, text: str, note: str):
    """Notfall setzen und alle Bildschirme neu schalten (Notfall schaltet ein, Spec §3.2)."""
    settings = MonitorSettings.load()
    settings.emergency_active = active
    settings.emergency_text = text
    settings.emergency_note = note
    settings.emergency_since = timezone.now() if active else None
    settings.save(update_fields=['emergency_active', 'emergency_text', 'emergency_note', 'emergency_since'])
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
        return {'id': source.id, 'name': source.name, 'slug': source.slug}
    else:
        view = DisplayView(
            name=payload.name,
            slug=slug,
            is_default=False,
            kind=payload.kind,
        )
        view.save()
        return {'id': view.id, 'name': view.name, 'slug': view.slug}


@monitor_router.delete("/views/{id}", auth=keycloak_auth)
def delete_view(request, id: int):
    _require_perm(request, 'monitor.setup')
    view = get_object_or_404(DisplayView, id=id)
    if view.is_default:
        return {"success": False, "message": "Standard-Profil kann nicht gelöscht werden"}
    view.deleted_at = timezone.now()
    view.save(update_fields=['deleted_at', 'updated_at'])
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
    obj = MediaFile.objects.create(
        name=name or file.name,
        file=file,
        kind=kind,
    )
    return {
        'id': obj.id, 'name': obj.name, 'kind': obj.kind,
        'file_url': obj.file.url, 'sort_order': obj.sort_order,
    }


@monitor_router.delete("/files/{id}", auth=keycloak_auth)
def delete_file(request, id: int):
    _require_perm(request, 'monitor.media')
    d = get_object_or_404(MediaFile, id=id)
    # Soft-Delete → Papierkorb (Datei bleibt für Wiederherstellung erhalten)
    d.deleted_at = timezone.now()
    d.save(update_fields=['deleted_at'])
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
    return {"success": True}


# ═══ Admin: Ankündigungen ═════════════════════════════════════════

@monitor_router.get("/announcements", response=list[AnnouncementSchema], auth=keycloak_auth)
def list_announcements(request):
    _require_perm(request, 'monitor.view')
    return Announcement.objects.all()


@monitor_router.post("/announcements", response=AnnouncementSchema, auth=keycloak_auth)
def create_announcement(request, payload: AnnouncementCreateSchema):
    _require_perm(request, 'monitor.exams')
    return Announcement.objects.create(**payload.dict())


@monitor_router.put("/announcements/{id}", response=AnnouncementSchema, auth=keycloak_auth)
def update_announcement(request, id: int, payload: AnnouncementCreateSchema):
    _require_perm(request, 'monitor.exams')
    a = get_object_or_404(Announcement, id=id)
    for key, value in payload.dict().items():
        setattr(a, key, value)
    a.save()
    return a


@monitor_router.delete("/announcements/{id}", auth=keycloak_auth)
def delete_announcement(request, id: int):
    _require_perm(request, 'monitor.exams')
    a = get_object_or_404(Announcement, id=id)
    a.delete()
    return {"success": True}


# ═══ Admin: WebUntis-Link-Bibliothek ═════════════════════════════

@monitor_router.get("/webuntis-links", response=list[WebUntisLinkSchema], auth=keycloak_auth)
def list_webuntis_links(request):
    _require_perm(request, 'monitor.view')
    return WebUntisLink.objects.all()


@monitor_router.post("/webuntis-links", response=WebUntisLinkSchema, auth=keycloak_auth)
def create_webuntis_link(request, payload: WebUntisLinkCreateSchema):
    _require_perm(request, 'monitor.setup')
    return WebUntisLink.objects.create(**payload.dict())


@monitor_router.put("/webuntis-links/{id}", response=WebUntisLinkSchema, auth=keycloak_auth)
def update_webuntis_link(request, id: int, payload: WebUntisLinkCreateSchema):
    _require_perm(request, 'monitor.setup')
    link = get_object_or_404(WebUntisLink, id=id)
    for key, value in payload.dict().items():
        setattr(link, key, value)
    link.save()
    return link


@monitor_router.delete("/webuntis-links/{id}", auth=keycloak_auth)
def delete_webuntis_link(request, id: int):
    _require_perm(request, 'monitor.setup')
    get_object_or_404(WebUntisLink, id=id).delete()
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
    return {'id': screen.id, 'name': screen.name, 'slug': screen.slug}


@monitor_router.put("/screens/{int:id}", response=ScreenListSchema, auth=keycloak_auth)
def update_screen(request, id: int, payload: ScreenUpdateSchema):
    _require_perm(request, 'monitor.setup')
    screen = get_object_or_404(Screen, id=id)
    data = payload.dict(exclude_unset=True)
    if 'default_view_id' in data:
        val = data.pop('default_view_id')
        screen.default_view_id = val if val else None
    if 'override_view_id' in data:
        val = data.pop('override_view_id')
        screen.override_view_id = val if val else None
    # Power-relevante Felder erkennen, damit wir den Pi sofort informieren
    power_keys = {'schedule', 'power_schedule', 'power_exceptions', 'power_mode',
                  'off_until', 'off_during_holidays'}
    power_changed = bool(power_keys & set(data.keys()))
    for key, value in data.items():
        setattr(screen, key, value)
    screen.save()
    if power_changed:
        from .consumers import push_power_to_screen
        push_power_to_screen(screen.slug)
    return screen


@monitor_router.delete("/screens/{int:id}", auth=keycloak_auth)
def delete_screen(request, id: int):
    _require_perm(request, 'monitor.setup')
    screen = get_object_or_404(Screen, id=id)
    screen.delete()
    return {"success": True}


@monitor_router.post("/screens/{int:id}/reload", auth=keycloak_auth)
def reload_screen(request, id: int):
    """Fordert einen Neuladen der Ansicht auf dem Display an (das Display pollt reload_requested_at)."""
    _require_perm(request, 'monitor.setup')
    screen = get_object_or_404(Screen, id=id)
    screen.reload_requested_at = timezone.now()
    screen.save(update_fields=['reload_requested_at'])
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
    return exam


@monitor_router.delete("/exams/{id}", auth=keycloak_auth)
def delete_exam(request, id: int):
    _require_perm(request, 'monitor.exams')
    exam = get_object_or_404(Exam, id=id)
    exam.delete()
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
    return event


@monitor_router.delete("/events/{id}", auth=keycloak_auth)
def delete_event(request, id: int):
    _require_perm(request, 'monitor.exams')
    get_object_or_404(DisplayEvent, id=id).delete()
    return {"success": True}


@monitor_router.post("/events/{id}/activate", response=DisplayEventSchema, auth=keycloak_auth)
def activate_event(request, id: int):
    _require_perm(request, 'monitor.exams')
    event = get_object_or_404(DisplayEvent, id=id)
    event.is_active = True
    event.save(update_fields=['is_active'])
    _log_audit(request, 'Event aktiviert', event.name)
    return event


@monitor_router.post("/events/{id}/deactivate", response=DisplayEventSchema, auth=keycloak_auth)
def deactivate_event(request, id: int):
    _require_perm(request, 'monitor.exams')
    event = get_object_or_404(DisplayEvent, id=id)
    event.is_active = False
    event.save(update_fields=['is_active'])
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
    return ExamTemplate.objects.create(**payload.dict())


@monitor_router.put("/exam-templates/{id}", response=ExamTemplateSchema, auth=keycloak_auth)
def update_exam_template(request, id: int, payload: ExamTemplateCreateSchema):
    _require_perm(request, 'monitor.exams')
    template = get_object_or_404(ExamTemplate, id=id)
    for key, value in payload.dict().items():
        setattr(template, key, value)
    template.save()
    return template


@monitor_router.delete("/exam-templates/{id}", auth=keycloak_auth)
def delete_exam_template(request, id: int):
    _require_perm(request, 'monitor.exams')
    get_object_or_404(ExamTemplate, id=id).delete()
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


# ═══ Einrichtung: Ferien, Notfall-Vorlagen, "bis Tagesende aus" ══
# Am Ende importiert, weil api_setup _require_perm aus diesem Modul nutzt.
from .api_setup import setup_router  # noqa: E402

monitor_router.add_router("", setup_router)
