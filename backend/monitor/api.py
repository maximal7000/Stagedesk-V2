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
    MediaFileSchema, OnAirSchema, EmergencySchema, DisplayViewVersionSchema,
    ScreenListSchema, ScreenCreateSchema, ScreenUpdateSchema,
    ExamSchema, ExamCreateSchema, ExamUpdateSchema,
    WebUntisLinkSchema, WebUntisLinkCreateSchema,
    DisplayEventSchema, DisplayEventCreateSchema, DisplayEventUpdateSchema,
    ExamTemplateSchema, ExamTemplateCreateSchema,
    MonitorSettingsSchema, MonitorSettingsUpdateSchema,
)
from . import oepnv

monitor_router = Router(tags=["Monitor"])

_HEX_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


def _clamp_int(v, lo, hi):
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return None


def _validate_view_data(data: dict) -> dict:
    """Serverseitige Validierung/Sanitisierung der Ansicht-Update-Daten.
    Klemmt Zahlenbereiche, verwirft ungültige Hex-Farben, prüft Zeitfenster."""
    for key, lo, hi in [
        ('split_left_percent', 20, 80), ('split_percent', 20, 80),
        ('image_focus_x', 0, 100), ('image_focus_y', 0, 100),
        ('webuntis_zoom', 25, 400), ('refresh_interval', 3, 3600),
    ]:
        if key in data and data[key] is not None:
            c = _clamp_int(data[key], lo, hi)
            if c is not None:
                data[key] = c
    # Hex-Farben: ungültige verwerfen (alter Wert bleibt). on_air_color darf leer sein.
    for key in ['background_color', 'accent_color', 'on_air_color']:
        if key in data and data[key]:
            if not _HEX_RE.match(str(data[key])):
                data.pop(key)
    # Zeitplan: Beginn < Ende erzwingen
    if 'schedule' in data and isinstance(data['schedule'], list):
        for e in data['schedule']:
            if isinstance(e, dict):
                start, end = e.get('von'), e.get('bis')
                if start and end and str(start) >= str(end):
                    raise HttpError(422, f"Zeitfenster ungültig: {start} muss vor {end} liegen")
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
            'temperatur': round(data['main']['temp'], 1),
            'feels_like': round(data['main']['feels_like'], 1),
            'beschreibung': data['weather'][0]['description'].capitalize(),
            'icon': data['weather'][0]['icon'],
            'luftfeuchtigkeit': data['main']['humidity'],
            'stadt': data['name'],
        }
        view.weather_cache = weather
        view.weather_cache_at = timezone.now()
        view.save(update_fields=['weather_cache', 'weather_cache_at', 'updated_at'])
        return weather
    except Exception:
        return view.weather_cache or None


def _fetch_transit(view):
    """ÖPNV-Abfahrten holen und cachen (2 Min, bei Fehler 1 Min Pause)"""
    # Immer laden wenn Layout 'abfahrten', sonst nur wenn Widget aktiv
    if view.layout != 'abfahrten' and not view.show_transit:
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
    if view.layout != 'abfahrten' and not view.show_transit:
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
    try:
        if view.transit_disruption_rail:
            result += oepnv.fetch_disruptions_nahsh(view.transit_disruption_rail_lines or None)
        if view.transit_disruption_bus:
            result += oepnv.fetch_disruptions_swl(view.transit_disruption_bus_lines or None)
    except Exception as e:
        print(f"Störungs-Fehler: {e}")
    # Manuelle Meldungen voranstellen
    for m in (view.transit_disruption_manual or []):
        if isinstance(m, dict) and (m.get('titel') or m.get('text')):
            result.insert(0, {
                'id': oepnv._disruption_id('manuell', m.get('titel'), m.get('text')),
                'quelle': 'manuell', 'typ': 'stoerung',
                'titel': m.get('titel') or 'Hinweis', 'text': m.get('text') or '',
                'linien': [], 'von': '', 'bis': '',
                'all_lines': False, 'bild': m.get('bild') or '', 'haltestellen': [], 'vorschlag': '',
                'highlighted': bool(m.get('highlighted')),
            })
    # Ausblend-Liste auto-bereinigen: nur IDs behalten, die noch existieren
    current_ids = {s.get('id') for s in result}
    hidden = [h for h in (view.transit_disruption_hidden or []) if h in current_ids]
    fields = ['transit_disruption_cache', 'transit_disruption_cache_at', 'updated_at']
    if hidden != (view.transit_disruption_hidden or []):
        view.transit_disruption_hidden = hidden
        fields.append('transit_disruption_hidden')
    view.transit_disruption_cache = result
    view.transit_disruption_cache_at = timezone.now()
    view.save(update_fields=fields)
    return result


