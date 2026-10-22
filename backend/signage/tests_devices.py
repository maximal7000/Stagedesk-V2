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

    def test_start_keeps_confirmed_undelivered_after_expiry(self):
        screen = Screen.objects.create(name='S', slug='s')
        device = Device.objects.create(screen=screen, serial='c')
        now = timezone.now()
        keep = PairingRequest.objects.create(
            code='111111', pairing_id_hash='keep', serial='c', confirmed_device=device,
            expires_at=now - timedelta(minutes=1))
        gone = PairingRequest.objects.create(
            code='222222', pairing_id_hash='gone', serial='c', confirmed_device=device,
            expires_at=now - timedelta(minutes=16))
        self.start(serial='new')
        self.assertTrue(PairingRequest.objects.filter(pk=keep.pk).exists())
        self.assertFalse(PairingRequest.objects.filter(pk=gone.pk).exists())

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
        with mock.patch('signage.devices.secrets.randbelow', side_effect=[0, 0, 5, 5]) as rb:
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
        with mock.patch('signage.push.close_device_sockets') as close, \
                self.captureOnCommitCallbacks(execute=True):
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

    def test_close_not_sent_before_commit(self):
        first = self.start(serial='old')
        self.pair(first['code'], screen_id=self.screen.id)
        second = self.start(serial='new')
        with mock.patch('signage.push.close_device_sockets') as close:
            with self.captureOnCommitCallbacks(execute=False) as callbacks:
                self.pair(second['code'], screen_id=self.screen.id)
            close.assert_not_called()
            for cb in callbacks:
                cb()
        close.assert_called_once()

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
        with mock.patch('signage.push.close_device_sockets') as close, \
                self.captureOnCommitCallbacks(execute=True):
            r = self.post(f'/devices/{self.device.id}/unpair', {})
        self.assertEqual(r.status_code, 200)
        self.device.refresh_from_db()
        self.assertIsNone(self.device.screen)
        self.assertIsNone(Device.for_token(self.raw))
        self.assertTrue(DeviceEvent.objects.filter(kind='unpaired', device=self.device).exists())
        close.assert_called_once_with(self.device)

    def test_delete_screen_unpairs_device(self):
        self.grant('monitor.setup')
        with mock.patch('signage.push.close_device_sockets') as close, \
                self.captureOnCommitCallbacks(execute=True):
            r = self.client.delete(f'/api/monitor/screens/{self.screen.id}', HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200, r.content)
        self.device.refresh_from_db()
        self.assertIsNone(self.device.screen)
        self.assertIsNotNone(self.device.revoked_at)
        self.assertIsNone(Device.for_token(self.raw))
        close.assert_called_once_with(self.device)

    def test_revoke(self):
        with mock.patch('signage.push.close_device_sockets') as close, \
                self.captureOnCommitCallbacks(execute=True):
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
        with mock.patch('signage.push.get_channel_layer', side_effect=RuntimeError('down')):
            push.close_device_sockets(device)


# ── Task 4: Geräte-API für das Admin ─────────────────────────────────

import io
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile

from . import devices
from .models import DeviceCommand


def _png_bytes():
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (4, 4), (200, 30, 60)).save(buf, format='PNG')
    return buf.getvalue()


@override_settings(CHANNEL_LAYERS=IN_MEMORY)
class DeviceApiBase(PairingTestBase):
    def setUp(self):
        super().setUp()
        self.screen = Screen.objects.create(name='Halle', slug='halle')
        self.device = Device.objects.create(
            screen=self.screen, serial='SER-1', model='Pi 5', last_seen_at=timezone.now(),
            last_telemetry={'network': {'kind': 'wifi', 'ip': '10.0.0.5', 'mac': 'aa:bb', 'signal_dbm': -60},
                            'system': {'serial': 'SER-1', 'temperature_c': 51}})
        self.token = self.device.issue_token()

    def get(self, path):
        return self.client.get(f'/api/monitor{path}', HTTP_AUTHORIZATION='Bearer x')

    def put(self, path, data):
        return self.client.put(f'/api/monitor{path}', data, content_type='application/json',
                               HTTP_AUTHORIZATION='Bearer x')


