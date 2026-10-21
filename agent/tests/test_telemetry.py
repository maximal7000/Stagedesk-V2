import json
import os
import unittest
from datetime import datetime, timezone
from pathlib import Path

from stagedesk_agent import telemetry
from stagedesk_agent.runner import RunResult
from tests.fakes import FakeRunner, make_paths

SAMPLES = Path(__file__).parent / "samples"
NOW = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)
WLR = ("env", "XDG_RUNTIME_DIR=/run/user/1000", "WAYLAND_DISPLAY=wayland-0", "wlr-randr")


def sample(name):
    return (SAMPLES / name).read_text()


def ok(text):
    return RunResult(0, text, "")


WIFI = {
    ("ip", "-j", "addr"): ok(sample("ip_addr_wifi.json")),
    ("iw", "dev", "wlan0", "link"): ok(sample("iw_link.txt")),
}
LAN = {("ip", "-j", "addr"): ok(sample("ip_addr_lan.json"))}


class TelemetryTests(unittest.TestCase):
    def setUp(self):
        self.paths = make_paths(self)
        telemetry.reset_cache()

    def collect(self, responses=None, **kw):
        runner = FakeRunner(responses)
        return telemetry.collect(runner, self.paths, NOW, **kw), runner

    def put(self, relative, text):
        target = self.paths.root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
        return target

    def test_wifi_signal_and_ssid_parsed(self):
        data, _ = self.collect(WIFI)
        self.assertEqual(data["network"], {
            "kind": "wifi", "ssid": "KATH-Lehrer", "signal_dbm": -58,
            "ip": "172.22.0.229", "mac": "dc:a6:32:11:22:33"})

    def test_lan_has_no_signal(self):
        data, runner = self.collect(LAN)
        self.assertEqual(data["network"], {
            "kind": "lan", "ssid": None, "signal_dbm": None,
            "ip": "192.168.100.20", "mac": "dc:a6:32:aa:bb:cc"})
        self.assertNotIn("iw", [c[0][0] for c in runner.calls])

    def test_no_network_gives_none_kind(self):
        data, _ = self.collect({("ip", "-j", "addr"): ok("[]")})
        self.assertEqual(data["network"]["kind"], None)
        self.assertIsNone(data["network"]["ip"])

    def test_ip_failure_gives_all_none(self):
        data, _ = self.collect({("ip", "-j", "addr"): RunResult(127, "", "not found")})
        self.assertEqual(data["network"], {"kind": None, "ssid": None, "signal_dbm": None, "ip": None, "mac": None})

    def test_wifi_not_connected(self):
        responses = dict(WIFI)
        responses[("iw", "dev", "wlan0", "link")] = ok("Not connected.\n")
        data, _ = self.collect(responses)
        self.assertEqual(data["network"]["kind"], "wifi")
        self.assertIsNone(data["network"]["ssid"])
        self.assertIsNone(data["network"]["signal_dbm"])

    def test_temperature_and_throttled_flags(self):
        data, _ = self.collect({
            ("vcgencmd", "measure_temp"): ok(sample("measure_temp.txt")),
            ("vcgencmd", "get_throttled"): ok(sample("get_throttled.txt")),
        })
        self.assertEqual(data["system"]["temperature_c"], 48.3)
        self.assertIs(data["system"]["throttled_now"], True)
        self.assertIs(data["system"]["throttled_since_boot"], True)

    def test_throttled_only_since_boot(self):
        data, _ = self.collect({("vcgencmd", "get_throttled"): ok("throttled=0x50000\n")})
        self.assertIs(data["system"]["throttled_now"], False)
        self.assertIs(data["system"]["throttled_since_boot"], True)

    def test_not_throttled(self):
        data, _ = self.collect({("vcgencmd", "get_throttled"): ok("throttled=0x0\n")})
        self.assertIs(data["system"]["throttled_now"], False)
        self.assertIs(data["system"]["throttled_since_boot"], False)

    def test_missing_vcgencmd_gives_none(self):
        missing = RunResult(127, "", "No such file")
        data, _ = self.collect({("vcgencmd", "measure_temp"): missing, ("vcgencmd", "get_throttled"): missing})
        self.assertIsNone(data["system"]["temperature_c"])
        self.assertIsNone(data["system"]["throttled_now"])
        self.assertIsNone(data["system"]["throttled_since_boot"])

    def test_proc_sources(self):
        self.put("proc/meminfo", sample("meminfo.txt"))
        self.put("proc/uptime", "3600.55 12000.00\n")
        self.put("proc/cpuinfo", "processor : 0\nSerial\t\t: 10000000abcdef01\n")
        (self.paths.proc / "device-tree").mkdir()
        (self.paths.proc / "device-tree" / "model").write_bytes(b"Raspberry Pi 4 Model B\x00")
        self.put("etc/os-release", sample("os-release.txt"))
        self.put("opt/stagedesk-agent/VERSION", "1.2.3\n")
        system = self.collect()[0]["system"]
        self.assertEqual(system["ram_percent"], 25.0)
        self.assertEqual(system["uptime_s"], 3600)
        self.assertEqual(system["serial"], "10000000abcdef01")
        self.assertEqual(system["model"], "Raspberry Pi 4 Model B")
        self.assertEqual(system["os"], "Debian GNU/Linux 12 (bookworm)")
        self.assertEqual(system["agent_version"], "1.2.3")
        self.assertIsInstance(system["disk_percent"], float)

    def test_missing_files_give_none(self):
        system = self.collect()[0]["system"]
        for key in ("ram_percent", "uptime_s", "serial", "model", "os", "agent_version", "temperature_c"):
            self.assertIsNone(system[key], key)

    def test_display_sources(self):
        data, runner = self.collect({
            WLR: ok(sample("wlr_randr.txt")),
            ("systemctl", "is-active", "stagedesk-kiosk"): ok("active\n"),
        }, power_status="an")
        self.assertEqual(data["display"], {"resolution": "3840x2160", "browser_running": True, "power": "an"})
        self.assertIn((WLR, "pi"), runner.calls)

    def test_kiosk_inactive(self):
        data, _ = self.collect({("systemctl", "is-active", "stagedesk-kiosk"): RunResult(3, "inactive\n", "")})
        self.assertIs(data["display"]["browser_running"], False)

    def test_display_unavailable_gives_none(self):
        failed = RunResult(127, "", "x")
        data, _ = self.collect({WLR: failed, ("systemctl", "is-active", "stagedesk-kiosk"): failed})
        self.assertEqual(data["display"], {"resolution": None, "browser_running": None, "power": None})

    def test_updates_from_state_file(self):
        self.put("var/lib/stagedesk-agent/update-state.json", json.dumps({
            "last_at": "2026-10-18T03:10:00+00:00", "last_ok": True, "last_error": None,
            "pending_packages": 4}))
        self.assertEqual(self.collect()[0]["updates"], {
            "last_at": "2026-10-18T03:10:00+00:00", "last_ok": True, "last_error": None,
            "pending_packages": 4, "reboot_required_since": None})

    def test_updates_without_state_file(self):
        updates = self.collect({("apt-get", "-s", "upgrade"): RunResult(127, "", "x")})[0]["updates"]
        self.assertEqual(updates, {"last_at": None, "last_ok": None, "last_error": None,
                                   "pending_packages": None, "reboot_required_since": None})

    def test_corrupt_state_file_gives_none(self):
        self.put("var/lib/stagedesk-agent/update-state.json", "{kaputt")
        self.assertIsNone(self.collect()[0]["updates"]["last_at"])

    def test_pending_packages_from_apt_when_state_has_none(self):
        apt = ("apt-get", "-s", "upgrade")
        out = "Reading...\nInst libfoo [1] (2 Debian)\nInst bar [1] (2 Debian)\nConf libfoo (2 Debian)\n"
        data, runner = self.collect({apt: ok(out)})
        self.assertEqual(data["updates"]["pending_packages"], 2)
        telemetry.collect(runner, self.paths, NOW)  # cached for an hour
        self.assertEqual([c[0] for c in runner.calls].count(apt), 1)

    def test_apt_failure_cached_only_five_minutes_and_uses_long_timeout(self):
        apt = ("apt-get", "-s", "upgrade")
        runner = FakeRunner({apt: RunResult(100, "", "lock")})
        timeouts = []
        original = runner.run
        runner.run = lambda args, timeout=30, user=None, input=None: (
            timeouts.append(timeout) if args[0] == "apt-get" else None) or original(args, timeout, user, input)
        telemetry.collect(runner, self.paths, NOW)
        self.assertEqual(timeouts, [60])
        later = NOW.replace(minute=3)
        telemetry.collect(runner, self.paths, later)
        self.assertEqual(len(timeouts), 1)
        telemetry.collect(runner, self.paths, NOW.replace(minute=6))
        self.assertEqual(len(timeouts), 2)

    def test_reboot_required_since_from_file_mtime(self):
        target = self.put("var/run/reboot-required", "*** System restart required ***\n")
        stamp = datetime(2026, 10, 15, 8, 30, tzinfo=timezone.utc).timestamp()
        os.utime(target, (stamp, stamp))
        self.assertEqual(self.collect()[0]["updates"]["reboot_required_since"], "2026-10-15T08:30:00+00:00")

    def test_every_group_present_and_json_small(self):
        data = self.collect(WIFI)[0]
        self.assertEqual(set(data), {"network", "system", "display", "updates"})
        self.assertLess(len(json.dumps(data)), 64 * 1024)

    def test_long_error_text_is_truncated(self):
        self.put("var/lib/stagedesk-agent/update-state.json", json.dumps({"last_error": "x" * 100000}))
        data = self.collect()[0]
        self.assertLessEqual(len(data["updates"]["last_error"]), 500)
        self.assertLess(len(json.dumps(data)), 64 * 1024)

    def test_a_crashing_source_does_not_stop_others(self):
        class Boom(FakeRunner):
            def run(self, args, timeout=30, user=None, input=None):
                if args[0] == "vcgencmd":
                    raise RuntimeError("boom")
                return super().run(args, timeout, user, input)
        data = telemetry.collect(Boom(LAN), self.paths, NOW)
        self.assertIsNone(data["system"]["temperature_c"])
        self.assertEqual(data["network"]["kind"], "lan")


if __name__ == "__main__":
    unittest.main()
