from unittest import mock

from django.test import TestCase

from core.auth import KeycloakAuth
from django.utils import timezone

from .models import DisplayView, Screen, WebUntisLink, validate_rotation_items


class ScreenAccessKeyTest(TestCase):
    def test_access_key_generated_and_unique(self):
        a = Screen.objects.create(name='A', slug='a')
        b = Screen.objects.create(name='B', slug='b')
        self.assertEqual(len(a.access_key), 32)
        self.assertEqual(len(b.access_key), 32)
        self.assertNotEqual(a.access_key, b.access_key)


class EffectiveStyleTest(TestCase):
    def test_effective_style_auto(self):
        v = DisplayView(kind='departures')
        self.assertEqual(v.effective_style(), 'dense')
        self.assertEqual(DisplayView(kind='substitutions').effective_style(), 'dense')
        self.assertEqual(DisplayView(kind='split').effective_style(), 'dense')
        self.assertEqual(DisplayView(kind='info').effective_style(), 'ci')
        self.assertEqual(DisplayView(kind='info', style='dark').effective_style(), 'dark')
        self.assertEqual(DisplayView(kind='departures', style='ci').effective_style(), 'ci')


class RotationItemsTest(TestCase):
    def setUp(self):
        self.view = DisplayView.objects.create(name='V', slug='v', kind='info')
        self.rotation = DisplayView.objects.create(name='R', slug='r', kind='rotation')

    def test_rotation_items_validation(self):
        with self.assertRaises(ValueError):
            validate_rotation_items([{'view_id': self.rotation.id, 'seconds': 10}])
        with self.assertRaises(ValueError):
            validate_rotation_items([{'view_id': 999999, 'seconds': 10}])
        with self.assertRaises(ValueError):
            validate_rotation_items([{'view_id': self.view.id, 'seconds': 4}])
        with self.assertRaises(ValueError):
            validate_rotation_items([])
        with self.assertRaises(ValueError):
            validate_rotation_items([{'view_id': self.view.id, 'seconds': 10}], own_id=self.view.id)
        items = [{'view_id': self.view.id, 'seconds': 60}]
        self.assertEqual(validate_rotation_items(items), items)