class DeviceListTest(DeviceApiBase):
    def test_devices_list_redacts_serial_ip_mac_for_view_only(self):
        self.grant('monitor.view')
        row = self.get('/devices').json()[0]
        self.assertIsNone(row['serial'])
        self.assertIsNone(row['telemetry']['network']['ip'])
        self.assertIsNone(row['telemetry']['network']['mac'])
        self.assertIsNone(row['telemetry']['system']['serial'])
        self.assertEqual(row['telemetry']['system']['temperature_c'], 51)
        self.assertEqual((row['status'], row['status_text'], row['legacy']), ('online', 'Online', False))
        self.grant('monitor.devices')
        row = self.get('/devices').json()[0]
        self.assertEqual(row['serial'], 'SER-1')
        self.assertEqual(row['telemetry']['network']['ip'], '10.0.0.5')
        self.assertEqual(row['telemetry']['network']['mac'], 'aa:bb')

    def test_devices_list_needs_view(self):
        self.assertEqual(self.get('/devices').status_code, 403)

    def test_legacy_screen_listed(self):
        self.grant('monitor.view')
        old = Screen.objects.create(name='Mensa', slug='mensa', cec_status='an', cec_status_at=timezone.now())
        Screen.objects.create(name='Alt', slug='alt', cec_status='an',
                              cec_status_at=timezone.now() - timedelta(minutes=5))
        rows = self.get('/devices').json()
        legacy = [r for r in rows if r['legacy']]
        self.assertEqual([(r['screen_id'], r['status'], r['status_text']) for r in legacy],
                         [(old.id, 'legacy', 'Altes Skript')])
        self.assertIsNone(legacy[0]['id'])

    def test_revoked_device_not_listed(self):
        self.grant('monitor.view')
        Device.objects.filter(pk=self.device.pk).update(revoked_at=timezone.now())
        self.assertEqual(self.get('/devices').json(), [])