# ═══ Öffentlicher Endpunkt (kein Auth) ═══════════════════════════

@monitor_router.get("/display")
def get_display_data(request, profil: str = None, bildschirm: str = None):
    """Öffentlicher Endpunkt: Alle Daten für das Monitor-Display"""
    screen = None
    if bildschirm:
        try:
            screen = Screen.objects.get(slug=bildschirm)
            view = screen.get_active_view()
        except Screen.DoesNotExist:
            view = DisplayView.get(slug=profil)
    else:
        view = DisplayView.get(slug=profil)
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
                'id': v.id, 'name': v.titel, 'ort': v.ort or '',
                'datum_von': v.datum_von, 'datum_bis': v.datum_bis,
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
    view_data['logo_url_resolved'] = view.get_logo_url()
    view_data['pdf_url_resolved'] = view.get_pdf_url()
    view_data['background_image_url_resolved'] = view.get_background_image_url()
    view_data['image_url_resolved'] = view.get_image_url()
    view_data['webuntis_url_resolved'] = view.get_webuntis_url()
    view_data['webuntis_url_next_day_resolved'] = view.get_webuntis_url_next_day()

    # Wenn on_air_fullscreen aktiv → Einstellungen der ON-AIR-Ansicht mitliefern
    on_air_view = None
    if view.on_air_fullscreen:
        on_air_source = DisplayView.objects.filter(layout='onair').exclude(pk=view.pk).first()
        if on_air_source:
            on_air_view = {
                'on_air_color': on_air_source.on_air_color,
                'on_air_text': on_air_source.on_air_text,
                'on_air_size': on_air_source.on_air_size,
                'on_air_position': on_air_source.on_air_position,
                'on_air_blink': on_air_source.on_air_blink,
                'show_clock': on_air_source.show_clock,
            }

    return {
        'config': view_data,
        'announcements': announcements,
        'events': events,
        'files': files,
        'weather': weather,
        'departures': departures,
        'disruptions': disruptions,
        'on_air_view': on_air_view,
        'exam': exam,
        'reload_requested_at': (screen.reload_requested_at.isoformat()
                                if (screen and screen.reload_requested_at) else None),
    }


@monitor_router.get("/clock")
def get_clock_data(request):
    """Schlanker öffentlicher Endpunkt für externe Uhr-/Status-Displays:
    ON-AIR-Status + nächste Veranstaltungen. Kein Login nötig.
    Die Antwortform bleibt für externe Aufrufer unverändert."""
    now = timezone.now()
    on_air = DisplayView.objects.filter(is_on_air=True).exists()
    view = DisplayView.get()
    on_air_text = view.on_air_text if view else 'ON AIR'

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
        'on_air': on_air,
        'on_air_text': on_air_text,
        'veranstaltungen': events,
    }


# ═══ ON AIR Endpunkt (Token-Auth) ════════════════════════════════

@monitor_router.post("/onair", response={200: dict, 401: dict, 403: dict})
def toggle_on_air(request, payload: OnAirSchema):
    """ON AIR Status ändern — betrifft ALLE Profile"""
    # Erst per Token prüfen
    token = request.headers.get('X-Monitor-Token', '')
    if token:
        view = DisplayView.objects.filter(api_token=token).first()
        if view:
            # Alle Profile updaten
            DisplayView.objects.all().update(
                is_on_air=payload.on_air,
                on_air_since=timezone.now() if payload.on_air else None,
            )
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
    DisplayView.objects.all().update(
        is_on_air=payload.on_air,
        on_air_since=timezone.now() if payload.on_air else None,
    )
    _log_audit(request, 'ON AIR ' + ('an' if payload.on_air else 'aus'))
    return 200, {"success": True, "on_air": payload.on_air}


# ═══ Notfall Endpunkt (Token-Auth) ═══════════════════════════════

