"""Client for the public WebUntis monitor endpoint (substitution plan without an account).

Two endpoints: `format` returns the display options configured in WebUntis (cached for an hour),
`data` returns rows, absences and messages of one day. Each request has an overall budget
(monotonic deadline); every error becomes MonitorUnavailable.

No data rows are logged."""
import re
import time
import urllib.parse
from datetime import date, datetime

import requests
from django.core.cache import cache
from django.utils import timezone

from .webuntis import ROW_KEYS, _strip_html

TIMEOUT = 5
FORMAT_CACHE_SECONDS = 3600
FORMAT_CACHE_PREFIX = 'signage:untis-monitor:format:'

FORMAT_PRESETS = {'students_2': 'vplan-schueler', 'students_1': 'vplan-schueler-1', 'teachers': 'vplan-lehrer'}

# Row columns in fixed order: (format option, field). Field None = drop.
# A column only exists if its option is set in the format.
COLUMN_ORDER = [
    ('showHour', 'periods'),
    ('showTime', None),
    ('showClass', 'classes'),
    ('showSubject', 'subject'),
    ('showRoom', 'room'),
    ('showTeacher', 'teacher'),
    ('showSubstText', 'kind_label'),
    ('showInfo', 'note'),
]
# Element types in absentElements/affectedElements.
ELEMENT_CLASS = 1
ELEMENT_TEACHER = 2
GROUP_BY = {1: 'class', 2: 'teacher'}
DEFAULT_KIND_LABEL = 'Vertretung'

_CHANGED = re.compile(r'^(.*?)\s*\((.*)\)\s*$', re.DOTALL)
# Kind texts from WebUntis (German, as delivered).
_CANCEL_TEXT = re.compile(r'entfall|ausfall', re.IGNORECASE)
_ROOM_CHANGE_TEXT = re.compile(r'raumänderung', re.IGNORECASE)
_NEW_SPAN = re.compile(r'<span[^>]*substMonitorSubstElem[^>]*>(.*?)</span>', re.DOTALL | re.IGNORECASE)


class MonitorUnavailable(Exception):
    """The monitor endpoint is unreachable or returned something unusable."""


def _base(server):
    return f'https://{server}/WebUntis/monitor/substitution'


