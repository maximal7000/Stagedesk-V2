import queue
import threading
import time
import unittest

from stagedesk_agent.cec_session import COMMAND, CecNoAnswer, CecSession, CecUnavailable
from stagedesk_agent.power import CecPower, make_power
from tests.fakes import FakeRunner


class FakeStdout:
    def __init__(self):
        self.lines = queue.Queue()

    def __iter__(self):
        while True:
            line = self.lines.get()
            if line is None:
                return
            yield line


class FakeStdin:
    def __init__(self, proc):
        self.proc = proc

    def write(self, text):
        if self.proc.broken:
            raise BrokenPipeError("cec-client gone")
        self.proc.written.append(text)
        for line in self.proc.script.get(text.strip(), []):
            self.proc.stdout.lines.put(line)

    def flush(self):
        pass


class FakeProc:
    def __init__(self, script):
        self.script = script
        self.written = []
        self.stdout = FakeStdout()
        self.stdin = FakeStdin(self)
        self.broken = False
        self.code = None

    def poll(self):
        return self.code

    def terminate(self):
        self.code = -15
        self.stdout.lines.put(None)


class FakePopen:
    def __init__(self, script=None):
        self.script = script or {}
        self.procs = []
        self.args = []

    def __call__(self, args, **kw):
        self.args.append(args)
        proc = FakeProc(self.script)
        self.procs.append(proc)
        return proc


def wait_until(check, timeout=2):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if check():
            return True
        time.sleep(0.01)
    return False


class CecSessionTests(unittest.TestCase):
    def test_one_process_for_many_commands_and_queries(self):
        popen = FakePopen({"pow 0": ["opening a connection to the CEC adapter...\n", "power status: on\n"]})
        session = CecSession(popen=popen)
        self.addCleanup(session.close)
        session.send("on 0")
        self.assertEqual(session.query_power("0"), "an")
        self.assertEqual(session.query_power("0"), "an")
        session.send("standby 0")
        self.assertEqual(len(popen.procs), 1)
        self.assertEqual(popen.args[0], COMMAND)
        self.assertEqual(popen.procs[0].written, ["on 0\n", "pow 0\n", "pow 0\n", "standby 0\n"])

    def test_query_without_answer_raises(self):
        session = CecSession(popen=FakePopen())
        self.addCleanup(session.close)
        with self.assertRaises(CecUnavailable):
            session.query_power("0", timeout=0.05)

    def test_unknown_power_status_is_no_answer_at_once(self):
        popen = FakePopen({"pow 0": ["power status: unknown\n"]})
        session = CecSession(popen=popen)
        self.addCleanup(session.close)
        start = time.monotonic()
        with self.assertRaises(CecNoAnswer):
            session.query_power("0", timeout=5)
        self.assertLess(time.monotonic() - start, 1)
        self.assertIsNone(session.state)

    def test_tv_broadcasts_change_the_state(self):
        popen = FakePopen()
        session = CecSession(popen=popen)
        self.addCleanup(session.close)
        changes = []
        session.on_change = changes.append
        session.send("as")
        out = popen.procs[0].stdout.lines
        out.put("TRAFFIC: [  1234]\t>> 0f:36\n")             # TV to all: standby (its own remote)
        out.put("TRAFFIC: [  1300]\t>> 4f:36\n")             # another device: ignored
        out.put("TRAFFIC: [  1400]\t>> 04:90:00\n")          # TV reports: on
        out.put("TRAFFIC: [  1500]\t>> 04:90:00\n")          # same state: no second call
        self.assertTrue(wait_until(lambda: changes == ["standby", "an"]))
        time.sleep(0.05)
        self.assertEqual(changes, ["standby", "an"])

    def test_dead_process_is_restarted(self):
        popen = FakePopen()
        session = CecSession(popen=popen)
        self.addCleanup(session.close)
        session.send("as")
        popen.procs[0].code = 1
        session.send("as")
        self.assertEqual(len(popen.procs), 2)

    def test_broken_pipe_is_unavailable_and_next_command_restarts(self):
        popen = FakePopen()
        session = CecSession(popen=popen)
        self.addCleanup(session.close)
        session.send("as")
        popen.procs[0].broken = True
        with self.assertRaises(CecUnavailable):
            session.send("as")
        session.send("as")
        self.assertEqual(len(popen.procs), 2)

    def test_missing_program_is_unavailable(self):
        def missing(*args, **kw):
            raise FileNotFoundError("cec-client")
        with self.assertRaises(CecUnavailable):
            CecSession(popen=missing).send("as")


