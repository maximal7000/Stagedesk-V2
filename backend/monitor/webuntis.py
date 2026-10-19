"""
WebUntis-Vertretungsplan (Spec §4.3).

Quelle wird automatisch erkannt: getSubstitutions, bei fehlendem Recht (-8509) der
Stundenplan aller Klassen, sonst "unavailable". Die gesamte Antwort liegt 5 Minuten
im Django-Cache (Fehler 60 s), gemeinsam für alle Bildschirme.

Es werden keine Zugangsdaten und keine Datenzeilen geloggt.
"""
import http.cookiejar
import json
import logging
import re
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from html import unescape

from django.core.cache import cache
from django.utils import timezone

from .power import is_holiday

logger = logging.getLogger(__name__)

CACHE_KEY = 'monitor:webuntis:subs'
CACHE_SECONDS = 300
CACHE_SECONDS_UNAVAILABLE = 60
TIMEOUT = 5
NO_RIGHT_CODE = -8509
# Höchstens so weit nach dem nächsten Schultag suchen (lange Ferien).
MAX_LOOKAHEAD_DAYS = 60

KIND_BY_TYPE = {'cancel': 'cancelled', 'subst': 'substitution', 'rmchg': 'room_change', 'rmlk': 'room_change'}
WEEKDAY_LABELS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
ROW_KEYS = ['class', 'periods', 'subject', 'teacher', 'teacher_old', 'room', 'room_old', 'kind', 'note']
ELEMENT_FIELDS = ['id', 'name']


class WebUntisError(Exception):
    """Fehlerantwort des JSON-RPC-Servers (code wie -8509)."""

    def __init__(self, code, message=''):
        super().__init__(f'{code}: {message}')
        self.code = code
        self.message = message


class WebUntisSession:
    """Verbindung zu einem WebUntis-Server (Basis-URL plus Cookie-Jar)."""

    def __init__(self, server, school):
        self.server = server
        self.school = school
        self.rpc_url = f"https://{server}/WebUntis/jsonrpc.do?school={urllib.parse.quote(school)}"
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookie_jar))

    def call(self, method, params=None):
        """JSON-RPC-Aufruf. Gibt `result` zurück, wirft WebUntisError bei Fehlerantwort."""
        body = json.dumps({"id": "1", "method": method, "params": params or {}, "jsonrpc": "2.0"}).encode()
        req = urllib.request.Request(self.rpc_url, data=body, headers={"Content-Type": "application/json"})
        with self.opener.open(req, timeout=TIMEOUT) as resp:
            payload = json.loads(resp.read())
        if 'error' in payload:
            error = payload['error'] or {}
            raise WebUntisError(error.get('code'), error.get('message', ''))
        return payload.get('result')

    def get_json(self, path, query=None):
        """GET auf einen REST-Pfad des Servers mit den Cookies aus dem Login."""
        url = f"https://{self.server}{path}"
        if query:
            url += '?' + urllib.parse.urlencode(query)
        with self.opener.open(urllib.request.Request(url), timeout=TIMEOUT) as resp:
            return json.loads(resp.read())


# ═══ Sitzung ══════════════════════════════════════════════════════

def _credentials():
    from .models import MonitorSettings
    settings = MonitorSettings.load()
    if not settings.webuntis_server or not settings.webuntis_school:
        return None
    return settings


def _login(settings):
    """Anmelden (ohne Benutzername anonym mit '#anonymous#'). Wirft bei Fehler."""
    session = WebUntisSession(settings.webuntis_server, settings.webuntis_school)
    session.call("authenticate", {
        "user": settings.webuntis_username or "#anonymous#",
        "password": settings.webuntis_password or "",
        "client": "stagedesk",
    })
    return session


def _logout(session):
    try:
        session.call("logout")
    except Exception:  # Abmelden ist nur Höflichkeit
        pass


