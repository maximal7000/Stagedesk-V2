"""Migrationstests. Die Tests verwenden bewusst die damaligen (historischen) Namen."""
import importlib

from django.db import connection
from django.db.models import JSONField, Value
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase


class MigrationTestCase(TransactionTestCase):
    """Basisklasse: migriert auf `migrate_from`, ruft `setUpBeforeMigration(apps)` mit den
    historischen Apps auf, migriert auf `migrate_to` und stellt `self.apps` bereit.

    `migrate_from` / `migrate_to` sind (app_label, migrationsname). Nach dem Test wird auf
    den neuesten Stand zurückmigriert, damit andere Tests unberührt bleiben.
    """
    migrate_from = None
    migrate_to = None

    def setUp(self):
        super().setUp()
        assert self.migrate_from and self.migrate_to, "migrate_from und migrate_to setzen"
        executor = MigrationExecutor(connection)
        old_targets = [self.migrate_from]
        executor.migrate(old_targets)
        old_apps = executor.loader.project_state(old_targets).apps

        self.setUpBeforeMigration(old_apps)

        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        new_targets = [self.migrate_to]
        executor.migrate(new_targets)
        self.apps = executor.loader.project_state(new_targets).apps

    def setUpBeforeMigration(self, apps):
        pass

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()


class RemoveDroppedFeaturesTest(MigrationTestCase):
    migrate_from = ('monitor', '0034_bildschirm_neu_laden_zeit')
    migrate_to = ('monitor', '0035_remove_dropped_features')

    def setUpBeforeMigration(self, apps):
        Config = apps.get_model('monitor', 'MonitorConfig')
        self.bk = Config.objects.create(name='BK', slug='bk', api_token='t-bk', layout_modus='baukasten')
        Config.objects.create(name='RP', slug='rp', api_token='t-rp', raumplan_server='s.webuntis.com',
                              raumplan_schule='kath', raumplan_benutzername='u', raumplan_passwort='p')
        Config.objects.create(name='RT', slug='rt', api_token='t-rt',
                              seitenrotation_seiten=['main', 'raumplan', 'wetter'])

    def test_raumplan_removed_from_rotation_pages(self):
        Config = self.apps.get_model('monitor', 'MonitorConfig')
        self.assertEqual(Config.objects.get(slug='rt').seitenrotation_seiten, ['main', 'wetter'])

    def test_baukasten_becomes_standard(self):
        Config = self.apps.get_model('monitor', 'MonitorConfig')
        self.assertEqual(Config.objects.get(slug='bk').layout_modus, 'standard')

    def test_profile_credentials_copied_when_global_empty(self):
        g = self.apps.get_model('monitor', 'MonitorGlobalSettings').objects.get()
        self.assertEqual((g.raumplan_server, g.raumplan_schule, g.raumplan_benutzername, g.raumplan_passwort),
                         ('s.webuntis.com', 'kath', 'u', 'p'))

    def test_dropped_fields_are_gone(self):
        fields = {f.name for f in self.apps.get_model('monitor', 'MonitorConfig')._meta.get_fields()}
        self.assertFalse(fields & {'layout_widgets', 'zeige_bildschirmschoner', 'kamera_url',
                                   'ticker_text', 'raumplan_raum', 'raumplan_cache'})


class RemoveDroppedFeaturesKeepsGlobalTest(MigrationTestCase):
    migrate_from = ('monitor', '0034_bildschirm_neu_laden_zeit')
    migrate_to = ('monitor', '0035_remove_dropped_features')

    def setUpBeforeMigration(self, apps):
        Config = apps.get_model('monitor', 'MonitorConfig')
        Config.objects.create(name='RP', slug='rp', api_token='t-rp', raumplan_server='alt.webuntis.com',
                              raumplan_schule='alt', raumplan_benutzername='alt', raumplan_passwort='alt')
        apps.get_model('monitor', 'MonitorGlobalSettings').objects.update_or_create(
            pk=1, defaults=dict(raumplan_server='neu.webuntis.com', raumplan_schule='neu',
                                raumplan_benutzername='neu', raumplan_passwort='neu'))

    def test_global_credentials_not_overwritten(self):
        g = self.apps.get_model('monitor', 'MonitorGlobalSettings').objects.get()
        self.assertEqual((g.raumplan_server, g.raumplan_schule, g.raumplan_benutzername, g.raumplan_passwort),
                         ('neu.webuntis.com', 'neu', 'neu', 'neu'))


