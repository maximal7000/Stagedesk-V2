import json
import unittest

from stagedesk_agent.runner import RunResult
from stagedesk_agent.updater import DPKG_CMD, FIX_CMD, UPDATE_CMD, UPGRADE_CMD, Updater
from tests.fakes import FakeRunner, make_paths

REBOOT = ("systemctl", "reboot")
OUT = "Reading...\n3 upgraded, 1 newly installed, 0 to remove and 0 not upgraded.\n"


class RecRunner(FakeRunner):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.timeouts = []

    def run(self, args, timeout=30, user=None, input=None):
        self.timeouts.append((tuple(args), timeout))
        return super().run(args, timeout, user, input)


class Base(unittest.TestCase):
    def setUp(self):
        self.paths = make_paths(self)
        self.sent = []
        self.gates = []  # scripted answers for update_gate_request; empty list = no answer
        self.runner = RecRunner({UPGRADE_CMD: RunResult(0, OUT, "")})
        self.updater = Updater(self.paths, self.runner, self.send, gate_timeout=0.05)

    def send(self, msg):
        self.sent.append(msg)
        if msg["type"] == "update_gate_request" and self.gates:
            allowed = self.gates.pop(0)
            self.updater.on_gate({"type": "update_gate", "allowed": allowed, "id": msg["id"],
                                  "reason": "" if allowed else "Termin aktiv"})
        return True

    def commands(self):
        return [c[0] for c in self.runner.calls]

    def results(self):
        return [m for m in self.sent if m["type"] == "update_result"]

    def need_reboot(self):
        self.paths.reboot_required.parent.mkdir(parents=True)
        self.paths.reboot_required.write_text("*** System restart required ***")

    def state(self):
        return json.loads(self.paths.update_state.read_text())


class UpdaterTests(Base):
    def test_update_skipped_when_gate_denied(self):
        self.gates = [False]
        result = self.updater.run(manual=False)
        self.assertEqual(result, {"skipped": "Termin aktiv"})
        self.assertNotIn(UPDATE_CMD, self.commands())

    def test_gate_without_answer_means_not_allowed(self):
        result = self.updater.run(manual=False)
        self.assertEqual(result, {"skipped": "Keine Antwort vom Server"})

    def test_update_runs_apt_and_reports(self):
        self.gates = [True]
        result = self.updater.run(manual=False)
        self.assertEqual(self.commands()[:4], [DPKG_CMD, FIX_CMD, UPDATE_CMD, UPGRADE_CMD])
        self.assertIn("-f", FIX_CMD)
        self.assertIn("DPkg::Lock::Timeout=300", FIX_CMD)
        self.assertIn("DPkg::Lock::Timeout=300", UPDATE_CMD)
        self.assertIn("DPkg::Lock::Timeout=300", UPGRADE_CMD)
        self.assertIn("full-upgrade", UPGRADE_CMD)
        self.assertIn("DEBIAN_FRONTEND=noninteractive", UPGRADE_CMD)
        self.assertIn("Dpkg::Options::=--force-confold", UPGRADE_CMD)
        self.assertTrue(result["ok"])
        res = self.results()[0]
        self.assertEqual((res["packages"], res["rebooted"], res["error"]), (4, False, None))
        state = self.state()
        self.assertEqual((state["last_ok"], state["last_error"], state["pending_packages"]), (True, None, 0))
        self.assertTrue(state["last_at"])

    def test_update_reboots_only_if_required_and_allowed(self):
        # not required: no second gate, no reboot
        self.gates = [True]
        self.updater.run(manual=False)
        self.assertNotIn(REBOOT, self.commands())
        self.assertEqual(sum(m["type"] == "update_gate_request" for m in self.sent), 1)
        # required but denied
        self.need_reboot()
        self.gates = [True, False]
        self.updater.run(manual=False)
        self.assertNotIn(REBOOT, self.commands())
        self.assertFalse(self.results()[-1]["rebooted"])
        # required and allowed: result is sent before the reboot
        self.gates = [True, True]
        self.sent.clear()
        self.updater.run(manual=False)
        self.assertIn(REBOOT, self.commands())
        self.assertTrue(self.results()[-1]["rebooted"])

    def test_manual_update_never_reboots(self):
        self.need_reboot()
        result = self.updater.run(manual=True)
        self.assertNotIn(REBOOT, self.commands())
        self.assertFalse(any(m["type"] == "update_gate_request" for m in self.sent))
        self.assertTrue(result["ok"])
        self.assertIn("Neustart nötig", result["text"])

    def test_update_timeout_reports_failure(self):
        self.runner.responses[UPGRADE_CMD] = RunResult(124, "", "timeout")
        self.gates = [True]
        result = self.updater.run(manual=False)
        self.assertFalse(result["ok"])
        self.assertIn("60 Minuten", result["text"])
        res = self.results()[0]
        self.assertIn("60 Minuten", res["error"])
        self.assertFalse(self.state()["last_ok"])

    def test_total_limit_is_shared_by_both_steps(self):
        self.gates = [True]
        self.updater.run(manual=False)
        limits = dict(self.runner.timeouts)
        self.assertLessEqual(limits[UPDATE_CMD], 3600)
        self.assertLessEqual(limits[UPGRADE_CMD], 3600)

    def test_apt_update_failure_is_reported(self):
        self.runner.responses[UPDATE_CMD] = RunResult(100, "", "Temporary failure resolving")
        result = self.updater.run(manual=True)
        self.assertFalse(result["ok"])
        self.assertNotIn(UPGRADE_CMD, self.commands())
        self.assertEqual(self.results()[0]["error"], "apt-get fehlgeschlagen: Temporary failure resolving")

    def test_dpkg_recovery_failure_stops_before_apt(self):
        self.runner.responses[DPKG_CMD] = RunResult(1, "", "dpkg was interrupted")
        result = self.updater.run(manual=True)
        self.assertIn("dpkg fehlgeschlagen", result["text"])
        self.assertNotIn(UPDATE_CMD, self.commands())

    def test_gate_answer_with_other_id_is_ignored(self):
        def send(msg):
            if msg["type"] == "update_gate_request":
                self.updater.on_gate({"type": "update_gate", "allowed": True, "id": "other"})
            return True
        self.updater.send = send
        self.assertEqual(self.updater.gate(), (False, "Keine Antwort vom Server"))

    def test_gate_request_carries_id(self):
        self.gates = [True]
        self.updater.gate()
        self.assertTrue(self.sent[0]["id"])

    def test_failed_run_keeps_previous_pending_count(self):
        self.paths.state_dir.mkdir(parents=True)
        self.paths.update_state.write_text(json.dumps({"pending_packages": 7}))
        self.runner.responses[UPGRADE_CMD] = RunResult(100, "", "boom")
        self.updater.run(manual=True)
        self.assertEqual(self.state()["pending_packages"], 7)
        self.paths.update_state.unlink()
        self.updater.run(manual=True)
        self.assertIsNone(self.state()["pending_packages"])

    def test_concurrent_run_is_refused(self):
        self.updater._lock.acquire()
        self.addCleanup(self.updater._lock.release)
        self.assertFalse(self.updater.run(manual=True)["ok"])

    def test_daily_reboot_needs_gate(self):
        self.gates = [False]
        self.assertEqual(self.updater.daily_reboot(), {"skipped": "Termin aktiv"})
        self.assertNotIn(REBOOT, self.commands())
        self.gates = [True]
        self.assertEqual(self.updater.daily_reboot(), {"rebooted": True})
        self.assertIn(REBOOT, self.commands())


if __name__ == "__main__":
    unittest.main()