def _save_source(source, now=None, force=False):
    from .models import MonitorSettings
    MonitorSettings.load()
    qs = MonitorSettings.objects.filter(pk=1)
    if not force:
        qs = qs.exclude(webuntis_source=source)
    qs.update(webuntis_source=source, webuntis_checked_at=now or timezone.now())


def _is_no_right(error):
    return error.code == NO_RIGHT_CODE or 'no right' in (error.message or '').lower()


def _log_failure(step, exc):
    code = exc.code if isinstance(exc, WebUntisError) else ''
    logger.warning('WebUntis %s fehlgeschlagen: %s %s', step, type(exc).__name__, code)


# ═══ Schultage ════════════════════════════════════════════════════

def _is_school_day(day: date) -> bool:
    return day.weekday() < 5 and not is_holiday(day)


def next_school_day(day: date) -> date:
    """Nächster Schultag nach `day`: überspringt Wochenenden und HolidayPeriod."""
    candidate = day
    for _ in range(MAX_LOOKAHEAD_DAYS):
        candidate += timedelta(days=1)
        if _is_school_day(candidate):
            return candidate
    return day + timedelta(days=1)


def school_days(today: date) -> list:
    """Heute (falls Schultag, sonst der nächste) und der Schultag danach."""
    first = today if _is_school_day(today) else next_school_day(today)
    return [first, next_school_day(first)]


def _day_label(day: date, today: date) -> str:
    if day == today:
        return 'Heute'
    if day == today + timedelta(days=1):
        return 'Morgen'
    return WEEKDAY_LABELS[day.weekday()]


def _untis_date(day: date) -> int:
    return int(day.strftime('%Y%m%d'))


def _parse_untis_date(value) -> date:
    return datetime.strptime(str(value), '%Y%m%d').date()


# ═══ Stunden ══════════════════════════════════════════════════════

def _timegrid(session):
    """{Untis-Wochentag (1 = Sonntag): [(name, start, end)]}. Leer, wenn nicht abrufbar."""
    try:
        grid = session.call("getTimegridUnits") or []
    except Exception as exc:
        _log_failure('getTimegridUnits', exc)
        return {}
    return {entry.get('day'): [(str(u.get('name', '')), u.get('startTime', 0), u.get('endTime', 0))
                               for u in entry.get('timeUnits') or []]
            for entry in grid}


def _period_label(timegrid, day: date, start: int, end: int) -> str:
    """Stunden, die [start, end) überlappen, als "5" bzw. "5-6"; ohne Raster die Uhrzeit."""
    units = timegrid.get(day.isoweekday() % 7 + 1) or next(iter(timegrid.values()), [])
    names = [name for name, u_start, u_end in units if u_start < end and u_end > start]
    if not names:
        return f'{start // 100:02d}:{start % 100:02d}'
    return names[0] if len(names) == 1 else f'{names[0]}-{names[-1]}'


def _period_range(label):
    first, _, last = label.partition('-')
    try:
        return int(first), int(last or first)
    except ValueError:
        return None


def merge_periods(rows):
    """Fasst aufeinanderfolgende Stunden mit sonst gleichen Angaben zu "5-6" zusammen.

    Erwartet Zeilen sortiert nach Klasse und Stunde.
    """
    merged = []
    for row in rows:
        prev = merged[-1] if merged else None
        if prev and all(prev[k] == row[k] for k in ROW_KEYS if k != 'periods'):
            prev_range, cur_range = _period_range(prev['periods']), _period_range(row['periods'])
            if prev_range and cur_range and prev_range[1] + 1 == cur_range[0]:
                prev['periods'] = f'{prev_range[0]}-{cur_range[1]}'
                continue
        merged.append(dict(row))
    return merged


def _natural_key(text):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r'(\d+)', text or '')]


# ═══ Abruf ════════════════════════════════════════════════════════

def _names(elements, key='name'):
    return ', '.join(e[key] for e in elements or [] if e.get(key))


def _row(class_name, subject, teacher, teacher_old, room, room_old, kind, note):
    return {'class': class_name, 'subject': subject, 'teacher': teacher, 'teacher_old': teacher_old,
            'room': room, 'room_old': room_old, 'kind': kind, 'note': note or ''}


