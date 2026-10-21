"""Gemeinsamer Zeitplan pro Bildschirm (Spec §2.2): Einschaltzeiten und Ansichten in einer Liste.

Alle Zeitpunkte sind fest vorgegeben; 2026-10-19 ist ein Montag.
"""
from datetime import datetime
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from ninja.errors import HttpError

from core.auth import KeycloakAuth
from users.models import Permission, UserProfile

from . import power
from .models import DisplayEvent, DisplayEventScreen, DisplayView, Screen
from .screen_schedule import active_row, is_on, merge_legacy, row_matches, split_legacy
from .validation import validate_screen_schedule

ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]


def r(days, start, end, view_id=None):
    return {'days': days, 'from': start, 'until': end, 'view_id': view_id}


def local(y, m, d, hh=0, mm=0):
    return timezone.make_aware(datetime(y, m, d, hh, mm), timezone.get_default_timezone())


def monday(hhmm):
    hh, mm = hhmm.split(':')
    return timezone.localtime(local(2026, 10, 19, int(hh), int(mm)))


class RowRulesTest(TestCase):

    def test_no_rows_always_on(self):
        self.assertTrue(is_on([], monday('03:00')))
        self.assertIsNone(active_row([], monday('03:00')))

    def test_adjacent_rows_stay_on(self):
        rows = [r([0], '07:00', '13:00', 5), r([0], '13:00', '18:00', None)]
        for t in ('12:59', '13:00', '13:01'):
            self.assertTrue(is_on(rows, monday(t)))
        self.assertEqual(active_row(rows, monday('12:59'))['view_id'], 5)
        self.assertIsNone(active_row(rows, monday('13:01'))['view_id'])

    def test_top_row_wins_on_overlap(self):
        rows = [r([0], '08:00', '10:00', 7), r([0], '07:00', '18:00', None)]
        self.assertIs(active_row(rows, monday('09:00')), rows[0])
        self.assertIs(active_row(rows, monday('11:00')), rows[1])

    def test_overnight_row(self):
        rows = [r([4], '22:00', '06:00', None)]  # Freitag 22:00 bis Samstag 06:00
        self.assertTrue(is_on(rows, timezone.localtime(local(2026, 10, 23, 23))))
        self.assertTrue(is_on(rows, timezone.localtime(local(2026, 10, 24, 5, 59))))
        self.assertFalse(is_on(rows, timezone.localtime(local(2026, 10, 24, 6, 1))))
        # der Teil nach 0 Uhr zählt zum Folgetag, nicht zum Freitag selbst
        self.assertFalse(is_on(rows, timezone.localtime(local(2026, 10, 23, 5))))
        self.assertTrue(row_matches(rows[0], 5, '06:00'))
        self.assertFalse(row_matches(rows[0], 4, '06:00'))

    def test_outside_rows_off(self):
        rows = [r([0, 1, 2, 3, 4], '07:00', '18:00', None)]
        self.assertFalse(is_on(rows, monday('06:59')))
        self.assertFalse(is_on(rows, monday('18:01')))
        self.assertFalse(is_on(rows, timezone.localtime(local(2026, 10, 25, 12))))  # Sonntag


@mock.patch('monitor.models.timezone.localtime', return_value=monday('09:00'))
class ActiveViewFromScheduleTest(TestCase):

    def setUp(self):
        self.default = DisplayView.objects.create(name='Standard', slug='standard', api_token='t-std')
        self.morning = DisplayView.objects.create(name='Morgen', slug='morgen', api_token='t-mor')
        self.screen = Screen.objects.create(name='Halle', slug='halle', default_view=self.default)

    def test_active_view_from_row(self, _now):
        self.screen.schedule = [r([0], '07:00', '10:00', self.morning.id), r(ALL_DAYS, '00:00', '23:59')]
        self.assertEqual(self.screen.get_active_view(), self.morning)

    def test_standard_row_uses_default_view(self, _now):
        self.screen.schedule = [r([0], '07:00', '10:00', None), r([0], '07:00', '12:00', self.morning.id)]
        self.assertEqual(self.screen.get_active_view(), self.default)

    def test_deleted_view_falls_back_to_default(self, _now):
        self.screen.schedule = [r([0], '07:00', '10:00', self.morning.id), r([0], '07:00', '18:00', None)]
        self.morning.deleted_at = timezone.now()
        self.morning.save()
        self.assertEqual(self.screen.get_active_view(), self.default)
        self.assertTrue(power.compute_power_state(self.screen, monday('09:00')))
        self.screen.schedule = [r([0], '07:00', '10:00', 999)]  # Ansicht gibt es gar nicht
        self.assertEqual(self.screen.get_active_view(), self.default)

    def test_override_and_event_still_win(self, _now):
        event_view = DisplayView.objects.create(name='Fest', slug='fest', api_token='t-fest')
        override = DisplayView.objects.create(name='Sofort', slug='sofort', api_token='t-sof')
        self.screen.schedule = [r([0], '07:00', '10:00', self.morning.id)]
        self.screen.save()
        event = DisplayEvent.objects.create(name='Fest', is_active=True)
        DisplayEventScreen.objects.create(event=event, screen=self.screen, view=event_view)
        self.assertEqual(self.screen.get_active_view(), event_view)
        self.screen.override_view = override
        self.assertEqual(self.screen.get_active_view(), override)


