from datetime import date, datetime, time, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

from django.test import TestCase

from core.auth import KeycloakAuth
from users.models import Permission, UserProfile

from . import display
from .color_scheme import resolve
from .models import DisplayView, MonitorSettings, Screen
from .sun import sun_times

BERLIN = ZoneInfo('Europe/Berlin')


def midpoint(a, b):
    return a + (b - a) / 2


def at(y, m, d, hh, mm):
    return datetime(y, m, d, hh, mm, tzinfo=BERLIN)


class SunTimesTest(TestCase):

    def assertAlmostMinutes(self, moment, expected, tolerance):
        minutes = moment.hour * 60 + moment.minute + moment.second / 60
        target = expected.hour * 60 + expected.minute
        self.assertLessEqual(abs(minutes - target), tolerance, f'{moment:%H:%M} statt {expected:%H:%M}')

    def test_sun_midsummer(self):
        rise, set_ = sun_times(date(2026, 6, 21))
        self.assertTrue(timedelta(hours=17) <= set_ - rise <= timedelta(hours=17, minutes=35))
        self.assertAlmostMinutes(midpoint(rise, set_), time(13, 19), tolerance=5)   # CEST

    def test_sun_midwinter(self):
        rise, set_ = sun_times(date(2026, 12, 21))
        self.assertTrue(timedelta(hours=7) <= set_ - rise <= timedelta(hours=7, minutes=30))
        self.assertAlmostMinutes(midpoint(rise, set_), time(12, 15), tolerance=5)   # CET

    def test_dst_day_local_times(self):
        rise, set_ = sun_times(date(2026, 10, 25))
        for moment in (rise, set_):
            self.assertEqual(moment.tzinfo.key, 'Europe/Berlin')
            self.assertEqual(moment.utcoffset(), timedelta(hours=1))
            self.assertEqual(moment.date(), date(2026, 10, 25))
        self.assertTrue(time(7, 0) <= rise.time() <= time(7, 30), rise)


class ResolveTest(TestCase):
    def setUp(self):
        self.settings = MonitorSettings.load()

    def test_defaults(self):
        self.assertEqual((self.settings.color_scheme, self.settings.light_from, self.settings.light_until),
                         ('light', '07:00', '18:00'))
        self.assertEqual(Screen(name='A', slug='a').color_scheme, 'inherit')
        self.assertEqual(resolve(None, self.settings, at(2026, 10, 21, 23, 0)), 'light')

    def test_fixed_schemes(self):
        self.settings.color_scheme = 'dark'
        self.assertEqual(resolve(None, self.settings, at(2026, 10, 21, 12, 0)), 'dark')

    def test_daylight_resolve(self):
        self.settings.color_scheme = 'daylight'
        rise, set_ = sun_times(date(2026, 10, 21))
        minute = timedelta(minutes=1)
        self.assertEqual(resolve(None, self.settings, rise - minute), 'dark')
        self.assertEqual(resolve(None, self.settings, rise + minute), 'light')
        self.assertEqual(resolve(None, self.settings, set_ - minute), 'light')
        self.assertEqual(resolve(None, self.settings, set_ + minute), 'dark')

    def test_schedule_resolve(self):
        self.settings.color_scheme = 'schedule'
        expected = {(6, 59): 'dark', (7, 0): 'light', (18, 0): 'light', (18, 1): 'dark'}
        for (hh, mm), scheme in expected.items():
            with self.subTest(time=f'{hh:02d}:{mm:02d}'):
                self.assertEqual(resolve(None, self.settings, at(2026, 10, 21, hh, mm)), scheme)

    def test_screen_exception_wins(self):
        self.settings.color_scheme = 'dark'
        screen = Screen(name='A', slug='a', color_scheme='light')
        self.assertEqual(resolve(screen, self.settings, at(2026, 10, 21, 23, 0)), 'light')
        self.settings.color_scheme = 'light'
        screen.color_scheme = 'dark'
        self.assertEqual(resolve(screen, self.settings, at(2026, 10, 21, 12, 0)), 'dark')
        screen.color_scheme = 'inherit'
        self.assertEqual(resolve(screen, self.settings, at(2026, 10, 21, 12, 0)), 'light')


class LayoutTest(TestCase):
    def test_effective_layout(self):
        for kind, layout in [('info', 'normal'), ('media', 'normal'), ('departures', 'wide'),
                             ('substitutions', 'wide'), ('split', 'wide'), ('rotation', 'wide')]:
            with self.subTest(kind=kind):
                self.assertEqual(DisplayView(kind=kind).effective_layout(), layout)
        self.assertEqual(DisplayView(kind='info', layout='wide').effective_layout(), 'wide')
        self.assertEqual(DisplayView(kind='departures', layout='normal').effective_layout(), 'normal')


