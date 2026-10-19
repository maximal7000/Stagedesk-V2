from datetime import datetime, timedelta

from django.test import TestCase
from django.utils import timezone

from .api import _legacy_reload_key
from .models import DisplayView, Screen


class LegacyAliasTest(TestCase):
    def setUp(self):
        self.view = DisplayView.objects.create(name='V', slug='v', is_default=True, api_token='tok')
        self.screen = Screen.objects.create(name='S', slug='glocke', default_view=self.view)

    def test_legacy_onair_with_token(self):
        r = self.client.post('/api/monitor/onair', {'on_air': True},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(DisplayView.objects.get(pk=self.view.pk).is_on_air)

    def test_new_on_air_route(self):
        r = self.client.post('/api/monitor/on-air', {'on_air': True},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(DisplayView.objects.get(pk=self.view.pk).is_on_air)

    def test_legacy_emergency_old_payload(self):
        r = self.client.post('/api/monitor/notfall', {'aktiv': True, 'text': 'Probealarm'},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertEqual(r.status_code, 200)
        v = DisplayView.objects.get(pk=self.view.pk)
        self.assertEqual((v.emergency_active, v.emergency_text), (True, 'Probealarm'))

    def test_legacy_emergency_rejects_bad_token(self):
        r = self.client.post('/api/monitor/notfall', {'aktiv': True},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='nope')
        self.assertEqual(r.status_code, 401)

    def test_new_emergency_route(self):
        r = self.client.post('/api/monitor/emergency', {'active': True, 'text': 'X'},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(DisplayView.objects.get(pk=self.view.pk).emergency_active)

    def test_legacy_power_keeps_old_response_shape(self):
        r = self.client.get('/api/monitor/bildschirm/power', {'slug': 'glocke'}).json()
        self.assertEqual(set(r), {'slug', 'power', 'power_zeitplan', 'ferien_modus',
                                  'power_ausnahmen', 'cec_status', 'cec_status_zeit'})

    def test_new_power_uses_new_keys(self):
        r = self.client.get('/api/monitor/screen/power', {'slug': 'glocke'}).json()
        self.assertEqual(set(r), {'slug', 'power', 'power_schedule', 'holiday_mode',
                                  'power_exceptions', 'cec_status', 'cec_status_at'})

    def test_legacy_cec_status_behaves_like_new_route(self):
        r = self.client.post('/api/monitor/bildschirm/cec-status?slug=glocke&status=on')
        self.assertTrue(r.json()['success'])
        r = self.client.post('/api/monitor/screen/cec-status?slug=glocke&status=standby')
        self.assertEqual(r.json()['cec_status'], 'standby')

    def test_display_accepts_old_and_new_params(self):
        for params in ({'screen': 'glocke'}, {'bildschirm': 'glocke'}, {'view': 'v'}, {'profil': 'v'}):
            self.assertEqual(self.client.get('/api/monitor/display', params).status_code, 200)

    def test_legacy_reload_key_changes_each_minute(self):
        t = timezone.make_aware(datetime(2026, 10, 19, 10, 42, 31))
        self.assertEqual(_legacy_reload_key(t), _legacy_reload_key(t + timedelta(seconds=20)))
        self.assertNotEqual(_legacy_reload_key(t), _legacy_reload_key(t + timedelta(seconds=40)))
        self.assertIn('neu_laden_zeit', self.client.get('/api/monitor/display', {'screen': 'glocke'}).json())

    def test_old_admin_route_is_gone(self):
        self.assertEqual(self.client.get('/api/monitor/bildschirme').status_code, 404)
