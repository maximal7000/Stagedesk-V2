import socket
import unittest
from pathlib import Path

from stagedesk_agent.power import CEC_CLIENT
from stagedesk_agent.power_probe import probe, recommend
from stagedesk_agent.runner import RunResult
from tests.fakes import FakeRunner

SAMPLES = Path(__file__).parent / "samples"
CEC = tuple(CEC_CLIENT)
LIST = ("cec-client", "-l")
DETECT = ("ddcutil", "detect", "--brief")
GETVCP = ("ddcutil", "getvcp", "D6")
WLR = ("env", "XDG_RUNTIME_DIR=/run/user/1000", "WAYLAND_DISPLAY=wayland-0", "wlr-randr")


def sample(name):
    return (SAMPLES / name).read_text()


def ok(name):
    return RunResult(0, sample(name), "")


def by_method(result, method):
    return next(row for row in result["methods"] if row["method"] == method)


def row(method, state):
    return {"method": method, "state": state, "text": ""}


class FakeSocket:
    def __init__(self, reply):
        self.reply = reply

    def sendall(self, data):
        self.sent = data

    def recv(self, size):
        return self.reply

    def close(self):
        pass


def answering(reply=b"\xa6\x00\x00\x00\x00\x04\x01\x19\x00"):
    return lambda addr, timeout=None: FakeSocket(reply)


def refusing(addr, timeout=None):
    raise ConnectionRefusedError("refused")


def runner_with(**overrides):
    responses = {LIST: ok("cec_list.txt"), CEC: ok("cec_scan.txt"), DETECT: ok("ddc_detect.txt"),
                 GETVCP: ok("ddc_getvcp_d6.txt"), WLR: ok("wlr_randr.txt")}
    responses.update({key: value for key, value in overrides.items()})
    return FakeRunner(responses)


class ProbeTests(unittest.TestCase):
    def test_cec_ok_with_display_name(self):
        result = by_method(probe(runner_with(), {}, refusing), "cec")
        self.assertEqual(result["state"], "ok")
        self.assertIn("LH4341UHS", result["text"])

    def test_cec_no_adapter_fails(self):
        runner = runner_with()
        runner.responses[LIST] = ok("cec_list_none.txt")
        self.assertEqual(by_method(probe(runner, {}, refusing), "cec")["state"], "fail")

    def test_cec_found_but_power_unreadable_warns(self):
        runner = runner_with()
        runner.responses[CEC] = RunResult(0, sample("cec_scan.txt").replace("power status:  on\n", ""), "")
        self.assertEqual(by_method(probe(runner, {}, refusing), "cec")["state"], "warn")

    def test_cec_no_display_fails(self):
        runner = runner_with()
        runner.responses[CEC] = RunResult(0, "CEC bus information\n===================\n", "")
        self.assertEqual(by_method(probe(runner, {}, refusing), "cec")["state"], "fail")

    def test_sicp_skipped_without_ip(self):
        result = by_method(probe(runner_with(), {}, refusing), "sicp")
        self.assertEqual((result["state"], result["text"]), ("skip", "Keine Display-IP eingetragen."))

    def test_sicp_ok_when_port_answers(self):
        result = by_method(probe(runner_with(), {"display_ip": "10.0.0.5"}, answering()), "sicp")
        self.assertEqual(result["state"], "ok")

    def test_sicp_fails_when_unreachable(self):
        result = by_method(probe(runner_with(), {"display_ip": "10.0.0.5"}, refusing), "sicp")
        self.assertEqual(result["state"], "fail")

    def test_sicp_timeout_fails(self):
        def slow(addr, timeout=None):
            raise socket.timeout()
        self.assertEqual(by_method(probe(runner_with(), {"display_ip": "10.0.0.5"}, slow), "sicp")["state"], "fail")

    def test_ddc_ok_and_fail(self):
        self.assertEqual(by_method(probe(runner_with(), {}, refusing), "ddc")["state"], "ok")
        runner = runner_with()
        runner.responses[DETECT] = RunResult(1, "No displays found.\n", "")
        self.assertEqual(by_method(probe(runner, {}, refusing), "ddc")["state"], "fail")

    def test_hdmi_is_warn_with_output_name(self):
        result = by_method(probe(runner_with(), {}, refusing), "hdmi")
        self.assertEqual(result["state"], "warn")
        self.assertIn("HDMI-A-1", result["text"])
        self.assertIn("Kein Signal", result["text"])

    def test_hdmi_without_output_fails(self):
        runner = runner_with()
        runner.responses[WLR] = RunResult(0, "", "")
        self.assertEqual(by_method(probe(runner, {}, refusing), "hdmi")["state"], "fail")

    def test_missing_tool_and_timeout_do_not_stop_probe(self):
        runner = runner_with()
        runner.responses[LIST] = RunResult(127, "", "No such file")
        runner.responses[DETECT] = RunResult(124, "", "timeout after 15s")
        result = probe(runner, {}, refusing)
        cec, ddc = by_method(result, "cec"), by_method(result, "ddc")
        self.assertEqual(cec["state"], "fail")
        self.assertIn("Programm fehlt: cec-client", cec["text"])
        self.assertEqual(ddc["state"], "fail")
        self.assertIn("Zeitlimit", ddc["text"])
        self.assertEqual(by_method(result, "hdmi")["state"], "warn")

    def test_probe_never_switches_anything(self):
        runner = runner_with()
        probe(runner, {"display_ip": "10.0.0.5"}, answering())
        for args, _ in runner.calls:
            self.assertNotIn("setvcp", args)
        self.assertTrue(all("standby" not in (text or "") for text in runner.inputs))

    def test_recommendation_order(self):
        cec, sicp, ddc, hdmi = (lambda s: row("cec", s)), (lambda s: row("sicp", s)), \
            (lambda s: row("ddc", s)), (lambda s: row("hdmi", s))
        self.assertEqual(recommend([cec("ok"), sicp("ok")]), "cec")
        self.assertEqual(recommend([cec("warn"), sicp("ok")]), "hybrid")
        self.assertEqual(recommend([cec("fail"), sicp("ok"), ddc("ok")]), "ddc")
        self.assertEqual(recommend([cec("fail"), sicp("skip"), ddc("fail"), hdmi("warn")]), "none")

    def test_result_has_recommended(self):
        self.assertEqual(probe(runner_with(), {}, refusing)["recommended"], "cec")