def _call_substitutions(session, start: date, end: date):
    return session.call("getSubstitutions", {
        "startDate": _untis_date(start), "endDate": _untis_date(end), "departmentId": 0})


def _fetch_substitution_entries(session, start: date, end: date):
    """[(date, start, end, row)] aus getSubstitutions."""
    result = _call_substitutions(session, start, end)
    entries = []
    for item in result or []:
        row = _row(_names(item.get('kl')), _names(item.get('su')),
                   _names(item.get('te')), _names(item.get('te'), 'orgname'),
                   _names(item.get('ro')), _names(item.get('ro'), 'orgname'),
                   KIND_BY_TYPE.get(item.get('type'), 'other'), item.get('txt'))
        entries.append((_parse_untis_date(item['date']), item.get('startTime', 0), item.get('endTime', 0), row))
    return entries


def _get_timetable(session, class_id, start: date, end: date):
    return session.call("getTimetable", {"options": {
        "element": {"id": class_id, "type": 1},
        "startDate": _untis_date(start), "endDate": _untis_date(end),
        "showSubstText": True, "showLsText": True,
        "klasseFields": ELEMENT_FIELDS, "teacherFields": ELEMENT_FIELDS,
        "subjectFields": ELEMENT_FIELDS, "roomFields": ELEMENT_FIELDS,
    }}) or []


def _timetable_kind(lesson):
    if lesson.get('code') == 'cancelled':
        return 'cancelled'
    teacher_changed = any(t.get('orgid') for t in lesson.get('te') or [])
    room_changed = any(r.get('orgid') for r in lesson.get('ro') or [])
    if teacher_changed:
        return 'substitution'
    if room_changed:
        return 'room_change'
    if lesson.get('code') == 'irregular':
        return 'substitution'
    return None


def _fetch_timetable_entries(session, start: date, end: date):
    """[(date, start, end, row)] aus den Stundenplänen aller Klassen (nur Abweichungen)."""
    lessons = {}
    class_names = {}
    for klasse in session.call("getKlassen") or []:
        for lesson in _get_timetable(session, klasse['id'], start, end):
            kind = _timetable_kind(lesson)
            if not kind:
                continue
            lessons.setdefault(lesson['id'], (lesson, kind))
            class_names.setdefault(lesson['id'], []).append(klasse.get('name', ''))
    entries = []
    for lesson_id, (lesson, kind) in lessons.items():
        row = _row(', '.join(class_names[lesson_id]), _names(lesson.get('su')),
                   _names(lesson.get('te')), _names(lesson.get('te'), 'orgname'),
                   _names(lesson.get('ro')), _names(lesson.get('ro'), 'orgname'),
                   kind, lesson.get('substText') or lesson.get('lstext'))
        entries.append((_parse_untis_date(lesson['date']), lesson.get('startTime', 0),
                        lesson.get('endTime', 0), row))
    return entries


def _news_json(session, day: date):
    return session.get_json('/WebUntis/api/public/news/newsWidgetData', {'date': _untis_date(day)})


def _fetch_news(session, day: date):
    """Nachricht zum Tag als Text oder None. Fehler fallen still weg."""
    try:
        data = _news_json(session, day)
        messages = (data.get('data') or {}).get('messagesOfDay') or []
    except Exception as exc:
        _log_failure('news', exc)
        return None
    texts = []
    for message in messages:
        parts = [_strip_html(message.get('subject')), _strip_html(message.get('text'))]
        text = ': '.join(p for p in parts if p)
        if text:
            texts.append(text)
    return '\n'.join(texts) or None


def _strip_html(value):
    text = re.sub(r'<[^>]+>', ' ', value or '')
    return re.sub(r'\s+', ' ', unescape(text)).strip()


