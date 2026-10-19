"""Migrationstests. Die Tests verwenden bewusst die damaligen (historischen) Namen."""
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


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