class EnglishNamesMigrationTest(MigrationTestCase):
    """0036 benennt Models und Felder um; die Daten (inkl. FK und M2M) bleiben erhalten."""
    migrate_from = ('monitor', '0035_remove_dropped_features')
    migrate_to = ('monitor', '0036_english_names')

    def setUpBeforeMigration(self, apps):
        Config = apps.get_model('monitor', 'MonitorConfig')
        Datei = apps.get_model('monitor', 'MonitorDatei')
        Bildschirm = apps.get_model('monitor', 'Bildschirm')
        logo = Datei.objects.create(name='Logo', datei='monitor/logo/a.png', typ='logo', reihenfolge=2)
        view = Config.objects.create(
            name='V', slug='v', api_token='t-v', ist_standard=True, layout_modus='abfahrten',
            titel='Titel', aktives_logo=logo, oepnv_stationen=[{'id': '1', 'wegzeit_minuten': 3}],
            oepnv_stoerung_ausgeblendet=['abc123'], notfall_aktiv=True, notfall_text='Alarm')
        screen = Bildschirm.objects.create(
            name='S', slug='glocke', default_profil=view, power_modus='manuell_an',
            zeitplan=[{'profil_id': view.pk, 'tage': [0], 'von': '07:00', 'bis': '08:00'}])
        klausur = apps.get_model('monitor', 'Klausur').objects.create(
            titel='Mathe', aktiv_von='2026-10-19T08:00Z', aktiv_bis='2026-10-19T10:00Z', split_seite='links')
        klausur.bildschirme.add(screen)
        event = apps.get_model('monitor', 'MonitorEvent').objects.create(name='E', aktiv=True)
        apps.get_model('monitor', 'EventBildschirm').objects.create(event=event, bildschirm=screen, profil=view)
        apps.get_model('monitor', 'MonitorConfigVersion').objects.create(config=view, daten={'titel': 'Alt'})
        apps.get_model('monitor', 'MonitorGlobalSettings').objects.update_or_create(
            pk=1, defaults=dict(raumplan_server='s.webuntis.com', raumplan_schule='kath'))

    def test_view_fields_kept(self):
        v = self.apps.get_model('monitor', 'DisplayView').objects.get(slug='v')
        self.assertEqual((v.is_default, v.layout, v.title, v.emergency_active, v.emergency_text),
                         (True, 'abfahrten', 'Titel', True, 'Alarm'))
        self.assertEqual(v.transit_stops, [{'id': '1', 'wegzeit_minuten': 3}])
        self.assertEqual(v.transit_disruption_hidden, ['abc123'])
        self.assertEqual((v.active_logo.name, v.active_logo.kind, v.active_logo.sort_order), ('Logo', 'logo', 2))

    def test_screen_exam_event_relations_kept(self):
        Screen = self.apps.get_model('monitor', 'Screen')
        screen = Screen.objects.get(slug='glocke')
        self.assertEqual((screen.default_view.slug, screen.power_mode), ('v', 'manuell_an'))
        self.assertEqual(screen.schedule[0]['tage'], [0])
        self.assertEqual([e.title for e in screen.exams.all()], ['Mathe'])
        a = self.apps.get_model('monitor', 'DisplayEventScreen').objects.get()
        self.assertEqual((a.event.is_active, a.screen.slug, a.view.slug), (True, 'glocke', 'v'))

    def test_version_and_settings_kept(self):
        version = self.apps.get_model('monitor', 'DisplayViewVersion').objects.get()
        self.assertEqual((version.view.slug, version.data), ('v', {'titel': 'Alt'}))
        s = self.apps.get_model('monitor', 'MonitorSettings').objects.get()
        self.assertEqual((s.webuntis_server, s.webuntis_school), ('s.webuntis.com', 'kath'))

    def test_backward_restores_old_names(self):
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        apps = executor.loader.project_state([self.migrate_from]).apps
        config = apps.get_model('monitor', 'MonitorConfig').objects.get(slug='v')
        self.assertEqual((config.titel, config.aktives_logo.datei.name), ('Titel', 'monitor/logo/a.png'))
        bs = apps.get_model('monitor', 'Bildschirm').objects.get(slug='glocke')
        self.assertEqual((bs.default_profil.slug, [k.titel for k in bs.klausuren.all()]), ('v', ['Mathe']))
        if connection.vendor == 'sqlite':
            # Fremdschlüssel zeigen wieder auf die alten Tabellen
            with connection.cursor() as cursor:
                cursor.execute('PRAGMA foreign_key_check')
                self.assertEqual(cursor.fetchall(), [])


