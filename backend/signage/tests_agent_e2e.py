"""End to end: the real agent with the real websocket-client against a running ASGI server.

Daphne runs in a thread of this process (same database, same in-memory channel layer).
All test calls go to that server over HTTP so pushes and sockets share one event loop.
The agent's system commands go through FakeRunner.

Needs `websocket-client` (test environment only, see backend/requirements-dev.txt)."""
import json
import socket
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

from django.test import TransactionTestCase, override_settings

from core.auth import KeycloakAuth
from users.models import Permission, UserProfile

from .models import Screen

AGENT_DIR = Path(__file__).resolve().parent.parent.parent / 'agent'
LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}

try:
    import websocket  # noqa: F401
    HAVE_WEBSOCKET = True
except ImportError:
    HAVE_WEBSOCKET = False

_server = {}


def live_server_port():
    """Start Daphne once per process in a thread (the Twisted reactor only runs once)."""
    if 'port' in _server:
        return _server['port']
    from daphne.server import Server
    from core.asgi import application
    ready = threading.Event()

    def run():
        server = Server(application=application, endpoints=['tcp:port=0:interface=127.0.0.1'],
                        signal_handlers=False, verbosity=0)
        _server['server'] = server
        from twisted.internet import reactor

        def resolve():
            if server.listening_addresses:
                _server['port'] = server.listening_addresses[0][1]
                ready.set()
            else:
                reactor.callLater(0.05, resolve)
        reactor.callLater(0.05, resolve)
        server.run()

    threading.Thread(target=run, daemon=True, name='e2e-daphne').start()
    if not ready.wait(20):
        raise RuntimeError('Daphne ist nicht gestartet')
    return _server['port']


def wait_for(condition, timeout=20, message='Bedingung nicht erreicht'):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = condition()
        if value:
            return value
        time.sleep(0.05)
    raise AssertionError(message)


class RecordingPages:
    def __init__(self):
        self.log = []

    def show_code(self, code):
        self.log.append(('code', code))

    def show_no_server(self):
        self.log.append(('no_server',))

    def show_none(self):
        self.log.append(('none',))

    def codes(self):
        return [entry[1] for entry in self.log if entry[0] == 'code']


@unittest.skipUnless(HAVE_WEBSOCKET, 'websocket-client fehlt (pip install -r requirements-dev.txt)')
@override_settings(CHANNEL_LAYERS=LAYERS, ALLOWED_HOSTS=['127.0.0.1', 'localhost', 'testserver'],
                   PUBLIC_BASE_URL='http://127.0.0.1')