class PayloadTest(TestCase):
    def test_payload_has_scheme_and_layout(self):
        view = DisplayView.objects.create(name='S', slug='s', kind='substitutions', is_default=False,
                                          webuntis_url='https://example.org/untis')
        MonitorSettings.objects.filter(pk=MonitorSettings.load().pk).update(color_scheme='dark')
        screen = Screen.objects.create(name='Halle', slug='halle', color_scheme='light')
        now = at(2026, 10, 21, 12, 0)
        with mock.patch.object(display, '_view_data', return_value=None):
            payload = display.build_payload(screen, view, key_ok=True, now=now)
            self.assertEqual(payload['view']['layout'], 'wide')
            self.assertNotIn('style', payload['view'])
            self.assertEqual((payload['scheme'], payload['screen']['scheme']), ('light', 'light'))
            preview = display.build_payload(None, view, key_ok=True, now=now, preview=True)
            self.assertEqual((preview['scheme'], preview['screen']), ('dark', None))
            unknown = display.build_payload(None, None, key_ok=False, now=now)
            self.assertEqual(unknown['scheme'], 'dark')


class ColorSchemeApiTest(TestCase):
    def setUp(self):
        self.profile = UserProfile.objects.create(keycloak_id='tester')
        auth = mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'})
        auth.start()
        self.addCleanup(auth.stop)

    def grant(self, *codes):
        for code in codes:
            perm, _ = Permission.objects.get_or_create(code=code, defaults={'name': code})
            self.profile.permissions.add(perm)

    def put(self, path, body):
        return self.client.put(f'/api/monitor{path}', body, content_type='application/json',
                               HTTP_AUTHORIZATION='Bearer x')

    def test_get_settings_has_scheme_and_daylight_today(self):
        self.grant('signage.view')
        r = self.client.get('/api/monitor/settings', HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual((data['color_scheme'], data['light_from'], data['light_until']),
                         ('light', '07:00', '18:00'))
        self.assertEqual(set(data['daylight_today']), {'sunrise', 'sunset'})
        for value in data['daylight_today'].values():
            self.assertRegex(value, r'^\d\d:\d\d$')

    def test_settings_scheme_needs_setup(self):
        self.grant('signage.view', 'signage.onair')
        self.assertEqual(self.put('/settings', {'color_scheme': 'dark'}).status_code, 403)
        self.grant('signage.setup')
        r = self.put('/settings', {'color_scheme': 'schedule', 'light_from': '06:30', 'light_until': '19:00'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['color_scheme'], r.json()['light_from'], r.json()['light_until']),
                         ('schedule', '06:30', '19:00'))

    def test_settings_light_times_validated(self):
        self.grant('signage.view', 'signage.setup')
        for body in ({'light_from': '18:00', 'light_until': '07:00'}, {'light_from': '19:00'},
                     {'light_until': '07:00'}):
            with self.subTest(body=body):
                r = self.put('/settings', body)
                self.assertEqual(r.status_code, 422, r.content)
                self.assertEqual(r.json()['detail'], 'Die helle Zeit muss vor ihrem Ende beginnen.')
        r = self.put('/settings', {'light_from': '7 Uhr'})
        self.assertEqual(r.status_code, 422)
        self.assertIn('HH:MM', r.json()['detail'])
        self.assertEqual(self.put('/settings', {'color_scheme': 'bunt'}).status_code, 422)
        settings = MonitorSettings.load()
        self.assertEqual((settings.color_scheme, settings.light_from, settings.light_until),
                         ('light', '07:00', '18:00'))

    def test_screen_scheme_needs_setup(self):
        screen = Screen.objects.create(name='Halle', slug='halle')
        self.grant('signage.view', 'signage.power', 'signage.devices')
        self.assertEqual(self.put(f'/screens/{screen.id}', {'color_scheme': 'dark'}).status_code, 403)
        self.grant('signage.setup')
        r = self.put(f'/screens/{screen.id}', {'color_scheme': 'dark'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['color_scheme'], 'dark')
        self.assertEqual(self.put(f'/screens/{screen.id}', {'color_scheme': 'bunt'}).status_code, 422)

    def test_screen_scheme_null_is_ignored(self):
        screen = Screen.objects.create(name='Halle', slug='halle', color_scheme='dark')
        self.grant('signage.view', 'signage.setup')
        r = self.put(f'/screens/{screen.id}', {'color_scheme': None, 'name': 'Aula'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['color_scheme'], 'dark')
        screen.refresh_from_db()
        self.assertEqual((screen.name, screen.color_scheme), ('Aula', 'dark'))
