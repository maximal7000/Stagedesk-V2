"""Monitor Schritt 0: gespeicherte Auswahlwerte, JSON-Schlüssel und Versionen englisch (Spec §5.3/§5.4).

Von Hand geschrieben und in sich geschlossen (importiert nichts aus anderen Migrationen).
Die Konstanten und reinen Funktionen werden von signage/tests_migrations.py geprüft.

Regeln für unvollständige Daten: fehlende Schlüssel bleiben fehlend, None und Nicht-Dicts
in Listen bleiben unverändert, unbekannte Schlüssel bleiben unverändert. Caches werden geleert.
"""
from django.db import migrations, models


# ─── §5.3 Auswahlwerte: Model -> Feld -> {alt: neu} ───────────────────────
_SIDE = {'links': 'left', 'rechts': 'right'}
_SPLIT_CONTENT = {'klausur': 'exam', 'onair': 'on_air', 'uhr': 'clock', 'leer': 'empty'}
_DISPLAY_MODE = {'vollbild': 'fullscreen'}

CHOICE_MAP = {
    'MediaFile': {
        'kind': {'bild': 'image', 'hintergrund': 'background'},
    },
    'DisplayView': {
        'layout': {
            'stundenplan': 'timetable', 'onair': 'on_air', 'abfahrten': 'departures',
            'pdf_vollbild': 'pdf_fullscreen', 'bild_vollbild': 'image_fullscreen',
            'baukasten': 'standard',
        },
        'split_left': _SPLIT_CONTENT,
        'split_right': _SPLIT_CONTENT,
        'pdf_mode': {'durchschalten': 'cycle', 'statisch': 'static', 'seiten': 'selection'},
        'theme_preset': {'veranstaltung': 'event', 'schulbetrieb': 'school', 'nacht': 'night'},
        'transit_font_size': {'gross': 'large'},
        'on_air_size': {'klein': 'small', 'mittel': 'medium', 'gross': 'large', 'riesig': 'huge'},
        'on_air_position': {
            'banner-oben': 'banner-top', 'banner-unten': 'banner-bottom',
            'oben-rechts': 'top-right', 'oben-links': 'top-left', 'oben-mitte': 'top-center',
            'unten-rechts': 'bottom-right', 'unten-links': 'bottom-left', 'unten-mitte': 'bottom-center',
            'mitte': 'center',
        },
        'on_air_split_side': _SIDE,
        'transit_disruption_position': {'unten': 'bottom', 'spalte': 'column'},
    },
    'Screen': {
        'power_mode': {'manuell_an': 'manual_on', 'manuell_aus': 'manual_off'},
    },
    'Exam': {
        'display_mode': _DISPLAY_MODE,
        'split_side': _SIDE,
    },
    'ExamTemplate': {
        'display_mode': _DISPLAY_MODE,
        'split_side': _SIDE,
    },
    'Announcement': {
        'priority': {'wichtig': 'important', 'dringend': 'urgent'},
    },
}

# Werte, die vorwärts zusammenfallen und rückwärts nicht zurückkommen (Streichung §4).
ONE_WAY_VALUES = {'baukasten'}