class PowerFromScheduleTest(TestCase):

    def test_compute_power_state_uses_union_of_rows(self):
        screen = Screen.objects.create(name='S', slug='s', off_during_holidays=False, schedule=[
            r([0], '07:00', '13:00', 5), r([0], '13:00', '18:00', None)])
        self.assertTrue(power.compute_power_state(screen, monday('13:00')))
        self.assertFalse(power.compute_power_state(screen, monday('18:01')))

    def test_next_on_time_uses_rows(self):
        screen = Screen(schedule=[r([1], '13:00', '15:00', 4), r([1], '07:30', '09:00', None)])
        self.assertEqual(power.next_on_time(screen, local(2026, 10, 19, 15)), local(2026, 10, 20, 7, 30))


class MergeLegacyTest(TestCase):

    def test_merge_legacy_clips_to_power(self):
        power_rows = [{'days': [0, 1, 2, 3, 4], 'from': '07:00', 'until': '18:00'}]
        view_rows = [{'view_id': 3, 'days': [0], 'from': '06:00', 'until': '09:00'}]
        self.assertEqual(merge_legacy(view_rows, power_rows), [
            r([0], '07:00', '09:00', 3),
            r([0, 1, 2, 3, 4], '07:00', '18:00', None),
        ])

    def test_merge_legacy_groups_days_and_drops_empty_cuts(self):
        power_rows = [{'days': [0, 1], 'from': '07:00', 'until': '18:00'},
                      {'days': [2], 'from': '12:00', 'until': '18:00'}]
        view_rows = [{'view_id': 3, 'days': [0, 1, 2, 6], 'from': '08:00', 'until': '10:00'},
                     {'view_id': 4, 'days': [0], 'from': '19:00', 'until': '20:00'}]
        self.assertEqual(merge_legacy(view_rows, power_rows), [
            r([0, 1], '08:00', '10:00', 3),
            r([0, 1], '07:00', '18:00', None),
            r([2], '12:00', '18:00', None),
        ])

    def test_merge_legacy_without_power(self):
        view_rows = [{'view_id': 3, 'days': [0], 'from': '06:00', 'until': '09:00'}]
        self.assertEqual(merge_legacy(view_rows, []), [
            {'view_id': 3, 'days': [0], 'from': '06:00', 'until': '09:00'},
            r(ALL_DAYS, '00:00', '23:59', None),
        ])
        self.assertEqual(merge_legacy([], []), [])

    def test_merge_legacy_only_power(self):
        self.assertEqual(merge_legacy([], [{'days': [0], 'from': '07:00', 'until': '18:00'}]),
                         [r([0], '07:00', '18:00', None)])

    def test_split_legacy(self):
        rows = [r([0], '07:00', '09:00', 3), r([0, 1], '07:00', '18:00', None)]
        self.assertEqual(split_legacy(rows), (
            [{'view_id': 3, 'days': [0], 'from': '07:00', 'until': '09:00'}],
            [{'days': [0, 1], 'from': '07:00', 'until': '18:00'}]))
        # ohne Standard-Zeile: die Zeilen selbst sind die Einschaltzeiten
        self.assertEqual(split_legacy([r([0], '07:00', '09:00', 3)]), (
            [{'view_id': 3, 'days': [0], 'from': '07:00', 'until': '09:00'}],
            [{'days': [0], 'from': '07:00', 'until': '09:00'}]))
        self.assertEqual(split_legacy([]), ([], []))


