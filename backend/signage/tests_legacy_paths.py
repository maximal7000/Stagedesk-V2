"""New addresses /api/signage/ and /ws/signage/ next to the permanent legacy /monitor addresses."""
from asgiref.sync import async_to_sync
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.test import RequestFactory, SimpleTestCase, TestCase, TransactionTestCase, override_settings

from .legacy_paths import LegacyPathMiddleware
from .models import Device, DisplayView, Screen
from .routing import websocket_urlpatterns

LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
application = URLRouter(websocket_urlpatterns)


def _without_timestamp(response):
    body = response.json()
    body.pop('generated_at', None)
    return body


class LegacyHttpPathsTest(TestCase):
    def setUp(self):
        view = DisplayView.objects.create(name='Info', slug='info', is_default=True)
        Screen.objects.create(name='Halle', slug='halle', default_view=view)

    def test_legacy_and_new_paths_same_response(self):
        old = self.client.get('/api/monitor/display', {'screen': 'halle'})
        new = self.client.get('/api/signage/display', {'screen': 'halle'})
        self.assertEqual(old.status_code, 200)
        self.assertEqual(new.status_code, 200)
        self.assertEqual(_without_timestamp(old), _without_timestamp(new))
        self.assertEqual(new.json()['screen']['slug'], 'halle')

    @override_settings(PUBLIC_BASE_URL='https://example.test')
    def test_install_script_on_both_paths(self):
        old = self.client.get('/api/monitor/agent/install.sh')
        new = self.client.get('/api/signage/agent/install.sh')
        self.assertEqual(old.status_code, 200)
        self.assertEqual(new.status_code, 200)
        self.assertEqual(old.content, new.content)

    def test_earliest_legacy_endpoints_still_answer(self):
        Screen.objects.create(name='Glocke', slug='glocke')
        for path in ('/api/monitor/bildschirm/power', '/api/signage/bildschirm/power'):
            r = self.client.get(path, {'slug': 'glocke'})
            self.assertEqual(r.status_code, 200, path)
        r = self.client.post('/api/monitor/notfall', {'aktiv': True}, content_type='application/json')
        self.assertIn(r.status_code, (401, 403))

    def test_old_monitor_router_mount_is_gone(self):
        from core.urls import api
        prefixes = [prefix for prefix, _router in api._routers]
        self.assertIn('/signage', prefixes)
        self.assertNotIn('/monitor', prefixes)


class LegacyPathMiddlewareTest(SimpleTestCase):
    def _rewrite(self, path):
        seen = {}

        def view(request):
            seen['path_info'] = request.path_info
            return None

        LegacyPathMiddleware(view)(RequestFactory().get(path))
        return seen['path_info']

    def test_only_api_monitor_prefix_is_rewritten(self):
        self.assertEqual(self._rewrite('/api/monitor/display'), '/api/signage/display')
        self.assertEqual(self._rewrite('/api/monitor/agent/install.sh'), '/api/signage/agent/install.sh')
        self.assertEqual(self._rewrite('/api/monitoring/x'), '/api/monitoring/x')
        self.assertEqual(self._rewrite('/monitor/api/monitor/'), '/monitor/api/monitor/')
        self.assertEqual(self._rewrite('/api/signage/display'), '/api/signage/display')
        self.assertEqual(self._rewrite('/media/monitor/a.png'), '/media/monitor/a.png')


@override_settings(CHANNEL_LAYERS=LAYERS)
class LegacyWebSocketPathsTest(TransactionTestCase):
    def setUp(self):
        self.screen = Screen.objects.create(name='Glocke', slug='glocke')
        self.token = Device.objects.create(screen=self.screen, serial='abc').issue_token()

    def _connects(self, path, token=None):
        async def run():
            headers = [(b'authorization', f'Bearer {token}'.encode())] if token else []
            comm = WebsocketCommunicator(application, path, headers=headers)
            connected, _ = await comm.connect()
            await comm.disconnect()
            return connected
        return async_to_sync(run)()

    def test_pi_socket_on_both_prefixes(self):
        self.assertTrue(self._connects('/ws/monitor/pi/glocke/', self.token))
        self.assertTrue(self._connects('/ws/signage/pi/glocke/', self.token))

    def test_display_socket_on_both_prefixes(self):
        self.assertTrue(self._connects('/ws/monitor/display/glocke/'))
        self.assertTrue(self._connects('/ws/signage/display/glocke/'))
