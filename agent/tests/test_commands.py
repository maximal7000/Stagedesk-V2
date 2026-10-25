import io
import json
import os
import threading
import unittest
import urllib.error

from stagedesk_agent import commands
from stagedesk_agent.agent import Agent
from stagedesk_agent.commands import CommandContext, execute, upload_screenshot
from stagedesk_agent.config import Config
from stagedesk_agent.runner import RunResult
from tests.fakes import FakeRunner, make_paths
from tests.test_agent import FakePages, FakePower, RecordingConn

ACTIVE = ("systemctl", "is-active", "stagedesk-kiosk")
RESTART = ("systemctl", "restart", "stagedesk-kiosk")


class FakeKiosk:
    def __init__(self, running=True):
        self.running, self.log = running, []

    def is_running(self):
        return self.running

    def restart(self):
        self.log.append("restart")
        return True

    def apply(self, url):
        self.log.append(("apply", url))
        return True


class FakeUpdater:
    def __init__(self):
        self.calls = []

    def run(self, manual=False):
        self.calls.append(manual)
        return {"ok": True, "text": "2 Pakete aktualisiert"}


class Base(unittest.TestCase):
    def setUp(self):
        self.paths = make_paths(self)
        self.cfg = Config.load(self.paths)
        self.cfg.token, self.cfg.slug = "TOK", "eingang"
        self.cfg.server = "https://srv.example"
        self.cfg.kiosk_url = "https://srv.example/monitor?screen=eingang&key=k"
        self.runner = FakeRunner()
        self.kiosk = FakeKiosk()
        self.deferred = []
        self.uploads = []
        self.shot = self.paths.root / "sd-shot.png"
        self.telemetry = {"display": {"browser_running": True, "resolution": "3840x2160"}}
        self.power_calls = []
        self.pages = type("P", (), {"shots": [], "none": 0,
                                    "show_test_pattern": lambda s, n, r, sec=60: s.shots.append((n, r, sec)),
                                    "show_none": lambda s: setattr(s, "none", s.none + 1)})()
        self.updater = FakeUpdater()
        self.ctx = CommandContext(
            config=self.cfg, kiosk=self.kiosk, pages=self.pages, runner=self.runner, updater=self.updater,
            apply_power=lambda on: self.power_calls.append(on) or ("an" if on else "standby"),
            last_telemetry=lambda: self.telemetry, set_kiosk=lambda url: self.kiosk.apply(url),
            defer=lambda delay, fn, key=None: self.deferred.append((delay, fn, key)),
            upload=lambda *a: self.uploads.append(a) or (True, "Screenshot hochgeladen"), screenshot_path=self.shot)


