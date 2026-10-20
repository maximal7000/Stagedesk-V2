import hashlib

from django.test import TestCase
from django.utils import timezone

from .models import Device, MonitorSettings, Screen


class DeviceTokenTest(TestCase):
    def test_issue_token_stores_only_hash(self):
        device = Device.objects.create(serial='abc')
        raw = device.issue_token()
        device.refresh_from_db()
        self.assertNotEqual(raw, device.token_hash)
        self.assertEqual(device.token_hash, hashlib.sha256(raw.encode()).hexdigest())
        self.assertIsNotNone(device.token_created_at)
        self.assertEqual(Device.for_token(raw), device)

    def test_for_token_ignores_revoked(self):
        device = Device.objects.create(serial='abc')
        raw = device.issue_token()
        device.revoked_at = timezone.now()
        device.save()
        self.assertIsNone(Device.for_token(raw))
        self.assertIsNone(Device.for_token('unknown'))


class DefaultsTest(TestCase):
    def test_screen_defaults(self):
        screen = Screen.objects.create(name='A', slug='a')
        self.assertEqual(screen.power_method, 'cec')
        self.assertEqual(screen.update_window, {"weekday": 6, "from": "03:00", "until": "05:00"})
        self.assertIs(screen.daily_reboot, True)
        self.assertIs(screen.auto_updates, True)
        self.assertEqual(screen.power_config, {})

    def test_settings_defaults(self):
        s = MonitorSettings.load()
        self.assertEqual(
            (s.device_offline_minutes, s.warn_temperature_c, s.warn_disk_percent,
             s.warn_wifi_dbm, s.warn_reboot_days, s.require_device_token),
            (10, 80, 90, -75, 7, False))
