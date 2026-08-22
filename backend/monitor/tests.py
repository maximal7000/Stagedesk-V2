from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from ninja.errors import HttpError

from .models import MonitorConfig, Bildschirm, MonitorEvent, EventBildschirm
from .api import _validate_config_data, _validate_klausur_data


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
