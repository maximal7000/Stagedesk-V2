import json
import unittest

from stagedesk_agent.config import Config
from stagedesk_agent.connection import Connection, ConnectionClosed
from tests.fakes import make_paths


class FakeTransport:
    def __init__(self, script):
        self.script = list(script)
        self.sent = []

    def recv(self):
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    def send(self, text):
        self.sent.append(json.loads(text))

    def close(self):
        pass


class Factory:
    def __init__(self, transports):
        self.transports = list(transports)
        self.calls = []

    def __call__(self, url, headers):
        self.calls.append((url, headers))
        item = self.transports.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def delays():
    while True:
        yield 5


class ConnectionTests(unittest.TestCase):
    def setUp(self):
        self.cfg = Config.load(make_paths(self))
        self.cfg.token, self.cfg.slug, self.cfg.key = "TOK", "mensa", "k"
        self.cfg.save()
        self.messages = []
        self.failed = []
        self.sleeps = []

    def conn(self, factory):
        c = Connection(self.cfg, self.messages.append, lambda: self.failed.append(True),
                       transport_factory=factory, delays=delays, sleep=self.sleeps.append)
        return c

    def test_url_and_bearer_header(self):
        t = FakeTransport([ConnectionClosed(4003)])
        f = Factory([t])
        self.conn(f).run_forever()
        url, headers = f.calls[0]
        self.assertEqual(url, "wss://stagedesk.t410.de/ws/monitor/pi/mensa/")
        self.assertEqual(headers, {"Authorization": "Bearer TOK"})

    def test_http_server_uses_ws_scheme(self):
        self.cfg.server = "http://127.0.0.1:8000"
        f = Factory([FakeTransport([ConnectionClosed(4003)])])
        self.conn(f).run_forever()
        self.assertEqual(f.calls[0][0], "ws://127.0.0.1:8000/ws/monitor/pi/mensa/")

    def test_auth_failed_4003_clears_token_and_restarts_pairing(self):
        f = Factory([FakeTransport([ConnectionClosed(4003)])])
        self.conn(f).run_forever()
        self.assertEqual(self.failed, [True])
        self.assertIsNone(Config.load(self.cfg.paths).token)
        self.assertEqual(f.transports, [])

    def test_ping_answered_with_pong_and_not_forwarded(self):
        t = FakeTransport([json.dumps({"type": "ping"}), json.dumps({"type": "hello", "slug": "x"}),
                           ConnectionClosed(4003)])
        self.conn(Factory([t])).run_forever()
        self.assertEqual(t.sent, [{"type": "pong"}])
        self.assertEqual(self.messages, [{"type": "hello", "slug": "x"}])

    def test_reconnects_with_backoff_after_drop_and_errors(self):
        t2 = FakeTransport([ConnectionClosed(4003)])
        f = Factory([OSError("no network"), FakeTransport([ConnectionClosed(1006)]), t2])
        self.conn(f).run_forever()
        self.assertEqual(self.sleeps, [5, 5])
        self.assertEqual(len(f.calls), 3)

    def test_backoff_resets_after_successful_connect(self):
        f = Factory([OSError("x"), FakeTransport(["{}", ConnectionClosed(1006)]),
                     OSError("y"), FakeTransport([ConnectionClosed(4003)])])
        c = Connection(self.cfg, self.messages.append, lambda: None, transport_factory=f,
                       delays=lambda: iter([5, 10, 20]), sleep=self.sleeps.append)
        c.run_forever()
        # fail(5), drop after a good connect (reset -> 5), fail (10)
        self.assertEqual(self.sleeps, [5, 5, 10])

    def test_backoff_not_reset_when_no_message_arrived(self):
        f = Factory([FakeTransport([ConnectionClosed(1006)]), OSError("x"),
                     FakeTransport([ConnectionClosed(4003)])])
        c = Connection(self.cfg, self.messages.append, lambda: None, transport_factory=f,
                       delays=lambda: iter([5, 10, 20]), sleep=self.sleeps.append)
        c.run_forever()
        self.assertEqual(self.sleeps, [5, 10])

    def test_stop_interrupts_backoff_wait(self):
        import threading
        import time
        f = Factory([OSError("x")])
        c = Connection(self.cfg, self.messages.append, lambda: None, transport_factory=f,
                       delays=lambda: iter([60]))
        worker = threading.Thread(target=c.run_forever)
        worker.start()
        time.sleep(0.1)
        started = time.monotonic()
        c.stop()
        worker.join(5)
        self.assertFalse(worker.is_alive())
        self.assertLess(time.monotonic() - started, 2)

    def test_bad_json_ignored(self):
        t = FakeTransport(["not json", ConnectionClosed(4003)])
        self.conn(Factory([t])).run_forever()
        self.assertEqual(self.messages, [])

    def test_send_without_connection_returns_false(self):
        c = self.conn(Factory([]))
        self.assertFalse(c.send({"type": "x"}))

    def test_send_while_connected(self):
        t = FakeTransport([])
        c = self.conn(Factory([t]))

        def on_msg(m):
            self.assertTrue(c.send({"type": "telemetry"}))
            raise ConnectionClosed(4003)

        t.script = [json.dumps({"type": "hello"})]
        c.on_message = on_msg
        c.run_forever()
        self.assertEqual(t.sent, [{"type": "telemetry"}])

    def test_stop_ends_loop(self):
        c = self.conn(Factory([OSError("x")]))
        c.sleep = lambda s: c.stop()
        c.run_forever()

    def test_no_token_does_not_connect(self):
        self.cfg.token = None
        f = Factory([])
        self.conn(f).run_forever()
        self.assertEqual(f.calls, [])
