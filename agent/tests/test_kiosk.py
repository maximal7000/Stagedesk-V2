import json
import unittest

from stagedesk_agent.kiosk import Kiosk
from stagedesk_agent.runner import RunResult
from tests.fakes import FakeRunner, make_paths

RESTART = (("systemctl", "restart", "stagedesk-kiosk"), None)


class KioskTests(unittest.TestCase):
    def setUp(self):
        self.paths = make_paths(self)
        self.runner = FakeRunner()
        self.kiosk = Kiosk(self.runner, self.paths)

    def restarts(self):
        return [c for c in self.runner.calls if c == RESTART]

    def test_browser_policy_written_once(self):
        self.assertTrue(self.kiosk.ensure_browser_policy())
        policy = json.loads(self.paths.browser_policy.read_text())
        self.assertIs(policy["TranslateEnabled"], False)
        self.assertIs(policy["PrivacySandboxPromptEnabled"], False)
        self.assertEqual(policy["DefaultNotificationsSetting"], 2)
        self.assertEqual(oct(self.paths.browser_policy.stat().st_mode & 0o777), "0o644")
        self.assertFalse(self.kiosk.ensure_browser_policy())
        self.paths.browser_policy.write_text("{}")
        self.assertTrue(self.kiosk.ensure_browser_policy())

    def test_output_lines_only_when_set(self):
        self.kiosk.set_output("1920x1080@59.939999", "270")
        self.kiosk.apply("https://x/a")
        self.assertEqual(self.paths.kiosk_env.read_text(),
                         "KIOSK_URL=https://x/a\nOUTPUT_MODE=1920x1080@59.939999\nOUTPUT_TRANSFORM=270\n")
        self.kiosk.set_output("", "normal")
        self.assertTrue(self.kiosk.apply("https://x/a"))
        self.assertEqual(self.paths.kiosk_env.read_text(), "KIOSK_URL=https://x/a\n")

    def test_malformed_output_falls_back_to_automatic(self):
        for mode, transform in (("3840x2160\nEVIL=1", "90"), ("4k", "45"), (None, None), ("3840x2160@60 x", "normal")):
            self.kiosk.set_output(mode, transform)
            self.assertEqual(self.kiosk.output, ("", "90" if transform == "90" else "normal"), mode)

    def test_kiosk_apply_writes_and_restarts_only_on_change(self):
        self.assertTrue(self.kiosk.apply("https://x/monitor?screen=a&key=k"))
        self.assertEqual(self.paths.kiosk_env.read_text(), "KIOSK_URL=https://x/monitor?screen=a&key=k\n")
        self.assertEqual(oct(self.paths.kiosk_env.stat().st_mode & 0o777), "0o600")
        self.assertEqual(len(self.restarts()), 1)
        self.assertFalse(self.kiosk.apply("https://x/monitor?screen=a&key=k"))
        self.assertEqual(len(self.restarts()), 1)
        self.assertTrue(self.kiosk.apply("https://x/monitor?screen=b&key=k"))
        self.assertEqual(len(self.restarts()), 2)

    def test_apply_rejects_newline_in_url(self):
        with self.assertRaises(ValueError):
            self.kiosk.apply("http://x/\nEVIL=1")

    def test_restart_and_is_running(self):
        self.assertTrue(self.kiosk.restart())
        self.assertEqual(len(self.restarts()), 1)
        self.runner.responses[("systemctl", "is-active", "stagedesk-kiosk")] = RunResult(0, "active\n", "")
        self.assertTrue(self.kiosk.is_running())
        self.runner.responses[("systemctl", "is-active", "stagedesk-kiosk")] = RunResult(3, "inactive\n", "")
        self.assertFalse(self.kiosk.is_running())

    def test_restart_failure_returns_false(self):
        self.runner.responses[RESTART[0]] = RunResult(5, "", "Unit not found")
        self.assertFalse(self.kiosk.restart())

    def test_failed_restart_is_retried_by_next_apply(self):
        self.runner.responses[RESTART[0]] = RunResult(5, "", "busy")
        self.assertFalse(self.kiosk.apply("https://x/a"))
        self.assertTrue(self.kiosk.pending_restart)
        self.runner.responses.clear()
        self.assertTrue(self.kiosk.apply("https://x/a"))  # same URL, but the restart is retried
        self.assertFalse(self.kiosk.pending_restart)
        self.assertFalse(self.kiosk.apply("https://x/a"))
        self.assertEqual(len(self.restarts()), 2)
