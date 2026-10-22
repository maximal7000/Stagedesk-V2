"""build_payload() is the only place that defines the response shape. The data sources (weather,
transit, disruptions) cache on the view; a preview (draft) view never writes to the database."""
import json
import logging
import re
import secrets
import urllib.parse
import urllib.request

from django.core.cache import cache
from django.utils import timezone

from . import color_scheme, substitutions, transit
from .models import Announcement, DisplayView, MediaFile, MonitorSettings
from .power import compute_power_state

logger = logging.getLogger(__name__)

DEFAULT_MAX_DEPARTURES = 10
PREVIEW_CACHE_PREFIX = 'signage:preview:'
PREVIEW_SECONDS = 600
_PREVIEW_TOKEN_RE = re.compile(r'^[A-Za-z0-9_-]{32}$')
_NULLABLE_DRAFT_FIELDS = {'webuntis_link_id', 'webuntis_link_next_day_id', 'custom_countdown_date',
                          'substitutions_show_exams'}


def _iso(value):
    return value.isoformat() if value else None


def _store_cache(view, fields):
    """Preview drafts are never written."""
    if getattr(view, '_preview', False) or view.pk is None:
        return
    view.save(update_fields=fields + ['updated_at'])


def _wants_transit(view):
    if view.kind == 'departures' or view.show_transit:
        return True
    return view.kind == 'split' and 'departures' in (view.split_left, view.split_right)


def _fetch_weather(view):
    settings = MonitorSettings.load()
    api_key = settings.weather_api_key or view.weather_api_key   # the global key wins
    if not view.show_weather or not view.weather_city or not api_key:
        return None

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
        _store_cache(view, ['weather_cache', 'weather_cache_at'])
        return weather
    except Exception:
        return view.weather_cache or None


