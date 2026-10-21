from unittest import mock

from django.test import TestCase, override_settings

from core.auth import KeycloakAuth
from users.models import Permission, UserProfile

from .models import DisplayView, MonitorSettings, Screen
from .tests_display import configure_webuntis, fake_load_days


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
        configure_webuntis()
        with mock.patch('monitor.substitutions.untis_monitor.load_days', side_effect=fake_load_days):
            stale = self.client.get('/api/monitor/display', {'screen': 'halle', 'key': old}).json()
            fresh = self.client.get('/api/monitor/display', {'screen': 'halle', 'key': new}).json()
        self.assertEqual(stale['view']['data']['days'], [])
        self.assertEqual(len(fresh['view']['data']['days']), 2)


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class ScreenAccessKeyVisibilityTest(TestCase):
    """access_key gibt den Vertretungsplan frei: nur mit monitor.setup in Antworten (Review T16)."""

    def setUp(self):
        self.screen = Screen.objects.create(name='Halle', slug='halle')
        self.profile = UserProfile.objects.create(keycloak_id='tester')
        auth = mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'})
        auth.start()
        self.addCleanup(auth.stop)

    def grant(self, *codes):
        for code in codes:
            perm, _ = Permission.objects.get_or_create(code=code, defaults={'name': code})
            self.profile.permissions.add(perm)

    def list_keys(self):
        r = self.client.get('/api/monitor/screens', HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200)
        return [s['access_key'] for s in r.json()]

    def update(self, body):
        return self.client.put(f'/api/monitor/screens/{self.screen.id}', body,
                               content_type='application/json', HTTP_AUTHORIZATION='Bearer x')

    def test_view_only_gets_no_key(self):
        self.grant('monitor.view')
        self.assertEqual(self.list_keys(), [''])

    def test_power_only_update_response_has_no_key(self):
        self.grant('monitor.view', 'monitor.power')
        r = self.update({'power_mode': 'manual_off'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['access_key'], '')
        self.screen.refresh_from_db()
        self.assertEqual(self.screen.power_mode, 'manual_off')
        self.assertEqual(len(self.screen.access_key), 32)

    def test_setup_gets_key(self):
        self.grant('monitor.view', 'monitor.setup')
        self.assertEqual(self.list_keys(), [self.screen.access_key])
        self.assertEqual(self.update({'location': 'Foyer'}).json()['access_key'], self.screen.access_key)


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class SettingsSecretsTest(TestCase):
    """Zugangsdaten sind write-only: GET/PUT liefern sie nie aus, nur ob sie gesetzt sind (Ruling R22)."""

    def setUp(self):
        self.profile = UserProfile.objects.create(keycloak_id='tester')
        auth = mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'})
        auth.start()
        self.addCleanup(auth.stop)
        settings = MonitorSettings.load()
        settings.webuntis_password = 'geheim'
        settings.weather_api_key = 'weather-key'
        settings.webuntis_username = 'lehrer'
        settings.save()

    def grant(self, *codes):
        for code in codes:
            perm, _ = Permission.objects.get_or_create(code=code, defaults={'name': code})
            self.profile.permissions.add(perm)

    def get(self):
        r = self.client.get('/api/monitor/settings', HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200)
        return r.json()

    def put(self, body):
        return self.client.put('/api/monitor/settings', body, content_type='application/json',
                               HTTP_AUTHORIZATION='Bearer x')

    def test_get_hides_secrets_and_reports_set(self):
        self.grant('monitor.view')
        data = self.get()
        self.assertEqual((data['webuntis_password'], data['weather_api_key']), ('', ''))
        self.assertIs(data['webuntis_password_set'], True)
        self.assertIs(data['weather_api_key_set'], True)
        self.assertEqual(data['webuntis_username'], 'lehrer')
        self.assertNotIn('geheim', str(data))

    def test_get_reports_unset(self):
        self.grant('monitor.view')
        MonitorSettings.objects.update(webuntis_password='', weather_api_key='')
        data = self.get()
        self.assertIs(data['webuntis_password_set'], False)
        self.assertIs(data['weather_api_key_set'], False)

    def test_put_empty_or_missing_secret_keeps_it(self):
        self.grant('monitor.view', 'monitor.setup')
        r = self.put({'webuntis_password': '', 'webuntis_server': 'neu.webuntis.com'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['webuntis_password'], '')
        self.assertIs(r.json()['webuntis_password_set'], True)
        self.assertNotIn('weather-key', r.content.decode())
        settings = MonitorSettings.load()
        self.assertEqual((settings.webuntis_password, settings.weather_api_key), ('geheim', 'weather-key'))
        self.assertEqual(settings.webuntis_server, 'neu.webuntis.com')

    def test_put_new_secret_is_stored_not_returned(self):
        self.grant('monitor.view', 'monitor.setup')
        r = self.put({'webuntis_password': 'neu', 'weather_api_key': 'k2'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()['webuntis_password'], r.json()['weather_api_key']), ('', ''))
        settings = MonitorSettings.load()
        self.assertEqual((settings.webuntis_password, settings.weather_api_key), ('neu', 'k2'))

    def test_put_clear_flags_empty_the_secret(self):
        self.grant('monitor.view', 'monitor.setup')
        r = self.put({'webuntis_password_clear': True, 'weather_api_key_clear': True})
        self.assertEqual(r.status_code, 200)
        self.assertIs(r.json()['webuntis_password_set'], False)
        self.assertIs(r.json()['weather_api_key_set'], False)
        settings = MonitorSettings.load()
        self.assertEqual((settings.webuntis_password, settings.weather_api_key), ('', ''))

    def test_clear_needs_setup(self):
        self.grant('monitor.view', 'monitor.onair')
        self.assertEqual(self.put({'webuntis_password_clear': True}).status_code, 403)
        self.assertEqual(MonitorSettings.load().webuntis_password, 'geheim')

    def test_on_air_only_update_response_hides_secrets(self):
        self.grant('monitor.view', 'monitor.onair')
        r = self.put({'on_air_text': 'LIVE'})
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('geheim', r.content.decode())
        self.assertNotIn('weather-key', r.content.decode())


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class ViewSecretsTest(TestCase):
    """GET /config: alter Wetter-Schlüssel der Ansicht nie, api_token (ATEM) nur mit monitor.setup."""

    def setUp(self):
        self.view = DisplayView.objects.create(name='Halle', slug='halle', weather_api_key='alt-key',
                                               api_token='t' * 32)
        self.profile = UserProfile.objects.create(keycloak_id='tester')
        auth = mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'})
        auth.start()
        self.addCleanup(auth.stop)

    def grant(self, *codes):
        for code in codes:
            perm, _ = Permission.objects.get_or_create(code=code, defaults={'name': code})
            self.profile.permissions.add(perm)

    def config(self):
        r = self.client.get('/api/monitor/config', {'view_id': self.view.id}, HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200)
        return r.json()

    def test_view_only_gets_neither_secret(self):
        self.grant('monitor.view')
        data = self.config()
        self.assertEqual((data['weather_api_key'], data['api_token']), ('', ''))
        self.assertIs(data['weather_api_key_set'], True)

    def test_setup_gets_token_but_not_weather_key(self):
        self.grant('monitor.view', 'monitor.setup')
        data = self.config()
        self.assertEqual((data['weather_api_key'], data['api_token']), ('', 't' * 32))

    def test_put_empty_weather_key_keeps_it_and_restore_keeps_it(self):
        self.grant('monitor.view', 'monitor.setup')
        r = self.client.put(f'/api/monitor/config?view_id={self.view.id}', {'weather_api_key': '', 'name': 'Neu'},
                            content_type='application/json', HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['weather_api_key'], '')
        self.view.refresh_from_db()
        self.assertEqual((self.view.weather_api_key, self.view.name), ('alt-key', 'Neu'))
        version = self.view.versions.first()
        self.assertNotIn('weather_api_key', version.data)
        r = self.client.post(f'/api/monitor/config/restore?version_id={version.id}',
                             HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200)
        self.view.refresh_from_db()
        self.assertEqual((self.view.weather_api_key, self.view.name), ('alt-key', 'Halle'))


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class ExamDefaultSideTest(TestCase):
    """Klausur und Vorlage stehen im geteilten Bild standardmäßig rechts (Modell und Spec)."""

    def setUp(self):
        auth = mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'admin'})
        auth.start()
        self.addCleanup(auth.stop)
        admin = mock.patch('monitor.permissions.is_admin', return_value=True)
        admin.start()
        self.addCleanup(admin.stop)

    def post(self, path, body):
        r = self.client.post(path, body, content_type='application/json', HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_exam_and_template_default_right(self):
        exam = self.post('/api/monitor/exams', {'active_from': '2026-10-20T08:00:00+02:00',
                                                'active_until': '2026-10-20T10:00:00+02:00'})
        self.assertEqual(exam['split_side'], 'right')
        self.assertEqual(self.post('/api/monitor/exam-templates', {'name': 'Abi'})['split_side'], 'right')
