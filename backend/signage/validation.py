"""View data validation, shared by save (PUT /config) and preview (POST /views/preview) so a draft
never fails only when displayed. Errors are HttpError 422 with a short German message that names the
cause."""
import re
from datetime import datetime

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from ninja.errors import HttpError

from .models import DisplayView, validate_rotation_items

CHOICE_FIELDS = {
    'kind': 'Typ',
    'layout': 'Aufteilung',
    'on_air_behavior': 'On-Air-Verhalten',
    'on_air_split_side': 'On-Air-Seite',
    'split_left': 'Split links',
    'split_right': 'Split rechts',
    'pdf_mode': 'Medien-Modus',
    'transit_font_size': 'Schriftgröße der Abfahrten',
    'transit_time_format': 'Zeitangabe',
    'substitutions_source': 'Datenquelle',
    'substitutions_format': 'Ausgabe',
}
NEXT_DAY_FROM_MESSAGE = "Uhrzeit ungültig (HH:MM oder leer)."


# Ranges as in the admin editors
NUMBER_FIELDS = {
    'page_seconds': ('Blättertakt', 5, 120),
    'media_seconds': ('Sekunden pro Seite', 3, 600),
    'pdf_per_screen': ('Seiten nebeneinander', 1, 3),
    'pdf_static_page': ('Feste Seite', 1, 999),
    'transit_duration': ('Vorausschau', 10, 240),
}
# Yes/no fields of the departures editor (advanced): never empty
BOOL_FIELDS = {
    'transit_source_db': 'Quelle Deutsche Bahn',
    'transit_source_nahsh': 'Quelle NAH.SH',
    'transit_show_disruptions': 'Störungen anzeigen',
    'transit_strip_city': 'Ortsnamen weglassen',
    'transit_show_via': 'Zwischenhalte anzeigen',
}
WALK_MINUTES = (0, 60)
MAX_DEPARTURES = (1, 50)
DEFAULT_MAX_DEPARTURES = 10  # same as display.DEFAULT_MAX_DEPARTURES


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def number_message(label, lo, hi):
    return f"{label} ungültig (ganze Zahl von {lo} bis {hi})."


def _check_numbers(data):
    for key, (label, lo, hi) in NUMBER_FIELDS.items():
        if key in data and not (_is_int(data[key]) and lo <= data[key] <= hi):
            raise HttpError(422, number_message(label, lo, hi))
    for key, label in BOOL_FIELDS.items():
        if key in data and not isinstance(data[key], bool):
            raise HttpError(422, f"{label} ungültig (an oder aus).")
    if 'transit_disruption_hidden' in data:
        hidden = data['transit_disruption_hidden']
        if not isinstance(hidden, list) or not all(isinstance(h, str) for h in hidden):
            raise HttpError(422, "Ausgeblendete Meldungen ungültig.")
    if 'transit_columns' in data and not (_is_int(data['transit_columns']) and 1 <= data['transit_columns'] <= 5):
        raise HttpError(422, "Spaltenzahl 1 bis 5.")
    # Left width: clamped into the range as before, but never empty
    if 'split_left_percent' in data and not _is_int(data['split_left_percent']):
        raise HttpError(422, number_message('Breite links', 20, 80))


def _check_stops(stops):
    if not isinstance(stops, list):
        raise HttpError(422, "Haltestellen ungültig.")
    for stop in stops:
        if not isinstance(stop, dict):
            raise HttpError(422, "Haltestellen ungültig.")
        name = stop.get('name') or stop.get('id') or 'ohne Namen'
        if _is_int(stop.get('max_departures')) and stop['max_departures'] == 0:
            stop['max_departures'] = DEFAULT_MAX_DEPARTURES  # legacy data: 0 meant "no limit"
        for key, label, (lo, hi) in (('walk_minutes', 'Fußweg', WALK_MINUTES),
                                     ('max_departures', 'Max. Zeilen', MAX_DEPARTURES)):
            if key in stop and not (_is_int(stop[key]) and lo <= stop[key] <= hi):
                raise HttpError(422, f"Haltestelle „{name}“: {number_message(label, lo, hi)}")
        column = stop.get('column')
        if column is not None and not (_is_int(column) and 1 <= column <= 5):
            raise HttpError(422, "Spalte der Haltestelle ungültig (1 bis 5).")
        if 'split_modes' in stop and not isinstance(stop['split_modes'], bool):
            raise HttpError(422, "„Busse und Züge getrennt“ ungültig.")


