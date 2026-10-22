"""Order of sources: WebUntis monitor endpoint -> WebUntis account (only with credentials) ->
embedded page. The chosen source comes first, then only the following ones. One deadline
(DEADLINE_SECONDS) covers the whole chain.

The monitor endpoint is cached per format, start and day count, with a single-flight lock and
a last good state (24 h). The account query caches in webuntis.py itself.

No data rows are logged."""
import logging
import time
from datetime import date, timedelta

from django.core.cache import cache
from django.utils import timezone

from . import untis_monitor, webuntis
from .models import MonitorSettings
from .substitution_rows import student_rows, teacher_rows

logger = logging.getLogger(__name__)

SOURCES = ['monitor', 'account', 'embed']
CACHE_PREFIX = 'signage:subs:'
CACHE_SECONDS = webuntis.CACHE_SECONDS
FAILED_SECONDS = webuntis.CACHE_SECONDS_UNAVAILABLE
LOCK_SECONDS = webuntis.LOCK_SECONDS
LAST_GOOD_SECONDS = webuntis.LAST_GOOD_SECONDS
DEFAULT_FORMAT = 'students_2'
# The account query has no format: all columns, grouped by class.
ACCOUNT_COLUMNS = {'class': True, 'subject': True, 'teacher': True, 'room': True, 'note': True}
_FAILED = {'failed': True}


def _no_affected():
    return {'classes': [], 'teachers': []}


def _result(source, *, group_by='class', columns=None, days=(), news=None, updated_at=None,
            fetched_at=None):
    return {'source': source, 'fallback': False, 'group_by': group_by,
            'columns': dict(columns or ACCOUNT_COLUMNS), 'days': list(days), 'news': news,
            'updated_at': updated_at, 'fetched_at': fetched_at}


def empty(source=None) -> dict:
    return _result(source)


def _past_cutoff(value, local_now) -> bool:
    try:
        hour, minute = (int(part) for part in (value or '').split(':'))
    except ValueError:
        return False
    return (local_now.hour, local_now.minute) >= (hour, minute)


def _day_count(view, single_day) -> int:
    return 1 if single_day or view.substitutions_format == 'students_1' else 2


def _format_name(view) -> str:
    if view.substitutions_format == 'custom':
        return (view.substitutions_custom_format or '').strip()
    return untis_monitor.FORMAT_PRESETS.get(view.substitutions_format,
                                            untis_monitor.FORMAT_PRESETS[DEFAULT_FORMAT])


def _overrides(view) -> dict:
    if view.substitutions_show_exams is None:
        return {}
    return {'showExamSupervision': bool(view.substitutions_show_exams)}


def _label(day_iso, today):
    return webuntis._day_label(date.fromisoformat(day_iso), today) if day_iso else ''


def _current_days(days, today):
    return [d for d in days if not d.get('date') or date.fromisoformat(d['date']) >= today]


def _exams_suffix(overrides):
    # A custom exam setting changes the rows: own key.
    return f":exams-{'on' if overrides['showExamSupervision'] else 'off'}" if overrides else ''


def _monitor_key(format_name, start, count, overrides):
    return f'{CACHE_PREFIX}monitor:{format_name}:{start.isoformat()}:{count}' + _exams_suffix(overrides)


def _family_key(format_name, overrides):
    return f'{CACHE_PREFIX}monitor:{format_name}' + _exams_suffix(overrides) + ':last_good'


def _last_good(key, family_key, start, count):
    """Falls back to the format's state when the key has just changed (midnight, switch to the next
    school day, first fetch) and the new one has no state yet."""
    stored = cache.get(key + ':last_good')
    if stored:
        return stored
    stored = cache.get(family_key)
    if not stored:
        return None
    days = _current_days(stored['days'], start)[:count]
    return {**stored, 'days': days} if days else None


def _store_monitor(data, now):
    """Absences are always included (shared cache)."""
    days = [{'date': d.get('date'), 'absent': d.get('absent') or [],
             'affected': d.get('affected') or _no_affected(), 'messages': d.get('messages') or [],
             'rows': d.get('rows') or []} for d in data.get('days') or []]
    return _result('monitor', group_by=data.get('group_by') or 'class', columns=data.get('columns'),
                   days=days, updated_at=data.get('updated_at'), fetched_at=now.isoformat())