class ExecuteTests(Base):
    def test_power_probe_returns_json_under_2000_chars(self):
        ok, text = execute({"id": 1, "kind": "power_probe"}, self.ctx)
        self.assertTrue(ok)
        data = json.loads(text)
        self.assertIn("checked_at", data)
        self.assertEqual([row["method"] for row in data["methods"]], ["cec", "sicp", "ddc", "hdmi"])
        self.assertLess(len(text), 2000)

    def test_unknown_command_fails(self):
        self.assertEqual(execute({"id": 1, "kind": "dance"}, self.ctx), (False, "Unbekannter Befehl"))

    def test_reload_only_restarts_kiosk_when_not_running(self):
        self.assertEqual(execute({"kind": "reload"}, self.ctx), (True, "Neu geladen"))
        self.assertEqual(self.kiosk.log, [])
        self.kiosk.running = False
        self.assertEqual(execute({"kind": "reload"}, self.ctx)[0], True)
        self.assertEqual(self.kiosk.log, ["restart"])

    def test_reload_restarts_kiosk_when_last_telemetry_says_browser_down(self):
        self.telemetry = {"display": {"browser_running": False}}
        self.assertTrue(execute({"kind": "reload"}, self.ctx)[0])
        self.assertEqual(self.kiosk.log, ["restart"])

    def test_restart_browser(self):
        self.assertEqual(execute({"kind": "restart_browser"}, self.ctx)[0], True)
        self.assertEqual(self.kiosk.log, ["restart"])

    def test_power_commands_use_power_module(self):
        self.assertEqual(execute({"kind": "power_on"}, self.ctx), (True, "Bildschirm: an"))
        self.assertEqual(execute({"kind": "power_off"}, self.ctx), (True, "Bildschirm: standby"))
        self.assertEqual(self.power_calls, [True, False])

    def test_power_error_status_is_failure(self):
        self.ctx.apply_power = lambda on: "Fehler: cec-client fehlt"
        self.assertEqual(execute({"kind": "power_on"}, self.ctx), (False, "Fehler: cec-client fehlt"))

    def test_update_now_calls_updater_manual(self):
        self.assertEqual(execute({"kind": "update_now"}, self.ctx), (True, "2 Pakete aktualisiert"))
        self.assertEqual(self.updater.calls, [True])

    def test_update_now_failure_and_crash(self):
        self.updater.run = lambda manual=False: {"ok": False, "text": "apt belegt"}
        self.assertEqual(execute({"kind": "update_now"}, self.ctx), (False, "apt belegt"))

        def boom(manual=False):
            raise RuntimeError("kaputt")
        self.updater.run = boom
        ok, text = execute({"kind": "update_now"}, self.ctx)
        self.assertFalse(ok)
        self.assertIn("kaputt", text)

    def test_reboot_is_deferred_not_immediate(self):
        self.assertEqual(execute({"kind": "reboot"}, self.ctx), (True, "Pi startet in 3 Sekunden neu"))
        self.assertNotIn(("systemctl", "reboot"), [args for args, _ in self.runner.calls])
        self.assertEqual([d[0] for d in self.deferred], [3])
        self.deferred[0][1]()
        self.assertIn((("systemctl", "reboot"), None), self.runner.calls)

    PNG = b"\x89PNG\r\n\x1a\n" + b"data"

    def grim_does(self, action):
        def run(args, timeout=30, user=None, input=None):
            self.runner.calls.append((tuple(args), user))
            action()
            return RunResult(0, "", "")
        self.ctx.runner = type("R", (), {"run": staticmethod(run)})()

    def test_screenshot_uploads_with_token(self):
        self.grim_does(lambda: self.shot.write_bytes(self.PNG))
        self.assertEqual(execute({"kind": "screenshot"}, self.ctx), (True, "Screenshot hochgeladen"))
        (call, user), = [c for c in self.runner.calls if "grim" in c[0]]
        self.assertEqual(user, "pi")
        self.assertEqual(call[-3:], ("-o", "HDMI-A-1", str(self.shot)))
        self.assertEqual(call[0], "env")
        self.assertIn("XDG_RUNTIME_DIR=/run/user/1000", call)
        self.assertEqual(self.uploads, [("https://srv.example", "TOK", self.PNG)])
        self.assertFalse(self.shot.exists())

    def test_screenshot_default_path_is_in_pi_runtime_dir(self):
        self.ctx.screenshot_path = None
        seen = []
        self.ctx.runner = type("R", (), {"run": staticmethod(lambda a, timeout=30, user=None, input=None:
                                                              (seen.append(a), RunResult(1, "", "x"))[1])})()
        execute({"kind": "screenshot"}, self.ctx)
        self.assertEqual(seen[0][-1], str(self.paths.runtime_dir / "sd-shot.png"))
        self.assertTrue(str(self.paths.runtime_dir).endswith("run/user/1000"))

    def test_screenshot_uses_power_output(self):
        self.cfg.power_config = {"output": "HDMI-A-2"}
        self.grim_does(lambda: self.shot.write_bytes(self.PNG))
        execute({"kind": "screenshot"}, self.ctx)
        (call, _), = [c for c in self.runner.calls if "grim" in c[0]]
        self.assertEqual(call[-3:], ("-o", "HDMI-A-2", str(self.shot)))

    def test_screenshot_grim_failure(self):
        self.ctx.runner = type("R", (), {"run": staticmethod(lambda *a, **k: RunResult(1, "", "no wayland"))})()
        ok, text = execute({"kind": "screenshot"}, self.ctx)
        self.assertFalse(ok)
        self.assertIn("no wayland", text)
        self.assertEqual(self.uploads, [])

    def test_screenshot_too_large_not_uploaded(self):
        self.grim_does(lambda: self.shot.write_bytes(self.PNG + b"0" * commands.MAX_SCREENSHOT))
        ok, text = execute({"kind": "screenshot"}, self.ctx)
        self.assertFalse(ok)
        self.assertIn("15 MB", text)
        self.assertEqual(self.uploads, [])
        self.assertFalse(self.shot.exists())

    def test_screenshot_symlink_rejected(self):
        secret = self.paths.root / "secret"
        secret.write_bytes(self.PNG)
        self.grim_does(lambda: (self.shot.unlink(missing_ok=True), os.symlink(secret, self.shot)))
        ok, _ = execute({"kind": "screenshot"}, self.ctx)
        self.assertFalse(ok)
        self.assertEqual(self.uploads, [])
        self.assertTrue(secret.exists())  # only the link is removed

    def test_screenshot_fifo_rejected_without_hanging(self):
        self.grim_does(lambda: os.mkfifo(self.shot))
        result = []
        thread = threading.Thread(target=lambda: result.append(execute({"kind": "screenshot"}, self.ctx)), daemon=True)
        thread.start()
        thread.join(3)
        self.assertFalse(thread.is_alive(), "reading a FIFO blocked")
        self.assertFalse(result[0][0])
        self.assertEqual(self.uploads, [])

    def test_screenshot_without_png_magic_rejected(self):
        self.grim_does(lambda: self.shot.write_bytes(b"not a png"))
        self.assertFalse(execute({"kind": "screenshot"}, self.ctx)[0])
        self.assertEqual(self.uploads, [])

    def test_test_pattern_returns_to_kiosk_url_after_60s(self):
        self.assertEqual(execute({"kind": "test_pattern"}, self.ctx), (True, "Testbild für 60 Sekunden"))
        self.assertEqual(self.pages.shots, [("eingang", "3840x2160", 60)])
        self.assertEqual(self.kiosk.log, [("apply", "http://127.0.0.1:8765/")])
        self.assertEqual([d[0] for d in self.deferred], [60])
        self.deferred[0][1]()  # the clock reaches 60 s
        self.assertEqual(self.kiosk.log[-1], ("apply", self.cfg.kiosk_url))

    def test_test_pattern_expiry_without_kiosk_url_shows_status_page(self):
        self.cfg.kiosk_url = None
        execute({"kind": "test_pattern"}, self.ctx)
        self.deferred[0][1]()
        self.assertEqual(self.pages.none, 1)
        self.assertEqual(self.kiosk.log, [("apply", "http://127.0.0.1:8765/")])

    def test_test_pattern_defers_with_key(self):
        execute({"kind": "test_pattern"}, self.ctx)
        self.assertEqual(self.deferred[0][2], "test_pattern")