def _check_next_day_from(data):
    if 'substitutions_next_day_from' not in data:
        return
    value = data['substitutions_next_day_from']
    if value is None:
        value = ''
    if not isinstance(value, str) or (value.strip() and not _HHMM.match(value.strip())):
        raise HttpError(422, NEXT_DAY_FROM_MESSAGE)
    data['substitutions_next_day_from'] = value.strip()


def _check_custom_format(data):
    """Empty is allowed (then the next source applies)."""
    if 'substitutions_custom_format' not in data:
        return
    value = (data['substitutions_custom_format'] or '').strip()
    if len(value) > 100:
        raise HttpError(422, "Eigenes Format: höchstens 100 Zeichen.")
    data['substitutions_custom_format'] = value


def _clamp_int(v, lo, hi):
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return None


def _check_choices(data):
    for key, label in CHOICE_FIELDS.items():
        if key not in data:
            continue
        valid = {value for value, _ in DisplayView._meta.get_field(key).choices}
        if data[key] in (None, ''):
            raise HttpError(422, f"{label} fehlt.")
        if data[key] not in valid:
            raise HttpError(422, f"{label}: ungültiger Wert „{data[key]}“.")


def parse_countdown_date(value):
    """Without a zone: local time (Europe/Berlin)."""
    if value in (None, ''):
        return None
    parsed = value if isinstance(value, datetime) else None
    if parsed is None and isinstance(value, str):
        try:
            parsed = parse_datetime(value.strip())
            if parsed is None:
                day = parse_date(value.strip())
                parsed = datetime(day.year, day.month, day.day) if day else None
        except ValueError:
            parsed = None
    if parsed is None:
        raise HttpError(422, "Countdown-Datum ungültig.")
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _check_not_in_rotation(view_id):
    rotations = DisplayView.objects.filter(kind='rotation', deleted_at__isnull=True).order_by('id')
    for rotation in rotations:
        items = rotation.rotation_items if isinstance(rotation.rotation_items, list) else []
        if any(isinstance(i, dict) and i.get('view_id') == view_id for i in items):
            raise HttpError(422, f"Diese Ansicht ist Teil des Wechsels „{rotation.name}“. Erst dort entfernen.")


def validate_view_data(data: dict, own_id=None, current_kind=None) -> dict:
    _check_choices(data)
    _check_numbers(data)
    _check_next_day_from(data)
    _check_custom_format(data)
    if 'transit_stops' in data:
        _check_stops(data['transit_stops'])
    for key, lo, hi in [
        ('split_left_percent', 20, 80), ('split_percent', 20, 80),
        ('webuntis_zoom', 25, 400),
    ]:
        if key in data and data[key] is not None:
            c = _clamp_int(data[key], lo, hi)
            if c is not None:
                data[key] = c
    if 'custom_countdown_date' in data:
        data['custom_countdown_date'] = parse_countdown_date(data['custom_countdown_date'])
    if 'schedule' in data and isinstance(data['schedule'], list):
        for e in data['schedule']:
            if isinstance(e, dict):
                start, end = e.get('from'), e.get('until')
                if start and end and str(start) >= str(end):
                    raise HttpError(422, f"Zeitfenster ungültig: {start} muss vor {end} liegen.")
    # An empty list is only an error for rotation views; other views carry it along.
    kind = data.get('kind', current_kind)
    if kind == 'rotation' and kind != current_kind and own_id is not None:
        _check_not_in_rotation(own_id)
    if 'rotation_items' in data and (data['rotation_items'] or kind == 'rotation'):
        try:
            data['rotation_items'] = validate_rotation_items(data['rotation_items'], own_id=own_id)
        except ValueError as e:
            raise HttpError(422, str(e))
    return data


# Key names as in the agent
POWER_CONFIG_KEYS = {
    'cec': {'cec_device'},
    'hdmi': {'output'},
    'hybrid': {'display_ip', 'display_port', 'monitor_id', 'cec_device'},
    'ddc': {'vcp_on', 'vcp_off'},
}
POWER_CONFIG_INTS = {'display_port': (1, 65535), 'monitor_id': (0, 255)}
POWER_METHOD_LABELS = {'cec': 'CEC', 'hdmi': 'HDMI-Ausgang', 'hybrid': 'Hybrid', 'ddc': 'DDC/CI'}
_HHMM = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