OLD_STOP = {'id': '8000237', 'name': 'Lübeck Hbf', 'wegzeit_minuten': 14, 'api': 'beide',
            'zeige_bahn': True, 'zusatz_zeige_bus': False, 'max_zug': 5}
NEW_STOP = {'id': '8000237', 'name': 'Lübeck Hbf', 'walk_minutes': 14, 'source': 'both',
            'show_rail': True, 'extra_show_bus': False, 'max_train': 5}


class EnglishValuesMigrationTest(MigrationTestCase):
    """0037 übersetzt gespeicherte Auswahlwerte, JSON-Schlüssel und Versionen (Spec §5.3/§5.4)."""
    migrate_from = ('monitor', '0036_english_names')
    migrate_to = ('monitor', '0037_english_values')

    def setUpBeforeMigration(self, apps):
        View = apps.get_model('monitor', 'DisplayView')
        Screen = apps.get_model('monitor', 'Screen')
        now = '2026-10-19T08:00Z'
        apps.get_model('monitor', 'MediaFile').objects.create(name='B', file='monitor/bild/b.png', kind='bild')
        view = View.objects.create(
            name='V', slug='v', api_token='t-v', layout='abfahrten', split_left='klausur', split_right='uhr',
            pdf_mode='durchschalten', theme_preset='nacht', transit_font_size='gross', on_air_size='riesig',
            on_air_position='oben-rechts', on_air_split_side='links', transit_disruption_position='spalte',
            schedule=[{'tage': [0, 1], 'von': '07:00', 'bis': '17:00'}],
            transit_stops=[dict(OLD_STOP)],
            transit_disruption_manual=[{'titel': 'Hinweis', 'text': 'T', 'bild': 'x.png', 'highlighted': True}],
            page_rotation_pages=['main', 'veranstaltungen', 'wetter'],
            transit_cache=[{'abfahrten': []}], transit_cache_at=now,
            transit_disruption_cache=[{'titel': 'x'}], transit_disruption_cache_at=now,
            weather_cache={'temperatur': 3}, weather_cache_at=now)
        self.view_pk = view.pk
        Screen.objects.create(
            name='S', slug='s', power_mode='manuell_an',
            schedule=[{'profil_id': 3, 'tage': [0, 1], 'von': '07:00', 'bis': '17:00'}],
            power_schedule=[{'tage': [2], 'von': '06:00', 'bis': '18:00'}],
            power_exceptions=[{'von_datum': '2026-12-24', 'bis_datum': '2026-12-26', 'von': '08:00',
                               'bis': '12:00', 'notiz': 'Weihnachten'}])
        apps.get_model('monitor', 'Exam').objects.create(
            title='K', active_from=now, active_until='2026-10-19T10:00Z', display_mode='vollbild',
            split_side='rechts')
        apps.get_model('monitor', 'ExamTemplate').objects.create(name='T', display_mode='vollbild', split_side='links')
        apps.get_model('monitor', 'Announcement').objects.create(title='A', priority='dringend')
        apps.get_model('monitor', 'DisplayViewVersion').objects.create(view=view, data={
            'layout_modus': 'abfahrten', 'oepnv_stationen': [dict(OLD_STOP)], 'zeige_kamera': True,
            'aktives_logo_id': 4, 'zeitplan': [{'tage': [1], 'von': '08:00', 'bis': '09:00'}],
            'oepnv_stoerung_manuell': [{'titel': 'M'}], 'seitenrotation_seiten': ['wetter', 'raumplan'],
            'on_air_groesse': 'klein', 'unbekannt': 1})

    def _view(self):
        return self.apps.get_model('monitor', 'DisplayView').objects.get(pk=self.view_pk)

    def test_choice_values_translated(self):
        v = self._view()
        self.assertEqual(
            (v.layout, v.split_left, v.split_right, v.pdf_mode, v.theme_preset, v.transit_font_size,
             v.on_air_size, v.on_air_position, v.on_air_split_side, v.transit_disruption_position),
            ('departures', 'exam', 'clock', 'cycle', 'night', 'large', 'huge', 'top-right', 'left', 'column'))
        self.assertEqual(self.apps.get_model('monitor', 'MediaFile').objects.get().kind, 'image')
        self.assertEqual(self.apps.get_model('monitor', 'Screen').objects.get().power_mode, 'manual_on')
        exam = self.apps.get_model('monitor', 'Exam').objects.get()
        self.assertEqual((exam.display_mode, exam.split_side), ('fullscreen', 'right'))
        tpl = self.apps.get_model('monitor', 'ExamTemplate').objects.get()
        self.assertEqual((tpl.display_mode, tpl.split_side), ('fullscreen', 'left'))
        self.assertEqual(self.apps.get_model('monitor', 'Announcement').objects.get().priority, 'urgent')

    def test_transit_stop_keys_translated(self):
        v = self._view()
        self.assertEqual(v.transit_stops, [NEW_STOP])
        self.assertEqual(v.transit_disruption_manual,
                         [{'title': 'Hinweis', 'text': 'T', 'image': 'x.png', 'highlighted': True}])
        self.assertEqual(v.page_rotation_pages, ['main', 'events', 'weather'])

    def test_schedules_translated(self):
        self.assertEqual(self._view().schedule, [{'days': [0, 1], 'from': '07:00', 'until': '17:00'}])
        s = self.apps.get_model('monitor', 'Screen').objects.get()
        self.assertEqual(s.schedule, [{'view_id': 3, 'days': [0, 1], 'from': '07:00', 'until': '17:00'}])
        self.assertEqual(s.power_schedule, [{'days': [2], 'from': '06:00', 'until': '18:00'}])
        self.assertEqual(s.power_exceptions, [{'from_date': '2026-12-24', 'until_date': '2026-12-26',
                                               'from': '08:00', 'until': '12:00', 'note': 'Weihnachten'}])

    def test_snapshot_translated_and_dropped_fields_removed(self):
        data = self.apps.get_model('monitor', 'DisplayViewVersion').objects.get().data
        self.assertEqual(data, {
            'layout': 'departures', 'transit_stops': [NEW_STOP], 'active_logo_id': 4,
            'schedule': [{'days': [1], 'from': '08:00', 'until': '09:00'}],
            'transit_disruption_manual': [{'title': 'M'}], 'page_rotation_pages': ['weather'],
            'on_air_size': 'small', 'unbekannt': 1})

    def test_caches_cleared(self):
        v = self._view()
        self.assertEqual((v.transit_cache, v.transit_cache_at), (None, None))
        self.assertEqual((v.transit_disruption_cache, v.transit_disruption_cache_at), ([], None))
        self.assertEqual((v.weather_cache, v.weather_cache_at), ({}, None))

    def test_backward_restores_old_values(self):
        executor = MigrationExecutor(connection)
        executor.migrate([('monitor', '0034_bildschirm_neu_laden_zeit')])
        apps = executor.loader.project_state([('monitor', '0034_bildschirm_neu_laden_zeit')]).apps
        c = apps.get_model('monitor', 'MonitorConfig').objects.get(slug='v')
        self.assertEqual((c.layout_modus, c.split_links, c.on_air_position, c.oepnv_stoerung_position),
                         ('abfahrten', 'klausur', 'oben-rechts', 'spalte'))
        self.assertEqual(c.oepnv_stationen, [OLD_STOP])
        self.assertEqual(c.zeitplan, [{'tage': [0, 1], 'von': '07:00', 'bis': '17:00'}])
        self.assertEqual(c.seitenrotation_seiten, ['main', 'veranstaltungen', 'wetter'])
        bs = apps.get_model('monitor', 'Bildschirm').objects.get(slug='s')
        self.assertEqual(bs.power_modus, 'manuell_an')
        self.assertEqual(bs.zeitplan, [{'profil_id': 3, 'tage': [0, 1], 'von': '07:00', 'bis': '17:00'}])
        self.assertEqual(bs.power_ausnahmen[0]['von_datum'], '2026-12-24')
        self.assertEqual(apps.get_model('monitor', 'Ankuendigung').objects.get().prioritaet, 'dringend')
        version = apps.get_model('monitor', 'MonitorConfigVersion').objects.get()
        self.assertEqual(version.daten['layout_modus'], 'abfahrten')
        self.assertEqual(version.daten['oepnv_stationen'], [OLD_STOP])
        self.assertEqual(version.daten['aktives_logo_id'], 4)
        self.assertNotIn('zeige_kamera', version.daten)


