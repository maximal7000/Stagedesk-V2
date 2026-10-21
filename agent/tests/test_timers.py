import unittest

from stagedesk_agent.timers import write_timers
from tests.fakes import FakeRunner, make_paths
from stagedesk_agent.runner import RunResult

WINDOW = {"weekday": 6, "from": "03:00", "until": "05:00"}


class TimerTests(unittest.TestCase):
    def setUp(self):
        self.paths = make_paths(self)
        self.runner = FakeRunner()

    def read(self, name):
        return (self.paths.systemd_dir / name).read_text()

    def commands(self):
        return [c[0] for c in self.runner.calls]

    def test_timer_oncalendar_from_window(self):
        write_timers(WINDOW, True, True, self.runner, self.paths)
        text = self.read("stagedesk-agent-update.timer")
        self.assertIn("OnCalendar=Sun 03:00", text)
        self.assertIn("RandomizedDelaySec=7200", text)
        self.assertIn("OnCalendar=04:00", self.read("stagedesk-agent-reboot.timer"))

    def test_window_over_midnight_and_monday(self):
        write_timers({"weekday": 0, "from": "23:00", "until": "01:00"}, True, True, self.runner, self.paths)
        text = self.read("stagedesk-agent-update.timer")
        self.assertIn("OnCalendar=Mon 23:00", text)
        self.assertIn("RandomizedDelaySec=7200", text)

    def test_invalid_window_falls_back_to_default(self):
        write_timers({"weekday": 9, "from": "x"}, True, True, self.runner, self.paths)
        self.assertIn("OnCalendar=Sun 03:00", self.read("stagedesk-agent-update.timer"))

    def test_sigusr1_starts_update_sigusr2_daily_reboot(self):
        write_timers(WINDOW, True, True, self.runner, self.paths)
        update = self.read("stagedesk-agent-update.service")
        reboot = self.read("stagedesk-agent-reboot.service")
        self.assertIn("systemctl kill --kill-whom=main --signal=SIGUSR1 stagedesk-agent", update)
        self.assertIn("systemctl kill --kill-whom=main --signal=SIGUSR2 stagedesk-agent", reboot)

    def test_auto_updates_off_disables_timer(self):
        write_timers(WINDOW, False, True, self.runner, self.paths)
        self.assertIn(("systemctl", "disable", "--now", "stagedesk-agent-update.timer"), self.commands())
        self.assertNotIn(("systemctl", "enable", "--now", "stagedesk-agent-update.timer"), self.commands())

    def test_daily_reboot_off_disables_reboot_timer(self):
        write_timers(WINDOW, True, False, self.runner, self.paths)
        self.assertIn(("systemctl", "disable", "--now", "stagedesk-agent-reboot.timer"), self.commands())

    def test_enables_when_not_enabled(self):
        runner = FakeRunner({("systemctl", "is-enabled", "stagedesk-agent-update.timer"): RunResult(1, "disabled", "")})
        write_timers(WINDOW, True, True, runner, self.paths)
        self.assertIn(("systemctl", "enable", "--now", "stagedesk-agent-update.timer"), [c[0] for c in runner.calls])

    def test_daemon_reload_only_on_change(self):
        write_timers(WINDOW, True, True, self.runner, self.paths)
        self.assertIn(("systemctl", "daemon-reload"), self.commands())
        self.runner.calls.clear()
        write_timers(WINDOW, True, True, self.runner, self.paths)
        self.assertNotIn(("systemctl", "daemon-reload"), self.commands())
        write_timers({"weekday": 1, "from": "02:00", "until": "03:00"}, True, True, self.runner, self.paths)
        self.assertIn(("systemctl", "daemon-reload"), self.commands())
        self.assertIn(("systemctl", "restart", "stagedesk-agent-update.timer"), self.commands())


if __name__ == "__main__":
    unittest.main()
