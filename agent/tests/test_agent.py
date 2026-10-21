import unittest

from stagedesk_agent.agent import Agent, read_identity
from stagedesk_agent.config import Config
from tests.fakes import make_paths


class FakePages:
    def __init__(self):
        self.log = []

    def show_code(self, code):
        self.log.append(("code", code))

    def show_no_server(self):
        self.log.append(("no_server",))

    def show_none(self):
        self.log.append(("none",))


class FakePairing:
    def __init__(self, cfg, result=True):
        self.cfg, self.result = cfg, result

    def run(self, on_code, on_unreachable=None, **kw):
        on_code("482913")
        if self.result:
            self.cfg.token, self.cfg.slug, self.cfg.key = "T", "s", "k"
            self.cfg.kiosk_url = None
            self.cfg.save()
        return self.result


class FakeConn:
    def __init__(self, cfg, on_message, on_auth_failed, fail=False):
        self.cfg = cfg
        self.on_message, self.on_auth_failed, self.fail = on_message, on_auth_failed, fail

    def run_forever(self):
        self.on_message({"type": "hello", "slug": "neu", "key": "k9", "kiosk_url": "https://x/m?screen=neu"})
        if self.fail:
            self.cfg.clear_pairing()  # the real Connection does this before the callback
            self.on_auth_failed()

    def send(self, msg):
        return True


class AgentTests(unittest.TestCase):
    def setUp(self):
        self.paths = make_paths(self)
        self.cfg = Config.load(self.paths)
        self.pages = FakePages()
        self.kiosk = []

    def agent(self, conn_fail=False):
        a = Agent(self.cfg, self.pages, kiosk_set_url=self.kiosk.append,
                  pairing_factory=lambda cfg: FakePairing(cfg),
                  connection_factory=lambda cfg, om, af: FakeConn(cfg, om, af, conn_fail))
        return a

    def test_without_token_pairs_shows_code_and_local_kiosk(self):
        a = self.agent()
        a.run_once()
        self.assertIn(("code", "482913"), self.pages.log)
        self.assertEqual(self.kiosk[0], "http://127.0.0.1:8765/")

    def test_hello_updates_config_and_kiosk_url(self):
        self.cfg.token = "T"
        self.cfg.save()
        self.agent().run_once()
        again = Config.load(self.paths)
        self.assertEqual((again.slug, again.key), ("neu", "k9"))
        self.assertEqual(self.kiosk[-1], "https://x/m?screen=neu")

    def test_auth_failed_goes_back_to_pairing(self):
        self.cfg.token = "T"
        self.cfg.save()
        a = self.agent(conn_fail=True)
        a.run_once()
        self.assertIsNone(Config.load(self.paths).token)
        self.assertEqual(a.state, "pairing")

    def test_identity_from_paths(self):
        (self.paths.proc / "device-tree").mkdir(parents=True)
        (self.paths.proc / "cpuinfo").write_text("processor : 0\nSerial\t\t: 10000000abcdef01\n")
        (self.paths.proc / "device-tree" / "model").write_bytes(b"Raspberry Pi 4 Model B\x00")
        self.assertEqual(read_identity(self.paths), ("10000000abcdef01", "Raspberry Pi 4 Model B"))

    def test_identity_missing_files(self):
        serial, model = read_identity(self.paths)
        self.assertEqual((serial, model), ("unknown", "unknown"))

    def test_after_4003_next_run_once_starts_pairing_and_shows_code(self):
        self.cfg.token = "T"
        self.cfg.save()
        a = self.agent(conn_fail=True)
        a.run_once()
        self.pages.log.clear()
        a.run_once()
        self.assertIn(("code", "482913"), self.pages.log)
        self.assertEqual(self.kiosk[-1], "http://127.0.0.1:8765/")

    def test_kiosk_url_derived_right_after_pairing(self):
        a = self.agent()
        a.run_once()          # pairing
        self.kiosk.clear()
        self.cfg.token = "T"   # connection will fail before hello in this variant
        a.connection_factory = lambda cfg, om, af: type("C", (), {"run_forever": lambda s: None})()
        a.run_once()
        self.assertEqual(self.kiosk, ["https://stagedesk.t410.de/monitor?screen=s&key=k"])
