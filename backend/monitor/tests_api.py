from django.test import TestCase, override_settings

from .models import DisplayView, MonitorSettings, Screen


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class LegacyAliasTest(TestCase):
    def setUp(self):
        self.view = DisplayView.objects.create(name='V', slug='v', is_default=True, api_token='tok')
        self.screen = Screen.objects.create(name='S', slug='glocke', default_view=self.view)

    def test_legacy_onair_with_token(self):
        r = self.client.post('/api/monitor/onair', {'on_air': True},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(MonitorSettings.load().on_air_active)

    def test_new_on_air_route(self):
        r = self.client.post('/api/monitor/on-air', {'on_air': True},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(MonitorSettings.load().on_air_active)

    def test_legacy_emergency_old_payload(self):
        r = self.client.post('/api/monitor/notfall', {'aktiv': True, 'text': 'Probealarm'},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertEqual(r.status_code, 200)
        s = MonitorSettings.load()
        self.assertEqual((s.emergency_active, s.emergency_text), (True, 'Probealarm'))
        self.assertIsNotNone(s.emergency_since)

    def test_legacy_emergency_rejects_bad_token(self):
        r = self.client.post('/api/monitor/notfall', {'aktiv': True},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='nope')
        self.assertEqual(r.status_code, 401)

    def test_new_emergency_route(self):
        r = self.client.post('/api/monitor/emergency', {'active': True, 'text': 'X'},
                             content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(MonitorSettings.load().emergency_active)

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

    def test_old_admin_route_is_gone(self):
        self.assertEqual(self.client.get('/api/monitor/bildschirme').status_code, 404)


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class GlobalStateApiTest(TestCase):
    """On-Air und Notfall liegen in MonitorSettings; /display und /clock lesen dort (Task 2)."""

    def setUp(self):
        self.view = DisplayView.objects.create(name='V', slug='v', is_default=True, api_token='tok',
                                               kind='departures')

    def test_display_returns_kind_and_global_state(self):
        self.client.post('/api/monitor/on-air', {'on_air': True},
                         content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.client.post('/api/monitor/emergency', {'active': True, 'text': 'Alarm'},
                         content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        data = self.client.get('/api/monitor/display', {'view': 'v'}).json()
        self.assertEqual(data['view']['kind'], 'departures')
        self.assertEqual((data['mode']['kind'], data['mode']['text']), ('emergency', 'Alarm'))
        self.client.post('/api/monitor/emergency', {'active': False},
                         content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        data = self.client.get('/api/monitor/display', {'view': 'v'}).json()
        self.assertEqual(data['mode']['kind'], 'on_air')

    def test_on_air_off_clears_since_and_clock_reads_settings(self):
        self.client.post('/api/monitor/on-air', {'on_air': True},
                         content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertTrue(self.client.get('/api/monitor/clock').json()['on_air'])
        self.client.post('/api/monitor/onair', {'on_air': False},
                         content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        settings = MonitorSettings.load()
        self.assertEqual((settings.on_air_active, settings.on_air_since), (False, None))
        self.assertFalse(self.client.get('/api/monitor/clock').json()['on_air'])
