"""WebUntis substitution plan via an account (JSON-RPC).

The source is detected automatically: getSubstitutions, on missing permission (-8509) the
timetables of all classes, otherwise "unavailable". The whole response stays 5 minutes in the
Django cache (errors 60 s), shared by all screens.

A fetch has an overall budget (DEADLINE_SECONDS). Only one worker loads at a time (lock in
the cache); if a fetch fails, the last good result stays valid.

No credentials and no data rows are logged."""
import http.cookiejar
import json
import logging
import re
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from html import unescape

from django.core.cache import cache
from django.utils import timezone

from .power import is_holiday

logger = logging.getLogger(__name__)

CACHE_KEY = 'signage:webuntis:subs'
LOCK_KEY = 'signage:webuntis:subs:lock'
LAST_GOOD_KEY = 'signage:webuntis:subs:last_good'
HOLIDAYS_KEY = 'signage:webuntis:holidays'
HOLIDAYS_SECONDS = 24 * 3600
FAILURES_KEY = 'signage:webuntis:subs:failures'
CACHE_SECONDS = 300
CACHE_SECONDS_UNAVAILABLE = 60
LOCK_SECONDS = 30
LAST_GOOD_SECONDS = 24 * 3600
FAILURES_SECONDS = 3600
# Store "unavailable" only after this many failures in a row.
FAILURES_BEFORE_UNAVAILABLE = 2
TIMEOUT = 5
DEADLINE_SECONDS = 20
NO_RIGHT_CODE = -8509
# Search at most this far for the next school day (long holidays).
MAX_LOOKAHEAD_DAYS = 60

KIND_BY_TYPE = {'cancel': 'cancelled', 'subst': 'substitution', 'rmchg': 'room_change', 'rmlk': 'room_change'}
WEEKDAY_LABELS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
KIND_LABELS = {'substitution': 'Vertretung', 'cancelled': 'Entfall', 'room_change': 'Raumänderung',
               'other': 'Änderung'}
# Row shape of both sources (account query here, public monitor in untis_monitor.py).
ROW_KEYS = ['classes', 'group', 'periods', 'subject', 'teacher', 'teacher_old', 'room', 'room_old',
            'kind', 'kind_label', 'note']
ELEMENT_FIELDS = ['id', 'name']


class WebUntisError(Exception):
    def __init__(self, code, message=''):
        super().__init__(f'{code}: {message}')
        self.code = code
        self.message = message


class DeadlineExceeded(Exception):
    """The overall budget of a fetch is used up."""


class WebUntisSession:
    def __init__(self, server, school):
        self.server = server
        self.school = school
        self.rpc_url = f"https://{server}/WebUntis/jsonrpc.do?school={urllib.parse.quote(school)}"
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookie_jar))
        # time.monotonic() point after which no calls start (None = no budget).
        self.deadline = None

    def _timeout(self):
        if self.deadline is None:
            return TIMEOUT
        return max(0.1, min(TIMEOUT, self.deadline - time.monotonic()))

    def call(self, method, params=None):
        body = json.dumps({"id": "1", "method": method, "params": params or {}, "jsonrpc": "2.0"}).encode()
        req = urllib.request.Request(self.rpc_url, data=body, headers={"Content-Type": "application/json"})
        with self.opener.open(req, timeout=self._timeout()) as resp:
            payload = json.loads(resp.read())
        if 'error' in payload:
            error = payload['error'] or {}
            raise WebUntisError(error.get('code'), error.get('message', ''))
        return payload.get('result')

    def get_json(self, path, query=None):
        url = f"https://{self.server}{path}"
        if query:
            url += '?' + urllib.parse.urlencode(query)
        with self.opener.open(urllib.request.Request(url), timeout=self._timeout()) as resp:
            return json.loads(resp.read())


def _credentials():
    from .models import MonitorSettings
    settings = MonitorSettings.load()
    if not settings.webuntis_server or not settings.webuntis_school:
        return None
    return settings


def _check_deadline(session):
    if session.deadline is not None and time.monotonic() >= session.deadline:
        raise DeadlineExceeded()


def _rpc(session, method, params=None):
    _check_deadline(session)
    return session.call(method, params)


def _login(settings, deadline=None):
    """Without a user name logs in anonymously as '#anonymous#'. Raises on error."""
    session = WebUntisSession(settings.webuntis_server, settings.webuntis_school)
    session.deadline = deadline
    _rpc(session, "authenticate", {
        "user": settings.webuntis_username or "#anonymous#",
        "password": settings.webuntis_password or "",
        "client": "stagedesk",
    })
    return session


def _logout(session):
    try:
        session.call("logout")
    except Exception:  # logging out is only courtesy
        pass


def _save_source(source, now=None):
    from .models import MonitorSettings
    MonitorSettings.load()
    MonitorSettings.objects.filter(pk=1).update(webuntis_source=source,
                                                webuntis_checked_at=now or timezone.now())


