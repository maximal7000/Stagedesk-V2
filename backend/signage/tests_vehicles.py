import json
from pathlib import Path
from unittest import mock

from django.core.cache import cache
from django.test import TestCase

from .transit import vehicles
from .validation import parse_map_center

FIXTURE = Path(__file__).parent / 'fixtures_transit' / 'nahsh_journey_geopos.json'


def recorded():
    return json.loads(FIXTURE.read_text())['svcResL'][0]['res']


class VehicleParseTest(TestCase):
    def test_polyline(self):
        self.assertEqual(vehicles.decode_polyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'),
                         [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]])

    def test_recorded_answer(self):
        found = vehicles.parse_vehicles(recorded())
        self.assertEqual(len(found), 12)
        first = found[0]
        self.assertEqual((first['line'], first['key'], first['kind'], first['replacement']), ('9', '9', 'bus', False))
        self.assertEqual(len(first['frames']), 7)  # 30 s ahead in 5 s steps
        lat, lon = first['frames'][0]
        self.assertTrue(53.85 < lat < 53.88 and 10.66 < lon < 10.71)

    def test_line_key(self):
        self.assertEqual({vehicles.line_key(n) for n in ('Bus    9', 'Bus 9', '9')}, {'9'})
        self.assertEqual(vehicles.line_key('SEV RE83'), 'SEV RE83')

    def test_map_center(self):
        self.assertEqual(parse_map_center('53.8699, 10.6892'), (53.8699, 10.6892))
        self.assertEqual(parse_map_center('53.8699;10.6892'), (53.8699, 10.6892))
        self.assertIsNone(parse_map_center('48.85, 2.35'))  # Paris: outside Germany
        self.assertIsNone(parse_map_center('Katharineum'))


class VehicleEndpointTest(TestCase):
    URL = '/api/signage/display/vehicles'

    def setUp(self):
        cache.clear()

    def test_shared_answer_for_15_seconds(self):
        with mock.patch('signage.transit.vehicles._nahsh_rpc', return_value=recorded()) as rpc:
            first = self.client.get(self.URL, {'bbox': '53.858,10.670,53.878,10.705'})
            again = self.client.get(self.URL, {'bbox': '53.8581,10.6701,53.8779,10.7049'})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(len(first.json()['vehicles']), 12)
        self.assertEqual(first.json()['step_ms'], 5000)
        self.assertEqual(again.json(), first.json())
        rpc.assert_called_once()
        rect = rpc.call_args.args[1]['rect']
        self.assertEqual((rect['llCrd']['y'], rect['urCrd']['y']), (53855000, 53880000))

    def test_rejects_large_or_foreign_boxes(self):
        with mock.patch('signage.transit.vehicles._nahsh_rpc') as rpc:
            for bbox in ('53,10,54,11', '48.8,2.3,48.9,2.4', 'x', '53.88,10.7,53.86,10.6'):
                self.assertEqual(self.client.get(self.URL, {'bbox': bbox}).status_code, 422, bbox)
        rpc.assert_not_called()

    def test_hafas_failure_is_502(self):
        with mock.patch('signage.transit.vehicles._nahsh_rpc', side_effect=OSError('down')), \
                self.assertLogs('signage.transit', 'ERROR'):
            self.assertEqual(self.client.get(self.URL, {'bbox': '53.858,10.670,53.878,10.705'}).status_code, 502)
