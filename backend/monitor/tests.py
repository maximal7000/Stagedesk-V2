import json
from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from ninja.errors import HttpError

from .models import MonitorConfig, Bildschirm, MonitorEvent, EventBildschirm
from .api import _validate_config_data, _validate_klausur_data
from . import oepnv


class ActiveProfilPriorityTest(TestCase):
    """Reihenfolge: Sofort-Override > aktives Event > Zeitplan > Default."""

    def setUp(self):
        self.default = MonitorConfig.objects.create(name='Default', slug='default')
        self.zeit = MonitorConfig.objects.create(name='Zeit', slug='zeit')
        self.event = MonitorConfig.objects.create(name='Event', slug='event')
        self.override = MonitorConfig.objects.create(name='Override', slug='override')
        self.bs = Bildschirm.objects.create(name='BS', slug='bs', default_profil=self.default)

    def _immer_zeitplan(self):
        self.bs.zeitplan = [{'profil_id': self.zeit.id, 'tage': list(range(7)), 'von': '00:00', 'bis': '23:59'}]
        self.bs.save()

    def _aktives_event(self):
        ev = MonitorEvent.objects.create(name='E', aktiv=True)
        EventBildschirm.objects.create(event=ev, bildschirm=self.bs, profil=self.event)

    def test_default_wenn_nichts_greift(self):
        self.assertEqual(self.bs.get_active_profil(), self.default)

    def test_zeitplan_schlaegt_default(self):
        self._immer_zeitplan()
        self.assertEqual(self.bs.get_active_profil(), self.zeit)

    def test_event_schlaegt_zeitplan(self):
        self._immer_zeitplan()
        self._aktives_event()
        self.assertEqual(self.bs.get_active_profil(), self.event)

    def test_override_schlaegt_alles(self):
        self._immer_zeitplan()
        self._aktives_event()
        self.bs.override_profil = self.override
        self.bs.save()
        self.assertEqual(self.bs.get_active_profil(), self.override)

    def test_abgelaufener_override_ignoriert(self):
        self.bs.override_profil = self.override
        self.bs.override_bis = timezone.now() - timedelta(hours=1)
        self.bs.save()
        self.assertEqual(self.bs.get_active_profil(), self.default)

    def test_override_mit_zukunftsablauf_gilt(self):
        self.bs.override_profil = self.override
        self.bs.override_bis = timezone.now() + timedelta(hours=1)
        self.bs.save()
        self.assertEqual(self.bs.get_active_profil(), self.override)


class ConfigValidationTest(TestCase):

    def test_split_prozent_geklemmt(self):
        self.assertEqual(_validate_config_data({'split_links_prozent': 95})['split_links_prozent'], 80)
        self.assertEqual(_validate_config_data({'split_links_prozent': 5})['split_links_prozent'], 20)

    def test_bild_fokus_geklemmt(self):
        self.assertEqual(_validate_config_data({'bild_fokus_x': 150})['bild_fokus_x'], 100)
        self.assertEqual(_validate_config_data({'bild_fokus_y': -10})['bild_fokus_y'], 0)

    def test_ungueltige_hexfarbe_verworfen(self):
        self.assertNotIn('akzent_farbe', _validate_config_data({'akzent_farbe': 'rot'}))
        self.assertEqual(_validate_config_data({'akzent_farbe': '#aabbcc'})['akzent_farbe'], '#aabbcc')

    def test_zeitplan_von_nach_bis_wirft(self):
        with self.assertRaises(HttpError):
            _validate_config_data({'zeitplan': [{'von': '16:00', 'bis': '08:00', 'profil_id': 1, 'tage': [0]}]})

    def test_klausur_ende_vor_beginn_wirft(self):
        with self.assertRaises(HttpError):
            _validate_klausur_data({'aktiv_von': '2026-01-02T10:00', 'aktiv_bis': '2026-01-02T09:00'})


class SoftDeleteTest(TestCase):

    def test_geloeschte_default_ansicht_wird_nicht_zurueckgegeben(self):
        default = MonitorConfig.objects.create(name='D', slug='d')
        bs = Bildschirm.objects.create(name='B', slug='b', default_profil=default)
        default.geloescht_am = timezone.now()
        default.save()
        # gelöschte Default-Ansicht darf nicht mehr angezeigt werden
        self.assertIsNone(bs.get_active_profil().geloescht_am)

    def test_get_ueberspringt_geloeschte(self):
        MonitorConfig.objects.create(name='Std', slug='std', ist_standard=True)
        MonitorConfig.objects.create(
            name='Z', slug='z', geloescht_am=timezone.now(),
            zeitplan=[{'profil_id': 999, 'tage': list(range(7)), 'von': '00:00', 'bis': '23:59'}])
        self.assertNotEqual(MonitorConfig.get().slug, 'z')


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
            self.assertEqual(oepnv.fetch_stoerungen_swl(), [])
        urlopen.assert_not_called()

    @override_settings(NAHSH_HAFAS_AID='test-aid')
    def test_nahsh_uses_aid_from_settings(self):
        # _nahsh_rpc nutzt _post_opener.open (Redirect-Handler), nicht urlopen
        with mock.patch.object(oepnv._post_opener, 'open') as opener_open:
            opener_open.return_value.__enter__.return_value.read.return_value = b'{"svcResL":[{"res":{}}]}'
            oepnv._nahsh_rpc('StationBoard', {})
        body = json.loads(opener_open.call_args[0][0].data)
        self.assertEqual(body['auth'], {'type': 'AID', 'aid': 'test-aid'})