class FakeResponse:
    def __init__(self, status=200):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class UploadTests(unittest.TestCase):
    def test_multipart_request(self):
        seen = {}

        def opener(request, timeout=None):
            seen["request"], seen["timeout"] = request, timeout
            return FakeResponse(200)
        self.assertEqual(upload_screenshot("https://srv.example/", "TOK", b"PNGDATA", opener=opener), (True, "Screenshot hochgeladen"))
        request = seen["request"]
        self.assertEqual(request.full_url, "https://srv.example/api/signage/agent/screenshot")
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("Authorization"), "Bearer TOK")
        self.assertTrue(request.get_header("Content-type").startswith("multipart/form-data; boundary="))
        self.assertIn(b'name="file"', request.data)
        self.assertIn(b"PNGDATA", request.data)

    def test_http_errors_have_texts(self):
        def failing(code):
            def opener(request, timeout=None):
                raise urllib.error.HTTPError(request.full_url, code, "x", {}, io.BytesIO(b""))
            return opener
        self.assertIn("Token", upload_screenshot("https://s", "T", b"x", opener=failing(401))[1])
        self.assertIn("15 MB", upload_screenshot("https://s", "T", b"x", opener=failing(413))[1])
        self.assertFalse(upload_screenshot("https://s", "T", b"x", opener=failing(500))[0])

    def test_network_error(self):
        def opener(request, timeout=None):
            raise urllib.error.URLError("nicht erreichbar")
        ok, text = upload_screenshot("https://s", "T", b"x", opener=opener)
        self.assertFalse(ok)
        self.assertIn("nicht erreichbar", text)


