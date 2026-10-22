"""Monitor Schritt 0: Models und Felder englisch benennen (Spec §5.1/§5.2).

Von Hand geschrieben: RenameModel/RenameField erhalten die Daten. Gespeicherte
Auswahlwerte und JSON-Schlüssel bleiben hier unverändert (folgt in 0037).
"""
import django.db.models.deletion
from django.db import migrations, models


# Reihenfolge: Models mit Fremdschlüssel vor den Models, auf die sie zeigen.
# Sonst scheitert das Zurückmigrieren (RenameModel.database_backwards sucht die
# verweisenden Models unter ihrem neuen Namen).
MODEL_RENAMES = [
    ('MonitorConfigVersion', 'DisplayViewVersion'),
    ('EventBildschirm', 'DisplayEventScreen'),
    ('MonitorEvent', 'DisplayEvent'),
    ('Klausur', 'Exam'),
    ('Bildschirm', 'Screen'),
    ('MonitorConfig', 'DisplayView'),
    ('MonitorDatei', 'MediaFile'),
    ('KlausurVorlage', 'ExamTemplate'),
    ('Ankuendigung', 'Announcement'),
    ('MonitorGlobalSettings', 'MonitorSettings'),
]

# Neuer Model-Name -> [(altes Feld, neues Feld)]
FIELD_RENAMES = {
    'MediaFile': [
        ('datei', 'file'), ('typ', 'kind'), ('reihenfolge', 'sort_order'),
        ('geloescht_am', 'deleted_at'), ('erstellt_am', 'created_at'),
    ],
    'WebUntisLink': [
        ('notiz', 'note'), ('erstellt_am', 'created_at'),
    ],
    'DisplayView': [
        ('ist_standard', 'is_default'), ('sortierung', 'sort_order'), ('zeitplan', 'schedule'),
        ('layout_modus', 'layout'), ('geloescht_am', 'deleted_at'), ('vollbild_header', 'fullscreen_header'),
        ('split_links', 'split_left'), ('split_rechts', 'split_right'),
        ('split_links_prozent', 'split_left_percent'),
        ('titel', 'title'), ('untertitel', 'subtitle'),
        ('hintergrund_farbe', 'background_color'), ('akzent_farbe', 'accent_color'),
        ('zeige_logo', 'show_logo'), ('aktives_logo', 'active_logo'),
        ('zeige_uhr', 'show_clock'), ('zeige_veranstaltungen', 'show_events'),
        ('zeige_ankuendigungen', 'show_announcements'), ('zeige_onair', 'show_on_air'),
        ('zeige_countdown', 'show_countdown'),
        ('notfall_aktiv', 'emergency_active'), ('notfall_text', 'emergency_text'),
        ('zeige_wetter', 'show_weather'), ('wetter_stadt', 'weather_city'),
        ('wetter_api_key', 'weather_api_key'), ('wetter_cache', 'weather_cache'),
        ('wetter_cache_zeit', 'weather_cache_at'),
        ('zeige_slideshow', 'show_slideshow'), ('slideshow_intervall', 'slideshow_interval'),
        ('zeige_pdf', 'show_pdf'), ('aktive_pdf', 'active_pdf'), ('pdf_modus', 'pdf_mode'),
        ('pdf_intervall', 'pdf_interval'), ('pdf_pro_ansicht', 'pdf_per_screen'),
        ('pdf_seiten', 'pdf_pages'), ('pdf_statische_seite', 'pdf_static_page'),
        ('aktives_bild', 'active_image'), ('bild_fit', 'image_fit'),
        ('bild_fokus_x', 'image_focus_x'), ('bild_fokus_y', 'image_focus_y'),
        ('zeige_webuntis', 'show_webuntis'), ('webuntis_url_1tag', 'webuntis_url_next_day'),
        ('webuntis_link_1tag', 'webuntis_link_next_day'),
        ('zeige_hintergrundbild', 'show_background_image'),
        ('aktives_hintergrundbild', 'active_background_image'),
        ('zeige_qr_code', 'show_qr_code'),
        ('zeige_freitext', 'show_free_text'), ('freitext_titel', 'free_text_title'),
        ('freitext_inhalt', 'free_text_content'),
        ('zeige_eigener_countdown', 'show_custom_countdown'),
        ('eigener_countdown_name', 'custom_countdown_name'),
        ('eigener_countdown_datum', 'custom_countdown_date'),
        ('zeige_seitenrotation', 'show_page_rotation'),
        ('seitenrotation_intervall', 'page_rotation_interval'),
        ('seitenrotation_seiten', 'page_rotation_pages'),
        ('zeige_oepnv', 'show_transit'), ('oepnv_stationen', 'transit_stops'),
        ('oepnv_dauer', 'transit_duration'), ('oepnv_max_abfahrten', 'transit_max_departures'),
        ('oepnv_zeige_bus', 'transit_show_bus'), ('oepnv_zeige_bahn', 'transit_show_rail'),
        ('oepnv_zeige_fernverkehr', 'transit_show_long_distance'),
        ('oepnv_api_db', 'transit_source_db'), ('oepnv_api_nahsh', 'transit_source_nahsh'),
        ('oepnv_zeige_via', 'transit_show_via'), ('oepnv_zeige_relativ', 'transit_show_relative'),
        ('oepnv_farbcodierung', 'transit_color_coding'),
        ('oepnv_highlight_naechste', 'transit_highlight_next'),
        ('oepnv_auto_scroll', 'transit_auto_scroll'),
        ('oepnv_stoerungsbanner', 'transit_disruption_banner'),
        ('oepnv_schriftgroesse', 'transit_font_size'), ('oepnv_layout_spalten', 'transit_columns'),
        ('oepnv_streik_aktiv', 'transit_strike_active'), ('oepnv_streik_text', 'transit_strike_text'),
        ('oepnv_streik_linien', 'transit_strike_lines'), ('oepnv_streik_typen', 'transit_strike_types'),
        ('oepnv_cache', 'transit_cache'), ('oepnv_cache_zeit', 'transit_cache_at'),
        ('oepnv_stoerung_bahn', 'transit_disruption_rail'),
        ('oepnv_stoerung_bus', 'transit_disruption_bus'),
        ('oepnv_stoerung_bahn_linien', 'transit_disruption_rail_lines'),
        ('oepnv_stoerung_bus_linien', 'transit_disruption_bus_lines'),
        ('oepnv_stoerung_manuell', 'transit_disruption_manual'),
        ('oepnv_stoerung_cache', 'transit_disruption_cache'),
        ('oepnv_stoerung_cache_zeit', 'transit_disruption_cache_at'),
        ('oepnv_stoerung_ausgeblendet', 'transit_disruption_hidden'),
        ('oepnv_stoerung_position', 'transit_disruption_position'),
        ('ist_on_air', 'is_on_air'), ('on_air_seit', 'on_air_since'),
        ('on_air_groesse', 'on_air_size'), ('on_air_blinken', 'on_air_blink'),
        ('on_air_farbe', 'on_air_color'), ('on_air_vollbild', 'on_air_fullscreen'),
        ('on_air_split_seite', 'on_air_split_side'),
        ('refresh_intervall', 'refresh_interval'), ('aktualisiert_am', 'updated_at'),
    ],
    'Screen': [
        ('default_profil', 'default_view'), ('zeitplan', 'schedule'),
        ('override_profil', 'override_view'), ('override_bis', 'override_until'),
        ('power_zeitplan', 'power_schedule'), ('ferien_modus', 'holiday_mode'),
        ('power_ausnahmen', 'power_exceptions'),
        ('neu_laden_zeit', 'reload_requested_at'), ('power_modus', 'power_mode'),
        ('cec_status_zeit', 'cec_status_at'),
        ('erstellt_am', 'created_at'), ('aktualisiert_am', 'updated_at'),
    ],
    'Exam': [
        ('titel', 'title'), ('aktiv_von', 'active_from'), ('aktiv_bis', 'active_until'),
        ('farbe', 'color'), ('bildschirme', 'screens'), ('anzeige_modus', 'display_mode'),
        ('split_seite', 'split_side'), ('split_prozent', 'split_percent'),
        ('erstellt_am', 'created_at'),
    ],
    'ExamTemplate': [
        ('dauer_minuten', 'duration_minutes'), ('titel', 'title'), ('farbe', 'color'),
        ('anzeige_modus', 'display_mode'), ('split_seite', 'split_side'),
        ('split_prozent', 'split_percent'), ('erstellt_am', 'created_at'),
    ],
    'Announcement': [
        ('titel', 'title'), ('prioritaet', 'priority'), ('ist_aktiv', 'is_active'),
        ('aktiv_von', 'active_from'), ('aktiv_bis', 'active_until'), ('erstellt_am', 'created_at'),
    ],
    'DisplayEvent': [
        ('beschreibung', 'description'), ('farbe', 'color'), ('aktiv', 'is_active'),
        ('aktiv_von', 'active_from'), ('aktiv_bis', 'active_until'), ('erstellt_am', 'created_at'),
        ('bildschirme', 'screens'),
    ],
    'DisplayEventScreen': [
        ('bildschirm', 'screen'), ('profil', 'view'),
    ],
    'MonitorSettings': [
        ('wetter_api_key', 'weather_api_key'),
        ('raumplan_server', 'webuntis_server'), ('raumplan_schule', 'webuntis_school'),
        ('raumplan_benutzername', 'webuntis_username'), ('raumplan_passwort', 'webuntis_password'),
    ],
    'DisplayViewVersion': [
        ('config', 'view'), ('daten', 'data'), ('erstellt_am', 'created_at'),
    ],
}