class EnglishValuesToleratesBadDataTest(MigrationTestCase):
    """Review Focus 1: fehlende Schlüssel, None und Nicht-Dicts brechen die Migration nicht."""
    migrate_from = ('monitor', '0036_english_names')
    migrate_to = ('monitor', '0037_english_values')

    def setUpBeforeMigration(self, apps):
        View = apps.get_model('monitor', 'DisplayView')
        View.objects.create(name='A', slug='a', api_token='t-a', transit_stops=[{'id': '1'}, None, 'x'],
                            schedule=[])
        json_null = Value(None, JSONField())  # JSON null (die Spalten sind NOT NULL)
        View.objects.create(name='B', slug='b', api_token='t-b', transit_stops=json_null,
                            transit_disruption_manual=json_null, page_rotation_pages=json_null,
                            schedule=json_null)
        apps.get_model('monitor', 'Screen').objects.create(name='S', slug='s', power_exceptions=[None, 'x'],
                                                          schedule=[{'tage': [1]}])
        v = View.objects.get(slug='a')
        apps.get_model('monitor', 'DisplayViewVersion').objects.create(view=v, data={})
        apps.get_model('monitor', 'DisplayViewVersion').objects.create(view=v, data=Value(None, JSONField()))

    def test_forward_tolerates_missing_and_null(self):
        View = self.apps.get_model('monitor', 'DisplayView')
        a, b = View.objects.get(slug='a'), View.objects.get(slug='b')
        self.assertEqual((a.transit_stops, a.schedule), ([{'id': '1'}, None, 'x'], []))
        self.assertEqual((b.transit_stops, b.transit_disruption_manual, b.page_rotation_pages, b.schedule),
                         (None, None, None, None))
        s = self.apps.get_model('monitor', 'Screen').objects.get()
        self.assertEqual((s.power_exceptions, s.schedule), ([None, 'x'], [{'days': [1]}]))
        datas = sorted(self.apps.get_model('monitor', 'DisplayViewVersion').objects.values_list('data', flat=True),
                       key=lambda d: d is None)
        self.assertEqual(datas, [{}, None])


