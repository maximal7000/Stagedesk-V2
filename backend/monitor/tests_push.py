"""Änderungs-Push an die Anzeige (Spec §4.2): DisplayConsumer, push.py und Auslöser."""
from unittest import mock

from asgiref.sync import async_to_sync, sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings

from . import api, api_setup, push
from .models import DisplayView, Screen
from .routing import websocket_urlpatterns
from .schemas import DisplayViewUpdateSchema

LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
application = URLRouter(websocket_urlpatterns)


async def _connect(slug):
    comm = WebsocketCommunicator(application, f'/ws/monitor/display/{slug}/')
    connected, _ = await comm.connect()
    assert connected
    return comm


@override_settings(CHANNEL_LAYERS=LAYERS)
class DisplayPushTest(TransactionTestCase):
    def setUp(self):
        self.view = DisplayView.objects.create(name='V', slug='v', is_default=True)
        self.screen = Screen.objects.create(name='S', slug='glocke', default_view=self.view)

    def test_display_ws_receives_changed_on_view_update(self):
        async def run():
            comm = await _connect('glocke')
            with mock.patch.object(api, '_require_perm'):
                await sync_to_async(api.update_view)(object(), DisplayViewUpdateSchema(), view_id=self.view.id)
            self.assertEqual(await comm.receive_json_from(), {'type': 'changed'})
            await comm.disconnect()
        async_to_sync(run)()

    def test_display_ws_receives_reload(self):
        async def run():
            comm = await _connect('glocke')
            other = await _connect('anderer')
            with mock.patch.object(api, '_require_perm'):
                await sync_to_async(api.reload_screen)(object(), self.screen.id)
            self.assertEqual(await comm.receive_json_from(), {'type': 'reload'})
            self.assertTrue(await other.receive_nothing())
            await comm.disconnect()
            await other.disconnect()
        async_to_sync(run)()
        self.screen.refresh_from_db()
        self.assertIsNotNone(self.screen.reload_requested_at)

    def test_unknown_slug_still_connects(self):
        async def run():
            comm = await _connect('gibt-es-nicht')
            self.assertTrue(await comm.receive_nothing())
            await comm.send_to(text_data='{"type":"ping"}')  # eingehende Nachrichten werden ignoriert
            self.assertTrue(await comm.receive_nothing())
            await comm.disconnect()
        async_to_sync(run)()

    def test_notify_changed_for_slugs_reaches_only_those(self):
        async def run():
            a, b = await _connect('a'), await _connect('b')
            await sync_to_async(push.notify_changed)(['a'])
            self.assertEqual(await a.receive_json_from(), {'type': 'changed'})
            self.assertTrue(await b.receive_nothing())
            await sync_to_async(push.notify_changed)()
            self.assertEqual(await a.receive_json_from(), {'type': 'changed'})
            self.assertEqual(await b.receive_json_from(), {'type': 'changed'})
            await a.disconnect()
            await b.disconnect()
        async_to_sync(run)()

    def test_setup_endpoint_triggers_push(self):
        async def run():
            comm = await _connect('glocke')
            with mock.patch.object(api_setup, '_require_perm'):
                await sync_to_async(api_setup.undo_power_off_today)(
                    object(), mock.Mock(screen_ids=[]))
            self.assertEqual(await comm.receive_json_from(), {'type': 'changed'})
            await comm.disconnect()
        async_to_sync(run)()

    def test_channel_layer_failure_does_not_raise(self):
        layer = mock.Mock()
        layer.group_send = mock.AsyncMock(side_effect=OSError('redis weg'))
        with mock.patch.object(push, 'get_channel_layer', return_value=layer):
            with self.assertLogs('monitor.push', level='ERROR'):
                push.notify_changed()
                push.notify_reload('glocke')
