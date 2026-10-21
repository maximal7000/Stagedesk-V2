"""
Gemeinsamer Zeitplan pro Bildschirm (Spec §2.2): eine Liste für Einschaltzeiten und Ansichten.

Zeile: {'days': [0-6], 'from': 'HH:MM', 'until': 'HH:MM', 'view_id': int | None}
- view_id None = Standard-Ansicht des Bildschirms.
- until < from = über Mitternacht; der Teil nach 0 Uhr zählt zum Folgetag.
- Enden zählen mit (Minutengenau), 07:00–13:00 und 13:00–18:00 sind also durchgehend an.
- Überschneiden sich Zeilen, bestimmt die obere die Ansicht; an ist der Bildschirm in der
  Vereinigung aller Zeilen. Ohne Zeilen ist er immer an.
"""
from datetime import datetime

ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
DAY_START = '00:00'
DAY_END = '23:59'


def _rows(rows):
    return [row for row in (rows or []) if isinstance(row, dict) and isinstance(row.get('days', []), list)]


def _window(row):
    start, end = row.get('from') or '', row.get('until') or ''
    if not start and not end:
        return DAY_START, DAY_END
    return start or DAY_START, end or DAY_END


def row_matches(row: dict, weekday: int, hhmm: str) -> bool:
    days = row.get('days', [])
    start, end = _window(row)
    if start <= end:
        return weekday in days and start <= hhmm <= end
    return (weekday in days and hhmm >= start) or ((weekday - 1) % 7 in days and hhmm <= end)


def active_row(rows: list, local_now: datetime):
    weekday, hhmm = local_now.weekday(), local_now.strftime('%H:%M')
    return next((row for row in _rows(rows) if row_matches(row, weekday, hhmm)), None)


def is_on(rows, local_now: datetime) -> bool:
    if not rows:
        return True
    return active_row(rows, local_now) is not None


def _day_intervals(power_rows, day):
    """Einschalt-Intervalle (von, bis) eines Wochentags; Fenster über Mitternacht geteilt."""
    intervals = []
    for row in power_rows:
        start, end = _window(row)
        days = row.get('days', [])
        if start <= end:
            if day in days:
                intervals.append((start, end))
        else:
            if day in days:
                intervals.append((start, DAY_END))
            if (day - 1) % 7 in days:
                intervals.append((DAY_START, end))
    return intervals


def _clip(view_row, power_rows):
    """Ansichten-Zeile auf die Einschaltzeiten schneiden; Tage mit gleichem Schnitt in eine Zeile."""
    start, end = _window(view_row)
    windows = {}
    for day in sorted(set(d for d in view_row.get('days', []) if isinstance(d, int))):
        for on_start, on_end in sorted(_day_intervals(power_rows, day)):
            cut = (max(start, on_start), min(end, on_end))
            if cut[0] < cut[1]:
                windows.setdefault(cut, []).append(day)
    return [{'days': days, 'from': cut[0], 'until': cut[1], 'view_id': view_row.get('view_id')}
            for cut, days in windows.items()]


def merge_legacy(view_rows: list, power_rows: list) -> list:
    """Altdaten (Ansichten-Zeitplan, Einschaltzeiten) zu einer Liste zusammenführen."""
    view_rows, power_rows = _rows(view_rows), _rows(power_rows)
    if not power_rows:
        return [dict(row) for row in view_rows] + (
            [{'days': list(ALL_DAYS), 'from': DAY_START, 'until': DAY_END, 'view_id': None}] if view_rows else [])
    merged = [clipped for row in view_rows for clipped in _clip(row, power_rows)]
    merged += [{'days': row.get('days', []), 'from': row.get('from', ''), 'until': row.get('until', ''),
                'view_id': None} for row in power_rows]
    return merged


def split_legacy(rows):
    """Rückweg: (Ansichten-Zeitplan, Einschaltzeiten) aus der gemeinsamen Liste."""
    rows = _rows(rows)

    def bare(row):
        return {'days': row.get('days', []), 'from': row.get('from', ''), 'until': row.get('until', '')}

    view_rows = [{'view_id': row['view_id'], **bare(row)} for row in rows if row.get('view_id')]
    power_rows = [bare(row) for row in rows if not row.get('view_id')]
    if not power_rows:
        power_rows = [bare(row) for row in rows]
    return view_rows, power_rows