def _is_no_right(error):
    return error.code == NO_RIGHT_CODE or 'no right' in (error.message or '').lower()


def _log_failure(step, exc):
    code = exc.code if isinstance(exc, WebUntisError) else ''
    logger.warning('WebUntis %s fehlgeschlagen: %s %s', step, type(exc).__name__, code)


def _is_school_day(day: date, holidays=()) -> bool:
    if day.weekday() >= 5 or is_holiday(day):
        return False
    return not any(first <= day <= last for first, last in holidays)


def next_school_day(day: date, holidays=()) -> date:
    candidate = day
    for _ in range(MAX_LOOKAHEAD_DAYS):
        candidate += timedelta(days=1)
        if _is_school_day(candidate, holidays):
            return candidate
    return day + timedelta(days=1)


def school_days(start: date, count: int = 2, holidays=()) -> list:
    days = []
    day = start if _is_school_day(start, holidays) else next_school_day(start, holidays)
    for _ in range(max(count, 0)):
        days.append(day)
        day = next_school_day(day, holidays)
    return days


def _untis_holidays(session) -> list:
    """WebUntis holidays as [(first, last day)], cached 24 h. Errors are dropped silently."""
    cached = cache.get(HOLIDAYS_KEY)
    if cached is not None:
        return cached
    try:
        result = _rpc(session, "getHolidays") or []
        holidays = [(_parse_untis_date(h['startDate']), _parse_untis_date(h['endDate'])) for h in result]
    except DeadlineExceeded:
        raise
    except Exception as exc:
        _log_failure('getHolidays', exc)
        return []
    cache.set(HOLIDAYS_KEY, holidays, HOLIDAYS_SECONDS)
    return holidays


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


def _timegrid(session):
    """{Untis weekday (1 = Sunday): [(name, start, end)]}. Empty if unavailable."""
    try:
        grid = _rpc(session, "getTimegridUnits") or []
    except DeadlineExceeded:
        raise
    except Exception as exc:
        _log_failure('getTimegridUnits', exc)
        return {}
    return {entry.get('day'): [(str(u.get('name', '')), u.get('startTime', 0), u.get('endTime', 0))
                               for u in entry.get('timeUnits') or []]
            for entry in grid}


def _period_label(timegrid, day: date, start: int, end: int) -> str:
    """Periods overlapping [start, end) as "5" or "5-6"; without a grid the clock time."""
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
    """Merges consecutive periods with otherwise equal fields into "5-6".

    Expects rows sorted by class and period."""
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


def _names(elements, key='name'):
    return ', '.join(e[key] for e in elements or [] if e.get(key))


def _name_list(elements, key='name'):
    return [e[key] for e in elements or [] if e.get(key)]


def _row(classes, subject, teacher, teacher_old, room, room_old, kind, note):
    return {'classes': list(classes), 'group': '', 'subject': subject, 'teacher': teacher,
            'teacher_old': teacher_old, 'room': room, 'room_old': room_old, 'kind': kind,
            'kind_label': KIND_LABELS[kind], 'note': note or ''}


def _call_substitutions(session, start: date, end: date):
    return _rpc(session, "getSubstitutions", {
        "startDate": _untis_date(start), "endDate": _untis_date(end), "departmentId": 0})


def _fetch_substitution_entries(session, start: date, end: date):
    result = _call_substitutions(session, start, end)
    entries = []
    for item in result or []:
        row = _row(_name_list(item.get('kl')), _names(item.get('su')),
                   _names(item.get('te')), _names(item.get('te'), 'orgname'),
                   _names(item.get('ro')), _names(item.get('ro'), 'orgname'),
                   KIND_BY_TYPE.get(item.get('type'), 'other'), item.get('txt'))
        entries.append((_parse_untis_date(item['date']), item.get('startTime', 0), item.get('endTime', 0), row))
    return entries