def _present_monitor(stored, view, today):
    if not stored or stored.get('failed'):
        return None
    days = _current_days(stored['days'], today)
    if not days:
        return None
    to_rows = teacher_rows if stored['group_by'] == 'teacher' else student_rows
    show_absences = view.substitutions_show_absences
    out = [{'date': d['date'], 'label': _label(d['date'], today),
            'absent': list(d['absent']) if show_absences else [],
            'affected': dict(d['affected']) if show_absences else _no_affected(),
            'messages': list(d['messages']), 'rows': to_rows(d['rows'])} for d in days]
    return {**stored, 'columns': dict(stored['columns']), 'days': out}


def _monitor(view, now, today, next_day, count, deadline):
    settings = MonitorSettings.load()
    format_name = _format_name(view)
    if not settings.webuntis_server or not settings.webuntis_school or not format_name:
        return None
    start = today + timedelta(days=1) if next_day else today
    overrides = _overrides(view)
    key = _monitor_key(format_name, start, count, overrides)
    family_key = _family_key(format_name, overrides)
    cached = cache.get(key)
    if cached is not None:
        return (_present_monitor(cached, view, today)
                or _present_monitor(_last_good(key, family_key, start, count), view, today))
    if not cache.add(key + ':lock', 1, LOCK_SECONDS):
        # Another worker is loading: do not wait.
        return _present_monitor(_last_good(key, family_key, start, count), view, today)
    try:
        try:
            data = untis_monitor.load_days(settings.webuntis_server, settings.webuntis_school, format_name,
                                           start=start, count=count, overrides=overrides,
                                           show_absences=True, deadline=deadline)
        except Exception as exc:
            logger.warning('WebUntis-Monitor %s fehlgeschlagen: %s', format_name, type(exc).__name__)
            cache.set(key, _FAILED, FAILED_SECONDS)
            return _present_monitor(_last_good(key, family_key, start, count), view, today)
        stored = _store_monitor(data, now)
        cache.set(key, stored, CACHE_SECONDS)
        cache.set(key + ':last_good', stored, LAST_GOOD_SECONDS)
        cache.set(family_key, stored, LAST_GOOD_SECONDS)
        return _present_monitor(stored, view, today)
    finally:
        cache.delete(key + ':lock')


def _account(view, now, today, next_day, count, deadline, chosen):
    settings = webuntis._credentials()
    if settings is None:
        return None
    # As a fallback only with configured credentials.
    if chosen != 'account' and not settings.webuntis_username:
        return None
    if time.monotonic() >= deadline:
        return None
    start = webuntis.next_school_day(today) if next_day else None
    result = webuntis.get_substitutions(now, start=start, count=count, deadline=deadline)
    if result.get('source') not in ('substitutions', 'timetable'):
        return None
    days = [{'date': d.get('date'), 'label': _label(d.get('date'), today), 'absent': [],
             'affected': _no_affected(), 'messages': [], 'rows': student_rows(d.get('rows') or [])}
            for d in _current_days(result.get('days') or [], today)]
    return _result(result['source'], days=days, news=result.get('news'),
                   fetched_at=result.get('fetched_at'))


def load(view, now, *, single_day: bool) -> dict:
    deadline = time.monotonic() + webuntis.DEADLINE_SECONDS
    local_now = timezone.localtime(now)
    today = local_now.date()
    next_day = _past_cutoff(view.substitutions_next_day_from, local_now)
    count = _day_count(view, single_day)
    chosen = view.substitutions_source if view.substitutions_source in SOURCES else SOURCES[0]
    for source in SOURCES[SOURCES.index(chosen):]:
        if source == 'monitor':
            result = _monitor(view, now, today, next_day, count, deadline)
        elif source == 'account':
            result = _account(view, now, today, next_day, count, deadline, chosen)
        else:
            result = empty('unavailable')  # the embedded page always delivers
        if result is not None:
            return {**result, 'fallback': source != chosen}
