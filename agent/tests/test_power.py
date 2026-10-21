import time
import unittest

from stagedesk_agent.power import make_power
from stagedesk_agent.runner import RunResult
from tests.fakes import FakeRunner

CEC = ("cec-client", "-s", "-d", "1")
SICP_OFF = bytes([0xA6, 0, 0, 0, 0, 4, 1, 0x18, 1, 0xBA])
SICP_STATUS = bytes([0xA6, 0, 0, 0, 0, 3, 1, 0x19, 0xBD])


class FakeSocket:
    def __init__(self, reply=b""):
        self.sent = []
        self.reply = reply
        self.closed = False

    def sendall(self, data):
        self.sent.append(bytes(data))

    def recv(self, size):
        return self.reply

    def close(self):
        self.closed = True


class FakeConnect:
    def __init__(self, reply=b"", fail=0):
        self.sockets = []
        self.addresses = []
        self.reply = reply
        self.fail = fail

    def __call__(self, address, timeout=None):
        self.addresses.append(address)
        if self.fail:
            self.fail -= 1
            raise OSError("Connection refused")
        sock = FakeSocket(self.reply)
        self.sockets.append(sock)
        return sock


def no_sleep(_seconds):
    pass


class CecTests(unittest.TestCase):
    def test_cec_on_off_commands(self):
        runner = FakeRunner()
        power = make_power("cec", {}, runner)
        self.assertEqual(power.set(True), "an")
        self.assertEqual(power.set(False), "standby")
        self.assertEqual([c[0] for c in runner.calls], [CEC, CEC])
        self.assertEqual(runner.inputs, ["on 0\n", "standby 0\n"])

    def test_cec_device_from_config(self):
        runner = FakeRunner()
        make_power("cec", {"cec_device": "5"}, runner).set(True)
        self.assertEqual(runner.inputs, ["on 5\n"])

    def test_cec_status_parsed(self):
        runner = FakeRunner({CEC: RunResult(0, "opening a connection...\npower status: standby\n", "")})
        power = make_power("cec", {}, runner)
        self.assertEqual(power.status(), "standby")
        self.assertEqual(runner.inputs, ["pow 0\n"])
        runner.responses[CEC] = RunResult(0, "power status: on\n", "")
        self.assertEqual(power.status(), "an")

    def test_cec_status_unknown_is_error_text(self):
        runner = FakeRunner({CEC: RunResult(0, "nothing useful\n", "")})
        self.assertTrue(make_power("cec", {}, runner).status().startswith("Fehler: "))


class HdmiTests(unittest.TestCase):
    OFF = ("env", "XDG_RUNTIME_DIR=/run/user/1000", "WAYLAND_DISPLAY=wayland-0",
           "wlr-randr", "--output", "HDMI-A-1", "--off")

    def test_hdmi_runs_wlr_randr_as_pi(self):
        runner = FakeRunner()
        power = make_power("hdmi", {}, runner, watchdog_interval=60)
        self.addCleanup(power.stop)
        self.assertEqual(power.set(False), "aus")
        self.assertEqual(runner.calls[0], (self.OFF, "pi"))
        self.assertEqual(power.set(True), "an")
        self.assertEqual(runner.calls[-1][0][-3:], ("--output", "HDMI-A-1", "--on"))
        self.assertEqual(power.status(), "an")

    def test_hdmi_output_from_config(self):
        runner = FakeRunner()
        power = make_power("hdmi", {"output": "HDMI-A-2"}, runner, watchdog_interval=60)
        self.addCleanup(power.stop)
        power.set(False)
        self.assertIn("HDMI-A-2", runner.calls[0][0])

    def test_hdmi_watchdog_reasserts_off(self):
        runner = FakeRunner()
        power = make_power("hdmi", {}, runner, watchdog_interval=0.01)
        self.addCleanup(power.stop)
        power.set(False)
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline and sum(c[0] == self.OFF for c in runner.calls) < 4:
            time.sleep(0.01)
        self.assertGreaterEqual(sum(c[0] == self.OFF for c in runner.calls), 4)

    def test_hdmi_watchdog_idle_while_on(self):
        runner = FakeRunner()
        power = make_power("hdmi", {}, runner, watchdog_interval=0.01)
        self.addCleanup(power.stop)
        power.set(True)
        time.sleep(0.1)
        self.assertEqual(sum(c[0] == self.OFF for c in runner.calls), 0)

    def test_hdmi_watchdog_stops_after_on(self):
        runner = FakeRunner()
        power = make_power("hdmi", {}, runner, watchdog_interval=0.01)
        self.addCleanup(power.stop)
        power.set(False)
        power.set(True)
        time.sleep(0.05)
        count = len(runner.calls)
        time.sleep(0.1)
        self.assertEqual(len(runner.calls), count)