# ─── §5.4 JSON-Schlüssel ─────────────────────────────────────────────
SCHEDULE_KEYS = {'tage': 'days', 'von': 'from', 'bis': 'until'}
SCREEN_SCHEDULE_KEYS = {**SCHEDULE_KEYS, 'profil_id': 'view_id'}
EXCEPTION_KEYS = {
    'von_datum': 'from_date', 'bis_datum': 'until_date', 'von': 'from', 'bis': 'until', 'notiz': 'note',
}
_STOP_PRODUCTS = {
    'bus': 'bus', 'bahn': 'rail', 'fernverkehr': 'long_distance', 'sbahn': 'suburban',
    'ubahn': 'subway', 'tram': 'tram', 'faehre': 'ferry',
}
STOP_KEYS = {
    'filter_linien': 'filter_lines', 'filter_richtung': 'filter_direction',
    'wegzeit_minuten': 'walk_minutes',
    'api': 'source',
    **{f'zeige_{de}': f'show_{en}' for de, en in _STOP_PRODUCTS.items()},
    'zusatz_id': 'extra_id', 'zusatz_api': 'extra_source', 'zusatz_name': 'extra_name',
    **{f'zusatz_zeige_{de}': f'extra_show_{en}' for de, en in _STOP_PRODUCTS.items()},
    'spalte': 'column', 'max_abfahrten': 'max_departures', 'trennung': 'split_by_type',
    'kompakt': 'compact', 'max_zug': 'max_train',
    # Herkunft aus der Stationssuche (db, nahsh, db+nahsh); nicht zu verwechseln mit `source` (ehem. api)
    'quelle': 'origin',
}
# Werte von `source` / `extra_source` (ehem. api / zusatz_api)
STOP_SOURCE_VALUES = {'beide': 'both'}
_STOP_SOURCE_FIELDS = ('api', 'zusatz_api')
MANUAL_DISRUPTION_KEYS = {'titel': 'title', 'bild': 'image'}
PAGE_ROTATION_VALUES = {
    'veranstaltungen': 'events', 'ankuendigungen': 'announcements', 'freitext': 'free_text', 'wetter': 'weather',
}
# Gestrichene Rotationsseite (§5.4): fällt vorwärts weg
DROPPED_PAGE_ROTATION_VALUES = {'raumplan'}