def _fetch_transit(view):
    if not _wants_transit(view):
        return None
    if not view.transit_stops:
        return None

    if view.transit_cache_at:
        age = (timezone.now() - view.transit_cache_at).total_seconds()
        # Even with an empty cache wait at least 60 s (no API spam on errors)
        if age < 60:
            return view.transit_cache

    try:
        result = transit.fetch_departures(
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
        _store_cache(view, ['transit_cache', 'transit_cache_at'])
        return result
    except Exception as e:
        logger.warning(f"ÖPNV-Fehler: {e}")
        # Set the timestamp on errors too: next retry in 60 s at the earliest
        view.transit_cache_at = timezone.now()
        _store_cache(view, ['transit_cache_at'])
        return view.transit_cache or None


def _fetch_disruptions(view):
    if not _wants_transit(view):
        return []
    if not (view.transit_disruption_rail or view.transit_disruption_bus or (view.transit_disruption_manual or [])):
        return []
    if view.transit_disruption_cache_at:
        age = (timezone.now() - view.transit_disruption_cache_at).total_seconds()
        if age < 300:
            return view.transit_disruption_cache or []
    result = []
    all_sources_ok = True
    try:
        if view.transit_disruption_rail:
            rail = transit.fetch_disruptions_nahsh(view.transit_disruption_rail_lines or None)
            all_sources_ok = all_sources_ok and bool(rail)
            result += rail
        if view.transit_disruption_bus:
            bus = transit.fetch_disruptions_swl(view.transit_disruption_bus_lines or None)
            all_sources_ok = all_sources_ok and bool(bus)
            result += bus
    except Exception as e:
        all_sources_ok = False
        logger.warning(f"Störungs-Fehler: {e}")
    for m in (view.transit_disruption_manual or []):
        if isinstance(m, dict) and (m.get('title') or m.get('text')):
            result.insert(0, {
                # Hash input keeps the old source key 'manuell' so hidden messages
                # (transit_disruption_hidden) stay hidden.
                'id': transit.disruption_id('manuell', m.get('title'), m.get('text')),
                'source': 'manual', 'kind': 'disruption',
                'title': m.get('title') or 'Hinweis', 'text': m.get('text') or '',
                'lines': [], 'from': '', 'until': '',
                'all_lines': False, 'image': m.get('image') or '', 'stops': [], 'suggestion': '',
                'highlighted': bool(m.get('highlighted')),
            })
    # Prune the hidden list only when every active source delivered data; an outage
    # (missing token, network error) must not drop hidden entries for good.
    if all_sources_ok:
        current_ids = {s.get('id') for s in result}
        hidden = [h for h in (view.transit_disruption_hidden or []) if h in current_ids]
    else:
        hidden = list(view.transit_disruption_hidden or [])
    fields = ['transit_disruption_cache', 'transit_disruption_cache_at']
    if hidden != (view.transit_disruption_hidden or []):
        view.transit_disruption_hidden = hidden
        fields.append('transit_disruption_hidden')
    view.transit_disruption_cache = result
    view.transit_disruption_cache_at = timezone.now()
    _store_cache(view, fields)
    return result


def _max_departures(stop):
    value = stop.get('max_departures', DEFAULT_MAX_DEPARTURES) if isinstance(stop, dict) else None
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        return DEFAULT_MAX_DEPARTURES
    return value


def _departures_data(view):
    stops = {s.get('id'): s for s in (view.transit_stops or []) if isinstance(s, dict)}
    stations = []
    for station in _fetch_transit(view) or []:
        limit = _max_departures(stops.get(station.get('station_id'), {}))
        # Copy: the cache on the view stays unchanged
        entry = dict(station)
        entry['departures'] = list(station.get('departures') or [])[:limit]
        entry['max_departures'] = limit
        stations.append(entry)
    hidden = set(view.transit_disruption_hidden or [])
    disruptions = [s for s in _fetch_disruptions(view) if s.get('id') not in hidden]
    return {'stations': stations, 'disruptions': disruptions}


def _substitutions_data(view, key_ok, now, compact=False, single_day=False):
    """Without a valid key only the embedded page, no substitution rows."""
    full, next_day = view.get_webuntis_url(), view.get_webuntis_url_next_day()
    embed_url = (next_day or full) if compact else (full or next_day)
    result = substitutions.load(view, now, single_day=single_day) if key_ok else substitutions.empty()
    live = result['source'] not in (None, 'unavailable')
    return {**result, 'embed_url': embed_url or None, 'mode': 'live' if live else 'embed'}


def _split_side(view, content, key_ok, now):
    if content in ('substitutions', 'webuntis'):
        return {'kind': 'substitutions',
                'data': _substitutions_data(view, key_ok, now, compact=True, single_day=True)}
    if content == 'departures':
        return {'kind': 'departures', 'data': _departures_data(view)}
    return {'kind': content, 'data': None}


def _split_data(view, key_ok, now):
    percent = view.split_left_percent if isinstance(view.split_left_percent, int) else 50
    return {
        'left': _split_side(view, view.split_left, key_ok, now),
        'right': _split_side(view, view.split_right, key_ok, now),
        'left_percent': max(20, min(80, percent)),
    }


def parse_page_selection(text, count):
    out = []
    for part in (text or '').split(','):
        part = part.strip()
        match = re.fullmatch(r'(\d+)\s*-\s*(\d+)', part)
        if match:
            a, b = sorted((int(match.group(1)), int(match.group(2))))
            numbers = range(a, b + 1)
        elif part.isdigit():
            numbers = [int(part)]
        else:
            continue
        for n in numbers:
            if 1 <= n <= count and n not in out:
                out.append(n)
    return out


def _pdf_page_numbers(view, count, per_screen):
    if view.pdf_mode == 'static':
        start = min(max(1, view.pdf_static_page or 1), count)
        return list(range(start, min(start + per_screen, count + 1)))
    return parse_page_selection(view.pdf_pages, count) or list(range(1, count + 1))


def _media_data(view):
    per_screen = max(1, min(3, view.pdf_per_screen or 1))
    ids = [i for i in (view.media_items or []) if isinstance(i, int) and not isinstance(i, bool)]
    files = {f.id: f for f in MediaFile.objects.filter(id__in=ids, deleted_at__isnull=True,
                                                       status__in=['ready', 'failed'])
             .prefetch_related('pages')}
    pages = []
    for file_id in ids:
        media_file = files.get(file_id)
        if media_file is None:
            continue
        # A failed re-render keeps the old pages.
        file_pages = list(media_file.pages.all())
        if not file_pages:
            continue
        if media_file.kind == 'pdf':
            numbers = _pdf_page_numbers(view, len(file_pages), per_screen)
            file_pages = [file_pages[n - 1] for n in numbers]
        pages += [{'url': p.image.url, 'width': p.width, 'height': p.height,
                   'orientation': p.orientation} for p in file_pages]
    return {'seconds': view.media_seconds, 'per_screen': per_screen, 'pages': pages}


def _upcoming_events(now):
    from veranstaltung.models import Veranstaltung
    upcoming = Veranstaltung.objects.filter(
        status='geplant',
        datum_bis__gte=now,
        datum_von__lte=now + timezone.timedelta(days=7),
    ).order_by('datum_von')[:10]
    events = []
    for v in upcoming:
        is_running = v.effektiv_status == 'laufend' or (
            v.datum_von and v.datum_bis and v.datum_von <= now <= v.datum_bis)
        events.append({
            'id': v.id, 'name': v.titel, 'location': v.ort or '',
            'date_from': _iso(v.datum_von), 'date_until': _iso(v.datum_bis),
            'status': v.status, 'is_running': bool(is_running),
        })
    return events


def _info_data(view, now):
    announcements = []
    if view.show_announcements:
        # Ordered by priority via Announcement.Meta.ordering
        for a in Announcement.objects.filter(is_active=True):
            if (a.active_from and now < a.active_from) or (a.active_until and now > a.active_until):
                continue
            announcements.append({'id': a.id, 'title': a.title, 'text': a.text, 'priority': a.priority,
                                  'active_until': _iso(a.active_until)})
    events = _upcoming_events(now) if (view.show_events or view.show_countdown) else []
    countdown = None
    if view.show_custom_countdown and view.custom_countdown_date and view.custom_countdown_date > now:
        countdown = {'name': view.custom_countdown_name, 'date': _iso(view.custom_countdown_date)}
    elif view.show_countdown:
        upcoming = next((e for e in events if not e['is_running']), None)
        if upcoming:
            countdown = {'name': upcoming['name'], 'date': upcoming['date_from']}
    return {'announcements': announcements,
            'events': events if view.show_events else [],
            'countdown': countdown}


def _rotation_data(view, key_ok, now, single_day):
    items = []
    for item in view.rotation_items or []:
        if not isinstance(item, dict):
            continue
        target = DisplayView.objects.filter(id=item.get('view_id'), deleted_at__isnull=True).first()
        if target is None or target.kind == 'rotation':
            continue
        seconds = item.get('seconds')
        if isinstance(seconds, bool) or not isinstance(seconds, int):
            seconds = 15
        items.append({'seconds': seconds, 'view': _view_object(target, key_ok, now, single_day)})
    return {'items': items}


def _view_data(view, key_ok, now, single_day):
    if view.kind == 'departures':
        return _departures_data(view)
    if view.kind == 'substitutions':
        return _substitutions_data(view, key_ok, now, single_day=single_day)
    if view.kind == 'split':
        return _split_data(view, key_ok, now)
    if view.kind == 'media':
        return _media_data(view)
    if view.kind == 'info':
        return _info_data(view, now)
    if view.kind == 'rotation':
        return _rotation_data(view, key_ok, now, single_day)
    return None


def _view_object(view, key_ok, now, single_day=False):
    """`single_day`: the special mode splits the screen, the substitution plan shows one day."""
    qr = None
    if view.show_qr_code and view.qr_code_url:
        qr = {'url': view.qr_code_url, 'label': view.qr_code_label}
    return {
        'id': view.id,
        'kind': view.kind,
        'layout': view.effective_layout(),
        'page_seconds': view.page_seconds,
        'show_weather': view.show_weather,
        'weather': _fetch_weather(view),
        'qr': qr,
        'data': _view_data(view, key_ok, now, single_day),
    }


def _mode(screen, view, settings):
    """Precedence: emergency > exam > on-air."""
    if settings.emergency_active:
        return {'kind': 'emergency', 'text': settings.emergency_text, 'note': settings.emergency_note,
                'since': _iso(settings.emergency_since)}
    exam = screen.get_active_exam() if screen else None
    # display_mode 'standard' forces nothing: the view stays visible.
    if exam and exam.display_mode in ('fullscreen', 'split'):
        return {'kind': 'exam', 'display': exam.display_mode, 'side': exam.split_side,
                'title': exam.title, 'text': exam.text,
                'active_from': _iso(exam.active_from), 'active_until': _iso(exam.active_until),
                'location': None}
    if settings.on_air_active and view.on_air_behavior != 'none':
        return {'kind': 'on_air', 'display': view.on_air_behavior, 'side': view.on_air_split_side,
                'text': settings.on_air_text, 'animation': settings.on_air_animation,
                'show_clock': settings.on_air_show_clock, 'since': _iso(settings.on_air_since)}
    return None


def _screen_object(screen, now, settings):
    return {'slug': screen.slug, 'name': screen.name, 'location': screen.location,
            'scale': screen.scale, 'orientation': screen.orientation,
            'power': compute_power_state(screen, now),
            'scheme': color_scheme.resolve(screen, settings, now)}


def build_payload(screen, view, *, key_ok, now, preview=False):
    """`screen=None, view=None` stands for an unknown screen.

    `preview=True`: the draft always shows, regardless of the screen's power and of emergency,
    exam or on-air."""
    settings = MonitorSettings.load()
    screen_data = _screen_object(screen, now, settings) if screen else None
    if screen_data and preview:
        screen_data['power'] = True
    mode = _mode(screen, view, settings) if view and not preview else None
    single_day = bool(mode) and mode.get('display') == 'split'
    return {
        'generated_at': now.isoformat(),
        'reload_requested_at': _iso(screen.reload_requested_at) if screen else None,
        'screen': screen_data,
        'scheme': screen_data['scheme'] if screen_data else color_scheme.resolve(None, settings, now),
        'mode': mode,
        'view': _view_object(view, key_ok, now, single_day) if view else None,
    }


def store_preview(draft: dict, screen_id=None) -> str:
    """The token is the authorization; the draft expires after 10 minutes."""
    token = secrets.token_urlsafe(24)[:32]
    cache.set(PREVIEW_CACHE_PREFIX + token, {'view': draft, 'screen_id': screen_id}, PREVIEW_SECONDS)
    return token


def load_preview(token):
    if not token or not _PREVIEW_TOKEN_RE.match(token):
        return None
    return cache.get(PREVIEW_CACHE_PREFIX + token)


def draft_view(draft: dict) -> DisplayView:
    draft = dict(draft)
    view_id = draft.pop('id', None)
    view = None
    if view_id:
        view = DisplayView.objects.filter(id=view_id, deleted_at__isnull=True).first()
    if view is None:
        view = DisplayView(name='Vorschau')
    for key, value in draft.items():
        if value is None and key not in _NULLABLE_DRAFT_FIELDS:
            continue
        setattr(view, key, value)
    if any(key.startswith('transit_') for key in draft):
        # changed stops or filters: do not show the saved view's cache
        view.transit_cache_at = None
        view.transit_disruption_cache_at = None
    view._preview = True
    return view