class TranslateFunctionsTest(TestCase):
    """Reine Funktionen aus 0037: Rundreise ohne Datenverlust."""

    def setUp(self):
        self.m = importlib.import_module('monitor.migrations.0037_english_values')

    def test_stop_roundtrip(self):
        self.assertEqual(self.m.translate_stop(OLD_STOP), NEW_STOP)
        self.assertEqual(self.m.translate_stop(NEW_STOP, reverse=True), OLD_STOP)

    def test_snapshot_baukasten_becomes_standard_and_stays(self):
        self.assertEqual(self.m.translate_snapshot({'layout_modus': 'baukasten'}), {'layout': 'standard'})
        self.assertEqual(self.m.translate_snapshot({'layout': 'standard'}, reverse=True),
                         {'layout_modus': 'standard'})


class EmergencyPermissionMigrationTest(MigrationTestCase):
    """users/0015: monitor.notfall heißt monitor.emergency, Gruppen-Zuweisungen bleiben (Spec §7)."""
    migrate_from = ('users', '0014_userprofile_notify_disabled')
    migrate_to = ('users', '0015_rename_monitor_emergency_permission')

    def setUpBeforeMigration(self, apps):
        Permission = apps.get_model('users', 'Permission')
        perm = Permission.objects.create(code='monitor.notfall', name='Notfall', category='monitor')
        group = apps.get_model('users', 'PermissionGroup').objects.create(name='Leitung')
        group.permissions.add(perm)
        self.perm_pk = perm.pk

    def test_permission_renamed(self):
        Permission = self.apps.get_model('users', 'Permission')
        self.assertFalse(Permission.objects.filter(code='monitor.notfall').exists())
        perm = Permission.objects.get(code='monitor.emergency')
        self.assertEqual(perm.pk, self.perm_pk)
        self.assertEqual([g.name for g in perm.groups.all()], ['Leitung'])

    def test_backward_restores_old_code(self):
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        apps = executor.loader.project_state([self.migrate_from]).apps
        perm = apps.get_model('users', 'Permission').objects.get(pk=self.perm_pk)
        self.assertEqual(perm.code, 'monitor.notfall')
        self.assertEqual([g.name for g in perm.groups.all()], ['Leitung'])