@monitor_router.post("/notfall", response={200: dict, 401: dict, 403: dict})
def toggle_emergency(request, payload: EmergencySchema):
    """Notfall-Meldung aktivieren/deaktivieren — betrifft ALLE Profile"""
    token = request.headers.get('X-Monitor-Token', '')
    if token:
        view = DisplayView.objects.filter(api_token=token).first()
        if view:
            DisplayView.objects.all().update(
                emergency_active=payload.active,
                emergency_text=payload.text,
            )
            _log_audit(request, 'Notfall ' + ('an' if payload.active else 'aus'), payload.text if payload.active else '', via_token=True)
            return 200, {"success": True}
        return 401, {"success": False, "message": "Ungültiges Token"}

    auth_result = keycloak_auth(request)
    if not auth_result:
        return 401, {"success": False, "message": "Nicht autorisiert"}
    request.auth = auth_result
    try:
        _require_perm(request, 'monitor.notfall')
    except HttpError as e:
        return 403, {"success": False, "message": e.message}
    DisplayView.objects.all().update(
        emergency_active=payload.active,
        emergency_text=payload.text,
    )
    _log_audit(request, 'Notfall ' + ('an' if payload.active else 'aus'), payload.text if payload.active else '')
    return 200, {"success": True}


# ═══ Admin: Profile ══════════════════════════════════════════════

@monitor_router.get("/profile", response=list[DisplayViewListSchema], auth=keycloak_auth)
def list_views(request):
    _require_perm(request, 'monitor.view')
    return DisplayView.objects.filter(deleted_at__isnull=True).order_by('sort_order', 'name')


@monitor_router.post("/profile", auth=keycloak_auth)
def create_view(request, payload: DisplayViewCreateSchema):
    _require_perm(request, 'monitor.edit')
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
        source.layout = payload.layout
        source.api_token = uuid.uuid4().hex
        source.save()
        return {'id': source.id, 'name': source.name, 'slug': source.slug}
    else:
        view = DisplayView(
            name=payload.name,
            slug=slug,
            is_default=False,
            layout=payload.layout,
        )
        view.save()
        return {'id': view.id, 'name': view.name, 'slug': view.slug}


@monitor_router.delete("/profile/{id}", auth=keycloak_auth)
def delete_view(request, id: int):
    _require_perm(request, 'monitor.edit')
    view = get_object_or_404(DisplayView, id=id)
    if view.is_default:
        return {"success": False, "message": "Standard-Profil kann nicht gelöscht werden"}
    view.deleted_at = timezone.now()
    view.save(update_fields=['deleted_at', 'updated_at'])
    return {"success": True}


# ═══ Admin: Config ════════════════════════════════════════════════

@monitor_router.get("/config", response=DisplayViewSchema, auth=keycloak_auth)
def get_view(request, profil_id: int = None):
    _require_perm(request, 'monitor.view')
    if profil_id:
        return get_object_or_404(DisplayView, id=profil_id)
    return DisplayView.get()