class DeviceStatusTest(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.screen = Screen.objects.create(name='S', slug='s')
        self.cfg = MonitorSettings.load()

    def status(self, device):
        return devices.device_status(device, self.screen, self.cfg, self.now)

    def test_states(self):
        dev = Device(screen=self.screen, last_seen_at=self.now - timedelta(seconds=30))
        self.assertEqual(self.status(dev), ('online', 'Online'))
        dev.active_warnings = [{'code': 'temp', 'text': 'CPU 85 Grad'}, {'code': 'x', 'text': 'zweite'}]
        self.assertEqual(self.status(dev), ('warning', 'Warnung · CPU 85 Grad'))

    def test_offline_and_off(self):
        seen = self.now - timedelta(minutes=3)
        dev = Device(screen=self.screen, last_seen_at=seen)
        hhmm = timezone.localtime(seen).strftime('%H:%M')
        self.assertEqual(self.status(dev), ('offline', f'Offline · zuletzt gesehen {hhmm}'))
        self.screen.power_mode = 'manual_off'
        self.assertEqual(self.status(dev), ('off', f'Aus · zuletzt gesehen {hhmm}'))

    def test_never_seen_and_unpaired_and_legacy(self):
        self.assertEqual(self.status(Device(screen=self.screen))[0], 'offline')
        self.assertEqual(self.status(None), ('unpaired', 'Kein Gerät gekoppelt'))
        self.screen.cec_status_at = self.now - timedelta(seconds=20)
        self.assertEqual(self.status(None), ('legacy', 'Altes Skript'))
        revoked = Device(screen=self.screen, revoked_at=self.now)
        self.assertEqual(self.status(revoked)[0], 'legacy')


class DeviceCommandApiTest(DeviceApiBase):
    def cmd(self, kind, device=None):
        return self.post(f'/devices/{(device or self.device).id}/commands', {'kind': kind})

    def test_command_needs_power_for_power_off(self):
        self.grant('monitor.devices')
        self.assertEqual(self.cmd('power_off').status_code, 403)
        self.assertEqual(self.cmd('power_on').status_code, 403)
        self.assertEqual(DeviceCommand.objects.count(), 0)
        self.assertEqual(self.cmd('restart_browser').status_code, 200)
        self.grant('monitor.power')
        r = self.cmd('power_off')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body['kind'], body['status']), ('power_off', 'pending'))

    def test_command_needs_devices(self):
        self.grant('monitor.power')
        self.assertEqual(self.cmd('power_off').status_code, 403)

    def test_command_creates_event_and_pushes(self):
        self.grant('monitor.devices')
        with mock.patch('signage.push.push_device_command') as push_cmd, \
                self.captureOnCommitCallbacks(execute=True):
            r = self.cmd('screenshot')
        self.assertEqual(r.status_code, 200)
        command = DeviceCommand.objects.get()
        push_cmd.assert_called_once_with(command)
        event = DeviceEvent.objects.get(kind='command')
        self.assertEqual((event.device, event.screen), (self.device, self.screen))
        self.assertEqual(event.data['command_id'], command.id)

    def test_reload_command_also_notifies_display(self):
        self.grant('monitor.devices')
        with mock.patch('signage.push.notify_reload') as reload, \
                self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.cmd('reload').status_code, 200)
        reload.assert_called_once_with('halle')
        with mock.patch('signage.push.notify_reload') as reload, \
                self.captureOnCommitCallbacks(execute=True):
            self.cmd('restart_browser')
        reload.assert_not_called()

    def test_unknown_kind_and_revoked_device(self):
        self.grant('monitor.devices')
        self.assertEqual(self.cmd('format_disk').status_code, 422)
        Device.objects.filter(pk=self.device.pk).update(revoked_at=timezone.now())
        self.assertEqual(self.cmd('reload').status_code, 409)

    def test_get_command_status(self):
        self.grant('monitor.devices')
        cid = self.cmd('reboot').json()['id']
        DeviceCommand.objects.filter(pk=cid).update(status='ok', result='fertig')
        body = self.get(f'/devices/{self.device.id}/commands/{cid}').json()
        self.assertEqual((body['status'], body['result']), ('ok', 'fertig'))
        other = Device.objects.create(serial='o')
        self.assertEqual(self.get(f'/devices/{other.id}/commands/{cid}').status_code, 404)

    def test_get_command_expires_stale_pending(self):
        self.grant('monitor.devices')
        cid = self.cmd('reboot').json()['id']
        DeviceCommand.objects.filter(pk=cid).update(created_at=timezone.now() - timedelta(minutes=6))
        self.assertEqual(self.get(f'/devices/{self.device.id}/commands/{cid}').json()['status'], 'expired')

    def test_finish_command_updates_event(self):
        self.grant('monitor.devices')
        cid = self.cmd('restart_browser').json()['id']
        devices.finish_command(self.device, cid, True, 'Browser neu gestartet')
        self.assertIn('Browser neu gestartet', DeviceEvent.objects.get(kind='command').text)


class DeviceEventsApiTest(DeviceApiBase):
    def test_events_list_with_person_and_filter(self):
        self.grant('monitor.devices')
        DeviceEvent.objects.create(device=self.device, screen=self.screen, kind='command', text='A',
                                   data={'created_by_name': 'Max'})
        DeviceEvent.objects.create(device=self.device, screen=self.screen, kind='online', text='B')
        rows = self.get(f'/screens/{self.screen.id}/events').json()
        self.assertEqual({r['text'] for r in rows}, {'A', 'B'})
        by_text = {r['text']: r for r in rows}
        self.assertEqual(by_text['A']['person'], 'Max')
        self.assertEqual(by_text['B']['person'], '')
        rows = self.get(f'/screens/{self.screen.id}/events?kind=online&limit=1').json()
        self.assertEqual([r['text'] for r in rows], ['B'])

    def test_events_need_devices(self):
        self.grant('monitor.view')
        self.assertEqual(self.get(f'/screens/{self.screen.id}/events').status_code, 403)


