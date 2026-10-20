import hashlib
from datetime import timedelta
from unittest import mock

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from core.auth import KeycloakAuth
from users.models import Permission, UserProfile

from . import push
from .models import Device, DeviceEvent, MonitorSettings, PairingRequest, Screen

IN_MEMORY = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}


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


    def test_reissue_invalidates_first_token(self):
        device = Device.objects.create(serial='abc')
        first = device.issue_token()
        second = device.issue_token()
        self.assertIsNone(Device.for_token(first))
        self.assertEqual(Device.for_token(second), device)

    def test_issue_token_keeps_revoked(self):
        device = Device.objects.create(serial='abc', revoked_at=timezone.now())
        raw = device.issue_token()
        device.refresh_from_db()
        self.assertIsNotNone(device.revoked_at)
        self.assertIsNone(Device.for_token(raw))


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


@override_settings(CHANNEL_LAYERS=IN_MEMORY)
class PairingTestBase(TestCase):
    def setUp(self):
        cache.clear()
        self.profile = UserProfile.objects.create(keycloak_id='tester')
        auth = mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'})
        auth.start()
        self.addCleanup(auth.stop)

    def grant(self, code):
        perm, _ = Permission.objects.get_or_create(code=code, defaults={'name': code})
        self.profile.permissions.add(perm)

    def post(self, path, data):
        return self.client.post(f'/api/monitor{path}', data, content_type='application/json',
                                HTTP_AUTHORIZATION='Bearer x')

    def start(self, serial='abc', model='Pi 4'):
        r = self.post('/agent/pair/start', {'serial': serial, 'model': model})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def pair(self, code, **extra):
        return self.post('/devices/pair', {'code': code, **extra})


class PairingStartTest(PairingTestBase):
    def test_pairing_code_format_and_expiry(self):
        before = timezone.now()
        body = self.start()
        self.assertRegex(body['code'], r'^[1-9][0-9]{5}$')
        self.assertGreaterEqual(len(body['pairing_id']), 40)
        req = PairingRequest.objects.get()
        self.assertEqual(req.code, body['code'])
        self.assertNotEqual(req.pairing_id_hash, body['pairing_id'])
        self.assertEqual(req.pairing_id_hash, hashlib.sha256(body['pairing_id'].encode()).hexdigest())
        delta = req.expires_at - before
        self.assertTrue(timedelta(minutes=14, seconds=55) < delta <= timedelta(minutes=15, seconds=5))

    def test_start_discards_expired(self):
        PairingRequest.objects.create(code='123456', pairing_id_hash='x', serial='old',
                                      expires_at=timezone.now() - timedelta(seconds=1))
        self.start(serial='new')
        self.assertEqual(list(PairingRequest.objects.values_list('serial', flat=True)), ['new'])

    def test_start_limits_open_requests(self):
        first = self.start(serial='s0')
        for i in range(1, 10):
            self.start(serial=f's{i}')
        self.assertEqual(PairingRequest.objects.count(), 10)
        self.start(serial='s10')
        self.assertEqual(PairingRequest.objects.count(), 10)
        self.assertFalse(PairingRequest.objects.filter(code=first['code'], serial='s0').exists())
        self.assertTrue(PairingRequest.objects.filter(serial='s10').exists())

    def test_start_limits_per_serial(self):
        first = self.start(serial='same')
        self.start(serial='same')
        self.start(serial='same')
        self.start(serial='same')
        qs = PairingRequest.objects.filter(serial='same')
        self.assertEqual(qs.count(), 3)
        oldest_hash = hashlib.sha256(first['pairing_id'].encode()).hexdigest()
        self.assertFalse(qs.filter(pairing_id_hash=oldest_hash).exists())

    def test_start_is_public(self):
        r = self.client.post('/api/monitor/agent/pair/start', {'serial': 'a', 'model': 'm'},
                             content_type='application/json')
        self.assertEqual(r.status_code, 200)

    def test_codes_unique_among_open(self):
        with mock.patch('monitor.devices.secrets.randbelow', side_effect=[0, 0, 5, 5]) as rb:
            a = self.start(serial='a')
            b = self.start(serial='b')
        self.assertNotEqual(a['code'], b['code'])
        self.assertEqual(rb.call_count, 3)


