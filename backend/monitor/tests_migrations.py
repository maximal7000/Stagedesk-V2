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