class AgentEndToEndTest(TransactionTestCase):
    def setUp(self):
        sys.path.insert(0, str(AGENT_DIR))
        self.addCleanup(sys.path.remove, str(AGENT_DIR))
        self.port = live_server_port()
        self.base = f'http://127.0.0.1:{self.port}'
        profile = UserProfile.objects.create(keycloak_id='tester')
        for code in ('signage.view', 'signage.devices', 'signage.power'):
            perm, _ = Permission.objects.get_or_create(code=code, defaults={'name': code})
            profile.permissions.add(perm)
        auth = mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester', 'name': 'Tester'})
        auth.start()
        self.addCleanup(auth.stop)
        self.screen = Screen.objects.create(name='Glocke', slug='glocke')

    def api(self, method, path, body=None):
        """In-memory SQLite (shared cache) reports "table is locked" as 500 when several server
        threads access it at once; the test calls are repeatable (the transaction was rolled back),
        so a 500 is retried a few times."""
        for attempt in range(6):
            request = urllib.request.Request(
                f'{self.base}/api/monitor{path}', method=method,
                data=json.dumps(body).encode() if body is not None else None,
                headers={'Authorization': 'Bearer x', 'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    return response.status, json.loads(response.read() or b'{}')
            except urllib.error.HTTPError as err:
                raw = err.read()
                if err.code == 500 and attempt < 5:
                    time.sleep(0.2)
                    continue
                try:
                    return err.code, json.loads(raw or b'{}')
                except ValueError:
                    return err.code, {'raw': raw[:300].decode('utf-8', 'replace')}

    def start_agent(self):
        from stagedesk_agent.agent import Agent
        from stagedesk_agent.config import Config
        from stagedesk_agent.kiosk import Kiosk
        from stagedesk_agent.paths import Paths
        from tests.fakes import FakeRunner

        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        paths = Paths(Path(tmp.name))
        (paths.opt_dir).mkdir(parents=True)
        (paths.opt_dir / 'VERSION').write_text('1.0.0\n')
        config = Config.load(paths)
        config.server = self.base
        self.pages = RecordingPages()
        self.runner = FakeRunner()
        self.agent = Agent(config, self.pages, runner=self.runner, kiosk=Kiosk(self.runner, paths),
                           telemetry_interval=1)
        thread = threading.Thread(target=self.agent.run, daemon=True, name='e2e-agent')
        thread.start()

        def stop():
            self.agent.request_stop()
            self.agent.stop()
            thread.join(10)
            # Wait until the server has dropped the agent's sockets before the test database is flushed.
            end = time.monotonic() + 5
            while time.monotonic() < end and any(
                    getattr(p, 'state', None) == 'connected' for p in list(_server['server'].connections)):
                time.sleep(0.05)
        self.addCleanup(stop)
        return config

    def device_row(self, device_id):
        status, rows = self.api('GET', '/devices')
        self.assertEqual(status, 200, rows)
        return next((row for row in rows if row['id'] == device_id), None)

    def run_on_reactor(self, function, *args):
        from twisted.internet import reactor, threads
        done = threading.Event()
        box = {}

        def call():
            try:
                box['value'] = function(*args)
            except BaseException as exc:
                box['error'] = exc
            done.set()
        reactor.callFromThread(call)
        self.assertTrue(done.wait(10), 'Reactor antwortet nicht')
        if 'error' in box:
            raise box['error']
        return box.get('value')

    def stop_server(self):
        server = _server['server']

        def stop():
            from twisted.internet import reactor, tcp
            for reader in reactor.getReaders():
                if isinstance(reader, tcp.Port) and reader.getHost().port == self.port:
                    reader.stopListening()
            for protocol in list(server.connections):
                transport = getattr(protocol, 'transport', None)
                if transport is not None:
                    transport.abortConnection()
        self.run_on_reactor(stop)

    def start_server(self):
        from twisted.internet import reactor
        from twisted.internet.endpoints import serverFromString
        server = _server['server']

        def start():
            endpoint = serverFromString(reactor, f'tcp:port={self.port}:interface=127.0.0.1')
            server.listeners = [endpoint.listen(server.http_factory)]
        self.run_on_reactor(start)

    def test_e2e_server_down_and_back_reconnects_and_restarts_browser(self):
        with mock.patch('stagedesk_agent.pairing.POLL_INTERVAL', 0.2), \
                mock.patch('stagedesk_agent.connection.backoff_delays', lambda jitter=True: iter(lambda: 0.3, None)):
            config = self.start_agent()
            code = wait_for(lambda: self.pages.codes() and self.pages.codes()[-1], message='kein Kopplungscode')
            status, paired = self.api('POST', '/devices/pair', {'code': code, 'screen_id': self.screen.id})
            self.assertEqual(status, 200, paired)
            device_id = paired['id']
            wait_for(lambda: (self.device_row(device_id) or {}).get('telemetry'), message='keine Telemetrie')
            restarts = lambda: [c for c in self.runner.calls if c[0] == ('systemctl', 'restart', 'stagedesk-kiosk')]
            before = len(restarts())
            seen = self.device_row(device_id)['last_seen_at']

            self.stop_server()
            try:
                with self.assertRaises(OSError):
                    socket.create_connection(('127.0.0.1', self.port), timeout=2).close()
                wait_for(lambda: self.agent.connection.outages >= 2, message='Agent bemerkt den Ausfall nicht')
                self.assertTrue(config.token, 'Token muss einen Ausfall überstehen')
            finally:
                self.start_server()

            wait_for(lambda: self.device_row(device_id)['last_seen_at'] != seen, message='kein neues hello')
            wait_for(lambda: len(restarts()) > before, message='Browser nach dem Ausfall nicht neu gestartet')
            self.assertTrue(config.token)

    def test_e2e_pair_hello_telemetry_command_unpair(self):
        # The test reads only via the API: in-memory SQLite shares the connection between threads and
        # locks tables when the test thread reads in parallel to the server.
        with mock.patch('stagedesk_agent.pairing.POLL_INTERVAL', 0.2), \
                mock.patch('stagedesk_agent.connection.backoff_delays', lambda jitter=True: iter(lambda: 0.2, None)):
            config = self.start_agent()

            code = wait_for(lambda: self.pages.codes() and self.pages.codes()[-1], message='kein Kopplungscode')
            status, paired = self.api('POST', '/devices/pair', {'code': code, 'screen_id': self.screen.id})
            self.assertEqual(status, 200, paired)
            device_id = paired['id']

            wait_for(lambda: config.token, message='kein Token')
            row = wait_for(lambda: (self.device_row(device_id) or {}).get('telemetry') and self.device_row(device_id),
                           message='keine Telemetrie')
            self.assertIn('system', row['telemetry'])
            self.assertEqual(row['agent_version'], '1.0.0')
            self.assertEqual(config.slug, 'glocke')
            self.assertIn('screen=glocke', config.kiosk_url)

            status, command = self.api('POST', f'/devices/{device_id}/commands', {'kind': 'restart_browser'})
            self.assertEqual(status, 200, command)

            def command_status():
                return self.api('GET', f'/devices/{device_id}/commands/{command["id"]}')[1]['status']
            try:
                wait_for(lambda: command_status() == 'ok', message='Befehl nicht ausgeführt')
            except AssertionError:
                raise AssertionError(f'Befehl nicht ausgeführt: {command_status()}; '
                                     f'Aufrufe {self.runner.calls[-5:]}; Zustand {self.agent.state}')
            self.assertIn(('systemctl', 'restart', 'stagedesk-kiosk'), [call[0] for call in self.runner.calls])

            codes_before = len(self.pages.codes())
            status, _ = self.api('POST', f'/devices/{device_id}/unpair')
            self.assertEqual(status, 200)
            wait_for(lambda: len(self.pages.codes()) > codes_before, message='kein neuer Kopplungscode')
            self.assertFalse(config.token)
            status, events = self.api('GET', f'/screens/{self.screen.id}/events')
            self.assertIn('unpaired', [event['kind'] for event in events])