class PairingFlowTest(PairingTestBase):
    def setUp(self):
        super().setUp()
        self.grant('monitor.devices')
        self.screen = Screen.objects.create(name='Halle', slug='halle')

    def poll(self, pairing_id):
        return self.client.post('/api/monitor/agent/pair/poll', {'pairing_id': pairing_id},
                                content_type='application/json')

    def test_poll_waiting_then_token_once_then_410(self):
        body = self.start()
        r = self.poll(body['pairing_id'])
        self.assertEqual((r.status_code, r.json()), (202, {'status': 'waiting'}))
        self.assertEqual(self.pair(body['code'], screen_id=self.screen.id).status_code, 200)
        r = self.poll(body['pairing_id'])
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data['status'], 'paired')
        self.assertEqual(data['slug'], 'halle')
        self.assertEqual(data['key'], self.screen.access_key)
        self.assertEqual(Device.for_token(data['token']), self.screen.device)
        self.assertEqual(self.poll(body['pairing_id']).status_code, 410)

    def test_poll_unknown_and_expired_404(self):
        self.assertEqual(self.poll('nope').status_code, 404)
        body = self.start()
        PairingRequest.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.poll(body['pairing_id']).status_code, 404)

    def test_pair_returns_device_and_event(self):
        body = self.start(serial='SER1', model='Pi 5')
        r = self.pair(body['code'], screen_id=self.screen.id)
        self.assertEqual(r.status_code, 200, r.content)
        out = r.json()
        self.assertEqual((out['serial'], out['model'], out['screen_id']), ('SER1', 'Pi 5', self.screen.id))
        self.assertNotIn('token', out)
        self.assertTrue(DeviceEvent.objects.filter(kind='paired', screen=self.screen).exists())

    def test_wrong_code_400_message(self):
        r = self.pair('000000', screen_id=self.screen.id)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['detail'],
                         'Der Code ist ungültig oder abgelaufen. Den Code auf dem Bildschirm prüfen.')

    def test_expired_code_400(self):
        body = self.start()
        PairingRequest.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.pair(body['code'], screen_id=self.screen.id).status_code, 400)

    def test_wrong_code_rate_limited_after_five(self):
        for _ in range(5):
            self.assertEqual(self.pair('000000', screen_id=self.screen.id).status_code, 400)
        r = self.pair('000000', screen_id=self.screen.id)
        self.assertEqual(r.status_code, 429)
        self.assertEqual(r.json()['detail'], 'Zu viele Versuche. Bitte eine Minute warten.')
        body = self.start()
        self.assertEqual(self.pair(body['code'], screen_id=self.screen.id).status_code, 429)

    def test_confirm_replaces_previous_device(self):
        first = self.start(serial='old')
        self.pair(first['code'], screen_id=self.screen.id)
        old = Device.objects.get(serial='old')
        old_raw = old.issue_token()
        second = self.start(serial='new')
        with mock.patch('monitor.push.close_device_sockets') as close:
            r = self.pair(second['code'], screen_id=self.screen.id)
        self.assertEqual(r.status_code, 200)
        old.refresh_from_db()
        self.assertIsNotNone(old.revoked_at)
        self.assertIsNone(old.screen)
        self.assertIsNone(Device.for_token(old_raw))
        self.assertTrue(DeviceEvent.objects.filter(kind='token_revoked', device=old).exists())
        close.assert_called_once_with(old)
        self.screen.refresh_from_db()
        self.assertEqual(self.screen.device.serial, 'new')

    def test_pair_requires_devices_permission(self):
        self.profile.permissions.clear()
        body = self.start()
        self.assertEqual(self.pair(body['code'], screen_id=self.screen.id).status_code, 403)
        self.assertEqual(PairingRequest.objects.get().confirmed_device, None)

    def test_new_screen_created_on_pair(self):
        body = self.start()
        r = self.pair(body['code'], new_screen={'name': 'Aula Foyer', 'location': 'EG'})
        self.assertEqual(r.status_code, 200, r.content)
        screen = Screen.objects.get(name='Aula Foyer')
        self.assertEqual((screen.slug, screen.location), ('aula-foyer', 'EG'))
        self.assertEqual(screen.device.serial, 'abc')

    def test_pair_needs_screen_or_new_screen(self):
        body = self.start()
        self.assertEqual(self.pair(body['code']).status_code, 422)
        self.assertEqual(self.pair(body['code'], screen_id=99999).status_code, 404)
        self.assertEqual(PairingRequest.objects.get().confirmed_device, None)

    def test_pair_already_confirmed_code_invalid(self):
        body = self.start()
        self.pair(body['code'], screen_id=self.screen.id)
        other = Screen.objects.create(name='B', slug='b')
        self.assertEqual(self.pair(body['code'], screen_id=other.id).status_code, 400)


class UnpairRevokeTest(PairingTestBase):
    def setUp(self):
        super().setUp()
        self.grant('monitor.devices')
        self.screen = Screen.objects.create(name='Halle', slug='halle')
        self.device = Device.objects.create(serial='x', screen=self.screen)
        self.raw = self.device.issue_token()

    def test_unpair(self):
        with mock.patch('monitor.push.close_device_sockets') as close:
            r = self.post(f'/devices/{self.device.id}/unpair', {})
        self.assertEqual(r.status_code, 200)
        self.device.refresh_from_db()
        self.assertIsNone(self.device.screen)
        self.assertTrue(DeviceEvent.objects.filter(kind='unpaired', device=self.device).exists())
        close.assert_called_once_with(self.device)

    def test_revoke(self):
        with mock.patch('monitor.push.close_device_sockets') as close:
            r = self.post(f'/devices/{self.device.id}/revoke', {})
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(Device.for_token(self.raw))
        self.assertTrue(DeviceEvent.objects.filter(kind='token_revoked', device=self.device).exists())
        close.assert_called_once_with(self.device)

    def test_requires_permission_and_404(self):
        self.profile.permissions.clear()
        self.assertEqual(self.post(f'/devices/{self.device.id}/unpair', {}).status_code, 403)
        self.assertEqual(self.post(f'/devices/{self.device.id}/revoke', {}).status_code, 403)
        self.grant('monitor.devices')
        self.assertEqual(self.post('/devices/99999/revoke', {}).status_code, 404)


@override_settings(CHANNEL_LAYERS=IN_MEMORY)
class CloseSocketsTest(TestCase):
    def test_close_device_sockets_sends_group_message(self):
        device = Device.objects.create(serial='x')
        layer = get_channel_layer()
        channel = async_to_sync(layer.new_channel)()
        async_to_sync(layer.group_add)(f'device_{device.id}', channel)
        push.close_device_sockets(device)
        msg = async_to_sync(layer.receive)(channel)
        self.assertEqual(msg, {'type': 'device_close', 'code': 4003})

    def test_close_device_sockets_swallows_layer_errors(self):
        device = Device.objects.create(serial='x')
        with mock.patch('monitor.push.get_channel_layer', side_effect=RuntimeError('down')):
            push.close_device_sockets(device)
