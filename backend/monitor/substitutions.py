"""
Vertretungsplan einer Ansicht (Spec §1.1, §1.3): Quellenkette, Ausweichen und Tageslogik.

Reihenfolge der Quellen: WebUntis-Vertretungsplan (Monitor-Schnittstelle) → WebUntis-Konto
(nur mit Zugangsdaten) → Seite einbetten. Die gewählte Quelle kommt zuerst, danach nur die
folgenden. Eine Frist (DEADLINE_SECONDS) gilt für die ganze Kette.

Die Monitor-Schnittstelle cacht je Format, Start und Tagesanzahl, mit Single-Flight-Sperre und
letztem guten Stand (24 h). Die Konto-Abfrage cacht in webuntis.py selbst.

Es werden keine Datenzeilen geloggt.
"""
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
CACHE_PREFIX = 'monitor:subs:'
CACHE_SECONDS = webuntis.CACHE_SECONDS
FAILED_SECONDS = webuntis.CACHE_SECONDS_UNAVAILABLE
LOCK_SECONDS = webuntis.LOCK_SECONDS
LAST_GOOD_SECONDS = webuntis.LAST_GOOD_SECONDS
DEFAULT_FORMAT = 'students_2'
# Die Konto-Abfrage kennt kein Format: alle Spalten, Gruppierung nach Klasse.
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
    """Ergebnis ohne Daten (Seite einbetten oder ohne gültigen Schlüssel)."""
    return _result(source)


# ═══ Tageslogik ═══════════════════════════════════════════════════

def _past_cutoff(value, local_now) -> bool:
    """True ab der Uhrzeit `value` (HH:MM); leer oder ungültig = nie."""
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
    """Nur Tage ab heute (ein Tag ohne Datum bleibt stehen)."""
    return [d for d in days if not d.get('date') or date.fromisoformat(d['date']) >= today]


# ═══ Monitor-Schnittstelle ════════════════════════════════════════

def _exams_suffix(overrides):
    # Eigene Klausur-Einstellung ändert die Zeilen: eigener Schlüssel.
    return f":exams-{'on' if overrides['showExamSupervision'] else 'off'}" if overrides else ''


def _monitor_key(format_name, start, count, overrides):
    return f'{CACHE_PREFIX}monitor:{format_name}:{start.isoformat()}:{count}' + _exams_suffix(overrides)


def _family_key(format_name, overrides):
    """Letzter guter Stand je Format, unabhängig von Start und Tagesanzahl."""
    return f'{CACHE_PREFIX}monitor:{format_name}' + _exams_suffix(overrides) + ':last_good'


def _last_good(key, family_key, start, count):
    """Letzter guter Stand dieses Schlüssels, sonst der des Formats ab `start`, auf `count` Tage gekürzt.

    Greift, wenn der Schlüssel gerade gewechselt hat (Mitternacht, Wechsel auf den nächsten Schultag,
    erster Abruf) und der neue noch keinen eigenen Stand hat.
    """
    stored = cache.get(key + ':last_good')
    if stored:
        return stored
    stored = cache.get(family_key)
    if not stored:
        return None
    days = _current_days(stored['days'], start)[:count]
    return {**stored, 'days': days} if days else None


def _store_monitor(data, now):
    """Rohstand für Cache und letzten guten Stand: Abwesenheiten immer dabei."""
    days = [{'date': d.get('date'), 'absent': d.get('absent') or [],
             'affected': d.get('affected') or _no_affected(), 'messages': d.get('messages') or [],
             'rows': d.get('rows') or []} for d in data.get('days') or []]
    return _result('monitor', group_by=data.get('group_by') or 'class', columns=data.get('columns'),
                   days=days, updated_at=data.get('updated_at'), fetched_at=now.isoformat())


def _present_monitor(stored, view, today):
    """Gespeicherten Stand für diese Ansicht aufbereiten; None, wenn kein Tag mehr aktuell ist."""
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
        # Ein anderer Worker lädt gerade: nicht warten.
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


# ═══ Konto-Abfrage ════════════════════════════════════════════════

def _account(view, now, today, next_day, count, deadline, chosen):
    settings = webuntis._credentials()
    if settings is None:
        return None
    # Als Ersatzquelle nur mit eingerichteten Zugangsdaten (Spec §1.1).
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


# ═══ Kette ════════════════════════════════════════════════════════

def load(view, now, *, single_day: bool) -> dict:
    """Vertretungsplan der Ansicht. `single_day`: nur ein Tag (geteilte Ansicht, Sondermodus)."""
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
            result = empty('unavailable')  # Seite einbetten: liefert immer
        if result is not None:
            return {**result, 'fallback': source != chosen}
