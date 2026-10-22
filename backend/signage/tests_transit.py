from datetime import datetime
from unittest import mock

from django.apps import apps
from django.test import SimpleTestCase

from signage.transit.common import TIMEZONE


class CredentialsWarningTest(SimpleTestCase):
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


def _at(hhmm):
    h, m = map(int, hhmm.split(':'))
    return datetime(2026, 10, 22, h, m, 20, tzinfo=TIMEZONE)


def _dep(plan, actual=None, realtime=True, **extra):
    return {'line': 'RE8', 'direction': 'Kiel', 'departure': plan,
            'departure_actual': actual or plan, 'realtime': realtime, **extra}


class DepartureVisibleTest(SimpleTestCase):
    def visible(self, dep, now, walk=0):
        from signage.transit.departures import departure_visible
        return departure_visible(dep, _at(now), walk)

    def test_walk_filter_uses_actual_time(self):
        self.assertTrue(self.visible(_dep('22:20', '22:25'), '22:12', 12))
        self.assertFalse(self.visible(_dep('22:20', '22:25'), '22:14', 12))

    def test_walk_zero_hides_departed(self):
        self.assertFalse(self.visible(_dep('22:05', '22:10'), '22:11', 0))
        self.assertTrue(self.visible(_dep('22:05', '22:11'), '22:11', 0))

    def test_no_realtime_grace(self):
        dep = _dep('22:10', realtime=False)
        self.assertTrue(self.visible(dep, '22:11'))
        self.assertFalse(self.visible(dep, '22:12'))

    def test_cancelled_follows_planned_time(self):
        dep = _dep('22:10', '22:30', cancelled=True)
        self.assertFalse(self.visible(dep, '22:12'))

    def test_midnight_wrap(self):
        self.assertTrue(self.visible(_dep('00:05', realtime=False), '23:58'))
        self.assertFalse(self.visible(_dep('23:59', realtime=False), '00:02'))
        self.assertFalse(self.visible(_dep('23:55', '23:59'), '00:02'))
        self.assertTrue(self.visible(_dep('00:00', '00:05'), '23:58'))


class FetchDeparturesTest(SimpleTestCase):
    def run_fetch(self, stops, db_deps=None, nahsh=None, client_id='id'):
        from signage.transit import db, departures
        with mock.patch.object(db, 'DB_TT_CLIENT_ID', client_id), \
             mock.patch.object(db, 'DB_TT_API_KEY', 'key'), \
             mock.patch.object(departures, '_fetch_departures_db',
                               **(db_deps or {'return_value': []})), \
             mock.patch.object(departures, '_fetch_departures_nahsh',
                               **(nahsh or {'return_value': []})):
            return departures.fetch_departures(stops)

    def test_station_fields(self):
        result = self.run_fetch([
            {'id': ''},
            {'id': '1', 'name': 'A', 'column': 2, 'split_modes': False},
            {'id': '2', 'name': 'B'},
        ])
        first, second = result['stations']
        self.assertEqual((first['index'], first['column'], first['split_modes']), (1, 2, False))
        self.assertEqual((second['index'], second['column'], second['split_modes']), (2, None, True))

    def test_sources_status(self):
        result = self.run_fetch([{'id': '1', 'name': 'A', 'source': 'nahsh'}],
                                nahsh={'side_effect': RuntimeError('down')})
        self.assertEqual(result['sources'], {'db': 'off', 'nahsh': 'error'})
        result = self.run_fetch([{'id': '1', 'name': 'A', 'source': 'both'}], client_id='')
        self.assertEqual(result['sources'], {'db': 'off', 'nahsh': 'ok'})
        result = self.run_fetch([{'id': '1', 'name': 'A', 'source': 'db'}])
        self.assertEqual(result['sources'], {'db': 'ok', 'nahsh': 'off'})
        result = self.run_fetch([{'id': '1', 'name': 'A', 'source': 'db'}],
                                db_deps={'side_effect': RuntimeError('down')})
        self.assertEqual(result['sources']['db'], 'error')

    def test_filter_applied_in_fetch(self):
        deps = [_dep('22:00', '22:00', realtime=True), _dep('23:50', '23:50')]
        with mock.patch('signage.transit.departures.datetime') as dt:
            dt.now.return_value = _at('22:30')
            dt.strptime = datetime.strptime
            result = self.run_fetch([{'id': '1', 'name': 'A', 'source': 'nahsh'}],
                                    nahsh={'return_value': deps})
        self.assertEqual([d['departure'] for d in result['stations'][0]['departures']], ['23:50'])


class TransitCacheTest(SimpleTestCase):
    def test_list_cache_is_normalised(self):
        from signage.display import _as_transit
        self.assertEqual(_as_transit([{'station_id': '1'}]),
                         {'stations': [{'station_id': '1'}], 'sources': {}})
        self.assertIsNone(_as_transit(None))


class DbFailureStatusTest(SimpleTestCase):
    STOP = [{'id': '1', 'name': 'A', 'source': 'db'}]

    def fetch(self, tt_get, stops=None):
        from signage.transit import db, departures
        with mock.patch.object(db, 'DB_TT_CLIENT_ID', 'id'), \
             mock.patch.object(db, 'DB_TT_API_KEY', 'key'), \
             mock.patch.object(db, '_db_tt_get', side_effect=tt_get):
            return departures.fetch_departures(stops or self.STOP)

    @staticmethod
    def _plan():
        from xml.etree import ElementTree as ET
        return ET.fromstring('<timetable/>')

    def test_all_plan_requests_failing_is_an_error(self):
        result = self.fetch(OSError('down'))
        self.assertEqual(result['sources']['db'], 'error')
        self.assertEqual(result['stations'][0]['departures'], [])

    def test_fchg_failure_is_an_error(self):
        def tt_get(path):
            if path.startswith('/fchg'):
                raise OSError('down')
            return self._plan()
        self.assertEqual(self.fetch(tt_get)['sources']['db'], 'error')

    def test_single_plan_hour_failure_is_an_error(self):
        calls = []

        def tt_get(path):
            calls.append(path)
            if path.startswith('/plan') and len(calls) == 2:
                raise OSError('down')
            return self._plan()
        self.assertEqual(self.fetch(tt_get)['sources']['db'], 'error')

    def test_healthy_db_is_ok(self):
        self.assertEqual(self.fetch(lambda path: self._plan())['sources']['db'], 'ok')

    def test_stopover_retry_success_is_not_an_error(self):
        from signage.transit import db, departures
        calls = []

        def fake(station_id, duration, max_results, stopovers=False, failed=None):
            calls.append(stopovers)
            if stopovers:
                raise OSError('500')
            return []
        with mock.patch.object(db, 'DB_TT_CLIENT_ID', 'id'), mock.patch.object(db, 'DB_TT_API_KEY', 'key'), \
             mock.patch.object(departures, '_fetch_departures_db', side_effect=fake):
            result = departures.fetch_departures([{'id': '1', 'name': 'A', 'source': 'db', 'filter_via': 'Kiel'}])
        self.assertEqual(calls, [True, False])
        self.assertEqual(result['sources']['db'], 'ok')

    def test_missing_api_key_is_off(self):
        from signage.transit import db, departures
        with mock.patch.object(db, 'DB_TT_CLIENT_ID', 'id'), mock.patch.object(db, 'DB_TT_API_KEY', ''), \
             mock.patch.object(departures, '_fetch_departures_db', return_value=[]):
            result = departures.fetch_departures(self.STOP)
        self.assertEqual(result['sources']['db'], 'off')
