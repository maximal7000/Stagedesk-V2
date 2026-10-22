from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from users.models import Permission, PermissionGroup, UserProfile

from . import devices
from .models import Device, DeviceEvent, MonitorSettings, Screen


def telemetry(**groups):
    base = {
        'network': {'kind': 'wifi', 'ssid': 'x', 'signal_dbm': -60, 'ip': '10.0.0.2', 'mac': 'aa'},
        'system': {'temperature_c': 50, 'throttled_now': False, 'throttled_since_boot': False,
                   'disk_percent': 40, 'ram_percent': 30, 'uptime_s': 100, 'model': 'Pi 4',
                   'serial': 'abc', 'os': 'bookworm', 'agent_version': '1'},
        'display': {'resolution': '3840x2160', 'browser_running': True, 'power': 'on'},
        'updates': {'last_at': None, 'last_ok': True, 'last_error': None, 'pending_packages': 0,
                    'reboot_required_since': None},
    }
    for name, values in groups.items():
        base[name] = {**base[name], **values}
    return base


class WatchBase(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.settings = MonitorSettings.load()
        self.screen = Screen.objects.create(name='Glocke', slug='glocke')
        self.device = Device.objects.create(screen=self.screen, serial='abc', last_seen_at=self.now,
                                            last_telemetry=telemetry())
        patcher = mock.patch('signage.devices.notification_recipients', return_value=['u1'])
        patcher.start()
        self.addCleanup(patcher.stop)
        notifier = mock.patch('signage.devices.notify_many')
        self.notify = notifier.start()
        self.addCleanup(notifier.stop)

    def bodies(self):
        return [c.args[3] for c in self.notify.call_args_list]


class StatusTest(WatchBase):
    def test_status_online_warning_offline_off_legacy_unpaired(self):
        now, s = self.now, self.settings
        self.assertEqual(devices.device_status(self.device, self.screen, s, now), ('online', 'Online'))
        self.device.active_warnings = [{'code': 'temperature', 'text': 'Temperatur 83 °C'}]
        self.assertEqual(devices.device_status(self.device, self.screen, s, now),
                         ('warning', 'Warnung · Temperatur 83 °C'))
        later = now + timedelta(minutes=5)
        status, text = devices.device_status(self.device, self.screen, s, later)
        self.assertEqual(status, 'offline')
        self.assertTrue(text.startswith('Offline · zuletzt gesehen '))
        self.screen.power_mode = 'manual_off'
        status, text = devices.device_status(self.device, self.screen, s, later)
        self.assertEqual(status, 'off')
        self.assertTrue(text.startswith('Aus · zuletzt gesehen '))
        legacy = Screen.objects.create(name='Alt', slug='alt', cec_status_at=now)
        self.assertEqual(devices.device_status(None, legacy, s, now), ('legacy', 'Altes Skript'))
        plain = Screen.objects.create(name='Plain', slug='plain-screen')
        self.assertEqual(devices.device_status(None, plain, s, now), ('unpaired', 'Kein Gerät gekoppelt'))


class ComputeWarningsTest(WatchBase):
    def codes(self, data):
        return [w['code'] for w in devices.compute_warnings(data, self.settings, self.now)]

    def test_warnings_thresholds_and_missing_values(self):
        s, now = self.settings, self.now
        self.assertEqual(devices.compute_warnings(telemetry(), s, now), [])
        self.assertEqual(devices.compute_warnings({}, s, now), [])
        # Boundaries: exactly at the threshold there is no warning yet
        self.assertEqual(self.codes(telemetry(system={'temperature_c': s.warn_temperature_c})), [])
        self.assertEqual(self.codes(telemetry(system={'disk_percent': s.warn_disk_percent})), [])
        self.assertEqual(self.codes(telemetry(network={'signal_dbm': s.warn_wifi_dbm})), [])
        got = devices.compute_warnings(telemetry(
            system={'temperature_c': 83, 'throttled_now': True, 'disk_percent': 93},
            network={'signal_dbm': -81}, display={'browser_running': False},
            updates={'last_ok': False, 'reboot_required_since': (now - timedelta(days=9, hours=2)).isoformat()},
        ), s, now)
        self.assertEqual([(w['code'], w['text']) for w in got], [
            ('temperature', 'Temperatur 83 °C'), ('throttled', 'Drosselung aktiv'),
            ('disk', 'Speicher 93 % belegt'), ('wifi', 'WLAN schwach (-81 dBm)'),
            ('browser', 'Browser läuft nicht'), ('update_failed', 'Letztes Update fehlgeschlagen'),
            ('reboot_pending', 'Neustart seit 9 Tagen nötig')])
        # missing values (null) produce nothing
        nulls = telemetry(system={'temperature_c': None, 'throttled_now': None, 'disk_percent': None},
                          network={'signal_dbm': None}, display={'browser_running': None},
                          updates={'last_ok': None, 'reboot_required_since': None})
        self.assertEqual(devices.compute_warnings(nulls, s, now), [])
        # Wi-Fi only for connection type Wi-Fi
        self.assertEqual(self.codes(telemetry(network={'kind': 'lan', 'signal_dbm': -90})), [])
        self.assertEqual(self.codes(telemetry(network={'kind': None, 'signal_dbm': -90})), [])
        # restart not needed for long enough yet, broken date
        recent = (now - timedelta(days=s.warn_reboot_days - 1)).isoformat()
        self.assertEqual(self.codes(telemetry(updates={'reboot_required_since': recent})), [])
        self.assertEqual(self.codes(telemetry(updates={'reboot_required_since': 'kaputt'})), [])
        # parts missing or of the wrong type
        self.assertEqual(devices.compute_warnings({'system': None, 'network': 'x'}, s, now), [])


class WatchTest(WatchBase):
    def go(self, at=None):
        devices.watch(at or self.now)
        self.device.refresh_from_db()

    def seen_ago(self, minutes):
        self.device.last_seen_at = self.now - timedelta(minutes=minutes)
        self.device.save()

    def test_offline_notification_once_after_threshold(self):
        self.seen_ago(9)
        self.go()
        self.notify.assert_not_called()
        self.seen_ago(11)
        self.go()
        self.assertEqual(self.bodies(), ['Bildschirm Glocke ist seit 11 Minuten offline.'])
        args = self.notify.call_args
        self.assertEqual(args.args[:3], (['u1'], 'system', args.args[2]))
        self.assertEqual(args.kwargs['link'], f'/signage-admin/screens/{self.screen.id}')
        self.assertIsNotNone(self.device.offline_notified_at)
        self.assertEqual(DeviceEvent.objects.filter(device=self.device, kind='offline').count(), 1)
        self.go(self.now + timedelta(minutes=5))
        self.assertEqual(self.notify.call_count, 1)

    def test_no_offline_notification_when_scheduled_off(self):
        self.screen.power_mode = 'manual_off'
        self.screen.save()
        self.seen_ago(30)
        self.go()
        self.notify.assert_not_called()
        self.assertIsNone(self.device.offline_notified_at)

    def test_back_online_notification_only_after_offline_notice(self):
        self.go()  # online, never reported offline
        self.notify.assert_not_called()
        self.seen_ago(15)
        self.go()
        self.notify.reset_mock()
        self.device.last_seen_at = self.now
        self.device.save()
        self.go()
        self.assertEqual(self.bodies(), ['Bildschirm Glocke ist wieder online.'])
        self.assertIsNone(self.device.offline_notified_at)
        self.assertEqual(DeviceEvent.objects.filter(device=self.device, kind='online').count(), 1)
        self.go()
        self.assertEqual(self.notify.call_count, 1)

    def test_warning_notified_once_until_cleared(self):
        self.device.last_telemetry = telemetry(system={'temperature_c': 83})
        self.device.save()
        self.go()
        self.assertEqual(self.bodies(), ['Glocke: Temperatur 83 °C.'])
        self.assertEqual([w['code'] for w in self.device.active_warnings], ['temperature'])
        # same warning, different value: no new notification
        self.device.last_telemetry = telemetry(system={'temperature_c': 85})
        self.device.save()
        self.go()
        self.assertEqual(self.notify.call_count, 1)
        # disappears: event, no notification
        self.device.last_telemetry = telemetry()
        self.device.save()
        self.go()
        self.assertEqual(self.notify.call_count, 1)
        self.assertEqual(self.device.active_warnings, [])
        self.assertEqual(DeviceEvent.objects.filter(device=self.device, kind='warning_cleared').count(), 1)
        # comes back: notified again
        self.device.last_telemetry = telemetry(system={'temperature_c': 90})
        self.device.save()
        self.go()
        self.assertEqual(self.notify.call_count, 2)
        self.assertEqual(DeviceEvent.objects.filter(device=self.device, kind='warning').count(), 2)

    def test_warnings_not_recomputed_from_stale_telemetry_while_offline(self):
        self.device.last_telemetry = telemetry(system={'temperature_c': 83})
        self.device.save()
        self.go()
        self.seen_ago(30)
        self.notify.reset_mock()
        self.go()
        self.assertEqual([w['code'] for w in self.device.active_warnings], ['temperature'])
        self.assertEqual(self.bodies(), ['Bildschirm Glocke ist seit 30 Minuten offline.'])

    def test_update_failed_notified_once(self):
        event = DeviceEvent.objects.create(device=self.device, screen=self.screen, kind='update_failed',
                                           text='Update fehlgeschlagen: Platte voll',
                                           data={'error': 'Platte voll'})
        self.go()
        self.assertEqual(self.bodies(), ['Update auf Glocke fehlgeschlagen: Platte voll.'])
        event.refresh_from_db()
        self.assertTrue(event.data['notified'])
        self.assertEqual(event.data['error'], 'Platte voll')
        self.go()
        self.assertEqual(self.notify.call_count, 1)

    def test_watch_twice_no_duplicates(self):
        self.device.last_telemetry = telemetry(system={'temperature_c': 83})
        self.device.save()
        DeviceEvent.objects.create(device=self.device, screen=self.screen, kind='update_failed',
                                   text='x', data={'error': 'Fehler'})
        other = Device.objects.create(screen=Screen.objects.create(name='B', slug='b'), serial='z',
                                      last_seen_at=self.now - timedelta(minutes=20))
        self.go()
        first = self.notify.call_count
        self.assertEqual(first, 3)
        self.go()
        self.assertEqual(self.notify.call_count, first)
        other.refresh_from_db()
        self.assertIsNotNone(other.offline_notified_at)

    def test_unpaired_and_revoked_devices_ignored(self):
        Device.objects.create(screen=None, serial='q', last_seen_at=self.now - timedelta(hours=1))
        revoked_screen = Screen.objects.create(name='R', slug='r')
        Device.objects.create(screen=revoked_screen, serial='r', revoked_at=self.now,
                              last_seen_at=self.now - timedelta(hours=1))
        self.go()
        self.notify.assert_not_called()

    def test_failing_notification_does_not_abort_other_devices_or_purge(self):
        other_screen = Screen.objects.create(name='Aula', slug='aula')
        other = Device.objects.create(screen=other_screen, serial='def', last_seen_at=self.now - timedelta(minutes=11),
                                      last_telemetry=telemetry())
        self.seen_ago(11)
        old = DeviceEvent.objects.create(device=self.device, screen=self.screen, kind='online', text='alt')
        DeviceEvent.objects.filter(pk=old.pk).update(created_at=self.now - timedelta(days=91))
        self.notify.side_effect = [RuntimeError('boom'), None]
        with self.assertLogs('signage.devices', level='ERROR'):
            self.go()
        self.assertEqual(self.notify.call_count, 2)
        self.assertFalse(DeviceEvent.objects.filter(pk=old.pk).exists())
        other.refresh_from_db()
        self.assertIsNotNone(other.offline_notified_at)

    def test_device_unpaired_during_run_is_skipped(self):
        self.seen_ago(11)
        real = devices._watch_device

        def unpair_after(device_id, cfg, now, add):
            real(device_id, cfg, now, add)
            Device.objects.filter(pk=device_id).update(screen=None)
        with mock.patch('signage.devices._watch_device', side_effect=unpair_after):
            self.go()
        self.notify.assert_not_called()

    def test_events_older_than_90_days_deleted(self):
        old = DeviceEvent.objects.create(device=self.device, screen=self.screen, kind='online', text='alt')
        fresh = DeviceEvent.objects.create(device=self.device, screen=self.screen, kind='online', text='neu')
        DeviceEvent.objects.filter(pk=old.pk).update(created_at=self.now - timedelta(days=91))
        DeviceEvent.objects.filter(pk=fresh.pk).update(created_at=self.now - timedelta(days=89))
        self.go()
        self.assertFalse(DeviceEvent.objects.filter(pk=old.pk).exists())
        self.assertTrue(DeviceEvent.objects.filter(pk=fresh.pk).exists())

    def test_command_runs_watch(self):
        from django.core.management import call_command
        with mock.patch('signage.devices.watch') as watch:
            call_command('signage_device_watch')
        watch.assert_called_once()


class RecipientsTest(TestCase):
    def test_recipients_only_with_devices_permission(self):
        perm, _ = Permission.objects.get_or_create(code='signage.devices', defaults={'name': 'Geräte'})
        other, _ = Permission.objects.get_or_create(code='signage.view', defaults={'name': 'Ansehen'})
        direct = UserProfile.objects.create(keycloak_id='direct', username='direct')
        direct.permissions.add(perm)
        grouped = UserProfile.objects.create(keycloak_id='grouped', username='grouped')
        group = PermissionGroup.objects.create(name='Geräte')
        group.permissions.add(perm)
        grouped.permission_groups.add(group)
        admin = UserProfile.objects.create(keycloak_id='admin', username='admin', is_admin_cached=True)
        plain = UserProfile.objects.create(keycloak_id='plain', username='plain')
        plain.permissions.add(other)
        UserProfile.objects.create(keycloak_id='nobody', username='nobody')
        self.assertEqual(sorted(devices.notification_recipients()), ['admin', 'direct', 'grouped'])
