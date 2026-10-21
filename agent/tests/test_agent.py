import threading
import unittest

from stagedesk_agent.agent import Agent, read_identity
from stagedesk_agent.config import Config
from stagedesk_agent.connection import Connection
from stagedesk_agent.pairing import PairingClient
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


class FakePower:
    def __init__(self, method, config):
        self.method, self.config = method, config
        self.state = "standby"
        self.calls = []
        self.stopped = False

    def set(self, on):
        self.calls.append(on)
        self.state = "an" if on else "standby"
        return self.state

    def status(self):
        return self.state

    def stop(self):
        self.stopped = True


class RecordingConn:
    """Runs scripted messages through on_message, then waits until `done` is set."""

    def __init__(self, cfg, on_message, on_auth_failed, script, done):
        self.on_message, self.script, self.done = on_message, script, done
        self.sent = []
        self.lock = threading.Lock()

    def run_forever(self):
        for message in self.script:
            self.on_message(message)
        self.done.wait(5)

    def send(self, msg):
        with self.lock:
            self.sent.append(msg)
        return True

    def of_type(self, kind):
        with self.lock:
            return [m for m in self.sent if m.get("type") == kind]


class WiringTests(unittest.TestCase):
    def setUp(self):
        self.paths = make_paths(self)
        self.cfg = Config.load(self.paths)
        self.cfg.token = "T"
        self.cfg.slug = "s"
        self.cfg.key = "k"
        self.cfg.save()
        self.made = []
        self.conns = []

    def agent(self, script, interval=0.01, collect=None):
        done = threading.Event()
        self.done = done

        def power_factory(method, config, runner):
            power = FakePower(method, config)
            self.made.append(power)
            return power

        def conn_factory(cfg, om, af):
            conn = RecordingConn(cfg, om, af, script, done)
            self.conns.append(conn)
            return conn

        return Agent(self.cfg, FakePages(), kiosk_set_url=lambda url: None,
                     connection_factory=conn_factory, power_factory=power_factory,
                     collect=collect or (lambda runner, paths, now, power_status=None: {"system": {"os": "x"}, "power": power_status}),
                     runner=object(), telemetry_interval=interval)

    def wait_for(self, predicate):
        for _ in range(500):
            if predicate():
                return True
            threading.Event().wait(0.01)
        return False

    def run_agent(self, agent, until):
        thread = threading.Thread(target=agent.run_once)
        thread.start()
        ok = self.wait_for(until)
        self.done.set()
        thread.join(5)
        self.assertTrue(ok, "condition not reached")

    def test_telemetry_sent_repeatedly_while_connected(self):
        agent = self.agent([{"type": "hello", "power_method": "cec"}])
        self.run_agent(agent, lambda: self.conns and len(self.conns[0].of_type("telemetry")) >= 3)
        first = self.conns[0].of_type("telemetry")[0]
        self.assertEqual(first["system"], {"os": "x"})
        self.assertNotIn("data", first)

    def test_telemetry_stops_after_connection_ends(self):
        agent = self.agent([])
        self.run_agent(agent, lambda: self.conns and self.conns[0].of_type("telemetry"))
        count = len(self.conns[0].of_type("telemetry"))
        threading.Event().wait(0.1)
        self.assertLessEqual(len(self.conns[0].of_type("telemetry")), count + 1)

    def test_telemetry_survives_collect_error(self):
        calls = []

        def collect(runner, paths, now, power_status=None):
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError("boom")
            return {"system": {}}
        agent = self.agent([], collect=collect)
        self.run_agent(agent, lambda: self.conns and self.conns[0].of_type("telemetry"))

    def test_power_command_switches_and_reports_status(self):
        agent = self.agent([{"type": "hello", "power_method": "hdmi", "power_config": {"output": "X"}},
                            {"type": "power_command", "power": True}], interval=60)
        self.run_agent(agent, lambda: self.conns and {"type": "power_status", "status": "an"} in self.conns[0].of_type("power_status"))
        self.assertEqual(self.made[-1].method, "hdmi")
        self.assertEqual(self.made[-1].config, {"output": "X"})
        self.assertEqual(self.made[-1].calls, [True])
        self.assertIn({"type": "power_status", "status": "an"}, self.conns[0].of_type("power_status"))

    def test_power_command_skipped_when_already_in_state(self):
        agent = self.agent([{"type": "hello", "power_method": "cec"}, {"type": "power_command", "power": False}],
                           interval=60)
        self.run_agent(agent, lambda: self.conns and self.conns[0].of_type("power_status"))
        threading.Event().wait(0.05)
        self.assertEqual(self.made[0].calls, [])

    def test_controller_rebuilt_only_when_method_or_config_changes(self):
        agent = self.agent([
            {"type": "hello", "power_method": "cec", "power_config": {}},
            {"type": "power_command", "power": True},
            {"type": "hello", "power_method": "cec", "power_config": {}},
            {"type": "power_command", "power": False},
            {"type": "hello", "power_method": "ddc", "power_config": {"vcp_on": "01"}},
            {"type": "power_command", "power": True},
        ], interval=60)
        self.run_agent(agent, lambda: len(self.made) == 2 and self.made[1].calls == [True])
        self.assertEqual([p.method for p in self.made], ["cec", "ddc"])
        self.assertEqual(self.made[0].calls, [True, False])
        self.assertTrue(self.made[0].stopped)

    def test_unknown_method_reports_error_text(self):
        def power_factory(method, config, runner):
            raise ValueError("unbekannte Power-Methode: laser")
        done = threading.Event()
        self.done = done
        script = [{"type": "hello", "power_method": "laser"}, {"type": "power_command", "power": True}]
        conns = self.conns
        agent = Agent(self.cfg, FakePages(), power_factory=power_factory, runner=object(), telemetry_interval=60,
                      collect=lambda *a, **k: {},
                      connection_factory=lambda c, om, af: conns.append(RecordingConn(c, om, af, script, done)) or conns[-1])
        self.run_agent(agent, lambda: conns and conns[0].of_type("power_status"))
        self.assertEqual(conns[0].of_type("power_status")[0]["status"], "Fehler: unbekannte Power-Methode: laser")


