import hashlib
import json
from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from ninja.errors import HttpError

from .models import DisplayView, Screen, DisplayEvent, DisplayEventScreen
from .api import _validate_view_data, _validate_exam_data
from . import oepnv


class ActiveViewPriorityTest(TestCase):
    """Reihenfolge: Sofort-Override > aktives Event > Zeitplan > Default."""

    def setUp(self):
        self.default = DisplayView.objects.create(name='Default', slug='default')
        self.scheduled = DisplayView.objects.create(name='Zeit', slug='zeit')
        self.event = DisplayView.objects.create(name='Event', slug='event')
        self.override = DisplayView.objects.create(name='Override', slug='override')
        self.screen = Screen.objects.create(name='BS', slug='bs', default_view=self.default)

    def _always_schedule(self):
        self.screen.schedule = [{'profil_id': self.scheduled.id, 'tage': list(range(7)), 'von': '00:00', 'bis': '23:59'}]
        self.screen.save()

    def _active_event(self):
        ev = DisplayEvent.objects.create(name='E', is_active=True)
        DisplayEventScreen.objects.create(event=ev, screen=self.screen, view=self.event)

    def test_default_when_nothing_applies(self):
        self.assertEqual(self.screen.get_active_view(), self.default)

    def test_schedule_beats_default(self):
        self._always_schedule()
        self.assertEqual(self.screen.get_active_view(), self.scheduled)

    def test_event_beats_schedule(self):
        self._always_schedule()
        self._active_event()
        self.assertEqual(self.screen.get_active_view(), self.event)

    def test_override_beats_everything(self):
        self._always_schedule()
        self._active_event()
        self.screen.override_view = self.override
        self.screen.save()
        self.assertEqual(self.screen.get_active_view(), self.override)

    def test_expired_override_ignored(self):
        self.screen.override_view = self.override
        self.screen.override_until = timezone.now() - timedelta(hours=1)
        self.screen.save()
        self.assertEqual(self.screen.get_active_view(), self.default)

    def test_override_with_future_expiry_applies(self):
        self.screen.override_view = self.override
        self.screen.override_until = timezone.now() + timedelta(hours=1)
        self.screen.save()
        self.assertEqual(self.screen.get_active_view(), self.override)


class ViewValidationTest(TestCase):

    def test_split_percent_clamped(self):
        self.assertEqual(_validate_view_data({'split_left_percent': 95})['split_left_percent'], 80)
        self.assertEqual(_validate_view_data({'split_left_percent': 5})['split_left_percent'], 20)

    def test_image_focus_clamped(self):
        self.assertEqual(_validate_view_data({'image_focus_x': 150})['image_focus_x'], 100)
        self.assertEqual(_validate_view_data({'image_focus_y': -10})['image_focus_y'], 0)

    def test_invalid_hex_color_dropped(self):
        self.assertNotIn('accent_color', _validate_view_data({'accent_color': 'rot'}))
        self.assertEqual(_validate_view_data({'accent_color': '#aabbcc'})['accent_color'], '#aabbcc')

    def test_schedule_from_after_until_raises(self):
        with self.assertRaises(HttpError):
            _validate_view_data({'schedule': [{'von': '16:00', 'bis': '08:00', 'profil_id': 1, 'tage': [0]}]})

    def test_exam_end_before_start_raises(self):
        with self.assertRaises(HttpError):
            _validate_exam_data({'active_from': '2026-01-02T10:00', 'active_until': '2026-01-02T09:00'})


class SoftDeleteTest(TestCase):

    def test_deleted_default_view_not_returned(self):
        default = DisplayView.objects.create(name='D', slug='d')
        screen = Screen.objects.create(name='B', slug='b', default_view=default)
        default.deleted_at = timezone.now()
        default.save()
        # gelöschte Default-Ansicht darf nicht mehr angezeigt werden
        self.assertIsNone(screen.get_active_view().deleted_at)

    def test_get_skips_deleted(self):
        DisplayView.objects.create(name='Std', slug='std', is_default=True)
        DisplayView.objects.create(
            name='Z', slug='z', deleted_at=timezone.now(),
            schedule=[{'profil_id': 999, 'tage': list(range(7)), 'von': '00:00', 'bis': '23:59'}])
        self.assertNotEqual(DisplayView.get().slug, 'z')


class TransitCredentialsTest(TestCase):
    """ÖPNV-Zugangsdaten kommen aus den Settings (.env), nicht aus dem Code."""

    @override_settings(NAHSH_HAFAS_AID='')
    def test_nahsh_without_aid_returns_none_and_logs(self):
        with self.assertLogs('monitor.oepnv', level='WARNING') as log, \
             mock.patch('urllib.request.urlopen') as urlopen:
            self.assertIsNone(oepnv._nahsh_rpc('StationBoard', {}))
        urlopen.assert_not_called()
        self.assertIn('NAHSH_HAFAS_AID', log.output[0])

    @override_settings(SWHL_STORYBLOK_TOKEN='')
    def test_swl_without_token_returns_empty_list(self):
        with self.assertLogs('monitor.oepnv', level='WARNING'), \
             mock.patch('urllib.request.urlopen') as urlopen:
            self.assertEqual(oepnv.fetch_disruptions_swl(), [])
        urlopen.assert_not_called()

    @override_settings(NAHSH_HAFAS_AID='test-aid')
    def test_nahsh_uses_aid_from_settings(self):
        # _nahsh_rpc nutzt _post_opener.open (Redirect-Handler), nicht urlopen
        with mock.patch.object(oepnv._post_opener, 'open') as opener_open:
            opener_open.return_value.__enter__.return_value.read.return_value = b'{"svcResL":[{"res":{}}]}'
            oepnv._nahsh_rpc('StationBoard', {})
        body = json.loads(opener_open.call_args[0][0].data)
        self.assertEqual(body['auth'], {'type': 'AID', 'aid': 'test-aid'})


class DisruptionIdTest(TestCase):

    def test_disruption_id_is_stable(self):
        # Hash-Eingaben bleiben identisch, sonst tauchen ausgeblendete Meldungen wieder auf
        self.assertEqual(oepnv._disruption_id('manuell', 'Titel', 'Text'),
                         hashlib.md5('manuell|Titel|Text'.encode()).hexdigest()[:12])