def _get_timetable(session, class_id, start: date, end: date):
    return _rpc(session, "getTimetable", {"options": {
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
    """[(date, start, end, row)] from the timetables of all classes (changes only)."""
    lessons = {}
    class_names = {}
    for klasse in _rpc(session, "getKlassen") or []:
        for lesson in _get_timetable(session, klasse['id'], start, end):
            kind = _timetable_kind(lesson)
            if not kind:
                continue
            lessons.setdefault(lesson['id'], (lesson, kind))
            class_names.setdefault(lesson['id'], []).append(klasse.get('name', ''))
    entries = []
    for lesson_id, (lesson, kind) in lessons.items():
        row = _row(class_names[lesson_id], _names(lesson.get('su')),
                   _names(lesson.get('te')), _names(lesson.get('te'), 'orgname'),
                   _names(lesson.get('ro')), _names(lesson.get('ro'), 'orgname'),
                   kind, lesson.get('substText') or lesson.get('lstext'))
        entries.append((_parse_untis_date(lesson['date']), lesson.get('startTime', 0),
                        lesson.get('endTime', 0), row))
    return entries


def _news_json(session, day: date):
    _check_deadline(session)
    return session.get_json('/WebUntis/api/public/news/newsWidgetData', {'date': _untis_date(day)})


def _fetch_news(session, day: date):
    """Message of the day as text or None. Errors are dropped silently."""
    try:
        data = _news_json(session, day)
        messages = (data.get('data') or {}).get('messagesOfDay') or []
    except DeadlineExceeded:
        raise
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
        rows.sort(key=lambda r: (_natural_key(', '.join(r['classes'])), r['_start']))
        rows = [{k: r[k] for k in ROW_KEYS} for r in rows]
        result.append({'date': day.isoformat(), 'label': _day_label(day, today), 'rows': merge_periods(rows)})
    return result


def _unavailable():
    return {'source': 'unavailable', 'news': None, 'days': [], 'fetched_at': None,
            'updated_at': None}


def _load(settings, now: datetime, start: date | None = None, count: int = 2, deadline: float | None = None):
    local_now = timezone.localtime(now)
    today = local_now.date()
    if deadline is None:
        deadline = time.monotonic() + DEADLINE_SECONDS
    session = _login(settings, deadline=deadline)
    try:
        days = school_days(start or today, max(count, 1), _untis_holidays(session))
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
    return {'source': source, 'news': news, 'days': _build_days(entries, timegrid, days, today, now_hhmm),
            'fetched_at': now.isoformat(), 'updated_at': None}


def _relevant_last_good(today: date, suffix=''):
    """Last good result, only with days from today and relabelled; otherwise None."""
    last_good = cache.get(LAST_GOOD_KEY + suffix)
    if not last_good:
        return None
    days = [{**d, 'label': _day_label(date.fromisoformat(d['date']), today)}
            for d in last_good['days'] if date.fromisoformat(d['date']) >= today]
    if not days:
        return None
    return {**last_good, 'days': days}


def _record_failure(now: datetime):
    """Counts failures in a row; "unavailable" is stored only from the second one on."""
    failures = (cache.get(FAILURES_KEY) or 0) + 1
    cache.set(FAILURES_KEY, failures, FAILURES_SECONDS)
    if failures >= FAILURES_BEFORE_UNAVAILABLE:
        _save_source('unavailable', now)


def get_substitutions(now: datetime, *, start: date | None = None, count: int = 2,
                      deadline: float | None = None) -> dict:
    """Substitutions for `count` school days from `start` (default: today, 2), cached.

    `deadline` (a time.monotonic() point) limits the fetch when it is part of a longer chain;
    without it DEADLINE_SECONDS from now applies."""
    # Only non-default queries get their own cache keys.
    if start is None and count == 2:
        suffix = ''
    else:
        suffix = f":{start.isoformat() if start is not None else 'today'}:{count}"
    cached = cache.get(CACHE_KEY + suffix)
    if cached is not None:
        return cached
    today = timezone.localtime(now).date()
    settings = _credentials()
    if settings is None:
        _save_source('unavailable', now)
        result = _unavailable()
        cache.set(CACHE_KEY + suffix, result, CACHE_SECONDS_UNAVAILABLE)
        return result
    if not cache.add(LOCK_KEY, 1, LOCK_SECONDS):
        # Another worker is loading: do not wait.
        return _relevant_last_good(today, suffix) or _unavailable()
    try:
        try:
            result = _load(settings, now, start, count, deadline)
        except Exception as exc:
            _log_failure('Abruf', exc)
            _record_failure(now)
            result = _relevant_last_good(today, suffix) or _unavailable()
            cache.set(CACHE_KEY + suffix, result, CACHE_SECONDS_UNAVAILABLE)
            return result
        cache.delete(FAILURES_KEY)
        _save_source(result['source'], now)
        cache.set(CACHE_KEY + suffix, result, CACHE_SECONDS)
        cache.set(LAST_GOOD_KEY + suffix, result, LAST_GOOD_SECONDS)
        return result
    finally:
        cache.delete(LOCK_KEY)


def _probe_timetable(session, day: date) -> bool:
    try:
        classes = _rpc(session, "getKlassen") or []
        if classes:
            _get_timetable(session, classes[0]['id'], day, day)
        return True
    except Exception as exc:
        _log_failure('getTimetable', exc)
        return False


def detect_source(session) -> str:
    """'substitutions', on missing permission 'timetable' (if available), otherwise 'unavailable'."""
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
    """Checks each path separately. Only yes/no and the source, no data."""
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
    _save_source(result['source'], now)
    cache.delete(CACHE_KEY)
    return result