def _build_days(entries, timegrid, days, today, now_hhmm):
    result = []
    for day in days:
        rows = []
        for entry_day, start, end, row in entries:
            if entry_day != day or (day == today and end <= now_hhmm):
                continue
            rows.append({**row, 'periods': _period_label(timegrid, day, start, end), '_start': start})
        rows.sort(key=lambda r: (_natural_key(r['class']), r['_start']))
        rows = [{k: r[k] for k in ROW_KEYS} for r in rows]
        result.append({'date': day.isoformat(), 'label': _day_label(day, today), 'rows': merge_periods(rows)})
    return result


def _unavailable():
    return {'source': 'unavailable', 'news': None, 'days': []}


def _load(settings, now: datetime):
    local_now = timezone.localtime(now)
    today = local_now.date()
    days = school_days(today)
    session = _login(settings)
    try:
        try:
            entries = _fetch_substitution_entries(session, days[0], days[-1])
            source = 'substitutions'
        except WebUntisError as exc:
            if not _is_no_right(exc):
                raise
            entries = _fetch_timetable_entries(session, days[0], days[-1])
            source = 'timetable'
        timegrid = _timegrid(session)
        news = _fetch_news(session, today)
    finally:
        _logout(session)
    now_hhmm = local_now.hour * 100 + local_now.minute
    return {'source': source, 'news': news, 'days': _build_days(entries, timegrid, days, today, now_hhmm)}


def get_substitutions(now: datetime) -> dict:
    """Vertretungen für heute und den nächsten Schultag, gecacht (Spec §4.3)."""
    cached = cache.get(CACHE_KEY)
    if cached is not None:
        return cached
    settings = _credentials()
    if settings is None:
        return _unavailable()
    try:
        result = _load(settings, now)
    except Exception as exc:
        _log_failure('Abruf', exc)
        result = _unavailable()
    _save_source(result['source'], now)
    seconds = CACHE_SECONDS_UNAVAILABLE if result['source'] == 'unavailable' else CACHE_SECONDS
    cache.set(CACHE_KEY, result, seconds)
    return result


# ═══ Diagnose ═════════════════════════════════════════════════════

def _probe_timetable(session, day: date) -> bool:
    try:
        classes = session.call("getKlassen") or []
        if classes:
            _get_timetable(session, classes[0]['id'], day, day)
        return True
    except Exception as exc:
        _log_failure('getTimetable', exc)
        return False


def detect_source(session) -> str:
    """'substitutions', bei fehlendem Recht 'timetable' (sofern abrufbar), sonst 'unavailable'."""
    today = timezone.localdate()
    try:
        _call_substitutions(session, today, today)
        return 'substitutions'
    except WebUntisError as exc:
        if not _is_no_right(exc):
            _log_failure('getSubstitutions', exc)
            return 'unavailable'
    except Exception as exc:
        _log_failure('getSubstitutions', exc)
        return 'unavailable'
    return 'timetable' if _probe_timetable(session, today) else 'unavailable'


def check() -> dict:
    """Prüft jeden Weg einzeln. Gibt nur Ja/Nein und die Quelle zurück, keine Daten."""
    now = timezone.now()
    today = timezone.localtime(now).date()
    result = {'login': False, 'substitutions': False, 'timetable': False, 'news': False,
              'source': 'unavailable'}
    settings = _credentials()
    session = None
    if settings is not None:
        try:
            session = _login(settings)
            result['login'] = True
        except Exception as exc:
            _log_failure('Anmeldung', exc)
    if session is not None:
        try:
            try:
                _call_substitutions(session, today, today)
                result['substitutions'] = True
            except Exception as exc:
                _log_failure('getSubstitutions', exc)
            result['timetable'] = _probe_timetable(session, today)
            try:
                _news_json(session, today)
                result['news'] = True
            except Exception as exc:
                _log_failure('news', exc)
        finally:
            _logout(session)
    if result['substitutions']:
        result['source'] = 'substitutions'
    elif result['timetable']:
        result['source'] = 'timetable'
    _save_source(result['source'], now, force=True)
    cache.delete(CACHE_KEY)
    return result