class ValidateScreenScheduleTest(TestCase):

    def setUp(self):
        self.view = DisplayView.objects.create(name='V', slug='v', api_token='t-v')
        self.gone = DisplayView.objects.create(name='Weg', slug='weg', api_token='t-weg',
                                               deleted_at=timezone.now())

    def message(self, rows):
        with self.assertRaises(HttpError) as ctx:
            validate_screen_schedule(rows)
        self.assertEqual(ctx.exception.status_code, 422)
        return str(ctx.exception)

    def test_validation_messages(self):
        ok = r([0], '07:00', '18:00', None)
        self.assertEqual(self.message([ok, r([], '07:00', '08:00')]),
                         'Zeile 2: Bitte mindestens einen Wochentag wählen.')
        self.assertEqual(self.message([ok, r([0], '07:00', '07:00')]), 'Zeile 2: Beginn und Ende sind gleich.')
        self.assertEqual(self.message([ok, r([0], '07:00', '08:00', self.gone.id)]),
                         'Zeile 2: Die gewählte Ansicht gibt es nicht mehr.')
        self.assertEqual(self.message([ok, r([0], '07:00', '08:00', 999)]),
                         'Zeile 2: Die gewählte Ansicht gibt es nicht mehr.')
        self.assertIn('Zeile 1', self.message([r([7], '07:00', '08:00')]))
        self.assertIn('Zeile 1', self.message([r([0], '7:00', '08:00')]))
        self.assertIn('Zeile 1', self.message([r([0], '07:00', '24:00')]))

    def test_valid_rows_are_normalized(self):
        rows = [{'days': [2, 0, 0], 'from': '22:00', 'until': '06:00', 'view_id': self.view.id, 'x': 1},
                {'days': [1], 'from': '07:00', 'until': '08:00'}]
        self.assertEqual(validate_screen_schedule(rows), [
            r([0, 2], '22:00', '06:00', self.view.id), r([1], '07:00', '08:00', None)])


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class ScheduleApiTest(TestCase):

    def setUp(self):
        self.view = DisplayView.objects.create(name='V', slug='v', api_token='t-v', is_default=True)
        self.screen = Screen.objects.create(name='Halle', slug='halle', default_view=self.view)
        self.profile = UserProfile.objects.create(keycloak_id='tester')
        auth = mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'})
        auth.start()
        self.addCleanup(auth.stop)
        push = mock.patch('monitor.consumers.push_power_to_screen')
        self.push = push.start()
        self.addCleanup(push.stop)

    def grant(self, *codes):
        for code in codes:
            perm, _ = Permission.objects.get_or_create(code=code, defaults={'name': code})
            self.profile.permissions.add(perm)

    def put(self, body):
        return self.client.put(f'/api/monitor/screens/{self.screen.id}', body,
                               content_type='application/json', HTTP_AUTHORIZATION='Bearer x')

    def test_schedule_requires_power_permission(self):
        self.grant('monitor.view', 'monitor.setup')
        self.assertEqual(self.put({'schedule': [r([0], '07:00', '18:00')]}).status_code, 403)
        self.screen.refresh_from_db()
        self.assertEqual(self.screen.schedule, [])

    def test_schedule_saves_and_pushes_power(self):
        self.grant('monitor.view', 'monitor.power')
        res = self.put({'schedule': [r([0], '07:00', '09:00', self.view.id), r([0, 1], '07:00', '18:00')]})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertNotIn('power_schedule', res.json())
        self.push.assert_called_once_with('halle')
        power_res = self.client.get('/api/monitor/screen/power', {'slug': 'halle'}).json()
        self.assertEqual(power_res['power_schedule'], [{'days': [0, 1], 'from': '07:00', 'until': '18:00'}])
        legacy = self.client.get('/api/monitor/bildschirm/power', {'slug': 'halle'}).json()
        self.assertEqual(legacy['power_zeitplan'], power_res['power_schedule'])

    def test_schedule_validation_error(self):
        self.grant('monitor.view', 'monitor.power')
        res = self.put({'schedule': [r([], '07:00', '18:00')]})
        self.assertEqual(res.status_code, 422)
        self.assertEqual(res.json()['detail'], 'Zeile 1: Bitte mindestens einen Wochentag wählen.')
        self.push.assert_not_called()
