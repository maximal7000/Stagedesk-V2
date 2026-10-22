from datetime import timedelta
from unittest import mock

from asgiref.sync import async_to_sync, sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from . import devices, push
from .models import (
    Device, DeviceCommand, DeviceEvent, DisplayEvent, DisplayEventScreen, DisplayView, Exam,
    MonitorSettings, Screen)
from .routing import websocket_urlpatterns

LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
application = URLRouter(websocket_urlpatterns)


def _communicator(slug, token=None):
    headers = [(b'authorization', f'Bearer {token}'.encode())] if token else []
    return WebsocketCommunicator(application, f'/ws/monitor/pi/{slug}/', headers=headers)


async def _sync_point(comm):
    """Everything up to here has been processed (messages are handled in order)."""
    await comm.send_json_to({'type': 'ping'})
    while True:
        msg = await comm.receive_json_from()
        if msg == {'type': 'pong'}:
            return


async def _drain_until(comm, wanted):
    for _ in range(10):
        msg = await comm.receive_json_from()
        if msg.get('type') == wanted:
            return msg
    raise AssertionError(f'{wanted} nicht empfangen')


@override_settings(CHANNEL_LAYERS=LAYERS, PUBLIC_BASE_URL='https://example.test')
class DeviceConsumerTest(TransactionTestCase):
    def setUp(self):
        self.screen = Screen.objects.create(name='Glocke', slug='glocke')
        self.device = Device.objects.create(screen=self.screen, serial='abc')
        self.token = self.device.issue_token()

    def test_valid_token_receives_hello(self):
        async def run():
            comm = _communicator('glocke', self.token)
            connected, _ = await comm.connect()
            self.assertTrue(connected)
            hello = await _drain_until(comm, 'hello')
            self.assertEqual(hello['slug'], 'glocke')
            self.assertEqual(hello['key'], self.screen.access_key)
            self.assertEqual(
                hello['kiosk_url'],
                f'https://example.test/signage?screen=glocke&key={self.screen.access_key}')
            self.assertEqual(hello['power_method'], 'cec')
            for field in ('power_config', 'update_window', 'auto_updates', 'daily_reboot',
                          'agent_version', 'agent_sha256'):
                self.assertIn(field, hello)
            await comm.disconnect()
        async_to_sync(run)()

    def test_invalid_token_closed_4003(self):
        async def run():
            comm = _communicator('glocke', 'falsch')
            await comm.connect()
            self.assertEqual((await comm.receive_output())['code'], 4003)
        async_to_sync(run)()

    def test_slug_mismatch_closed_4003(self):
        async def run():
            await sync_to_async(Screen.objects.create)(name='Andere', slug='andere')
            comm = _communicator('andere', self.token)
            await comm.connect()
            self.assertEqual((await comm.receive_output())['code'], 4003)
        async_to_sync(run)()

    def test_device_without_screen_closed_4003(self):
        Device.objects.filter(pk=self.device.pk).update(screen=None)

        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            self.assertEqual((await comm.receive_output())['code'], 4003)
        async_to_sync(run)()

    def test_legacy_without_token_gets_power_command(self):
        async def run():
            comm = _communicator('glocke')
            connected, _ = await comm.connect()
            self.assertTrue(connected)
            self.assertEqual(await comm.receive_json_from(), {'type': 'power_command', 'power': True})
            await comm.send_json_to({'type': 'cec_status', 'status': 'on'})
            self.assertEqual(await comm.receive_json_from(), {'type': 'ack', 'cec_status': 'on'})
            await comm.disconnect()
        async_to_sync(run)()
        self.screen.refresh_from_db()
        self.assertEqual(self.screen.cec_status, 'on')

    def test_require_token_rejects_legacy_4001(self):
        MonitorSettings.objects.update_or_create(pk=1, defaults={'require_device_token': True})

        async def run():
            comm = _communicator('glocke')
            await comm.connect()
            self.assertEqual((await comm.receive_output())['code'], 4001)
        async_to_sync(run)()

    def test_revoke_closes_open_socket_4003(self):
        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            await sync_to_async(devices.revoke_token)(self.device)
            for _ in range(10):
                out = await comm.receive_output()
                if out['type'] == 'websocket.close':
                    self.assertEqual(out['code'], 4003)
                    return
            self.fail('keine Close-Nachricht')
        async_to_sync(run)()

    def test_flat_agent_telemetry_fills_agent_version_from_system_group(self):
        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            await comm.send_json_to({'type': 'telemetry', 'system': {'agent_version': '2.0.1'}})
            await _sync_point(comm)
            device = await sync_to_async(Device.objects.get)(pk=self.device.pk)
            self.assertEqual(device.agent_version, '2.0.1')
            await comm.disconnect()
        async_to_sync(run)()

    def test_telemetry_throttled_but_last_seen_updated(self):
        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            await comm.send_json_to({'type': 'telemetry', 'data': {'cpu_temp': 40, 'agent_version': '1.2.3'}})
            await _sync_point(comm)
            first = await sync_to_async(Device.objects.get)(pk=self.device.pk)
            self.assertEqual(first.last_telemetry['cpu_temp'], 40)
            self.assertEqual(first.agent_version, '1.2.3')
            await comm.send_json_to({'type': 'telemetry', 'data': {'cpu_temp': 99}})
            await _sync_point(comm)
            second = await sync_to_async(Device.objects.get)(pk=self.device.pk)
            self.assertEqual(second.last_telemetry['cpu_temp'], 40)  # throttled
            self.assertGreater(second.last_seen_at, first.last_seen_at)
            await comm.disconnect()
        async_to_sync(run)()

    def test_telemetry_saved_again_after_30_seconds(self):
        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            with mock.patch('signage.consumers._monotonic', side_effect=[100.0, 131.0]):
                await comm.send_json_to({'type': 'telemetry', 'data': {'cpu_temp': 1}})
                await comm.send_json_to({'type': 'telemetry', 'data': {'cpu_temp': 2}})
                await _sync_point(comm)
            dev = await sync_to_async(Device.objects.get)(pk=self.device.pk)
            self.assertEqual(dev.last_telemetry['cpu_temp'], 2)
            await comm.disconnect()
        async_to_sync(run)()

    def test_pending_command_sent_on_connect(self):
        command = DeviceCommand.objects.create(device=self.device, kind='restart_browser', params={'a': 1})

        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            msg = await _drain_until(comm, 'command')
            self.assertEqual(msg, {'type': 'command', 'id': command.id, 'kind': 'restart_browser',
                                   'params': {'a': 1}})
            await comm.disconnect()
        async_to_sync(run)()
        command.refresh_from_db()
        self.assertEqual(command.status, 'sent')

    def test_command_older_than_5_min_expired(self):
        command = DeviceCommand.objects.create(device=self.device, kind='reboot')
        DeviceCommand.objects.filter(pk=command.pk).update(created_at=timezone.now() - timedelta(minutes=6))

        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            await _sync_point(comm)
            self.assertTrue(await comm.receive_nothing())
            await comm.disconnect()
        async_to_sync(run)()
        command.refresh_from_db()
        self.assertEqual(command.status, 'expired')
        self.assertEqual(command.result, 'Das Gerät war 5 Minuten nicht verbunden.')
        self.assertIsNotNone(command.finished_at)

    def test_push_device_command_reaches_open_socket(self):
        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            command = await sync_to_async(DeviceCommand.objects.create)(device=self.device, kind='screenshot')
            await sync_to_async(push.push_device_command)(command)
            msg = await _drain_until(comm, 'command')
            self.assertEqual(msg['id'], command.id)
            await comm.disconnect()
        async_to_sync(run)()

    def test_push_device_hello_resends_current_config(self):
        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            await sync_to_async(Screen.objects.filter(pk=self.screen.pk).update)(power_method='hdmi')
            await sync_to_async(push.push_device_hello)(self.screen)
            self.assertEqual((await _drain_until(comm, 'hello'))['power_method'], 'hdmi')
            await comm.disconnect()
        async_to_sync(run)()

    def test_command_result_sets_status(self):
        ok_cmd = DeviceCommand.objects.create(device=self.device, kind='restart_browser', status='sent')
        bad_cmd = DeviceCommand.objects.create(device=self.device, kind='reboot', status='sent')

        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            await comm.send_json_to({'type': 'command_result', 'id': ok_cmd.id, 'ok': True, 'text': 'fertig'})
            await comm.send_json_to({'type': 'command_result', 'id': bad_cmd.id, 'ok': False, 'text': 'kaputt'})
            await _sync_point(comm)
            await comm.disconnect()
        async_to_sync(run)()
        ok_cmd.refresh_from_db()
        bad_cmd.refresh_from_db()
        self.assertEqual((ok_cmd.status, ok_cmd.result), ('ok', 'fertig'))
        self.assertEqual((bad_cmd.status, bad_cmd.result), ('failed', 'kaputt'))
        self.assertIsNotNone(ok_cmd.finished_at)

    def test_command_result_of_other_device_ignored(self):
        other = Device.objects.create(serial='x')
        foreign = DeviceCommand.objects.create(device=other, kind='reboot', status='sent')

        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            await comm.send_json_to({'type': 'command_result', 'id': foreign.id, 'ok': True, 'text': ''})
            await _sync_point(comm)
            await comm.disconnect()
        async_to_sync(run)()
        foreign.refresh_from_db()
        self.assertEqual(foreign.status, 'sent')

    def _event(self, name, assign=True, **kwargs):
        event = DisplayEvent.objects.create(name=name, **kwargs)
        if assign:
            view = DisplayView.objects.create(name=f'V {name}', slug=f'v-{name.lower()}')
            DisplayEventScreen.objects.create(event=event, screen=self.screen, view=view)
        return event

    def _ask_gate(self):
        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            await comm.send_json_to({'type': 'update_gate_request'})
            msg = await _drain_until(comm, 'update_gate')
            await comm.disconnect()
            return msg
        return async_to_sync(run)()

    def test_update_gate_echoes_request_id(self):
        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            await comm.send_json_to({'type': 'update_gate_request', 'id': 'abc'})
            msg = await _drain_until(comm, 'update_gate')
            await comm.send_json_to({'type': 'update_gate_request'})
            plain = await _drain_until(comm, 'update_gate')
            await comm.disconnect()
            return msg, plain
        msg, plain = async_to_sync(run)()
        self.assertEqual(msg['id'], 'abc')
        self.assertNotIn('id', plain)

    def test_update_gate_denied_during_event(self):
        self._event('Elternabend', is_active=True)
        msg = self._ask_gate()
        self.assertFalse(msg['allowed'])
        self.assertEqual(msg['reason'], 'Termin „Elternabend" läuft')

    def test_update_gate_refusal_is_logged(self):
        self._event('Elternabend', is_active=True)
        self._ask_gate()
        event = DeviceEvent.objects.get(device=self.device, kind='update')
        self.assertEqual(event.text, 'Update oder Neustart verschoben: Termin „Elternabend" läuft')
        self.assertEqual(event.screen, self.screen)

    def test_update_gate_allowed_is_not_logged(self):
        self._ask_gate()
        self.assertFalse(DeviceEvent.objects.filter(device=self.device, kind='update').exists())

    def test_tick_does_not_switch_on_after_screen_deleted(self):
        from .consumers import ScreenPiConsumer
        consumer = ScreenPiConsumer()
        consumer.slug = 'gibtsnicht'
        self.assertIsNone(async_to_sync(consumer._get_power_state)())

    def test_update_gate_denied_during_timed_event(self):
        now = timezone.now()
        self._event('Zeitfenster', active_from=now - timedelta(hours=1), active_until=now + timedelta(hours=1))
        self.assertFalse(self._ask_gate()['allowed'])

    def test_update_gate_allowed_otherwise(self):
        now = timezone.now()
        self._event('Aktiv, anderer Bildschirm', assign=False, is_active=True)
        self._event('Vorbei', active_from=now - timedelta(hours=3), active_until=now - timedelta(hours=2))
        msg = self._ask_gate()
        self.assertEqual((msg['allowed'], msg['reason']), (True, ''))

    def test_update_gate_reasons_exam_emergency_on_air(self):
        now = timezone.now()
        self.assertEqual(devices.update_gate(self.screen, now), (True, ''))
        exam = Exam.objects.create(title='Mathe', active_from=now - timedelta(minutes=5),
                                   active_until=now + timedelta(minutes=5), display_mode='fullscreen')
        exam.screens.add(self.screen)
        allowed, reason = devices.update_gate(self.screen, now)
        self.assertFalse(allowed)
        self.assertEqual(reason, 'Klausur „Mathe" läuft')
        exam.display_mode = 'split'
        exam.save()
        self.assertFalse(devices.update_gate(self.screen, now)[0])
        exam.delete()
        MonitorSettings.objects.update_or_create(pk=1, defaults={'on_air_active': True})
        allowed, reason = devices.update_gate(self.screen, now)
        self.assertFalse(allowed)
        self.assertIn('On-Air', reason)
        MonitorSettings.objects.filter(pk=1).update(emergency_active=True)
        allowed, reason = devices.update_gate(self.screen, now)
        self.assertFalse(allowed)
        self.assertIn('Notfall', reason)

    def test_update_gate_exam_standard_mode_allowed(self):
        now = timezone.now()
        exam = Exam.objects.create(title='Mathe', active_from=now - timedelta(minutes=5),
                                   active_until=now + timedelta(minutes=5), display_mode='standard')
        exam.screens.add(self.screen)
        self.assertEqual(devices.update_gate(self.screen, now), (True, ''))

    def test_update_gate_on_air_behavior_none_allowed(self):
        view = DisplayView.objects.create(name='Ohne', slug='ohne', is_default=True, on_air_behavior='none')
        Screen.objects.filter(pk=self.screen.pk).update(default_view=view)
        self.screen.refresh_from_db()
        MonitorSettings.objects.update_or_create(pk=1, defaults={'on_air_active': True})
        self.assertEqual(devices.update_gate(self.screen, timezone.now()), (True, ''))

    def test_sent_command_stays_sent_within_75_min(self):
        running = DeviceCommand.objects.create(device=self.device, kind='update_now', status='sent')
        DeviceCommand.objects.filter(pk=running.pk).update(created_at=timezone.now() - timedelta(minutes=70))
        self.assertEqual(devices.send_pending_commands(self.device), [])
        running.refresh_from_db()
        self.assertEqual(running.status, 'sent')
        devices.finish_command(self.device, running.id, True, 'fertig')
        running.refresh_from_db()
        self.assertEqual((running.status, running.result), ('ok', 'fertig'))

    def test_sent_command_without_result_expires_after_75_min(self):
        stuck = DeviceCommand.objects.create(device=self.device, kind='reboot', status='sent')
        DeviceCommand.objects.filter(pk=stuck.pk).update(created_at=timezone.now() - timedelta(minutes=76))
        self.assertEqual(devices.send_pending_commands(self.device), [])
        stuck.refresh_from_db()
        self.assertEqual((stuck.status, stuck.result), ('expired', 'Keine Rückmeldung vom Gerät.'))

    def test_oversized_telemetry_ignored(self):
        devices.store_telemetry(self.device, {'cpu_temp': 40})
        with self.assertLogs('signage.devices', level='WARNING'):
            devices.store_telemetry(self.device, {'blob': 'x' * 70000})
        self.device.refresh_from_db()
        self.assertEqual(self.device.last_telemetry, {'cpu_temp': 40})

    def test_update_failed_creates_event(self):
        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            await comm.send_json_to({'type': 'update_result', 'at': '2026-10-20T03:10:00+02:00',
                                     'packages': 3, 'rebooted': False, 'error': 'apt: Paketquelle nicht erreichbar'})
            await comm.send_json_to({'type': 'update_result', 'at': '2026-10-27T03:10:00+01:00',
                                     'packages': 5, 'rebooted': True, 'error': None})
            await _sync_point(comm)
            await comm.disconnect()
        async_to_sync(run)()
        failed = DeviceEvent.objects.get(device=self.device, kind='update_failed')
        self.assertIn('Paketquelle', failed.text)
        self.assertEqual(failed.data['packages'], 3)
        done = DeviceEvent.objects.get(device=self.device, kind='update')
        self.assertEqual(done.data['rebooted'], True)
        self.device.refresh_from_db()
        self.assertEqual(self.device.last_telemetry['last_update']['ok'], True)

    def test_power_status_writes_cec_status(self):
        async def run():
            comm = _communicator('glocke', self.token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            await comm.send_json_to({'type': 'power_status', 'status': 'standby'})
            await _sync_point(comm)
            await comm.disconnect()
        async_to_sync(run)()
        self.screen.refresh_from_db()
        self.assertEqual(self.screen.cec_status, 'standby')
        self.assertIsNotNone(self.screen.cec_status_at)


@override_settings(CHANNEL_LAYERS=LAYERS)
class AgentUpdatedConsumerTest(TransactionTestCase):
    def test_agent_updated_survives_telemetry_throttle(self):
        screen = Screen.objects.create(name='Glocke', slug='glocke')
        device = Device.objects.create(screen=screen, serial='abc')
        token = device.issue_token()
        event = {'from': '1.0.0', 'to': '1.0.1', 'at': '2026-10-20T03:10:00+00:00'}

        async def run():
            comm = _communicator('glocke', token)
            await comm.connect()
            await _drain_until(comm, 'hello')
            await comm.send_json_to({'type': 'telemetry', 'system': {'agent_version': '1.0.0'}})
            await comm.send_json_to({'type': 'telemetry', 'system': {'agent_version': '1.0.1'},
                                     'agent_updated': event})
            await comm.send_json_to({'type': 'telemetry', 'agent_updated': event})
            await _sync_point(comm)
            await comm.disconnect()
        async_to_sync(run)()
        events = DeviceEvent.objects.filter(device=device, kind='agent_updated')
        self.assertEqual(events.count(), 1)
        self.assertEqual(events.get().text, 'Agent aktualisiert von 1.0.0 auf 1.0.1')
