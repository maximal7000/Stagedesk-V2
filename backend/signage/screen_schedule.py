"""Per-screen schedule: one list for on-times and views.

Row: {'days': [0-6], 'from': 'HH:MM', 'until': 'HH:MM', 'view_id': int | None}
- view_id None = the screen's default view.
- until < from = across midnight; the part after 00:00 counts for the next day.
- Ends are inclusive (minute precision), so 07:00-13:00 and 13:00-18:00 are on throughout.
- If rows overlap, the top one picks the view; the screen is on in the union of all rows.
  Without rows it is always on."""
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


def _legacy_power_rows(power_rows):
    """Legacy power rows across midnight applied to the same day (00:00-until and from-23:59):
    split them into two rows on the same days so they behave unchanged."""
    rows = []
    for row in power_rows:
        start, end = _window(row)
        days = row.get('days', [])
        if start > end:
            rows.append({'days': days, 'from': start, 'until': DAY_END})
            rows.append({'days': days, 'from': DAY_START, 'until': end})
        else:
            rows.append({'days': days, 'from': row.get('from', ''), 'until': row.get('until', '')})
    return rows


def _legacy_view_row_matched(row):
    """Legacy view rows only matched with a view_id and from < until (start <= now <= end)."""
    start, end = _window(row)
    return bool(row.get('view_id')) and start < end


def _clip(view_row, power_rows):
    """Clip a view row to the on-times; days with the same clip share one row."""
    start, end = _window(view_row)
    windows = {}
    for day in sorted(set(d for d in view_row.get('days', []) if isinstance(d, int))):
        intervals = sorted(_window(row) for row in power_rows if day in row.get('days', []))
        for on_start, on_end in intervals:
            cut = (max(start, on_start), min(end, on_end))
            if cut[0] < cut[1]:
                windows.setdefault(cut, []).append(day)
    return [{'days': days, 'from': cut[0], 'until': cut[1], 'view_id': view_row.get('view_id')}
            for cut, days in windows.items()]


def merge_legacy(view_rows: list, power_rows: list) -> list:
    """Merge legacy data (view schedule, on-times) into one list with the same effect: view rows
    that never matched are dropped, on-time rows across midnight still apply to the same day."""
    view_rows = [row for row in _rows(view_rows) if _legacy_view_row_matched(row)]
    power_rows = _legacy_power_rows(_rows(power_rows))
    if not power_rows:
        return [dict(row) for row in view_rows] + (
            [{'days': list(ALL_DAYS), 'from': DAY_START, 'until': DAY_END, 'view_id': None}] if view_rows else [])
    merged = [clipped for row in view_rows for clipped in _clip(row, power_rows)]
    merged += [{**row, 'view_id': None} for row in power_rows]
    return merged


def split_legacy(rows):
    """Rollback: (view schedule, on-times) from the combined list."""
    rows = _rows(rows)

    def bare(row):
        return {'days': row.get('days', []), 'from': row.get('from', ''), 'until': row.get('until', '')}

    view_rows = [{'view_id': row['view_id'], **bare(row)} for row in rows if row.get('view_id')]
    power_rows = [bare(row) for row in rows if not row.get('view_id')]
    if not power_rows:
        power_rows = [bare(row) for row in rows]
    return view_rows, power_rows