class UpdateViewApiTest(TestCase):
    def test_update_view_rejects_invalid_rotation(self):
        view = DisplayView.objects.create(name='R', slug='r', kind='rotation')
        # Die Auth ist beim Dekorieren gebunden: Instanzmethode patchen, nicht den Namen.
        with mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'}), \
                mock.patch('monitor.api._require_perm'):
            r = self.client.put(f'/api/monitor/config?view_id={view.id}',
                                {'rotation_items': [{'view_id': 999999, 'seconds': 10}]},
                                content_type='application/json')
        self.assertEqual(r.status_code, 422)
        view.refresh_from_db()
        self.assertEqual(view.rotation_items, [])

    def _put(self, view, body):
        with mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'}), \
                mock.patch('monitor.api._require_perm'):
            return self.client.put(f'/api/monitor/config?view_id={view.id}', body, content_type='application/json')

    def test_update_view_rejects_invalid_choices(self):
        view = DisplayView.objects.create(name='I', slug='i', kind='info')
        for body, fragment in [({'kind': 'tabelle'}, 'Typ'), ({'style': 'bunt'}, 'Stil'),
                               ({'on_air_split_side': 'oben'}, 'On-Air'), ({'pdf_mode': 'zufall'}, 'Modus')]:
            r = self._put(view, body)
            self.assertEqual(r.status_code, 422, r.content)
            self.assertIn(fragment, r.json()['detail'])
        view.refresh_from_db()
        self.assertEqual((view.kind, view.style, view.on_air_split_side, view.pdf_mode),
                         ('info', 'auto', 'right', 'cycle'))

    def test_update_view_countdown_date(self):
        view = DisplayView.objects.create(name='I', slug='i', kind='info')
        r = self._put(view, {'custom_countdown_date': 'kein Datum'})
        self.assertEqual(r.status_code, 422, r.content)
        self.assertIn('Countdown', r.json()['detail'])
        r = self._put(view, {'custom_countdown_date': '2099-06-01T10:00'})
        self.assertEqual(r.status_code, 200, r.content)
        view.refresh_from_db()
        self.assertEqual(view.custom_countdown_date.isoformat(), '2099-06-01T08:00:00+00:00')
        r = self._put(view, {'custom_countdown_date': None})
        self.assertEqual(r.status_code, 200, r.content)
        view.refresh_from_db()
        self.assertIsNone(view.custom_countdown_date)

    def test_update_view_rejects_empty_or_out_of_range_numbers(self):
        view = DisplayView.objects.create(name='I', slug='i', kind='departures')
        cases = [
            ({'page_seconds': None}, 'Blättertakt'), ({'page_seconds': 4}, 'Blättertakt'),
            ({'page_seconds': 121}, 'Blättertakt'), ({'media_seconds': None}, 'Sekunden pro Seite'),
            ({'media_seconds': 2}, 'Sekunden pro Seite'), ({'pdf_per_screen': 4}, 'Seiten nebeneinander'),
            ({'pdf_static_page': 0}, 'Feste Seite'), ({'split_left_percent': None}, 'Breite links'),
            ({'transit_duration': None}, 'Vorausschau'), ({'transit_duration': 9}, 'Vorausschau'),
            ({'transit_duration': 241}, 'Vorausschau'),
            ({'transit_source_db': None}, 'Deutsche Bahn'), ({'transit_source_nahsh': None}, 'NAH.SH'),
            ({'transit_show_via': None}, 'Zwischenhalte'),
            ({'transit_disruption_hidden': [None]}, 'Ausgeblendete Meldungen'),
            ({'transit_disruption_hidden': [1]}, 'Ausgeblendete Meldungen'),
            ({'transit_stops': [{'id': '1', 'name': 'Kohlmarkt', 'walk_minutes': None}]}, 'Fußweg'),
            ({'transit_stops': [{'id': '1', 'name': 'Kohlmarkt', 'walk_minutes': 61}]}, 'Fußweg'),
            ({'transit_stops': [{'id': '1', 'name': 'Kohlmarkt', 'max_departures': 31}]}, 'Max. Zeilen'),
            ({'transit_stops': [{'id': '1', 'name': 'Kohlmarkt', 'max_departures': 'viele'}]}, 'Max. Zeilen'),
            ({'transit_stops': [{'id': '1', 'name': 'Kohlmarkt', 'max_departures': True}]}, 'Max. Zeilen'),
        ]
        for body, fragment in cases:
            r = self._put(view, body)
            self.assertEqual(r.status_code, 422, (body, r.content))
            detail = r.json()['detail']
            self.assertIsInstance(detail, str)
            self.assertIn(fragment, detail)
        view.refresh_from_db()
        self.assertEqual((view.page_seconds, view.media_seconds, view.transit_stops), (15, 10, []))
        stops = [{'id': '1', 'name': 'Kohlmarkt', 'walk_minutes': 60, 'max_departures': 30}]
        r = self._put(view, {'page_seconds': 120, 'media_seconds': 3, 'pdf_per_screen': 3, 'transit_stops': stops})
        self.assertEqual(r.status_code, 200, r.content)
        # Breite links wird wie bisher geklemmt
        self.assertEqual(self._put(view, {'split_left_percent': 95}).json()['split_left_percent'], 80)

    def test_update_view_missing_choice_wording(self):
        view = DisplayView.objects.create(name='I', slug='i', kind='info')
        r = self._put(view, {'style': None})
        self.assertEqual(r.status_code, 422, r.content)
        self.assertEqual(r.json()['detail'], 'Für Stil fehlt die Auswahl. Bitte einen der angebotenen Werte wählen.')

    def test_update_view_own_url_replaces_saved_link(self):
        link = WebUntisLink.objects.create(name='Bibliothek', url='https://bibliothek.example/untis')
        view = DisplayView.objects.create(name='S', slug='s', kind='substitutions', webuntis_link=link)
        self.assertEqual(view.get_webuntis_url(), 'https://bibliothek.example/untis')
        r = self._put(view, {'webuntis_url': 'https://eigen.example/untis', 'webuntis_link_id': None})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNone(r.json()['webuntis_link_id'])
        view.refresh_from_db()
        self.assertIsNone(view.webuntis_link_id)
        self.assertEqual(view.get_webuntis_url(), 'https://eigen.example/untis')

    def test_get_trashed_view_is_404(self):
        view = DisplayView.objects.create(name='T', slug='t', kind='info', deleted_at=timezone.now())
        with mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'}), \
                mock.patch('monitor.api._require_perm'):
            self.assertEqual(self.client.get(f'/api/monitor/config?view_id={view.id}').status_code, 404)
            view.deleted_at = None
            view.save()
            self.assertEqual(self.client.get(f'/api/monitor/config?view_id={view.id}').status_code, 200)
