import hashlib
import json
from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from ninja.errors import HttpError

from .models import DisplayView, Screen, DisplayEvent, DisplayEventScreen
from .api import _validate_view_data, _validate_exam_data, _fetch_disruptions
from . import oepnv


class ActiveViewPriorityTest(TestCase):
    """Reihenfolge: Sofort-Override > aktives Event > Zeitplan > Default."""

    def setUp(self):
        self.default = DisplayView.objects.create(name='Default', slug='default')
        self.scheduled = DisplayView.objects.create(name='Zeit', slug='scheduled')
        self.event = DisplayView.objects.create(name='Event', slug='event')
        self.override = DisplayView.objects.create(name='Override', slug='override')
        self.screen = Screen.objects.create(name='BS', slug='bs', default_view=self.default)

    def _always_schedule(self):
        self.screen.schedule = [{'view_id': self.scheduled.id, 'days': list(range(7)), 'from': '00:00', 'until': '23:59'}]
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

    def test_webuntis_zoom_clamped(self):
        self.assertEqual(_validate_view_data({'webuntis_zoom': 1000})['webuntis_zoom'], 400)

    def test_invalid_exam_hex_color_dropped(self):
        self.assertNotIn('color', _validate_exam_data({'color': 'rot'}))
        self.assertEqual(_validate_exam_data({'color': '#aabbcc'})['color'], '#aabbcc')

    def test_schedule_from_after_until_raises(self):
        with self.assertRaises(HttpError):
            _validate_view_data({'schedule': [{'from': '16:00', 'until': '08:00', 'view_id': 1, 'days': [0]}]})

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
            schedule=[{'view_id': 999, 'days': list(range(7)), 'from': '00:00', 'until': '23:59'}])
        self.assertNotEqual(DisplayView.get().slug, 'z')


class TransitCredentialsTest(TestCase):
    """ÖPNV-Zugangsdaten kommen aus den Settings (.env), nicht aus dem Code."""

    @override_settings(NAHSH_HAFAS_AID='')
    def test_nahsh_without_aid_returns_none_and_logs(self):
        with self.assertLogs('signage.oepnv', level='WARNING') as log, \
             mock.patch.object(oepnv._post_opener, 'open') as opener_open:
            self.assertIsNone(oepnv._nahsh_rpc('StationBoard', {}))
        opener_open.assert_not_called()
        self.assertIn('NAHSH_HAFAS_AID', log.output[0])

    @override_settings(SWHL_STORYBLOK_TOKEN='')
    def test_swl_without_token_returns_empty_list(self):
        with self.assertLogs('signage.oepnv', level='WARNING'), \
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


class ManualDisruptionTest(TestCase):

    def test_manual_disruption_uses_english_keys_and_stable_id(self):
        view = DisplayView.objects.create(
            name='V', slug='v', kind='departures', transit_disruption_rail=False, transit_disruption_bus=False,
            transit_disruption_manual=[{'title': 'Titel', 'text': 'Text', 'image': 'k.png', 'highlighted': True}])
        [d] = _fetch_disruptions(view)
        self.assertEqual(d['id'], oepnv._disruption_id('manuell', 'Titel', 'Text'))
        self.assertEqual((d['source'], d['kind'], d['title'], d['image'], d['lines'], d['from'], d['until']),
                         ('manual', 'disruption', 'Titel', 'k.png', [], '', ''))


class PowerStateTest(TestCase):

    def test_manual_modes(self):
        screen = Screen.objects.create(name='S', slug='s', power_mode='manual_off')
        self.assertFalse(screen.get_power_state())
        screen.power_mode = 'manual_on'
        self.assertTrue(screen.get_power_state())

    def test_exception_with_english_keys(self):
        today = timezone.localdate().isoformat()
        screen = Screen.objects.create(name='S', slug='s', schedule=[{'days': [], 'from': '07:00', 'until': '08:00'}], power_exceptions=[
            {'from_date': today, 'until_date': today, 'from': '00:00', 'until': '23:59', 'note': 'x'}])
        self.assertTrue(screen.get_power_state())


class UploadPathTest(TestCase):

    def test_upload_dirs_unchanged(self):
        from .models import MediaFile, monitor_upload_path
        self.assertEqual(monitor_upload_path(MediaFile(kind='image'), 'a.png'), 'monitor/bild/a.png')
        self.assertEqual(monitor_upload_path(MediaFile(kind='background'), 'a.png'), 'monitor/hintergrund/a.png')
        self.assertEqual(monitor_upload_path(MediaFile(kind='pdf'), 'a.pdf'), 'monitor/pdf/a.pdf')


class OrderingTest(TestCase):

    def test_announcements_urgent_important_normal(self):
        from .models import Announcement
        for p in ('normal', 'urgent', 'important'):
            Announcement.objects.create(title=p, priority=p)
        self.assertEqual([a.priority for a in Announcement.objects.all()], ['urgent', 'important', 'normal'])

    def test_media_files_keep_old_kind_order(self):
        from .models import MediaFile
        for k in ('pdf', 'logo', 'background', 'image'):
            MediaFile.objects.create(name=k, file=f'monitor/{k}/x', kind=k)
        self.assertEqual([m.kind for m in MediaFile.objects.all()], ['image', 'background', 'logo', 'pdf'])


class DisruptionHiddenPruneTest(TestCase):
    """Ausblend-Liste wird nur bereinigt, wenn alle aktiven Quellen Daten lieferten."""

    def _view(self):
        return DisplayView.objects.create(
            name='D', slug='d', kind='departures',
            transit_disruption_rail=True, transit_disruption_bus=True,
            transit_disruption_hidden=['rail1', 'bus1', 'gone'])

    @staticmethod
    def _item(i, src):
        return {'id': i, 'source': src, 'kind': 'disruption', 'title': i, 'text': '',
                'lines': [], 'from': '', 'until': '', 'all_lines': False,
                'image': '', 'stops': [], 'suggestion': ''}

    def test_failed_source_keeps_hidden_list(self):
        view = self._view()
        with mock.patch.object(oepnv, 'fetch_disruptions_nahsh', return_value=[self._item('rail1', 'nahsh')]), \
             mock.patch.object(oepnv, 'fetch_disruptions_swl', return_value=[]):
            _fetch_disruptions(view)
        view.refresh_from_db()
        self.assertEqual(view.transit_disruption_hidden, ['rail1', 'bus1', 'gone'])

    def test_all_sources_ok_prunes_stale_ids(self):
        view = self._view()
        with mock.patch.object(oepnv, 'fetch_disruptions_nahsh', return_value=[self._item('rail1', 'nahsh')]), \
             mock.patch.object(oepnv, 'fetch_disruptions_swl', return_value=[self._item('bus1', 'swl')]):
            _fetch_disruptions(view)
        view.refresh_from_db()
        self.assertEqual(view.transit_disruption_hidden, ['rail1', 'bus1'])