# ─── §5.2 Feldnamen von MonitorConfig -> DisplayView (für Schnappschüsse) ─────
# Muss mit FIELD_RENAMES['DisplayView'] in 0036_english_names übereinstimmen.
FIELD_MAP = {
    'ist_standard': 'is_default', 'sortierung': 'sort_order', 'zeitplan': 'schedule',
    'layout_modus': 'layout', 'geloescht_am': 'deleted_at', 'vollbild_header': 'fullscreen_header',
    'split_links': 'split_left', 'split_rechts': 'split_right', 'split_links_prozent': 'split_left_percent',
    'titel': 'title', 'untertitel': 'subtitle',
    'hintergrund_farbe': 'background_color', 'akzent_farbe': 'accent_color',
    'zeige_logo': 'show_logo', 'aktives_logo': 'active_logo',
    'zeige_uhr': 'show_clock', 'zeige_veranstaltungen': 'show_events',
    'zeige_ankuendigungen': 'show_announcements', 'zeige_onair': 'show_on_air',
    'zeige_countdown': 'show_countdown',
    'notfall_aktiv': 'emergency_active', 'notfall_text': 'emergency_text',
    'zeige_wetter': 'show_weather', 'wetter_stadt': 'weather_city',
    'wetter_api_key': 'weather_api_key', 'wetter_cache': 'weather_cache',
    'wetter_cache_zeit': 'weather_cache_at',
    'zeige_slideshow': 'show_slideshow', 'slideshow_intervall': 'slideshow_interval',
    'zeige_pdf': 'show_pdf', 'aktive_pdf': 'active_pdf', 'pdf_modus': 'pdf_mode',
    'pdf_intervall': 'pdf_interval', 'pdf_pro_ansicht': 'pdf_per_screen',
    'pdf_seiten': 'pdf_pages', 'pdf_statische_seite': 'pdf_static_page',
    'aktives_bild': 'active_image', 'bild_fit': 'image_fit',
    'bild_fokus_x': 'image_focus_x', 'bild_fokus_y': 'image_focus_y',
    'zeige_webuntis': 'show_webuntis', 'webuntis_url_1tag': 'webuntis_url_next_day',
    'webuntis_link_1tag': 'webuntis_link_next_day',
    'zeige_hintergrundbild': 'show_background_image',
    'aktives_hintergrundbild': 'active_background_image',
    'zeige_qr_code': 'show_qr_code',
    'zeige_freitext': 'show_free_text', 'freitext_titel': 'free_text_title',
    'freitext_inhalt': 'free_text_content',
    'zeige_eigener_countdown': 'show_custom_countdown',
    'eigener_countdown_name': 'custom_countdown_name',
    'eigener_countdown_datum': 'custom_countdown_date',
    'zeige_seitenrotation': 'show_page_rotation',
    'seitenrotation_intervall': 'page_rotation_interval',
    'seitenrotation_seiten': 'page_rotation_pages',
    'zeige_oepnv': 'show_transit', 'oepnv_stationen': 'transit_stops',
    'oepnv_dauer': 'transit_duration', 'oepnv_max_abfahrten': 'transit_max_departures',
    'oepnv_zeige_bus': 'transit_show_bus', 'oepnv_zeige_bahn': 'transit_show_rail',
    'oepnv_zeige_fernverkehr': 'transit_show_long_distance',
    'oepnv_api_db': 'transit_source_db', 'oepnv_api_nahsh': 'transit_source_nahsh',
    'oepnv_zeige_via': 'transit_show_via', 'oepnv_zeige_relativ': 'transit_show_relative',
    'oepnv_farbcodierung': 'transit_color_coding',
    'oepnv_highlight_naechste': 'transit_highlight_next',
    'oepnv_auto_scroll': 'transit_auto_scroll',
    'oepnv_stoerungsbanner': 'transit_disruption_banner',
    'oepnv_schriftgroesse': 'transit_font_size', 'oepnv_layout_spalten': 'transit_columns',
    'oepnv_streik_aktiv': 'transit_strike_active', 'oepnv_streik_text': 'transit_strike_text',
    'oepnv_streik_linien': 'transit_strike_lines', 'oepnv_streik_typen': 'transit_strike_types',
    'oepnv_cache': 'transit_cache', 'oepnv_cache_zeit': 'transit_cache_at',
    'oepnv_stoerung_bahn': 'transit_disruption_rail',
    'oepnv_stoerung_bus': 'transit_disruption_bus',
    'oepnv_stoerung_bahn_linien': 'transit_disruption_rail_lines',
    'oepnv_stoerung_bus_linien': 'transit_disruption_bus_lines',
    'oepnv_stoerung_manuell': 'transit_disruption_manual',
    'oepnv_stoerung_cache': 'transit_disruption_cache',
    'oepnv_stoerung_cache_zeit': 'transit_disruption_cache_at',
    'oepnv_stoerung_ausgeblendet': 'transit_disruption_hidden',
    'oepnv_stoerung_position': 'transit_disruption_position',
    'ist_on_air': 'is_on_air', 'on_air_seit': 'on_air_since',
    'on_air_groesse': 'on_air_size', 'on_air_blinken': 'on_air_blink',
    'on_air_farbe': 'on_air_color', 'on_air_vollbild': 'on_air_fullscreen',
    'on_air_split_seite': 'on_air_split_side',
    'refresh_intervall': 'refresh_interval', 'aktualisiert_am': 'updated_at',
}
# Schnappschüsse speichern Fremdschlüssel als `<feld>_id` (Schema-Feldnamen).
_FK_FIELDS = ('aktives_logo', 'aktive_pdf', 'aktives_bild', 'webuntis_link_1tag', 'aktives_hintergrundbild')
FIELD_MAP.update({f'{old}_id': f'{FIELD_MAP[old]}_id' for old in _FK_FIELDS})

# §4: gestrichene Felder; fallen aus Schnappschüssen vorwärts weg
DROPPED_FIELDS = {
    'layout_widgets', 'baukasten_spalten', 'baukasten_zeilenhoehe',
    'zeige_bildschirmschoner', 'bildschirmschoner_timeout',
    'zeige_kamera', 'kamera_url', 'kamera_titel', 'kamera_typ',
    'zeige_ticker', 'ticker_text', 'ticker_geschwindigkeit',
    'zeige_raumplan', 'raumplan_server', 'raumplan_schule', 'raumplan_raum',
    'raumplan_benutzername', 'raumplan_passwort', 'raumplan_cache', 'raumplan_cache_zeit',
}

# Caches: werden geleert statt umgeschrieben (Feld -> leerer Wert passend zur Spalte)
CACHE_CLEAR = {
    'transit_cache': None, 'transit_cache_at': None,
    'transit_disruption_cache': [], 'transit_disruption_cache_at': None,
    'weather_cache': {}, 'weather_cache_at': None,
}


