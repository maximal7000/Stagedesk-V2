import threading
import unittest

from stagedesk_agent.agent import Agent
from tests import test_agent as ta
from tests.test_agent import FakePages, FakePower


class FakeUpdater:
    def __init__(self):
        self.calls = []
        self.gates = []

    def run(self, manual=False):
        self.calls.append(("run", manual))
        return {"skipped": "x"}

    def daily_reboot(self):
        self.calls.append(("daily_reboot",))
        return {"rebooted": True}

    def on_gate(self, message):
        self.gates.append(message)


class FakeSelfUpdater:
    def __init__(self, event=None):
        self.checked, self.event = [], event

    def confirm(self):
        event, self.event = self.event, None
        return event

    def check(self, hello):
        self.checked.append(hello)


class UpdateWiringTests(unittest.TestCase):
    setUp = ta.WiringTests.setUp
    wait_for = ta.WiringTests.wait_for
    run_agent = ta.WiringTests.run_agent

    def make(self, script, updater=None, self_updater=None, writes=None):
        self.done = threading.Event()
        conns = self.conns
        agent = Agent(self.cfg, FakePages(), power_factory=lambda m, c, r: FakePower(m, c), runner="R",
                      telemetry_interval=60, collect=lambda *a, **k: {"system": {}},
                      updater=updater or FakeUpdater(), self_updater=self_updater,
                      timer_writer=lambda *args: writes.append(args) if writes is not None else None,
                      connection_factory=lambda c, om, af: conns.append(
                          ta.RecordingConn(c, om, af, script, self.done)) or conns[-1])
        return agent

    def test_hello_rewrites_timers_checks_self_update_and_reports_agent_updated_once(self):
        writes = []
        selfup = FakeSelfUpdater({"from": "1.0.0", "to": "1.1.0", "at": "t"})
        hello = {"type": "hello", "update_window": {"weekday": 2, "from": "01:00", "until": "02:00"},
                 "auto_updates": False, "daily_reboot": False, "agent_version": "1.1.0", "agent_sha256": "ab"}
        agent = self.make([hello], self_updater=selfup, writes=writes)
        self.run_agent(agent, lambda: writes and selfup.checked and any(
            "agent_updated" in m for m in self.conns[0].of_type("telemetry")))
        self.assertEqual(writes[0][:3], ({"weekday": 2, "from": "01:00", "until": "02:00"}, False, False))
        self.assertEqual(writes[0][3], "R")
        self.assertEqual(selfup.checked[0]["agent_sha256"], "ab")
        agent._send_telemetry()
        reported = [m["agent_updated"] for m in self.conns[0].of_type("telemetry") if "agent_updated" in m]
        self.assertEqual(reported, [{"from": "1.0.0", "to": "1.1.0", "at": "t"}])

    def test_update_gate_is_routed_to_updater(self):
        updater = FakeUpdater()
        agent = self.make([{"type": "update_gate", "allowed": True, "reason": ""}], updater=updater)
        self.run_agent(agent, lambda: updater.gates)

    def test_sigusr1_starts_update_sigusr2_daily_reboot(self):
        updater = FakeUpdater()
        agent = self.make([], updater=updater)
        agent.start_signal_watcher()
        thread = threading.Thread(target=agent.run_once)
        thread.start()
        agent.request_update()
        self.assertTrue(self.wait_for(lambda: ("run", False) in updater.calls))
        agent.request_daily_reboot()
        self.assertTrue(self.wait_for(lambda: ("daily_reboot",) in updater.calls))
        self.done.set()
        thread.join(5)
        agent.request_stop()

    def test_signal_requests_only_set_flags(self):
        agent = self.make([])
        agent.request_update()  # no watcher running: must not block or run anything
        self.assertTrue(agent._update_requested)

    def test_auto_update_off_ignores_signal(self):
        updater = FakeUpdater()
        agent = self.make([], updater=updater)
        agent.config.auto_updates = False
        agent._auto_update()
        self.assertEqual(updater.calls, [])


if __name__ == "__main__":
    unittest.main()
