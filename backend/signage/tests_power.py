"""Power-Regel (Spec §3.2), "bis Tagesende aus", Ferien, Notfall-Push (Task 4).

Alle Zeitpunkte sind fest vorgegeben; kein Test hängt vom echten Datum ab.
2026-10-19 ist ein Montag.
"""
from datetime import date, datetime, timedelta, timezone as dt_timezone
from unittest import mock

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from core.auth import KeycloakAuth
from signage.api import screens as api_screens, settings as api_settings
from . import power
from .models import EmergencyTemplate, HolidayPeriod, MonitorSettings, Screen
from .schemas import MonitorSettingsUpdateSchema, ScreenUpdateSchema

WEEKDAYS = [0, 1, 2, 3, 4]
OFFICE_HOURS = [{'days': WEEKDAYS, 'from': '07:00', 'until': '17:00'}]


def local(y, m, d, hh=0, mm=0):
    return timezone.make_aware(datetime(y, m, d, hh, mm), timezone.get_default_timezone())


MONDAY_10 = local(2026, 10, 19, 10)


class ComputePowerStateTest(TestCase):

    def screen(self, **kwargs):
        kwargs.setdefault('schedule', OFFICE_HOURS)
        return Screen.objects.create(name='S', slug='s', **kwargs)

    def test_emergency_forces_on(self):
        screen = self.screen(power_mode='manual_off')
        settings = MonitorSettings.load()
        settings.emergency_active = True
        settings.save()
        self.assertTrue(power.compute_power_state(screen, MONDAY_10))

    def test_order_manual_before_off_until(self):
        screen = self.screen(power_mode='manual_on', off_until=MONDAY_10 + timedelta(hours=5))
        self.assertTrue(power.compute_power_state(screen, MONDAY_10))

    def test_off_until_future_is_off(self):
        screen = self.screen(off_until=MONDAY_10 + timedelta(hours=1))
        self.assertFalse(power.compute_power_state(screen, MONDAY_10))
        # abgelaufen: wieder Zeitplan
        self.assertTrue(power.compute_power_state(screen, MONDAY_10 + timedelta(hours=2)))

    def test_exception_before_holiday(self):
        HolidayPeriod.objects.create(name='Herbstferien', start_date=date(2026, 10, 19),
                                     end_date=date(2026, 10, 30))
        screen = self.screen(power_exceptions=[
            {'from_date': '2026-10-19', 'until_date': '2026-10-19', 'from': '08:00', 'until': '12:00', 'note': ''}])
        self.assertTrue(power.compute_power_state(screen, MONDAY_10))
        self.assertFalse(power.compute_power_state(screen, local(2026, 10, 20, 10)))

    def test_holiday_period_off_only_if_flag(self):
        HolidayPeriod.objects.create(name='Herbstferien', start_date=date(2026, 10, 19),
                                     end_date=date(2026, 10, 30))
        self.assertFalse(power.compute_power_state(self.screen(), MONDAY_10))
        other = Screen.objects.create(name='T', slug='t', schedule=OFFICE_HOURS, off_during_holidays=False)
        self.assertTrue(power.compute_power_state(other, MONDAY_10))

    def test_holiday_end_date_inclusive(self):
        HolidayPeriod.objects.create(name='Tag', start_date=date(2026, 10, 16), end_date=date(2026, 10, 19))
        self.assertTrue(power.is_holiday(date(2026, 10, 19)))
        self.assertFalse(power.is_holiday(date(2026, 10, 20)))

    def test_empty_schedule_always_on(self):
        screen = self.screen(schedule=[])
        self.assertTrue(power.compute_power_state(screen, local(2026, 10, 18, 3)))

    def test_schedule_uses_local_time(self):
        screen = self.screen()
        # 06:30 UTC = 08:30 Berlin (Sommerzeit bis 25.10.)
        utc_time = datetime(2026, 10, 19, 6, 30, tzinfo=dt_timezone.utc)
        self.assertTrue(power.compute_power_state(screen, utc_time))

    def test_get_power_state_delegates(self):
        screen = self.screen(power_mode='manual_off')
        self.assertFalse(screen.get_power_state(MONDAY_10))