class CecPowerWithSessionTests(unittest.TestCase):
    def test_commands_and_status_go_through_the_session(self):
        popen = FakePopen({"pow 0": ["power status: standby\n"]})
        session = CecSession(popen=popen)
        self.addCleanup(session.close)
        runner = FakeRunner()
        power = make_power("cec", {}, runner, cec_session=session)
        self.assertEqual(power.status(), "standby")
        self.assertEqual(power.set(True), "an")
        self.assertEqual(runner.calls, [])
        self.assertEqual(popen.procs[0].written, ["pow 0\n", "on 0\n"])

    def test_without_working_session_single_commands_are_used(self):
        def missing(*args, **kw):
            raise FileNotFoundError("cec-client")
        runner = FakeRunner()
        power = make_power("cec", {}, runner, cec_session=CecSession(popen=missing))
        self.assertEqual(power.set(True), "an")
        self.assertEqual(power.status(), "an")  # remembered, no extra announcement
        self.assertEqual(runner.inputs, ["on 0\n"])

    def test_silent_tv_is_asked_again(self):
        popen = FakePopen({"pow 0": ["power status: unknown\n"]})
        session = CecSession(popen=popen)
        self.addCleanup(session.close)
        answer_next = lambda seconds: popen.script.update({"pow 0": ["power status: standby\n"]})
        power = make_power("cec", {}, FakeRunner(), cec_session=session, sleep=answer_next)
        self.assertEqual(power.status(), "standby")
        self.assertEqual(popen.procs[0].written, ["pow 0\n", "pow 0\n"])

    def test_silent_tv_keeps_the_last_state_then_shows_an_error(self):
        popen = FakePopen({"pow 0": ["power status: unknown\n"]})
        session = CecSession(popen=popen)
        self.addCleanup(session.close)
        now = [1000.0]
        runner = FakeRunner()
        power = CecPower({}, runner, cec_session=session, clock=lambda: now[0], sleep=lambda s: None)
        self.assertEqual(power.status(), "unbekannt")
        power.set(True)
        self.assertEqual(power.status(), "an")
        now[0] += 119
        self.assertEqual(power.status(), "an")
        now[0] += 2
        self.assertEqual(power.status(), "Fehler: Fernseher antwortet nicht über CEC")
        self.assertEqual(runner.calls, [])  # no single cec-client while the session runs
        popen.script["pow 0"] = ["power status: standby\n"]
        self.assertEqual(power.status(), "standby")

    def test_switching_never_trusts_a_reported_state(self):
        # LG signage displays answer "on" in standby; skipping on that left the screen dark
        popen = FakePopen({"pow 0": ["power status: on\n"]})
        session = CecSession(popen=popen)
        self.addCleanup(session.close)
        power = CecPower({}, FakeRunner(), cec_session=session, sleep=lambda s: None)
        self.assertIsNone(power.confirmed_status())
        self.assertIsNone(CecPower({}, FakeRunner()).confirmed_status())

    def test_every_command_is_logged(self):
        session = CecSession(popen=FakePopen())
        self.addCleanup(session.close)
        power = CecPower({}, FakeRunner(), cec_session=session, sleep=lambda s: None)
        with self.assertLogs("stagedesk_agent.power", "INFO") as logs:
            power.set(True)
            power.set(False)
        self.assertEqual([r.getMessage() for r in logs.records], ["CEC: on 0 gesendet", "CEC: standby 0 gesendet"])

    def test_hybrid_switches_on_through_the_session(self):
        popen = FakePopen()
        session = CecSession(popen=popen)
        self.addCleanup(session.close)
        power = make_power("hybrid", {"display_ip": "10.0.0.2"}, FakeRunner(), cec_session=session,
                           sleep=lambda s: None)
        self.assertEqual(power.set(True), "an")
        self.assertEqual(popen.procs[0].written, ["on 0\n", "as\n", "on 0\n", "as\n"])


if __name__ == "__main__":
    unittest.main()