# ─── Reine Funktionen ─────────────────────────────────────────────────

def _invert(mapping):
    return {new: old for old, new in mapping.items() if old not in ONE_WAY_VALUES}


def _pick(mapping, reverse):
    return _invert(mapping) if reverse else mapping


def _rename_keys(entry, mapping):
    """Benennt Schlüssel eines Dicts um. Nicht-Dicts (None, Strings …) bleiben unverändert."""
    if not isinstance(entry, dict):
        return entry
    return {mapping.get(k, k): v for k, v in entry.items()}


def _rename_list(entries, mapping, reverse=False):
    if not isinstance(entries, list):
        return entries
    m = _pick(mapping, reverse)
    return [_rename_keys(e, m) for e in entries]


def translate_stop(entry, reverse=False):
    """Ein Eintrag aus transit_stops (alt <-> neu): Schlüssel und Werte von api/zusatz_api."""
    if not isinstance(entry, dict):
        return entry
    keys = _pick(STOP_KEYS, reverse)
    values = _pick(STOP_SOURCE_VALUES, reverse)
    # Namen der Quell-Felder auf der Eingangsseite (alt vorwärts, neu rückwärts)
    source_fields = {STOP_KEYS[f] for f in _STOP_SOURCE_FIELDS} if reverse else set(_STOP_SOURCE_FIELDS)
    out = {}
    for k, v in entry.items():
        if k in source_fields and isinstance(v, str):
            v = values.get(v, v)
        out[keys.get(k, k)] = v
    return out


def _translate_stops(stops, reverse=False):
    if not isinstance(stops, list):
        return stops
    return [translate_stop(s, reverse) for s in stops]


def _translate_pages(pages, reverse=False):
    if not isinstance(pages, list):
        return pages
    values = _pick(PAGE_ROTATION_VALUES, reverse)
    out = []
    for p in pages:
        if not reverse and p in DROPPED_PAGE_ROTATION_VALUES:
            continue
        out.append(values.get(p, p) if isinstance(p, str) else p)
    return out


def _translate_choice(model, field, value, reverse=False):
    mapping = CHOICE_MAP.get(model, {}).get(field)
    if not mapping or not isinstance(value, str):
        return value
    return _pick(mapping, reverse).get(value, value)


def _translate_view_json(field, value, reverse=False):
    """JSON-Inhalt eines DisplayView-Felds (neuer Feldname) übersetzen."""
    if field == 'schedule':
        return _rename_list(value, SCHEDULE_KEYS, reverse)
    if field == 'transit_stops':
        return _translate_stops(value, reverse)
    if field == 'transit_disruption_manual':
        return _rename_list(value, MANUAL_DISRUPTION_KEYS, reverse)
    if field == 'page_rotation_pages':
        return _translate_pages(value, reverse)
    return _translate_choice('DisplayView', field, value, reverse)


def translate_snapshot(data, reverse=False):
    """Schnappschuss (DisplayViewVersion.data) übersetzen: Feldnamen, Auswahlwerte, JSON-Schlüssel.
    Vorwärts fallen DROPPED_FIELDS weg; rückwärts kommen sie nicht zurück."""
    if not isinstance(data, dict):
        return data
    out = {}
    if not reverse:
        for key, value in data.items():
            if key in DROPPED_FIELDS:
                continue
            new_key = FIELD_MAP.get(key, key)
            out[new_key] = _translate_view_json(new_key, value)
    else:
        names = _invert(FIELD_MAP)
        for key, value in data.items():
            out[names.get(key, key)] = _translate_view_json(key, value, reverse=True)
    return out


# ─── Datenmigration ─────────────────────────────────────────────────

def _migrate_choices(apps, reverse):
    for model_name, fields in CHOICE_MAP.items():
        Model = apps.get_model('signage', model_name)
        for field, mapping in fields.items():
            for old, new in _pick(mapping, reverse).items():
                Model.objects.filter(**{field: old}).update(**{field: new})