class ScreenshotUploadTest(DeviceApiBase):
    def setUp(self):
        super().setUp()
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, True)
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)

    def upload(self, data=None, token='default', name='shot.png'):
        headers = {}
        token = self.token if token == 'default' else token
        if token:
            headers['HTTP_AUTHORIZATION'] = f'Bearer {token}'
        file = SimpleUploadedFile(name, _png_bytes() if data is None else data, content_type='image/png')
        return self.client.post('/api/monitor/agent/screenshot', {'file': file}, **headers)

    def test_screenshot_upload_requires_valid_token(self):
        self.assertEqual(self.upload(token=None).status_code, 401)
        self.assertEqual(self.upload(token='wrong').status_code, 401)
        Device.objects.filter(pk=self.device.pk).update(revoked_at=timezone.now())
        self.assertEqual(self.upload().status_code, 401)
        self.device.refresh_from_db()
        self.assertFalse(self.device.last_screenshot)

    def test_screenshot_upload_stores_and_completes_command(self):
        command = DeviceCommand.objects.create(device=self.device, kind='screenshot', status='sent')
        r = self.upload()
        self.assertEqual(r.status_code, 200, r.content)
        self.device.refresh_from_db()
        self.assertTrue(self.device.last_screenshot.name.startswith('monitor/screenshots/'))
        self.assertIsNotNone(self.device.last_screenshot_at)
        command.refresh_from_db()
        self.assertEqual(command.status, 'ok')
        self.grant('monitor.view')
        row = self.get('/devices').json()[0]
        self.assertTrue(row['last_screenshot_url'].endswith('.png'))

    def test_screenshot_rejects_over_15mb(self):
        r = self.upload(data=b'\x89PNG' + b'0' * (15 * 1024 * 1024))
        self.assertEqual(r.status_code, 413)
        self.assertIn('15 MB', r.json()['detail'])
        self.device.refresh_from_db()
        self.assertFalse(self.device.last_screenshot)

    def test_screenshot_rejects_non_png(self):
        r = self.upload(data=b'GIF89a not a png')
        self.assertEqual(r.status_code, 422)

    def test_screenshot_replaces_previous_file(self):
        import os
        self.assertEqual(self.upload().status_code, 200)
        self.device.refresh_from_db()
        first = self.device.last_screenshot.path
        self.assertTrue(os.path.exists(first))
        self.assertEqual(self.upload().status_code, 200)
        self.device.refresh_from_db()
        self.assertNotEqual(self.device.last_screenshot.path, first)
        self.assertFalse(os.path.exists(first))
        self.assertTrue(os.path.exists(self.device.last_screenshot.path))


