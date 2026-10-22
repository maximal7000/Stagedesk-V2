"""Einschaltzeiten und Ansichten-Zeitplan werden ein gemeinsamer Zeitplan (Spec §2.2).

Vorwärts: Ansichten-Zeilen auf die Einschaltzeiten zugeschnitten oben, darunter jede Einschaltzeile mit
Standard-Ansicht; Zeilen, die nie griffen (Ansicht fehlt oder gelöscht, von >= bis), entfallen. Eine
Ansicht als Ziffern-Text ("3") griff im alten Code und wird zur Zahl. Rückwärts: aufteilen.

Die Hilfsfunktionen sind hier eingefroren (Stand dieser Migration), damit spätere Änderungen an
monitor.screen_schedule die Migration nicht verändern.
"""
from django.db import migrations, models

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


def _legacy_power_rows(power_rows):
    """Alte Einschaltzeilen über Mitternacht galten am selben Tag (00:00–bis und von–23:59):
    in zwei Zeilen auf denselben Tagen umschreiben, damit sie unverändert wirken."""
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
    """Alte Ansichten-Zeilen griffen nur mit view_id und bei von < bis (start <= jetzt <= ende)."""
    start, end = _window(row)
    return bool(row.get('view_id')) and start < end


def _clip(view_row, power_rows):
    """Ansichten-Zeile auf die Einschaltzeiten schneiden; Tage mit gleichem Schnitt in eine Zeile."""
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


def merge_legacy(view_rows, power_rows):
    view_rows = [row for row in _rows(view_rows) if _legacy_view_row_matched(row)]
    power_rows = _legacy_power_rows(_rows(power_rows))
    if not power_rows:
        return [dict(row) for row in view_rows] + (
            [{'days': list(ALL_DAYS), 'from': DAY_START, 'until': DAY_END, 'view_id': None}] if view_rows else [])
    merged = [clipped for row in view_rows for clipped in _clip(row, power_rows)]
    merged += [{**row, 'view_id': None} for row in power_rows]
    return merged


def split_legacy(rows):
    rows = _rows(rows)

    def bare(row):
        return {'days': row.get('days', []), 'from': row.get('from', ''), 'until': row.get('until', '')}

    view_rows = [{'view_id': row['view_id'], **bare(row)} for row in rows if row.get('view_id')]
    power_rows = [bare(row) for row in rows if not row.get('view_id')]
    if not power_rows:
        power_rows = [bare(row) for row in rows]
    return view_rows, power_rows


def _view_id(value):
    """Ansicht als Zahl; Ziffern-Text ("3") wird zur Zahl, alles andere None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def forward(apps, schema_editor):
    Screen = apps.get_model('monitor', 'Screen')
    View = apps.get_model('monitor', 'DisplayView')
    live = set(View.objects.filter(deleted_at__isnull=True).values_list('id', flat=True))
    for screen in Screen.objects.all():
        # Zeilen mit fehlender oder gelöschter Ansicht griffen nie: entfallen, statt Standard zu zeigen
        view_rows = [{**row, 'view_id': _view_id(row.get('view_id'))} for row in (screen.schedule or [])
                     if isinstance(row, dict) and _view_id(row.get('view_id')) in live]
        screen.schedule = merge_legacy(view_rows, screen.power_schedule)
        screen.save(update_fields=['schedule'])


def backward(apps, schema_editor):
    Screen = apps.get_model('monitor', 'Screen')
    for screen in Screen.objects.all():
        screen.schedule, screen.power_schedule = split_legacy(screen.schedule)
        screen.save(update_fields=['schedule', 'power_schedule'])


class Migration(migrations.Migration):

    dependencies = [
        ("monitor", "0044_substitution_sources"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
        migrations.RemoveField(model_name="screen", name="power_schedule"),
        migrations.AlterField(
            model_name="screen",
            name="schedule",
            field=models.JSONField(
                blank=True, default=list,
                help_text='Zeitplan: [{"days": [0-6], "from": "HH:MM", "until": "HH:MM", "view_id": 3 | null}]. '
                          'null = Standard-Ansicht, until < from = über Mitternacht. Leer = immer an.'),
        ),
    ]
