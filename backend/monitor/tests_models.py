from unittest import mock

from django.test import TestCase

from core.auth import KeycloakAuth
from .models import DisplayView, Screen, validate_rotation_items


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