class HelloGatedConn(RecordingConn):
    """send() fails until hello was delivered, like a transport that does not exist yet."""

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.ready = False

    def run_forever(self):
        threading.Event().wait(0.1)  # the telemetry thread tries (and fails) meanwhile
        self.ready = True
        super().run_forever()

    def send(self, msg):
        return self.ready and super().send(msg)


class FirstSendTests(unittest.TestCase):
    setUp = WiringTests.setUp
    wait_for = WiringTests.wait_for
    run_agent = WiringTests.run_agent

    def test_telemetry_sent_right_after_hello_not_after_a_minute(self):
        done = threading.Event()
        self.done = done
        conns = self.conns
        agent = Agent(self.cfg, FakePages(), power_factory=lambda m, c, r: FakePower(m, c), runner=object(),
                      telemetry_interval=60, telemetry_retry=60, collect=lambda *a, **k: {"system": {}},
                      connection_factory=lambda c, om, af: conns.append(
                          HelloGatedConn(c, om, af, [{"type": "hello", "power_method": "cec"}], done)) or conns[-1])
        self.run_agent(agent, lambda: conns and conns[0].of_type("telemetry") and conns[0].of_type("power_status"))

    def test_failed_send_is_retried_quickly(self):
        done = threading.Event()
        self.done = done
        conns = self.conns
        agent = Agent(self.cfg, FakePages(), power_factory=lambda m, c, r: FakePower(m, c), runner=object(),
                      telemetry_interval=60, telemetry_retry=0.01, collect=lambda *a, **k: {"system": {}},
                      connection_factory=lambda c, om, af: conns.append(
                          HelloGatedConn(c, om, af, [], done)) or conns[-1])
        self.run_agent(agent, lambda: conns and conns[0].of_type("telemetry"))

    def test_power_command_does_not_block_the_reader(self):
        gate = threading.Event()

        class Slow(FakePower):
            def set(self, on):
                gate.wait(5)
                return super().set(on)
        agent = Agent(self.cfg, FakePages(), power_factory=lambda m, c, r: Slow(m, c), runner=object(),
                      collect=lambda *a, **k: {}, telemetry_interval=60)
        sent = []
        agent.connection = type("C", (), {"send": lambda s, m: sent.append(m) or True})()
        started = threading.Event()
        threading.Thread(target=lambda: (agent.on_message({"type": "power_command", "power": True}),
                                         started.set())).start()
        self.assertTrue(started.wait(2), "on_message blocked on the power command")
        gate.set()
        self.assertTrue(self.wait_for(lambda: {"type": "power_status", "status": "an"} in sent))


class StopTests(unittest.TestCase):
    def setUp(self):
        self.paths = make_paths(self)
        self.cfg = Config.load(self.paths)

    def test_request_stop_does_not_take_connection_lock(self):
        """SIGTERM can arrive while the main thread sits inside Connection.send (lock held)."""
        agent = Agent(self.cfg, FakePages())
        conn = Connection(self.cfg, lambda m: None, lambda: None, transport_factory=lambda *a: None)
        agent.connection = conn
        finished = threading.Event()
        with conn._lock:
            thread = threading.Thread(target=lambda: (agent.request_stop(), finished.set()))
            thread.start()
            self.assertTrue(finished.wait(2), "request_stop blocked on the connection lock")
        thread.join()
        self.assertTrue(agent.stop_event.is_set())

    def test_stop_between_check_and_connection_creation_is_not_lost(self):
        self.cfg.token, self.cfg.slug = "T", "s"
        attempts = []

        def factory(cfg, om, af):
            agent.request_stop()  # arrives after run_once checked, before the connection exists
            return Connection(cfg, om, af, transport_factory=lambda *a: attempts.append(1),
                              stop_event=agent.stop_event)
        agent = Agent(self.cfg, FakePages(), connection_factory=factory)
        agent.run_once()
        self.assertEqual(attempts, [])

    def test_stop_between_check_and_pairing_creation_is_not_lost(self):
        posts = []

        def factory(cfg):
            agent.request_stop()
            return PairingClient(cfg, http_post=lambda *a, **k: posts.append(1), stop_event=agent.stop_event)
        agent = Agent(self.cfg, FakePages(), pairing_factory=factory)
        agent.run_once()
        self.assertEqual(posts, [])

    def test_watcher_closes_connection_after_request_stop(self):
        agent = Agent(self.cfg, FakePages())
        closed = threading.Event()
        agent.connection = type("C", (), {"stop": lambda s: closed.set()})()
        agent.start_stop_watcher()
        agent.request_stop()
        self.assertTrue(closed.wait(2))
