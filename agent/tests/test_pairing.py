import unittest
from datetime import datetime, timedelta, timezone

from stagedesk_agent.config import Config
from stagedesk_agent.pairing import PairingClient
from tests.fakes import make_paths

T0 = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)


def iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


class FakeHttp:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def __call__(self, url, payload):
        self.calls.append((url, payload))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


class PairingTests(unittest.TestCase):
    def setUp(self):
        self.cfg = Config.load(make_paths(self))
        self.clock = [0.0]

    def client(self, replies):
        self.http = FakeHttp(replies)
        return PairingClient(self.cfg, self.http, serial="abc", model="Pi 4", now=lambda: T0, monotonic=lambda: self.clock[0])

    def test_start_returns_code_and_posts_identity(self):
        c = self.client([(200, {"code": "482913", "pairing_id": "pid", "expires_at": iso(T0 + timedelta(minutes=15))})])
        code, pid, exp = c.start()
        self.assertEqual((code, pid), ("482913", "pid"))
        self.assertEqual(self.http.calls[0], ("https://stagedesk.t410.de/api/signage/agent/pair/start",
                                              {"serial": "abc", "model": "Pi 4"}))

    def test_poll_waiting_is_none(self):
        c = self.client([(202, {"status": "waiting"})])
        self.assertIsNone(c.poll("pid"))

    def test_pairing_success_saves_token_slug_key(self):
        c = self.client([(200, {"status": "paired", "token": "T", "slug": "mensa", "key": "K"})])
        result = c.poll("pid")
        self.assertEqual(result["status"], "paired")
        again = Config.load(self.cfg.paths)
        self.assertEqual((again.token, again.slug, again.key), ("T", "mensa", "K"))

    def test_poll_404_and_410_mean_expired(self):
        for status in (404, 410):
            c = self.client([(status, {"detail": "x"})])
            self.assertEqual(c.poll("pid"), {"status": "expired"})

    def test_pairing_requests_new_code_after_expiry(self):
        exp1 = iso(T0 + timedelta(minutes=15))
        exp2 = iso(T0 + timedelta(minutes=40))
        c = self.client([
            (200, {"code": "111111", "pairing_id": "p1", "expires_at": exp1}),
            (202, {"status": "waiting"}),
            (200, {"code": "222222", "pairing_id": "p2", "expires_at": exp2}),
            (200, {"status": "paired", "token": "T", "slug": "s", "key": "k"}),
        ])
        codes = []

        def sleep(seconds):
            self.clock[0] += 8 * 60

        self.assertTrue(c.run(on_code=codes.append, sleep=sleep, poll_interval=5))
        self.assertEqual(codes, ["111111", "222222"])
        self.assertEqual(self.cfg.token, "T")

    def test_gone_on_poll_starts_new_pairing(self):
        far = iso(T0 + timedelta(hours=5))
        c = self.client([
            (200, {"code": "111111", "pairing_id": "p1", "expires_at": far}),
            (410, {}),
            (200, {"code": "222222", "pairing_id": "p2", "expires_at": far}),
            (200, {"status": "paired", "token": "T", "slug": "s", "key": "k"}),
        ])
        codes = []
        self.assertTrue(c.run(on_code=codes.append, sleep=lambda s: None))
        self.assertEqual(codes, ["111111", "222222"])

    def test_network_error_reports_unreachable_and_retries(self):
        far = iso(T0 + timedelta(hours=5))
        c = self.client([
            OSError("down"),
            (200, {"code": "111111", "pairing_id": "p1", "expires_at": far}),
            (200, {"status": "paired", "token": "T", "slug": "s", "key": "k"}),
        ])
        events = []
        c.run(on_code=lambda code: events.append(code), on_unreachable=lambda: events.append("down"),
              sleep=lambda s: None)
        self.assertEqual(events, ["down", "111111"])

    def test_stop_ends_loop(self):
        c = self.client([OSError("down")] * 5)
        self.assertFalse(c.run(on_code=lambda c: None, sleep=lambda s: c.stop()))


    def _far(self):
        return iso(T0 + timedelta(hours=1) - timedelta(minutes=1))

    def test_code_shown_again_after_network_recovers(self):
        c = self.client([
            (200, {"code": "111111", "pairing_id": "p1", "expires_at": self._far()}),
            OSError("down"),
            (202, {"status": "waiting"}),
            (200, {"status": "paired", "token": "T", "slug": "s", "key": "k"}),
        ])
        events = []
        c.run(on_code=events.append, on_unreachable=lambda: events.append("down"), sleep=lambda s: None)
        self.assertEqual(events, ["111111", "down", "111111"])

    def test_server_errors_keep_code_and_back_off(self):
        c = self.client([
            (200, {"code": "111111", "pairing_id": "p1", "expires_at": self._far()}),
            (503, {}),
            (429, {}),
            (200, {"status": "paired", "token": "T", "slug": "s", "key": "k"}),
        ])
        events, sleeps = [], []
        c.run(on_code=events.append, on_unreachable=lambda: events.append("down"), sleep=sleeps.append)
        self.assertEqual(events, ["111111"])
        self.assertEqual(sleeps, [5, 5, 10])

    def test_malformed_answer_retries(self):
        c = self.client([
            (200, {"nonsense": 1}),
            (200, {"code": "111111", "pairing_id": "p1", "expires_at": self._far()}),
            (200, {"status": "paired"}),
            (200, {"code": "222222", "pairing_id": "p2", "expires_at": self._far()}),
            (200, {"status": "paired", "token": "T", "slug": "s", "key": "k"}),
        ])
        codes = []
        self.assertTrue(c.run(on_code=codes.append, sleep=lambda s: None))
        self.assertEqual(codes, ["111111", "222222"])

    def test_wrong_device_clock_does_not_loop_tightly(self):
        # expires_at already in the past by the device clock: falls back to 15 min from receipt
        c = self.client([(200, {"code": "111111", "pairing_id": "p1", "expires_at": iso(T0 - timedelta(days=3))})])
        c.start()
        self.assertEqual(c._deadline, 15 * 60)

    def test_lifetime_measured_from_receipt(self):
        c = self.client([(200, {"code": "1", "pairing_id": "p", "expires_at": iso(T0 + timedelta(minutes=10))})])
        self.clock[0] = 1000.0
        c.start()
        self.assertEqual(c._deadline, 1000.0 + 600)