class NextOnTimeTest(TestCase):

    def test_next_on_time_same_week(self):
        screen = Screen(schedule=OFFICE_HOURS)
        self.assertEqual(power.next_on_time(screen, local(2026, 10, 19, 15)), local(2026, 10, 20, 7))

    def test_power_off_today_skips_days_without_window(self):
        screen = Screen(schedule=OFFICE_HOURS)
        self.assertEqual(power.next_on_time(screen, local(2026, 10, 23, 15)), local(2026, 10, 26, 7))

    def test_next_on_time_earliest_window_of_day(self):
        screen = Screen(schedule=[{'days': [1], 'from': '13:00', 'until': '15:00'},
                                        {'days': [1], 'from': '07:30', 'until': '09:00'}])
        self.assertEqual(power.next_on_time(screen, local(2026, 10, 19, 15)), local(2026, 10, 20, 7, 30))

    def test_next_on_time_without_schedule(self):
        screen = Screen(schedule=[])
        self.assertEqual(power.next_on_time(screen, local(2026, 10, 19, 15)), local(2026, 10, 20, 5))

    def test_next_on_time_schedule_without_days_falls_back(self):
        screen = Screen(schedule=[{'days': [], 'from': '07:00', 'until': '08:00'}])
        self.assertEqual(power.next_on_time(screen, local(2026, 10, 19, 15)), local(2026, 10, 20, 5))


def _auth():
    return mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'})


