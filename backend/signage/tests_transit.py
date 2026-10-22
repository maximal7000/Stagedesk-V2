from unittest import mock

from django.apps import apps
from django.test import SimpleTestCase


class CredentialsWarningTest(SimpleTestCase):
    """SignageConfig.ready() warns once when the DB timetable credentials are missing."""

    def _ready(self):
        apps.get_app_config('signage').ready()

    def test_warns_when_db_credentials_missing(self):
        from signage.transit import db
        with mock.patch.object(db, 'DB_TT_CLIENT_ID', ''), \
             mock.patch.object(db, 'DB_TT_API_KEY', 'key'):
            with self.assertLogs('signage.transit', 'WARNING') as log:
                self._ready()
        self.assertEqual(len(log.records), 1)
        self.assertIn('DB_TT_CLIENT_ID/DB_TT_API_KEY not set', log.output[0])
        with mock.patch.object(db, 'DB_TT_CLIENT_ID', 'id'), \
             mock.patch.object(db, 'DB_TT_API_KEY', ''):
            with self.assertLogs('signage.transit', 'WARNING'):
                self._ready()

    def test_no_warning_when_credentials_set(self):
        from signage.transit import db
        with mock.patch.object(db, 'DB_TT_CLIENT_ID', 'id'), \
             mock.patch.object(db, 'DB_TT_API_KEY', 'key'):
            with self.assertNoLogs('signage.transit', 'WARNING'):
                self._ready()
