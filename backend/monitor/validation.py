"""
Prüfung der Ansicht-Daten (Spec §3.1): gemeinsam für das Speichern (PUT /config) und die Vorschau
(POST /views/preview), damit ein Entwurf nie erst beim Anzeigen scheitert. Fehler sind HttpError 422
mit deutscher Meldung, die Ursache und nächsten Schritt nennt.
"""
from datetime import datetime

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from ninja.errors import HttpError

from .models import DisplayView, validate_rotation_items

# Auswahlfelder der Ansicht → Bezeichnung in der Fehlermeldung
CHOICE_FIELDS = {
    'kind': 'Typ',
    'style': 'Stil',
    'on_air_behavior': 'On-Air-Verhalten',
    'on_air_split_side': 'On-Air-Seite',
    'split_left': 'Split links',
    'split_right': 'Split rechts',
    'pdf_mode': 'Medien-Modus',
    'transit_font_size': 'Schriftgröße der Abfahrten',
    'transit_disruption_position': 'Position der Störungen',
}


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
        if data[key] not in valid:
            raise HttpError(422, f"Ungültiger Wert für {label}: „{data[key]}“. Bitte einen der angebotenen Werte wählen.")


def parse_countdown_date(value):
    """Datum des Countdowns: leer → None, ohne Zeitzone → Ortszeit (Europe/Berlin)."""
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
        raise HttpError(422, "Das Countdown-Datum ist ungültig. Bitte Datum und Uhrzeit neu wählen.")
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def validate_view_data(data: dict, own_id=None, current_kind=None) -> dict:
    """Serverseitige Validierung/Sanitisierung der Ansicht-Daten.
    Prüft Auswahlwerte, klemmt Zahlenbereiche, prüft Zeitfenster, Countdown und Rotationseinträge."""
    _check_choices(data)
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
    # Zeitplan: Beginn < Ende erzwingen
    if 'schedule' in data and isinstance(data['schedule'], list):
        for e in data['schedule']:
            if isinstance(e, dict):
                start, end = e.get('from'), e.get('until')
                if start and end and str(start) >= str(end):
                    raise HttpError(422, f"Zeitfenster ungültig: {start} muss vor {end} liegen")
    # Leere Liste ist nur bei Rotations-Ansichten ein Fehler; andere Ansichten tragen sie mit.
    kind = data.get('kind', current_kind)
    if 'rotation_items' in data and (data['rotation_items'] or kind == 'rotation'):
        try:
            data['rotation_items'] = validate_rotation_items(data['rotation_items'], own_id=own_id)
        except ValueError as e:
            raise HttpError(422, str(e))
    return data