def _save_changed(obj, values):
    """Schreibt nur geänderte Felder. Unverändertes JSON-null bleibt so unangetastet
    (ein Python-None würde in NOT-NULL-Spalten als SQL NULL scheitern)."""
    changed = [f for f, v in values.items() if v != getattr(obj, f)]
    for f in changed:
        setattr(obj, f, values[f])
    if changed:
        obj.save(update_fields=changed)


def _migrate(apps, reverse):
    _migrate_choices(apps, reverse)

    View = apps.get_model('signage', 'DisplayView')
    for view in View.objects.all():
        values = {f: _translate_view_json(f, getattr(view, f), reverse)
                  for f in ('schedule', 'transit_stops', 'transit_disruption_manual', 'page_rotation_pages')}
        values.update(CACHE_CLEAR)
        _save_changed(view, values)

    Screen = apps.get_model('signage', 'Screen')
    for screen in Screen.objects.all():
        _save_changed(screen, {
            'schedule': _rename_list(screen.schedule, SCREEN_SCHEDULE_KEYS, reverse),
            'power_schedule': _rename_list(screen.power_schedule, SCHEDULE_KEYS, reverse),
            'power_exceptions': _rename_list(screen.power_exceptions, EXCEPTION_KEYS, reverse),
        })

    Version = apps.get_model('signage', 'DisplayViewVersion')
    for version in Version.objects.all():
        _save_changed(version, {'data': translate_snapshot(version.data, reverse)})


def forward(apps, schema_editor):
    _migrate(apps, reverse=False)


def backward(apps, schema_editor):
    _migrate(apps, reverse=True)