def validate_update_window(value):
    if not isinstance(value, dict) or set(value) != {'weekday', 'from', 'until'}:
        raise HttpError(422, "Update-Fenster unvollständig.")
    weekday = value['weekday']
    if not _is_int(weekday) or not 0 <= weekday <= 6:
        raise HttpError(422, "Update-Fenster: Wochentag ungültig.")
    for key, label in (('from', 'Beginn'), ('until', 'Ende')):
        if not isinstance(value[key], str) or not _HHMM.match(value[key]):
            raise HttpError(422, f"Update-Fenster: {label} ungültig (HH:MM).")
    if value['from'] >= value['until']:
        raise HttpError(422, f"Update-Fenster: {value['from']} muss vor {value['until']} liegen.")


def validate_power_config(method, config):
    if not isinstance(config, dict):
        raise HttpError(422, "Steuerung des Bildschirms ungültig.")
    known = POWER_CONFIG_KEYS[method]
    unknown = sorted(set(config) - known)
    if unknown:
        raise HttpError(422, f"{POWER_METHOD_LABELS[method]}: unbekanntes Feld „{unknown[0]}“.")
    for key, value in config.items():
        if key in POWER_CONFIG_INTS:
            lo, hi = POWER_CONFIG_INTS[key]
            if not (_is_int(value) and lo <= value <= hi):
                raise HttpError(422, number_message(key, lo, hi))
        elif not isinstance(value, str) or len(value) > 64:
            raise HttpError(422, f"{key}: höchstens 64 Zeichen.")


def validate_screen_device_data(data: dict, current_method: str, current_config: dict) -> None:
    """If only the method changes, the stored config must fit the new method."""
    if 'update_window' in data:
        validate_update_window(data['update_window'])
    method = data.get('power_method', current_method)
    if 'power_config' in data:
        validate_power_config(method, data['power_config'])
    elif 'power_method' in data:
        validate_power_config(method, current_config or {})


SCHEDULE_INVALID_MESSAGE = "Zeitplan ungültig."


def validate_screen_schedule(rows) -> list:
    if not isinstance(rows, list):
        raise HttpError(422, SCHEDULE_INVALID_MESSAGE)
    clean = []
    for number, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise HttpError(422, SCHEDULE_INVALID_MESSAGE)
        days = row.get('days')
        if not isinstance(days, list) or not days:
            raise HttpError(422, f"Zeile {number}: kein Wochentag gewählt.")
        if not all(_is_int(d) and 0 <= d <= 6 for d in days):
            raise HttpError(422, f"Zeile {number}: Wochentag ungültig.")
        for key, label in (('from', 'Beginn'), ('until', 'Ende')):
            if not isinstance(row.get(key), str) or not _HHMM.match(row[key]):
                raise HttpError(422, f"Zeile {number}: {label} ungültig (HH:MM).")
        if row['from'] == row['until']:
            raise HttpError(422, f"Zeile {number}: Beginn und Ende sind gleich.")
        view_id = row.get('view_id')
        if view_id is not None and not (
                _is_int(view_id) and DisplayView.objects.filter(id=view_id, deleted_at__isnull=True).exists()):
            raise HttpError(422, f"Zeile {number}: Ansicht nicht mehr vorhanden.")
        clean.append({'days': sorted(set(days)), 'from': row['from'], 'until': row['until'], 'view_id': view_id})
    return clean


SETTINGS_DEVICE_FIELDS = {
    'device_offline_minutes': ('Offline nach (Minuten)', 2, 240),
    'warn_temperature_c': ('Warnung ab Temperatur (°C)', 50, 95),
    'warn_disk_percent': ('Warnung ab Speicherbelegung (%)', 50, 99),
    'warn_wifi_dbm': ('Warnung bei WLAN schwächer als (dBm)', -95, -40),
    'warn_reboot_days': ('Neustart-Warnung nach (Tagen)', 1, 60),
}


def validate_settings_device_data(data: dict) -> None:
    for key, (label, lo, hi) in SETTINGS_DEVICE_FIELDS.items():
        if key in data and not (_is_int(data[key]) and lo <= data[key] <= hi):
            raise HttpError(422, number_message(label, lo, hi))


LIGHT_ORDER_MESSAGE = "„Hell ab“ muss vor „Hell bis“ liegen."


def validate_settings_light_times(data: dict, current_from: str, current_until: str) -> None:
    """Uses the stored value if only one of from/until is sent."""
    for key, label in (('light_from', 'Hell ab'), ('light_until', 'Hell bis')):
        if key in data and not (isinstance(data[key], str) and _HHMM.match(data[key])):
            raise HttpError(422, f"{label}: Uhrzeit ungültig (HH:MM).")
    if data.get('light_from', current_from) >= data.get('light_until', current_until):
        raise HttpError(422, LIGHT_ORDER_MESSAGE)