@monitor_router.get("/stoerungen", auth=keycloak_auth)
def list_disruptions(request, profil_id: int = None):
    """Admin: alle aktuellen Störungen (aller Quellen) mit hidden-Flag zum Ausblenden."""
    _require_perm(request, 'monitor.view')
    view = get_object_or_404(DisplayView, id=profil_id) if profil_id else DisplayView.get()
    hidden = set(view.transit_disruption_hidden or [])
    out = []
    for s in _fetch_disruptions(view):
        out.append({
            'id': s.get('id'), 'quelle': s.get('quelle'), 'typ': s.get('typ'),
            'titel': s.get('titel'), 'text': (s.get('text') or '')[:160],
            'linien': s.get('linien', []), 'von': s.get('von', ''), 'bis': s.get('bis', ''),
            'hat_bild': bool(s.get('bild')), 'hidden': s.get('id') in hidden,
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
def update_view(request, payload: DisplayViewUpdateSchema, profil_id: int = None):
    _require_perm(request, 'monitor.edit')
    if profil_id:
        view = get_object_or_404(DisplayView, id=profil_id)
    else:
        view = DisplayView.get()

    _snapshot_view(view)  # Zustand vor der Änderung sichern

    data = payload.dict(exclude_unset=True)
    data = _validate_view_data(data)

    # FK-Felder separat behandeln
    for fk_key in ('active_logo_id', 'active_pdf_id', 'active_background_image_id',
                   'active_image_id', 'webuntis_link_id', 'webuntis_link_next_day_id'):
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


@monitor_router.get("/config/versionen", response=list[DisplayViewVersionSchema], auth=keycloak_auth)
def list_view_versions(request, profil_id: int):
    _require_perm(request, 'monitor.view')
    from .models import DisplayViewVersion
    return list(DisplayViewVersion.objects.filter(view_id=profil_id)[:15])


@monitor_router.post("/config/restore", response=DisplayViewSchema, auth=keycloak_auth)
def restore_view_version(request, version_id: int):
    _require_perm(request, 'monitor.edit')
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
def regenerate_token(request, profil_id: int = None):
    _require_perm(request, 'monitor.edit')
    if profil_id:
        view = get_object_or_404(DisplayView, id=profil_id)
    else:
        view = DisplayView.get()
    view.api_token = uuid.uuid4().hex
    view.save(update_fields=['api_token', 'updated_at'])
    return {"api_token": view.api_token}


# ═══ Admin: Dateien (Upload/Manage) ══════════════════════════════

@monitor_router.get("/dateien", response=list[MediaFileSchema], auth=keycloak_auth)
def list_files(request, typ: str = None):
    _require_perm(request, 'monitor.view')
    qs = MediaFile.objects.filter(deleted_at__isnull=True)
    if typ:
        qs = qs.filter(kind=typ)
    return qs


@monitor_router.post("/dateien", auth=keycloak_auth)
def upload_file(request, datei: UploadedFile = File(...), name: str = Form(""), typ: str = Form("bild")):
    _require_perm(request, 'monitor.edit')
    obj = MediaFile.objects.create(
        name=name or datei.name,
        file=datei,
        kind=typ,
    )
    return {
        'id': obj.id, 'name': obj.name, 'kind': obj.kind,
        'file_url': obj.file.url, 'sort_order': obj.sort_order,
    }


@monitor_router.delete("/dateien/{id}", auth=keycloak_auth)
def delete_file(request, id: int):
    _require_perm(request, 'monitor.edit')
    d = get_object_or_404(MediaFile, id=id)
    # Soft-Delete → Papierkorb (Datei bleibt für Wiederherstellung erhalten)
    d.deleted_at = timezone.now()
    d.save(update_fields=['deleted_at'])
    return {"success": True}


# ═══ Admin: Papierkorb (Soft-Delete) ═════════════════════════════

@monitor_router.get("/papierkorb", auth=keycloak_auth)
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


@monitor_router.post("/papierkorb/wiederherstellen", auth=keycloak_auth)
def restore_trash(request, art: str, id: int):
    _require_perm(request, 'monitor.edit')
    if art == 'ansicht':
        obj = get_object_or_404(DisplayView, id=id)
        obj.deleted_at = None
        obj.save(update_fields=['deleted_at', 'updated_at'])
    elif art == 'medium':
        obj = get_object_or_404(MediaFile, id=id)
        obj.deleted_at = None
        obj.save(update_fields=['deleted_at'])
    else:
        raise HttpError(400, "Unbekannte Art")
    return {"success": True}


@monitor_router.delete("/papierkorb/endgueltig", auth=keycloak_auth)
def purge_trash(request, art: str, id: int):
    _require_perm(request, 'monitor.edit')
    if art == 'ansicht':
        obj = get_object_or_404(DisplayView, id=id, deleted_at__isnull=False)
        obj.delete()
    elif art == 'medium':
        obj = get_object_or_404(MediaFile, id=id, deleted_at__isnull=False)
        if obj.file:
            obj.file.delete(save=False)
        obj.delete()
    else:
        raise HttpError(400, "Unbekannte Art")
    return {"success": True}


# ═══ Admin: Ankündigungen ═════════════════════════════════════════

@monitor_router.get("/ankuendigungen", response=list[AnnouncementSchema], auth=keycloak_auth)
def list_announcements(request):
    _require_perm(request, 'monitor.view')
    return Announcement.objects.all()


@monitor_router.post("/ankuendigungen", response=AnnouncementSchema, auth=keycloak_auth)
def create_announcement(request, payload: AnnouncementCreateSchema):
    _require_perm(request, 'monitor.edit')
    return Announcement.objects.create(**payload.dict())


@monitor_router.put("/ankuendigungen/{id}", response=AnnouncementSchema, auth=keycloak_auth)
def update_announcement(request, id: int, payload: AnnouncementCreateSchema):
    _require_perm(request, 'monitor.edit')
    a = get_object_or_404(Announcement, id=id)
    for key, value in payload.dict().items():
        setattr(a, key, value)
    a.save()
    return a


@monitor_router.delete("/ankuendigungen/{id}", auth=keycloak_auth)
def delete_announcement(request, id: int):
    _require_perm(request, 'monitor.edit')
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
    _require_perm(request, 'monitor.edit')
    return WebUntisLink.objects.create(**payload.dict())


@monitor_router.put("/webuntis-links/{id}", response=WebUntisLinkSchema, auth=keycloak_auth)
def update_webuntis_link(request, id: int, payload: WebUntisLinkCreateSchema):
    _require_perm(request, 'monitor.edit')
    link = get_object_or_404(WebUntisLink, id=id)
    for key, value in payload.dict().items():
        setattr(link, key, value)
    link.save()
    return link


@monitor_router.delete("/webuntis-links/{id}", auth=keycloak_auth)
def delete_webuntis_link(request, id: int):
    _require_perm(request, 'monitor.edit')
    get_object_or_404(WebUntisLink, id=id).delete()
    return {"success": True}


# ═══ Admin: ÖPNV Stationssuche ═══════════════════════════════════

@monitor_router.get("/oepnv/suche", auth=keycloak_auth)
def search_transit_stops(request, q: str = "", results: int = 10,
                         use_db: bool = True, use_nahsh: bool = True):
    """Stationen für ÖPNV-Abfahrtsmonitor suchen"""
    _require_perm(request, 'monitor.edit')
    if len(q) < 2:
        return []
    return oepnv.search_stations(q, results=min(results, 20),
                                 use_db=use_db, use_nahsh=use_nahsh)


# ═══ Bildschirm: Power-Status (öffentlich, kein Auth) ═════════════

@monitor_router.get("/bildschirm/power")
def get_screen_power(request, slug: str):
    """Öffentlicher Endpunkt: Soll der Bildschirm gerade an sein?
    Wird vom Raspberry Pi per Cronjob gepollt. Die Antwortschlüssel bleiben
    für die Pi-Skripte unverändert."""
    try:
        screen = Screen.objects.get(slug=slug)
        return {
            'slug': screen.slug,
            'power': screen.get_power_state(),
            'power_zeitplan': screen.power_schedule,
            'ferien_modus': screen.holiday_mode,
            'power_ausnahmen': screen.power_exceptions,
            'cec_status': screen.cec_status,
            'cec_status_zeit': screen.cec_status_at,
        }
    except Screen.DoesNotExist:
        return {'slug': slug, 'power': True, 'error': 'Bildschirm nicht gefunden'}


@monitor_router.post("/bildschirm/cec-status")
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

@monitor_router.get("/bildschirme", response=list[ScreenListSchema], auth=keycloak_auth)
def list_screens(request):
    _require_perm(request, 'monitor.view')
    return Screen.objects.all()


@monitor_router.post("/bildschirme", auth=keycloak_auth)
def create_screen(request, payload: ScreenCreateSchema):
    _require_perm(request, 'monitor.edit')
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


@monitor_router.put("/bildschirme/{id}", response=ScreenListSchema, auth=keycloak_auth)
def update_screen(request, id: int, payload: ScreenUpdateSchema):
    _require_perm(request, 'monitor.edit')
    screen = get_object_or_404(Screen, id=id)
    data = payload.dict(exclude_unset=True)
    if 'default_view_id' in data:
        val = data.pop('default_view_id')
        screen.default_view_id = val if val else None
    if 'override_view_id' in data:
        val = data.pop('override_view_id')
        screen.override_view_id = val if val else None
    # Power-relevante Felder erkennen, damit wir den Pi sofort informieren
    power_keys = {'schedule', 'power_schedule', 'holiday_mode', 'power_exceptions', 'power_mode'}
    power_changed = bool(power_keys & set(data.keys()))
    for key, value in data.items():
        setattr(screen, key, value)
    screen.save()
    if power_changed:
        from .consumers import push_power_to_screen
        push_power_to_screen(screen.slug)
    return screen


@monitor_router.delete("/bildschirme/{id}", auth=keycloak_auth)
def delete_screen(request, id: int):
    _require_perm(request, 'monitor.edit')
    screen = get_object_or_404(Screen, id=id)
    screen.delete()
    return {"success": True}


@monitor_router.post("/bildschirme/{id}/reload", auth=keycloak_auth)
def reload_screen(request, id: int):
    """Fordert einen Neuladen der Ansicht auf dem Display an (das Display pollt reload_requested_at)."""
    _require_perm(request, 'monitor.edit')
    screen = get_object_or_404(Screen, id=id)
    screen.reload_requested_at = timezone.now()
    screen.save(update_fields=['reload_requested_at'])
    return {"success": True}


# ═══ Klausuren ════════════════════════════════════════════════════

@monitor_router.get("/klausuren", response=list[ExamSchema], auth=keycloak_auth)
def list_exams(request):
    _require_perm(request, 'monitor.view')
    return list(Exam.objects.prefetch_related('screens').all())


@monitor_router.post("/klausuren", response=ExamSchema, auth=keycloak_auth)
def create_exam(request, payload: ExamCreateSchema):
    _require_perm(request, 'monitor.edit')
    data = payload.dict()
    _validate_exam_data(data)
    screen_ids = data.pop('screen_ids', [])
    exam = Exam.objects.create(**data)
    if screen_ids:
        exam.screens.set(Screen.objects.filter(id__in=screen_ids))
    return exam


@monitor_router.put("/klausuren/{id}", response=ExamSchema, auth=keycloak_auth)
def update_exam(request, id: int, payload: ExamUpdateSchema):
    _require_perm(request, 'monitor.edit')
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


@monitor_router.delete("/klausuren/{id}", auth=keycloak_auth)
def delete_exam(request, id: int):
    _require_perm(request, 'monitor.edit')
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
    _require_perm(request, 'monitor.edit')
    data = payload.dict()
    assignments = data.pop('assignments', [])
    event = DisplayEvent.objects.create(**data)
    _apply_event_assignments(event, assignments)
    return event


@monitor_router.put("/events/{id}", response=DisplayEventSchema, auth=keycloak_auth)
def update_event(request, id: int, payload: DisplayEventUpdateSchema):
    _require_perm(request, 'monitor.edit')
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
    _require_perm(request, 'monitor.edit')
    get_object_or_404(DisplayEvent, id=id).delete()
    return {"success": True}


@monitor_router.post("/events/{id}/aktivieren", response=DisplayEventSchema, auth=keycloak_auth)
def activate_event(request, id: int):
    _require_perm(request, 'monitor.edit')
    event = get_object_or_404(DisplayEvent, id=id)
    event.is_active = True
    event.save(update_fields=['is_active'])
    _log_audit(request, 'Event aktiviert', event.name)
    return event


@monitor_router.post("/events/{id}/deaktivieren", response=DisplayEventSchema, auth=keycloak_auth)
def deactivate_event(request, id: int):
    _require_perm(request, 'monitor.edit')
    event = get_object_or_404(DisplayEvent, id=id)
    event.is_active = False
    event.save(update_fields=['is_active'])
    _log_audit(request, 'Event deaktiviert', event.name)
    return event


# ═══ Admin: Klausur-Vorlagen ═════════════════════════════════════

@monitor_router.get("/klausur-vorlagen", response=list[ExamTemplateSchema], auth=keycloak_auth)
def list_exam_templates(request):
    _require_perm(request, 'monitor.view')
    return ExamTemplate.objects.all()


@monitor_router.post("/klausur-vorlagen", response=ExamTemplateSchema, auth=keycloak_auth)
def create_exam_template(request, payload: ExamTemplateCreateSchema):
    _require_perm(request, 'monitor.edit')
    return ExamTemplate.objects.create(**payload.dict())


@monitor_router.put("/klausur-vorlagen/{id}", response=ExamTemplateSchema, auth=keycloak_auth)
def update_exam_template(request, id: int, payload: ExamTemplateCreateSchema):
    _require_perm(request, 'monitor.edit')
    template = get_object_or_404(ExamTemplate, id=id)
    for key, value in payload.dict().items():
        setattr(template, key, value)
    template.save()
    return template


@monitor_router.delete("/klausur-vorlagen/{id}", auth=keycloak_auth)
def delete_exam_template(request, id: int):
    _require_perm(request, 'monitor.edit')
    get_object_or_404(ExamTemplate, id=id).delete()
    return {"success": True}


# ═══ Admin: Globale Einstellungen (Wetter/WebUntis-Zugang) ═══════

@monitor_router.get("/global-settings", response=MonitorSettingsSchema, auth=keycloak_auth)
def get_settings(request):
    _require_perm(request, 'monitor.view')
    return MonitorSettings.load()


@monitor_router.put("/global-settings", response=MonitorSettingsSchema, auth=keycloak_auth)
def update_settings(request, payload: MonitorSettingsUpdateSchema):
    _require_perm(request, 'monitor.edit')
    settings = MonitorSettings.load()
    for key, value in payload.dict(exclude_unset=True).items():
        setattr(settings, key, value)
    settings.save()
    return settings