class Migration(migrations.Migration):

    dependencies = [
        ('signage', '0036_english_names'),
    ]

    operations = [
        # Auswahlwerte, Standardwerte und help_text der Felder (nur Django-Zustand, kein DB-Schema)
        migrations.AlterField(
            model_name="announcement",
            name="priority",
            field=models.CharField(
                choices=[
                    ("normal", "Normal"),
                    ("important", "Wichtig"),
                    ("urgent", "Dringend"),
                ],
                default="normal",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="layout",
            field=models.CharField(
                choices=[
                    ("standard", "Standard-Layout"),
                    ("timetable", "Stundenplan-Vollbild"),
                    ("on_air", "ON AIR Display"),
                    ("departures", "Abfahrtsmonitor (ÖPNV)"),
                    ("pdf_fullscreen", "PDF-Vollbild"),
                    ("image_fullscreen", "Bild-Vollbild"),
                    ("split", "Splitscreen"),
                ],
                default="standard",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="on_air_position",
            field=models.CharField(
                choices=[
                    ("banner-top", "Banner oben (volle Breite)"),
                    ("banner-bottom", "Banner unten (volle Breite)"),
                    ("top-right", "Oben rechts"),
                    ("top-left", "Oben links"),
                    ("top-center", "Oben Mitte"),
                    ("bottom-right", "Unten rechts"),
                    ("bottom-left", "Unten links"),
                    ("bottom-center", "Unten Mitte"),
                    ("center", "Mitte (Overlay)"),
                ],
                default="banner-top",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="on_air_size",
            field=models.CharField(
                choices=[
                    ("small", "Klein"),
                    ("medium", "Mittel"),
                    ("large", "Groß"),
                    ("huge", "Riesig"),
                ],
                default="large",
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="on_air_split_side",
            field=models.CharField(
                choices=[("left", "Links"), ("right", "Rechts")],
                default="right",
                help_text="Auf welcher Seite ON AIR im Splitscreen steht",
                max_length=6,
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="pdf_mode",
            field=models.CharField(
                choices=[
                    ("cycle", "Seiten automatisch durchschalten"),
                    ("static", "Feste Seite anzeigen"),
                    ("selection", "Nur bestimmte Seiten"),
                ],
                default="cycle",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="pdf_static_page",
            field=models.IntegerField(
                default=1, help_text="Feste Seite (Modus 'static')"
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="schedule",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='[{"days": [0-6], "from": "HH:MM", "until": "HH:MM"}]',
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="split_left",
            field=models.CharField(
                choices=[
                    ("exam", "Klausur"),
                    ("on_air", "On Air"),
                    ("webuntis", "WebUntis"),
                    ("clock", "Uhr"),
                    ("empty", "Leer"),
                ],
                default="webuntis",
                help_text="Inhalt der linken Split-Seite",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="split_right",
            field=models.CharField(
                choices=[
                    ("exam", "Klausur"),
                    ("on_air", "On Air"),
                    ("webuntis", "WebUntis"),
                    ("clock", "Uhr"),
                    ("empty", "Leer"),
                ],
                default="exam",
                help_text="Inhalt der rechten Split-Seite",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="theme_preset",
            field=models.CharField(
                choices=[
                    ("custom", "Benutzerdefiniert"),
                    ("event", "Veranstaltung"),
                    ("school", "Schulbetrieb"),
                    ("night", "Nacht"),
                ],
                default="custom",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="transit_disruption_manual",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Manuelle Meldungen: [{'title':..., 'text':..., 'image':..., 'highlighted':...}]",
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="transit_disruption_position",
            field=models.CharField(
                choices=[("bottom", "Unten (Streifen)"), ("column", "Eigene Spalte")],
                default="bottom",
                help_text="Störungs-Anzeige: 'bottom' (Streifen) oder 'column' (eigene Spalte)",
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="transit_font_size",
            field=models.CharField(
                choices=[
                    ("normal", "Normal"),
                    ("large", "Groß (HD)"),
                    ("4k", "Sehr groß (4K)"),
                ],
                default="large",
                help_text="Schriftgröße für Abfahrtsanzeige",
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="transit_stops",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='[{"id": "...", "name": "...", "filter_lines": [], "filter_direction": "", "show_bus": true, "show_rail": true, "show_long_distance": true, "walk_minutes": 0}]',
            ),
        ),
        migrations.AlterField(
            model_name="exam",
            name="display_mode",
            field=models.CharField(
                choices=[
                    ("fullscreen", "Vollbild (Klausur-Hinweis)"),
                    ("split", "Splitscreen (Klausur + Stundenplan)"),
                    ("standard", "Kein Zwang (Profil-Layout)"),
                ],
                default="fullscreen",
                help_text="Wie der Bildschirm während der Klausur aussieht",
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="exam",
            name="split_side",
            field=models.CharField(
                choices=[("left", "Links"), ("right", "Rechts")],
                default="right",
                help_text="Auf welcher Seite die Klausur steht (Split)",
                max_length=6,
            ),
        ),
        migrations.AlterField(
            model_name="examtemplate",
            name="display_mode",
            field=models.CharField(
                choices=[
                    ("fullscreen", "Vollbild (Klausur-Hinweis)"),
                    ("split", "Splitscreen (Klausur + Stundenplan)"),
                    ("standard", "Kein Zwang (Profil-Layout)"),
                ],
                default="fullscreen",
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="examtemplate",
            name="split_side",
            field=models.CharField(default="right", max_length=6),
        ),
        migrations.AlterField(
            model_name="mediafile",
            name="kind",
            field=models.CharField(
                choices=[
                    ("logo", "Logo"),
                    ("image", "Slideshow-Bild"),
                    ("pdf", "PDF-Datei"),
                    ("background", "Hintergrundbild"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="screen",
            name="power_exceptions",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='[{"from_date": "YYYY-MM-DD", "until_date": "YYYY-MM-DD", "from": "HH:MM", "until": "HH:MM", "note": ""}]',
            ),
        ),
        migrations.AlterField(
            model_name="screen",
            name="power_mode",
            field=models.CharField(
                choices=[
                    ("auto", "Automatisch (Zeitplan)"),
                    ("manual_on", "Manuell — Immer An"),
                    ("manual_off", "Manuell — Immer Aus"),
                ],
                default="auto",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="screen",
            name="power_schedule",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='[{"days": [0-6], "from": "HH:MM", "until": "HH:MM"}]. Leer = immer an.',
            ),
        ),
        migrations.AlterField(
            model_name="screen",
            name="schedule",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='[{"view_id": 3, "days": [0-6], "from": "HH:MM", "until": "HH:MM"}]',
            ),
        ),
        migrations.RunPython(forward, backward),
    ]