class AgentCommandTests(unittest.TestCase):
    def setUp(self):
        self.paths = make_paths(self)
        self.cfg = Config.load(self.paths)
        self.cfg.token, self.cfg.slug, self.cfg.key = "T", "s", "k"
        self.cfg.save()
        self.made = []
        self.conns = []

    def build(self, script, runner=None, timer=None):
        done = threading.Event()
        self.done = done

        def power_factory(method, config, r):
            p = FakePower(method, config)
            self.made.append(p)
            return p
        agent = Agent(self.cfg, FakePages(), kiosk_set_url=lambda url: None, runner=runner or FakeRunner(),
                      power_factory=power_factory, collect=lambda *a, **k: {"display": {"browser_running": True}},
                      telemetry_interval=60, timer_factory=timer,
                      connection_factory=lambda c, om, af: self.conns.append(RecordingConn(c, om, af, script, done)) or self.conns[-1])
        return agent

    def run_agent(self, agent, until):
        thread = threading.Thread(target=agent.run_once)
        thread.start()
        for _ in range(500):
            if until():
                break
            threading.Event().wait(0.01)
        self.done.set()
        thread.join(5)

    def results(self):
        return self.conns[0].of_type("command_result") if self.conns else []

    def test_power_command_from_server_switches_display(self):
        agent = self.build([{"type": "hello", "power_method": "cec"},
                            {"type": "command", "id": 7, "kind": "power_on", "params": {}}])
        self.run_agent(agent, lambda: self.results())
        self.assertEqual(self.results(), [{"type": "command_result", "id": 7, "ok": True, "text": "Bildschirm: an"}])
        self.assertEqual(self.made[0].calls, [True])

    def test_unknown_command_gets_result(self):
        agent = self.build([{"type": "command", "id": 3, "kind": "x"}])
        self.run_agent(agent, lambda: self.results())
        self.assertEqual(self.results()[0], {"type": "command_result", "id": 3, "ok": False, "text": "Unbekannter Befehl"})

    def test_reboot_acknowledged_before_reboot(self):
        order = []
        runner = FakeRunner()
        real_run = runner.run
        runner.run = lambda args, **kw: (order.append(("run", tuple(args))), real_run(args, **kw))[1]
        timers = []

        class FakeTimer:
            def __init__(self, delay, fn):
                self.delay, self.fn, self.daemon, self.cancelled = delay, fn, False, False
                timers.append(self)

            def start(self):
                order.append(("timer_started", self.delay))

            def cancel(self):
                self.cancelled = True
        agent = self.build([{"type": "command", "id": 9, "kind": "reboot"}], runner=runner, timer=FakeTimer)
        self.run_agent(agent, lambda: self.results() and timers)
        self.assertEqual(self.results()[0]["id"], 9)
        self.assertTrue(self.results()[0]["ok"])
        self.assertEqual(order, [("timer_started", 3)])  # nothing ran yet; the ack is already sent
        timers[0].fn()
        self.assertEqual(order[-1], ("run", ("systemctl", "reboot")))

    def test_commands_do_not_block_reader_and_run_in_order(self):
        gate = threading.Event()
        agent = self.build([])
        agent.connection = type("C", (), {"send": lambda s, m: sent.append(m) or True, "stop": lambda s: None})()
        sent = []
        agent.updater = type("U", (), {"run": lambda s, manual=False: (gate.wait(5), {"ok": True, "text": "fertig"})[1]})()
        started = threading.Event()
        threading.Thread(target=lambda: (
            agent.on_message({"type": "command", "id": 1, "kind": "update_now"}),
            agent.on_message({"type": "command", "id": 2, "kind": "bogus"}),
            started.set())).start()
        self.assertTrue(started.wait(2), "on_message blocked on a command")
        self.assertEqual(sent, [])
        gate.set()
        for _ in range(300):
            if len(sent) == 2:
                break
            threading.Event().wait(0.01)
        self.assertEqual([m["id"] for m in sent], [1, 2])
        agent.stop()

    def test_stop_ends_command_worker(self):
        agent = self.build([])
        agent.connection = type("C", (), {"send": lambda s, m: True, "stop": lambda s: None})()
        agent.on_message({"type": "command", "id": 1, "kind": "bogus"})
        worker = agent._command_worker
        agent.stop()
        worker.join(2)
        self.assertFalse(worker.is_alive())

    def test_placeholder_updater_reports_failure(self):
        agent = self.build([])
        ok, text = agent.updater.run(manual=True)["ok"], agent.updater.run(manual=True)["text"]
        self.assertFalse(ok)
        self.assertEqual(text, "Updates folgen mit dem nächsten Agent-Update")

    def test_last_telemetry_feeds_reload(self):
        agent = self.build([])
        agent.collect = lambda *a, **k: {"display": {"browser_running": False}}
        agent.connection = type("C", (), {"send": lambda s, m: True})()
        agent._send_telemetry()
        self.assertEqual(agent.last_telemetry["display"]["browser_running"], False)


