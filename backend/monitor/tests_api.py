from unittest import mock

from django.test import TestCase, override_settings

from core.auth import KeycloakAuth
from users.models import Permission, UserProfile

from .models import DisplayView, MonitorSettings, Screen
from .tests_display import SUBSTITUTIONS


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


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class RegenerateScreenKeyTest(TestCase):
    """POST /screens/{id}/regenerate-key (Spec §4.5): neuer access_key, Recht setup."""

    def setUp(self):
        self.view = DisplayView.objects.create(name='Vertretung', slug='vertretung', kind='substitutions',
                                               webuntis_url='https://example.org/untis')
        self.screen = Screen.objects.create(name='Halle', slug='halle', default_view=self.view)
        self.profile = UserProfile.objects.create(keycloak_id='tester')
        auth = mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'})
        auth.start()
        self.addCleanup(auth.stop)

    def grant(self, code):
        perm, _ = Permission.objects.get_or_create(code=code, defaults={'name': code})
        self.profile.permissions.add(perm)

    def regenerate(self):
        return self.client.post(f'/api/monitor/screens/{self.screen.id}/regenerate-key',
                                HTTP_AUTHORIZATION='Bearer x')

    def test_requires_setup(self):
        self.grant('monitor.view')
        self.grant('monitor.power')
        old = self.screen.access_key
        self.assertEqual(self.regenerate().status_code, 403)
        self.screen.refresh_from_db()
        self.assertEqual(self.screen.access_key, old)

    def test_unknown_screen_404(self):
        self.grant('monitor.setup')
        r = self.client.post('/api/monitor/screens/9999/regenerate-key', HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 404)

    def test_key_changes_and_is_returned(self):
        self.grant('monitor.setup')
        old = self.screen.access_key
        with mock.patch('monitor.api.push.notify_changed') as notify, \
                self.captureOnCommitCallbacks(execute=True):
            r = self.regenerate()
        self.assertEqual(r.status_code, 200)
        self.screen.refresh_from_db()
        self.assertNotEqual(self.screen.access_key, old)
        self.assertEqual(len(self.screen.access_key), 32)
        self.assertEqual(r.json()['access_key'], self.screen.access_key)
        self.assertEqual(r.json()['id'], self.screen.id)
        notify.assert_called_once_with(['halle'])

    def test_old_key_loses_substitutions(self):
        self.grant('monitor.setup')
        old = self.screen.access_key
        self.regenerate()
        new = Screen.objects.get(id=self.screen.id).access_key
        with mock.patch('monitor.display.webuntis.get_substitutions', return_value=SUBSTITUTIONS):
            stale = self.client.get('/api/monitor/display', {'screen': 'halle', 'key': old}).json()
            fresh = self.client.get('/api/monitor/display', {'screen': 'halle', 'key': new}).json()
        self.assertEqual(stale['view']['data']['days'], [])
        self.assertEqual(len(fresh['view']['data']['days']), 2)