def _post(url, body, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise MonitorUnavailable('Frist abgelaufen')
    try:
        response = requests.post(url, json=body, timeout=min(TIMEOUT, remaining))
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise MonitorUnavailable(type(exc).__name__) from exc
    if not isinstance(data, dict) or not isinstance(data.get('payload'), dict):
        raise MonitorUnavailable('Antwort ohne payload')
    return data


def request_format(server, school, format_name, deadline):
    query = f'school={urllib.parse.quote(school)}&formatName={urllib.parse.quote(format_name)}'
    url = f'{_base(server)}/format?{query}'
    return _post(url, {'formatName': format_name, 'schoolName': school}, deadline)


def request_day(server, school, format_name, options, day: date, deadline):
    url = f'{_base(server)}/data?school={urllib.parse.quote(school)}'
    body = {**options, 'formatName': format_name, 'schoolName': school,
            'date': int(day.strftime('%Y%m%d')), 'dateOffset': 0}
    return _post(url, body, deadline)


def fetch_format(server, school, format_name, deadline) -> dict:
    key = FORMAT_CACHE_PREFIX + format_name
    cached = cache.get(key)
    if cached is not None:
        return cached
    payload = request_format(server, school, format_name, deadline)['payload']
    cache.set(key, payload, FORMAT_CACHE_SECONDS)
    return payload


def fetch_day(server, school, format_name, options, day: date, deadline) -> dict:
    return request_day(server, school, format_name, options, day, deadline)['payload']


def check(server, school, format_name, deadline):
    """The format is fetched fresh, not from the cache; no data is returned."""
    cache.delete(FORMAT_CACHE_PREFIX + format_name)
    try:
        options = fetch_format(server, school, format_name, deadline)
        fetch_day(server, school, format_name, options, timezone.localdate(), deadline)
    except MonitorUnavailable as exc:
        return str(exc)
    except Exception as exc:
        return type(exc).__name__
    return None


def _iso_date(value):
    try:
        return datetime.strptime(str(value), '%Y%m%d').date().isoformat()
    except (TypeError, ValueError):
        return None


def _updated_at(value):
    try:
        naive = datetime.strptime(value, '%d.%m.%Y %H:%M:%S')
    except (TypeError, ValueError):
        return None
    return timezone.make_aware(naive, timezone.get_default_timezone()).isoformat()


def _unit(value):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number or None


def _absence_periods(absences):
    starts, ends = [], []
    for absence in absences or []:
        start, end = _unit(absence.get('startUnit')), _unit(absence.get('endUnit'))
        if absence.get('type') == 'ALL_DAY' or start is None or end is None:
            return ''
        starts.append(start)
        ends.append(end)
    if not starts:
        return ''
    first, last = min(starts), max(ends)
    return f'{first}.' if first == last else f'{first}.–{last}.'


def parse_header(payload: dict, show_absences: bool) -> dict:
    absent, affected = [], {'classes': [], 'teachers': []}
    if show_absences:
        for element in payload.get('absentElements') or []:
            kind = 'class' if element.get('elementType') == ELEMENT_CLASS else 'teacher'
            absent.append({'name': element.get('elementName') or '', 'kind': kind,
                           'periods': _absence_periods(element.get('absences'))})
        elements = payload.get('affectedElements') or {}
        affected = {'classes': list(elements.get(str(ELEMENT_CLASS)) or []),
                    'teachers': list(elements.get(str(ELEMENT_TEACHER)) or [])}
    messages = [{'subject': _strip_html(m.get('subject')), 'body': _strip_html(m.get('body'))}
                for m in (payload.get('messageData') or {}).get('messages') or []]
    return {'date': _iso_date(payload.get('date')), 'next_date': _iso_date(payload.get('nextDate')),
            'absent': absent, 'affected': affected, 'messages': messages,
            'updated_at': _updated_at(payload.get('lastUpdate'))}


def _text(html):
    return _strip_html(html)


def _split_change(cell):
    """(new, old) of a cell: "<span ...>ROT</span> (<span ...>ÖLZ</span>)" or "204 (209)"."""
    cell = cell or ''
    span = _NEW_SPAN.search(cell)
    if span:
        new = _text(span.group(1))
        rest = _text(cell[span.end():])
        match = re.match(r'^\((.*)\)$', rest)
        return new, (match.group(1).strip() if match else '')
    text = _text(cell)
    match = _CHANGED.match(text)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return text, ''


def _periods(text):
    parts = [p.strip() for p in text.split('-')]
    if len(parts) == 2 and all(parts):
        return f'{parts[0]}.–{parts[1]}.'
    return f'{text}.' if text else ''


def _kind(label, css_classes):
    if _CANCEL_TEXT.search(label) or 'cancelStyle' in (css_classes or []):
        return 'cancelled'
    if _ROOM_CHANGE_TEXT.search(label):
        return 'room_change'
    return 'other' if label else 'substitution'


def parse_rows(payload: dict, options: dict) -> list:
    """Repeated per group as delivered; the caller dedupes."""
    fields = [field for option, field in COLUMN_ORDER if options.get(option)]
    rows = []
    for raw in payload.get('rows') or []:
        cells = dict(zip(fields, raw.get('data') or []))
        teacher, teacher_old = _split_change(cells.get('teacher'))
        room, room_old = _split_change(cells.get('room'))
        label = _text(cells.get('kind_label'))
        rows.append({
            'classes': [c.strip() for c in _text(cells.get('classes')).split(',') if c.strip()],
            'group': raw.get('group') or '',
            'periods': _periods(_text(cells.get('periods'))),
            'subject': _text(cells.get('subject')),
            'teacher': teacher, 'teacher_old': teacher_old,
            'room': room, 'room_old': room_old,
            'kind': _kind(label, raw.get('cssClasses')),
            'kind_label': label or DEFAULT_KIND_LABEL,
            'note': _text(cells.get('note')),
        })
    return rows


def load_days(server, school, format_name, *, start: date, count: int, overrides: dict,
              show_absences: bool, deadline: float) -> dict:
    """The next day comes from the previous day's next_date."""
    options = {**fetch_format(server, school, format_name, deadline), **(overrides or {})}
    days = []
    day = start
    for _ in range(max(count, 0)):
        payload = fetch_day(server, school, format_name, options, day, deadline)
        header = parse_header(payload, show_absences)
        days.append({**header, 'rows': parse_rows(payload, options)})
        if not header['next_date']:
            break
        day = date.fromisoformat(header['next_date'])
    return {
        'group_by': GROUP_BY.get(options.get('groupBy'), 'class'),
        'columns': {'class': bool(options.get('showClass')), 'subject': bool(options.get('showSubject')),
                    'teacher': bool(options.get('showTeacher')), 'room': bool(options.get('showRoom')),
                    'note': bool(options.get('showInfo') or options.get('showSubstText'))},
        'days': days,
        'updated_at': next((d['updated_at'] for d in days if d['updated_at']), None),
    }
