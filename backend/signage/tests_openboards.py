import json
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase

from .transit import db, openboards
from .transit.common import TIMEZONE
from .transit.departures import fetch_departures

SAMPLE = json.loads((Path(__file__).parent / 'fixtures_transit' / 'openboards-luebeck-hbf.json').read_text())
NOW = datetime(2026, 11, 8, 16, 58, tzinfo=TIMEZONE)
EMPTY = {'departures': [], 'stopPlaces': []}


def configured():
    return mock.patch.multiple(db, DB_TT_CLIENT_ID='id', DB_TT_API_KEY='key')


class OpenBoardsTest(SimpleTestCase):
    def fetch(self, answers, duration=60, **kw):
        calls = []

        def post(path, body, timeout=None):
            calls.append(body)
            answer = answers[len(calls) - 1] if len(calls) <= len(answers) else EMPTY
            if isinstance(answer, Exception):
                raise answer
            return answer
        with configured(), mock.patch.object(openboards, '_post', side_effect=post):
            rows = openboards.fetch_departures_openboards('8000237', duration, 50, now=NOW, **kw)
        return rows, calls

    def test_sample_rows_with_replacement_buses(self):
        rows, _ = self.fetch([SAMPLE], duration=30, stopovers=True)
        self.assertEqual([(r['line'], r['departure'], r['direction']) for r in rows], [
            ('SEV RE83', '16:59', 'Bahnhof, Ascheberg (Holstein)'),
            ('RE8', '17:03', 'Lübeck-Travemünde Strand'),
            ('SEV RE83', '17:05', 'ZOB/Bahnhof, Plön'),
            ('RE8', '17:09', 'Hamburg Hbf'),
            ('SEV X85', '17:12', 'Puttgarden Bahnhof, Fehmarn'),
            ('RB85', '17:12', 'Neustadt(Holst)'),
            ('SEV RE83', '17:15', 'Bahnhof (Ladestraße), Büchen'),
        ])
        sev, re8 = rows[0], rows[1]
        self.assertEqual((sev['kind'], sev['kind_icon'], sev['rail_replacement'], sev['replacement_for']),
                         ('bus', 'bus', True, 'RE83'))
        self.assertEqual(sev['stopovers'], ['ZOB/Bahnhof, Eutin', 'Bahnhof, Malente', 'ZOB/Bahnhof, Plön'])
        self.assertEqual((re8['kind'], re8['platform'], re8['delay'], re8['realtime'], re8['cancelled']),
                         ('regionalExpress', '6', 0, True, False))
        self.assertNotIn('rail_replacement', re8)
        self.assertFalse(rows[4]['realtime'])  # timeType SCHEDULE

    def test_delay_platform_change_and_cancellation(self):
        dep = json.loads(json.dumps(SAMPLE['departures'][1]))
        dep['time'] = '2026-11-08T17:08:00+01:00'
        dep['platform'] = {'name': '5'}
        dep['canceled'] = True
        rows, _ = self.fetch([{**SAMPLE, 'departures': [dep]}])
        self.assertEqual((rows[0]['departure'], rows[0]['departure_actual'], rows[0]['delay']), ('17:03', '17:08', 5))
        self.assertEqual((rows[0]['platform'], rows[0]['platform_planned'], rows[0]['cancelled']), ('5', '6', True))

    def test_windows_cover_the_look_ahead_and_drop_duplicates(self):
        rows, calls = self.fetch([SAMPLE, SAMPLE], duration=60)
        self.assertEqual([c['timeWindow']['timeStart'] for c in calls],
                         ['2026-11-08T16:53:00+01:00', '2026-11-08T17:23:00+01:00', '2026-11-08T17:53:00+01:00'])
        self.assertEqual(calls[0]['stopPlaceOrStation'], {'evaNumbers': ['8000237']})
        self.assertEqual(len(rows), 7)

    def test_first_window_failing_raises_later_ones_only_shorten(self):
        with self.assertRaises(OSError):
            self.fetch([OSError('401')])
        rows, calls = self.fetch([SAMPLE, OSError('timeout')], duration=120)
        self.assertEqual((len(rows), len(calls)), (7, 2))

    def test_without_db_access_nothing_is_asked(self):
        with mock.patch.multiple(db, DB_TT_CLIENT_ID='', DB_TT_API_KEY=''), \
                mock.patch.object(openboards, '_post') as post:
            self.assertEqual(openboards.fetch_departures_openboards('8000237', 60, 50), [])
        post.assert_not_called()


class OpenBoardsSourceTest(SimpleTestCase):
    def test_stop_with_openboards_source_uses_only_openboards(self):
        stop = {'id': '8000237', 'name': 'Lübeck Hbf', 'source': 'openboards', 'show_bus': False}
        soon = (datetime.now(TIMEZONE) + timedelta(minutes=10)).strftime('%H:%M')
        rows = [{'line': 'SEV RE83', 'direction': 'Plön', 'departure': soon, 'departure_actual': soon, 'delay': 0,
                 'realtime': True, 'platform': '', 'kind': 'bus', 'kind_icon': 'bus', 'cancelled': False, 'remarks': [],
                 'rail_replacement': True, 'replacement_for': 'RE83'}]
        with configured(), \
                mock.patch('signage.transit.departures.fetch_departures_openboards', return_value=rows) as ob, \
                mock.patch('signage.transit.departures._fetch_departures_db') as tt, \
                mock.patch('signage.transit.departures._fetch_departures_nahsh') as nahsh:
            result = fetch_departures([stop], duration=60)
        ob.assert_called_once()
        tt.assert_not_called()
        nahsh.assert_not_called()
        self.assertEqual(result['sources']['openboards'], 'ok')
        # A replacement bus follows the train filter, so "no buses" keeps it
        self.assertEqual([d['line'] for d in result['stations'][0]['departures']], ['SEV RE83'])