class HybridTests(unittest.TestCase):
    CONFIG = {"display_ip": "192.0.2.7"}

    def test_hybrid_off_sends_sicp_packet(self):
        connect = FakeConnect()
        power = make_power("hybrid", self.CONFIG, FakeRunner(), connect=connect, sleep=no_sleep)
        self.assertEqual(power.set(False), "standby")
        self.assertEqual(connect.addresses, [("192.0.2.7", 5000)])
        self.assertEqual(connect.sockets[0].sent, [SICP_OFF])

    def test_hybrid_uses_configured_port_and_monitor_id(self):
        connect = FakeConnect()
        cfg = {"display_ip": "192.0.2.7", "display_port": 5005, "monitor_id": 1}
        make_power("hybrid", cfg, FakeRunner(), connect=connect, sleep=no_sleep).set(False)
        self.assertEqual(connect.addresses, [("192.0.2.7", 5005)])
        frame = connect.sockets[0].sent[0]
        self.assertEqual(frame[1], 1)
        xor = 0
        for byte in frame[:-1]:
            xor ^= byte
        self.assertEqual(frame[-1], xor)

    def test_hybrid_off_retries_then_reports_error(self):
        connect = FakeConnect(fail=99)
        power = make_power("hybrid", self.CONFIG, FakeRunner(), connect=connect, sleep=no_sleep)
        status = power.set(False)
        self.assertTrue(status.startswith("Fehler: "), status)
        self.assertEqual(len(connect.addresses), 7)

    def test_hybrid_off_succeeds_on_later_attempt(self):
        connect = FakeConnect(fail=3)
        power = make_power("hybrid", self.CONFIG, FakeRunner(), connect=connect, sleep=no_sleep)
        self.assertEqual(power.set(False), "standby")

    def test_hybrid_on_uses_cec(self):
        runner = FakeRunner()
        power = make_power("hybrid", self.CONFIG, runner, connect=FakeConnect(), sleep=no_sleep)
        self.assertEqual(power.set(True), "an")
        self.assertEqual(runner.inputs, ["on 0\n", "as\n", "on 0\n", "as\n"])

    def test_hybrid_status_over_sicp(self):
        connect = FakeConnect(reply=bytes([0xA6, 0, 0, 0, 0, 5, 1, 0x19, 0x01, 0]))
        power = make_power("hybrid", self.CONFIG, FakeRunner(), connect=connect, sleep=no_sleep)
        self.assertEqual(power.status(), "standby")
        self.assertEqual(connect.sockets[0].sent, [SICP_STATUS])
        connect.reply = bytes([0xA6, 0, 0, 0, 0, 5, 1, 0x19, 0x02, 0])
        self.assertEqual(power.status(), "an")

    def test_hybrid_unreachable_display_is_standby(self):
        power = make_power("hybrid", self.CONFIG, FakeRunner(), connect=FakeConnect(fail=9), sleep=no_sleep)
        self.assertEqual(power.status(), "standby")

    def test_hybrid_without_ip_is_error_text(self):
        power = make_power("hybrid", {}, FakeRunner(), connect=FakeConnect(), sleep=no_sleep)
        self.assertTrue(power.set(False).startswith("Fehler: "))
        self.assertIn("display_ip", power.set(False))


class DdcTests(unittest.TestCase):
    def test_ddc_values(self):
        runner = FakeRunner()
        power = make_power("ddc", {}, runner, sleep=no_sleep)
        self.assertEqual(power.set(False), "aus")
        self.assertEqual(power.set(True), "an")
        self.assertEqual([c[0] for c in runner.calls],
                         [("ddcutil", "setvcp", "D6", "04"), ("ddcutil", "setvcp", "D6", "01")])

    def test_ddc_values_from_config(self):
        runner = FakeRunner()
        make_power("ddc", {"vcp_off": "02", "vcp_on": "01"}, runner, sleep=no_sleep).set(False)
        self.assertEqual(runner.calls[0][0][-1], "02")

    def test_ddc_retries_once_then_error(self):
        runner = FakeRunner({("ddcutil", "setvcp", "D6", "04"): RunResult(1, "", "No displays found")})
        status = make_power("ddc", {}, runner, sleep=no_sleep).set(False)
        self.assertEqual(status, "Fehler: No displays found")
        self.assertEqual(len(runner.calls), 2)


class ErrorTests(unittest.TestCase):
    def test_power_error_status_text(self):
        runner = FakeRunner({CEC: RunResult(127, "", "cec-client: not found")})
        self.assertEqual(make_power("cec", {}, runner).set(True), "Fehler: cec-client: not found")

    def test_cec_timeout_is_error(self):
        runner = FakeRunner({CEC: RunResult(124, "", "timeout after 20s")})
        self.assertEqual(make_power("cec", {}, runner).set(False), "Fehler: timeout after 20s")

    def test_cec_nonzero_exit_alone_is_not_a_failure(self):
        runner = FakeRunner({CEC: RunResult(1, "power status: standby\n", "")})
        power = make_power("cec", {}, runner)
        self.assertEqual(power.set(False), "standby")
        self.assertEqual(power.status(), "standby")

    def test_hybrid_on_tolerates_cec_nonzero_exit(self):
        runner = FakeRunner({CEC: RunResult(1, "", "")})
        power = make_power("hybrid", {"display_ip": "192.0.2.7"}, runner, connect=FakeConnect(), sleep=no_sleep)
        self.assertEqual(power.set(True), "an")

    def test_error_text_from_exception(self):
        class Boom:
            def run(self, *a, **k):
                raise RuntimeError("kaputt")
        self.assertEqual(make_power("cec", {}, Boom()).set(True), "Fehler: kaputt")

    def test_unknown_method_rejected(self):
        with self.assertRaises(ValueError):
            make_power("laser", {}, FakeRunner())

    def test_non_dict_config_uses_defaults(self):
        runner = FakeRunner()
        make_power("cec", None, runner).set(True)
        self.assertEqual(runner.inputs, ["on 0\n"])