class PowerOffTodayEndpointTest(TestCase):

    def setUp(self):
        self.a = Screen.objects.create(name='A', slug='a', schedule=OFFICE_HOURS)
        self.b = Screen.objects.create(name='B', slug='b', schedule=[])
        patches = [_auth(), mock.patch('signage.api.setup._require_perm'),
                   mock.patch('signage.api.setup.push_power_to_all'),
                   mock.patch('signage.api.setup.timezone.now', return_value=local(2026, 10, 19, 15))]
        mocks = [p.start() for p in patches]
        self.push = mocks[2]
        for p in patches:
            self.addCleanup(p.stop)

    def test_power_off_today_endpoint_all_and_subset(self):
        r = self.client.post('/api/monitor/screens/power-off-today', {}, content_type='application/json')
        self.assertEqual(r.status_code, 200, r.content)
        self.a.refresh_from_db()
        self.b.refresh_from_db()
        self.assertEqual(self.a.off_until, local(2026, 10, 20, 7))
        self.assertEqual(self.b.off_until, local(2026, 10, 20, 5))
        self.assertEqual(set(r.json()['off_until']), {str(self.a.id), str(self.b.id)})
        self.push.assert_called()

        r = self.client.delete('/api/monitor/screens/power-off-today', {}, content_type='application/json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Screen.objects.filter(off_until__isnull=False).count(), 0)

        r = self.client.post('/api/monitor/screens/power-off-today', {'screen_ids': [self.a.id]},
                             content_type='application/json')
        self.assertEqual(set(r.json()['off_until']), {str(self.a.id)})
        self.b.refresh_from_db()
        self.assertIsNone(self.b.off_until)

        self.client.post('/api/monitor/screens/power-off-today', {'screen_ids': [self.b.id]},
                         content_type='application/json')
        self.client.delete('/api/monitor/screens/power-off-today', {'screen_ids': [self.a.id]},
                           content_type='application/json')
        self.a.refresh_from_db()
        self.b.refresh_from_db()
        self.assertIsNone(self.a.off_until)
        self.assertIsNotNone(self.b.off_until)

    def test_existing_screen_routes_still_resolve(self):
        with mock.patch('signage.api.screens._require_perm'):
            r = self.client.delete(f'/api/monitor/screens/{self.b.id}')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(Screen.objects.filter(id=self.b.id).exists())


class HolidayAndTemplateCrudTest(TestCase):

    def setUp(self):
        patches = [_auth(), mock.patch('signage.api.setup._require_perm'),
                   mock.patch('signage.api.setup.push_power_to_all')]
        mocks = [p.start() for p in patches]
        self.guard, self.push = mocks[1], mocks[2]
        for p in patches:
            self.addCleanup(p.stop)

    def test_holiday_crud_pushes_power(self):
        body = {'name': 'Herbstferien', 'start_date': '2026-10-19', 'end_date': '2026-10-30'}
        r = self.client.post('/api/monitor/holidays', body, content_type='application/json')
        self.assertEqual(r.status_code, 200, r.content)
        hid = r.json()['id']
        self.assertEqual(self.guard.call_args.args[1], 'signage.power')
        self.assertEqual(len(self.client.get('/api/monitor/holidays').json()), 1)
        body['name'] = 'Herbst'
        r = self.client.put(f'/api/monitor/holidays/{hid}', body, content_type='application/json')
        self.assertEqual(r.json()['name'], 'Herbst')
        self.assertEqual(self.client.delete(f'/api/monitor/holidays/{hid}').status_code, 200)
        self.assertFalse(HolidayPeriod.objects.exists())
        self.assertEqual(self.push.call_count, 3)

    def test_holiday_rejects_end_before_start(self):
        body = {'name': 'X', 'start_date': '2026-10-30', 'end_date': '2026-10-19'}
        r = self.client.post('/api/monitor/holidays', body, content_type='application/json')
        self.assertEqual(r.status_code, 422)
        self.assertFalse(HolidayPeriod.objects.exists())

    def test_emergency_template_crud(self):
        r = self.client.post('/api/monitor/emergency-templates',
                             {'title': 'Feueralarm', 'text': 'Gebäude verlassen'}, content_type='application/json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.guard.call_args.args[1], 'signage.emergency')
        tid = r.json()['id']
        r = self.client.put(f'/api/monitor/emergency-templates/{tid}',
                            {'title': 'Feueralarm', 'text': 'Gebäude verlassen', 'note': 'Sammelplatz Hof',
                             'sort_order': 2}, content_type='application/json')
        self.assertEqual(r.json()['note'], 'Sammelplatz Hof')
        self.assertEqual(len(self.client.get('/api/monitor/emergency-templates').json()), 1)
        self.client.delete(f'/api/monitor/emergency-templates/{tid}')
        self.assertFalse(EmergencyTemplate.objects.exists())
        self.push.assert_not_called()


class EmergencyEndpointTest(TestCase):

    def test_emergency_endpoint_pushes_power(self):
        with _auth(), mock.patch('signage.api.settings._require_perm'), \
                mock.patch('signage.api.settings.push_power_to_all') as push:
            r = self.client.post('/api/monitor/emergency',
                                 {'active': True, 'text': 'Feueralarm', 'note': 'Sammelplatz Hof'},
                                 content_type='application/json')
            self.assertEqual(r.status_code, 200)
            push.assert_called_once_with()
            s = MonitorSettings.load()
            self.assertEqual((s.emergency_active, s.emergency_text, s.emergency_note),
                             (True, 'Feueralarm', 'Sammelplatz Hof'))
            self.assertIsNotNone(s.emergency_since)

            self.client.post('/api/monitor/emergency', {'active': False}, content_type='application/json')
            self.assertEqual(push.call_count, 2)
            s.refresh_from_db()
            self.assertEqual((s.emergency_active, s.emergency_since), (False, None))

    def test_legacy_emergency_pushes_power_with_empty_note(self):
        from .models import DisplayView
        DisplayView.objects.create(name='V', slug='v', api_token='tok')
        MonitorSettings.objects.update_or_create(pk=1, defaults={'emergency_note': 'alt'})
        with mock.patch('signage.api.settings.push_power_to_all') as push:
            r = self.client.post('/api/monitor/notfall', {'aktiv': True, 'text': 'Probe'},
                                 content_type='application/json', HTTP_X_MONITOR_TOKEN='tok')
        self.assertEqual(r.status_code, 200)
        push.assert_called_once_with()
        self.assertEqual(MonitorSettings.load().emergency_note, '')


class PushPowerToAllTest(TestCase):

    def test_push_power_to_all_hits_every_screen(self):
        from . import consumers
        Screen.objects.create(name='A', slug='a')
        Screen.objects.create(name='B', slug='b')
        with mock.patch.object(consumers, 'push_power_to_screen') as push:
            consumers.push_power_to_all()
        self.assertEqual(sorted(c.args[0] for c in push.call_args_list), ['a', 'b'])

    def test_push_failure_does_not_raise(self):
        from . import consumers
        Screen.objects.create(name='A', slug='a')
        with mock.patch.object(consumers, 'push_power_to_screen', side_effect=ConnectionError), \
                self.assertLogs('signage.consumers', 'ERROR'):
            consumers.push_power_to_all()


class ScreenPowerPushTest(TestCase):

    def test_push_failure_after_save_is_logged_not_500(self):
        """Final-Review 4: der gespeicherte Strommodus gilt, auch wenn der Push scheitert."""
        screen = Screen.objects.create(name='A', slug='a')
        with _auth(), mock.patch('signage.api.screens._require_perm'), \
                mock.patch('signage.consumers.push_power_to_screen', side_effect=ConnectionError), \
                self.assertLogs('signage.api.screens', 'ERROR'):
            r = self.client.put(f'/api/monitor/screens/{screen.id}', {'power_mode': 'manual_off'},
                                content_type='application/json', HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200, r.content)
        screen.refresh_from_db()
        self.assertEqual(screen.power_mode, 'manual_off')


class _Denied(Exception):
    pass


class SettingsPermissionSplitTest(SimpleTestCase):
    """PUT /settings: On-Air-Darstellung braucht onair, alles andere setup (Spec §4.5)."""

    def required(self, **fields):
        payload = MonitorSettingsUpdateSchema(**fields)
        with mock.patch.object(api_settings, '_require_perm', side_effect=_Denied) as guard:
            with self.assertRaises(_Denied):
                api_settings.update_settings(object(), payload)
        return guard.call_args.args[1]

    def test_on_air_fields_need_onair(self):
        self.assertEqual(self.required(on_air_text='LIVE', on_air_animation='blink', on_air_show_clock=False),
                         'signage.onair')

    def test_other_fields_need_setup(self):
        self.assertEqual(self.required(weather_api_key='k'), 'signage.setup')
        self.assertEqual(self.required(weather_api_key='k', on_air_text='LIVE'), 'signage.setup')
        self.assertEqual(self.required(), 'signage.setup')


class FreshImportTest(SimpleTestCase):
    """signage.api.setup muss sich in einem frischen Prozess als erstes Modul importieren lassen."""

    def test_api_setup_imports_standalone(self):
        import subprocess
        import sys
        from pathlib import Path
        code = 'import django; django.setup(); import signage.api.setup'
        env = {**__import__('os').environ, 'DJANGO_SETTINGS_MODULE': 'core.settings'}
        result = subprocess.run([sys.executable, '-c', code], cwd=Path(__file__).resolve().parent.parent,
                                env=env, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)


class ScreenUpdatePermissionSplitTest(SimpleTestCase):
    """PUT /screens/{id}: Power-Felder brauchen power, alles andere setup (Spec §3.5)."""

    def required(self, **fields):
        payload = ScreenUpdateSchema(**fields)
        with mock.patch.object(api_screens, '_require_perm') as guard, \
                mock.patch.object(api_screens, 'get_object_or_404', side_effect=_Denied):
            with self.assertRaises(_Denied):
                api_screens.update_screen(object(), 1, payload)
        return [c.args[1] for c in guard.call_args_list]

    def test_power_only_needs_power(self):
        self.assertEqual(self.required(power_mode='manual_off', schedule=[], power_exceptions=[],
                                       off_during_holidays=False, off_until=None), ['signage.power'])

    def test_setup_only_needs_setup(self):
        self.assertEqual(self.required(name='Halle'), ['signage.setup'])
        self.assertEqual(self.required(schedule=[]), ['signage.power'])
        self.assertEqual(self.required(), ['signage.setup'])

    def test_mixed_needs_both(self):
        self.assertEqual(self.required(name='Halle', power_mode='auto'), ['signage.setup', 'signage.power'])

    def test_override_needs_setup(self):
        # Andere Ansicht vorübergehend gehört zu Bildschirme (setup), nicht zu Ein- und Ausschalten
        self.assertEqual(self.required(override_view_id=3, override_until=None), ['signage.setup'])
        self.assertEqual(self.required(override_view_id=None, override_until=None), ['signage.setup'])