class TimerTests(unittest.TestCase):
    def setUp(self):
        self.paths = make_paths(self)
        self.cfg = Config.load(self.paths)
        self.cfg.token, self.cfg.kiosk_url = "T", "https://x/monitor"
        self.timers = []
        timers = self.timers

        class FakeTimer:
            def __init__(self, delay, fn):
                self.delay, self.fn, self.cancelled, self.started = delay, fn, False, False
                timers.append(self)

            def start(self):
                self.started = True

            def cancel(self):
                self.cancelled = True
        self.agent = Agent(self.cfg, FakePages(), runner=FakeRunner(), timer_factory=FakeTimer)
        self.agent.pages.show_test_pattern = lambda *a: None
        self.sent = []
        self.agent.connection = type("C", (), {"send": lambda s, m: self.sent.append(m) or True,
                                               "stop": lambda s: None})()

    def test_second_test_pattern_replaces_return_timer(self):
        self.agent._run_command({"id": 1, "kind": "test_pattern"})
        self.agent._run_command({"id": 2, "kind": "test_pattern"})
        self.assertTrue(self.timers[0].cancelled)
        self.assertFalse(self.timers[1].cancelled)
        self.assertEqual(len(self.agent._timers), 1)

    def test_finished_timers_are_pruned(self):
        self.agent._run_command({"id": 1, "kind": "test_pattern"})
        self.timers[0].fn()
        self.assertEqual(self.agent._timers, [])

    def test_no_timer_started_after_stop(self):
        self.agent.stop_event.set()
        self.agent._run_command({"id": 1, "kind": "test_pattern"})
        self.assertEqual(self.timers, [])

    def test_failed_result_send_is_logged(self):
        self.agent.connection = type("C", (), {"send": lambda s, m: False})()
        with self.assertLogs("stagedesk_agent", level="WARNING") as logs:
            self.agent._run_command({"id": 5, "kind": "bogus"})
        self.assertIn("5", logs.output[0])


class RecordingPowerTest:
    def __init__(self):
        self.starts = []
        self.ends = 0

    def start(self, method, config, seconds):
        self.starts.append((method, config, seconds))
        return True, json.dumps({"off_at": "2026-10-25T10:00:00+01:00", "seconds": seconds})

    def end(self):
        self.ends += 1
        return True, "Bildschirm wird eingeschaltet"


class PowerTestCommandTests(Base):
    def setUp(self):
        super().setUp()
        self.power_test = RecordingPowerTest()
        self.ctx.power_test = self.power_test

    def test_power_test_command_passes_params(self):
        ok, text = execute({"kind": "power_test", "params": {"method": "hdmi", "config": {"output": "X"},
                                                               "seconds": 20}}, self.ctx)
        self.assertTrue(ok)
        self.assertEqual(json.loads(text)["seconds"], 20)
        self.assertEqual(self.power_test.starts, [("hdmi", {"output": "X"}, 20)])

    def test_power_test_defaults(self):
        self.assertTrue(execute({"kind": "power_test", "params": {"method": "none"}}, self.ctx)[0])
        self.assertTrue(execute({"kind": "power_test", "params": {"method": "cec", "config": None}}, self.ctx)[0])
        self.assertEqual(self.power_test.starts, [("none", {}, 15), ("cec", {}, 15)])

    def test_power_test_command_validates_params(self):
        for params in ({"method": "laser"}, {}, {"method": "cec", "seconds": 4}, {"method": "cec", "seconds": 61},
                       {"method": "cec", "seconds": "15"}, {"method": "cec", "seconds": True},
                       {"method": "cec", "config": "x"}):
            self.assertEqual(execute({"kind": "power_test", "params": params}, self.ctx),
                             (False, "Ungültige Testparameter"), params)
        self.assertEqual(execute({"kind": "power_test"}, self.ctx), (False, "Ungültige Testparameter"))
        self.assertEqual(self.power_test.starts, [])

    def test_power_test_end_command(self):
        self.assertEqual(execute({"kind": "power_test_end", "params": {}}, self.ctx),
                         (True, "Bildschirm wird eingeschaltet"))
        self.assertEqual(self.power_test.ends, 1)

    def test_power_probe_holds_the_power_lock(self):
        lock = threading.Lock()
        seen = []
        self.ctx.power_lock = lock
        real_run = self.runner.run
        self.runner.run = lambda *a, **k: seen.append(lock.locked()) or real_run(*a, **k)
        execute({"kind": "power_probe"}, self.ctx)
        self.assertTrue(seen)
        self.assertTrue(all(seen))
        self.assertFalse(lock.locked())