class ScreenDeviceFieldsApiTest(DeviceApiBase):
    def test_screen_device_fields_need_devices_permission(self):
        self.grant('monitor.setup')
        for body in ({'power_method': 'hdmi'}, {'auto_updates': False}, {'daily_reboot': False},
                     {'power_config': {}}, {'update_window': {'weekday': 1, 'from': '01:00', 'until': '02:00'}}):
            self.assertEqual(self.put(f'/screens/{self.screen.id}', body).status_code, 403, body)
        self.grant('monitor.devices')
        with mock.patch('signage.push.push_device_hello') as hello, \
                self.captureOnCommitCallbacks(execute=True):
            r = self.put(f'/screens/{self.screen.id}', {'power_method': 'hdmi', 'daily_reboot': False})
        self.assertEqual(r.status_code, 200, r.content)
        hello.assert_called_once()
        self.screen.refresh_from_db()
        self.assertEqual((self.screen.power_method, self.screen.daily_reboot), ('hdmi', False))

    def test_devices_permission_alone_does_not_edit_other_fields(self):
        self.grant('monitor.devices')
        self.assertEqual(self.put(f'/screens/{self.screen.id}', {'name': 'Neu'}).status_code, 403)
        self.assertEqual(self.put(f'/screens/{self.screen.id}', {'name': 'Neu', 'daily_reboot': True}).status_code, 403)

    def test_update_window_validation(self):
        self.grant('monitor.devices')
        url = f'/screens/{self.screen.id}'
        r = self.put(url, {'update_window': {'weekday': 7, 'from': '03:00', 'until': '05:00'}})
        self.assertEqual(r.status_code, 422)
        self.assertIn('Wochentag', r.json()['detail'])
        for bad in ({'weekday': 1, 'from': '25:00', 'until': '26:00'},
                    {'weekday': 1, 'from': '05:00', 'until': '03:00'},
                    {'weekday': 1, 'from': '03:00', 'until': '03:00'},
                    {'weekday': 1, 'from': '3:00', 'until': '05:00'},
                    {'weekday': True, 'from': '03:00', 'until': '05:00'},
                    {'weekday': 1, 'from': '03:00'},
                    {'weekday': 1, 'from': '03:00', 'until': '05:00', 'x': 1}):
            self.assertEqual(self.put(url, {'update_window': bad}).status_code, 422, bad)
        self.screen.refresh_from_db()
        self.assertEqual(self.screen.update_window['weekday'], 6)
        ok = {'weekday': 0, 'from': '01:00', 'until': '02:30'}
        self.assertEqual(self.put(url, {'update_window': ok}).status_code, 200)

    def test_power_config_validation_per_method(self):
        self.grant('monitor.devices')
        url = f'/screens/{self.screen.id}'
        self.assertEqual(self.put(url, {'power_method': 'ddc', 'power_config': {'vcp_on': '01', 'vcp_off': '04'}}).status_code, 200)
        r = self.put(url, {'power_config': {'cec_device': '0'}})  # Methode bleibt ddc
        self.assertEqual(r.status_code, 422)
        self.assertIn('cec_device', r.json()['detail'])
        self.assertEqual(self.put(url, {'power_method': 'hybrid',
                                        'power_config': {'display_ip': '10.0.0.2', 'display_port': 5000,
                                                         'monitor_id': 0, 'cec_device': '0'}}).status_code, 200)
        self.assertEqual(self.put(url, {'power_config': {'display_port': 70000}}).status_code, 422)
        self.assertEqual(self.put(url, {'power_config': {'display_ip': ['x']}}).status_code, 422)
        # Methodenwechsel ohne passende Konfiguration: alte Schlüssel bleiben nicht erlaubt
        self.assertEqual(self.put(url, {'power_method': 'cec'}).status_code, 422)

    def test_explicit_null_device_fields_are_ignored(self):
        self.grant('monitor.devices')
        url = f'/screens/{self.screen.id}'
        for field in ('power_method', 'auto_updates', 'daily_reboot'):
            r = self.put(url, {field: None})
            self.assertEqual(r.status_code, 200, (field, r.content))
        r = self.put(url, {'power_method': None, 'daily_reboot': False})
        self.assertEqual(r.status_code, 200, r.content)
        self.screen.refresh_from_db()
        self.assertEqual((self.screen.power_method, self.screen.auto_updates, self.screen.daily_reboot),
                         ('cec', True, False))

    def test_screen_response_still_hides_key_without_setup(self):
        self.grant('monitor.devices')
        r = self.put(f'/screens/{self.screen.id}', {'daily_reboot': True})
        self.assertEqual(r.json()['access_key'], '')


class SettingsDeviceFieldsTest(DeviceApiBase):
    def test_settings_device_fields_ranges(self):
        self.grant('monitor.devices')
        self.assertEqual(self.put('/settings', {'warn_temperature_c': 70}).status_code, 403)
        self.grant('monitor.setup')
        for field, low, high in (('device_offline_minutes', 2, 240), ('warn_temperature_c', 50, 95),
                                 ('warn_disk_percent', 50, 99), ('warn_wifi_dbm', -95, -40),
                                 ('warn_reboot_days', 1, 60)):
            for bad in (low - 1, high + 1):
                r = self.put('/settings', {field: bad})
                self.assertEqual(r.status_code, 422, (field, bad))
                self.assertIn(f'{low}', r.json()['detail'])
            for good in (low, high):
                self.assertEqual(self.put('/settings', {field: good}).status_code, 200, (field, good))
        self.assertEqual(MonitorSettings.load().warn_wifi_dbm, -40)

    def test_settings_device_fields_need_setup(self):
        self.grant('monitor.onair')
        self.assertEqual(self.put('/settings', {'warn_disk_percent': 80}).status_code, 403)
        self.assertEqual(self.put('/settings', {'require_device_token': True}).status_code, 403)