def _rebuild_sqlite_tables(apps, schema_editor):
    """Nur rückwärts, nur SQLite: Tabellen mit Fremdschlüsseln neu aufbauen.

    SQLite baut beim Zurückbenennen eines Models jede verweisende Tabelle einmal
    pro Fremdschlüssel neu und kopiert die übrigen Fremdschlüssel dabei aus dem
    schon umbenannten Zustand. Danach zeigen z.B. monitor_monitorconfig auf
    monitor_mediafile und monitor_bildschirm auf monitor_displayview. Ein
    Neuaufbau mit den historischen Models (Stand 0035) stellt die Verweise
    richtig. PostgreSQL baut keine Tabellen neu und braucht das nicht.
    """
    if schema_editor.connection.vendor != 'sqlite':
        return
    for model in apps.get_app_config('signage').get_models(include_auto_created=True):
        schema_editor._remake_table(model)


def _media_fk(related_name):
    return models.ForeignKey(
        blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
        related_name=related_name, to='signage.mediafile')


class Migration(migrations.Migration):

    dependencies = [
        ('signage', '0035_remove_dropped_features'),
    ]

    operations = (
        # Läuft rückwärts als letzter Schritt (siehe _rebuild_sqlite_tables)
        [migrations.RunPython(migrations.RunPython.noop, _rebuild_sqlite_tables)]
        + [migrations.RenameModel(old_name=old, new_name=new) for old, new in MODEL_RENAMES]
        + [
            migrations.RenameField(model_name=model, old_name=old, new_name=new)
            for model, pairs in FIELD_RENAMES.items()
            for old, new in pairs
        ]
        + [
            # related_name und help_text nach dem Glossar
            migrations.AlterField(
                model_name='displayview', name='active_logo', field=_media_fk('as_active_logo')),
            migrations.AlterField(
                model_name='displayview', name='active_pdf', field=_media_fk('as_active_pdf')),
            migrations.AlterField(
                model_name='displayview', name='active_image', field=_media_fk('as_active_image')),
            migrations.AlterField(
                model_name='displayview', name='active_background_image',
                field=_media_fk('as_background_image')),
            migrations.AlterField(
                model_name='displayview', name='webuntis_link',
                field=models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='as_view_link', to='signage.webuntislink',
                    help_text='Gespeicherter Link (2 Tage) — überschreibt webuntis_url')),
            migrations.AlterField(
                model_name='displayview', name='webuntis_link_next_day',
                field=models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='as_view_link_next_day', to='signage.webuntislink',
                    help_text='Gespeicherter Link (1 Tag) — überschreibt webuntis_url_next_day')),
            migrations.AlterField(
                model_name='screen', name='default_view',
                field=models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='as_default_screen', to='signage.displayview',
                    help_text='Fallback-Profil wenn kein Zeitplan greift')),
            migrations.AlterField(
                model_name='screen', name='override_view',
                field=models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='as_override_screen', to='signage.displayview',
                    help_text='Sofort-Override: erzwingt diese Ansicht (vor Event/Zeitplan)')),
            migrations.AlterField(
                model_name='exam', name='screens',
                field=models.ManyToManyField(
                    blank=True, related_name='exams', to='signage.screen',
                    help_text='Auf welchen Bildschirmen angezeigt')),
            migrations.AlterField(
                model_name='exam', name='webuntis_link',
                field=models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='as_exam_link', to='signage.webuntislink',
                    help_text='Stundenplan-Link für den Split während der Klausur')),
            migrations.AlterField(
                model_name='examtemplate', name='webuntis_link',
                field=models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='as_template_link', to='signage.webuntislink')),
            migrations.AlterField(
                model_name='displayeventscreen', name='event',
                field=models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='assignments', to='signage.displayevent')),
            migrations.AlterField(
                model_name='displayeventscreen', name='screen',
                field=models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='event_assignments', to='signage.screen')),
            migrations.AlterField(
                model_name='displayeventscreen', name='view',
                field=models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='event_assignments', to='signage.displayview')),
            migrations.AlterField(
                model_name='displayviewversion', name='view',
                field=models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='versions', to='signage.displayview')),
            # Sortierung auf die neuen Feldnamen
            migrations.AlterModelOptions(
                name='mediafile',
                options={'ordering': ['kind', 'sort_order', '-created_at'],
                         'verbose_name': 'Monitor-Datei', 'verbose_name_plural': 'Monitor-Dateien'}),
            migrations.AlterModelOptions(
                name='displayview',
                options={'ordering': ['-is_default', 'name'],
                         'verbose_name': 'Monitor-Profil', 'verbose_name_plural': 'Monitor-Profile'}),
            migrations.AlterModelOptions(
                name='exam',
                options={'ordering': ['-active_from'],
                         'verbose_name': 'Klausur', 'verbose_name_plural': 'Klausuren'}),
            migrations.AlterModelOptions(
                name='announcement',
                options={'ordering': ['-priority', '-created_at'],
                         'verbose_name': 'Ankündigung', 'verbose_name_plural': 'Ankündigungen'}),
            migrations.AlterModelOptions(
                name='displayevent',
                options={'ordering': ['-is_active', 'name'],
                         'verbose_name': 'Event', 'verbose_name_plural': 'Events'}),
            migrations.AlterModelOptions(
                name='displayviewversion',
                options={'ordering': ['-created_at']}),
        ]
    )
