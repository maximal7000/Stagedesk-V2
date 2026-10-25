import json
import threading
import unittest
from datetime import datetime

from stagedesk_agent.power import PowerError
from stagedesk_agent.power_test import PowerTest


class FakeController:
    def __init__(self, method, config, fail_off=None, fail_text=None):
        self.method, self.config = method, config
        self.calls = []
        self.stopped = False
        self.fail_off = fail_off
        self.fail_text = fail_text

    def set(self, on):
        if not on and self.fail_off:
            raise self.fail_off
        if not on and self.fail_text:
            return self.fail_text
        self.calls.append(on)
        return "an" if on else "standby"

    def stop(self):
        self.stopped = True


class PowerTestTests(unittest.TestCase):
    def setUp(self):
        self.made = []
        self.deferred = []
        self.finished = []
        self.power_lock = threading.Lock()
        self.controller_options = {}

    def factory(self, method, config, runner):
        controller = FakeController(method, config, **self.controller_options)
        self.made.append(controller)
        return controller

    def make(self, **kw):
        return PowerTest(self.factory, "runner", lambda delay, fn, key=None: self.deferred.append((delay, fn, key)),
                         lambda: self.finished.append(self.power_lock.locked()), power_lock=self.power_lock, **kw)

    def test_start_switches_off_with_given_method_and_schedules_on(self):
        test = self.make()
        ok, text = test.start("hdmi", {"output": "HDMI-A-2"}, 15)
        self.assertTrue(ok)
        data = json.loads(text)
        self.assertEqual(data["seconds"], 15)
        datetime.fromisoformat(data["off_at"])
        self.assertEqual([(c.method, c.config) for c in self.made], [("hdmi", {"output": "HDMI-A-2"})])
        self.assertEqual(self.made[0].calls, [False])
        self.assertEqual([(d, k) for d, _, k in self.deferred], [(15, "power_test")])
        self.assertTrue(test.active)

    def test_on_after_delay_uses_same_method_then_calls_on_finished(self):
        test = self.make()
        test.start("cec", {}, 20)
        self.deferred[0][1]()
        self.assertEqual(len(self.made), 1)
        self.assertEqual(self.made[0].calls, [False, True])
        self.assertTrue(self.made[0].stopped)
        self.assertFalse(test.active)
        self.assertEqual(self.finished, [False])  # called once, without holding the power lock

    def test_switching_holds_the_power_lock(self):
        seen = []

        class Recording(FakeController):
            def set(inner, on):
                seen.append(self.power_lock.locked())
                return super().set(on)
        test = PowerTest(lambda m, c, r: Recording(m, c), None, lambda d, fn, key=None: self.deferred.append(fn),
                         lambda: None, power_lock=self.power_lock)
        test.start("cec", {}, 5)
        self.deferred[0]()
        self.assertEqual(seen, [True, True])

    def test_second_start_is_refused(self):
        test = self.make()
        test.start("cec", {}, 15)
        self.assertEqual(test.start("hdmi", {}, 15), (False, "Es läuft schon ein Test."))
        self.assertEqual(len(self.made), 1)
        self.assertEqual(len(self.deferred), 1)

    def test_end_switches_on_now(self):
        test = self.make()
        test.start("cec", {}, 30)
        ok, _ = test.end()
        self.assertTrue(ok)
        self.assertEqual([(d, k) for d, _, k in self.deferred], [(30, "power_test"), (0, "power_test")])
        self.deferred[1][1]()
        self.assertEqual(self.made[0].calls, [False, True])
        self.assertFalse(test.active)
        self.assertEqual(self.finished, [False])

    def test_stale_timer_after_end_does_nothing(self):
        test = self.make()
        test.start("cec", {}, 30)
        test.end()
        self.deferred[1][1]()
        self.deferred[0][1]()
        self.assertEqual(self.made[0].calls, [False, True])
        self.assertEqual(len(self.finished), 1)

    def test_end_without_test(self):
        self.assertEqual(self.make().end(), (True, "Kein Test aktiv"))
        self.assertEqual(self.deferred, [])

    def test_start_failure_schedules_nothing(self):
        self.controller_options = {"fail_off": PowerError("cec-client fehlt")}
        test = self.make()
        self.assertEqual(test.start("cec", {}, 15), (False, "cec-client fehlt"))
        self.assertEqual(self.deferred, [])
        self.assertFalse(test.active)
        self.assertTrue(self.made[0].stopped)

    def test_start_failure_reported_as_status_text(self):
        self.controller_options = {"fail_text": "Fehler: Display nicht erreichbar"}
        test = self.make()
        self.assertEqual(test.start("hybrid", {}, 15), (False, "Fehler: Display nicht erreichbar"))
        self.assertEqual(self.deferred, [])
        self.assertFalse(test.active)

    def test_factory_failure_schedules_nothing(self):
        def broken(method, config, runner):
            raise ValueError("unbekannte Power-Methode: laser")
        test = PowerTest(broken, None, lambda *a, **k: self.deferred.append(a), lambda: None)
        self.assertEqual(test.start("laser", {}, 15), (False, "unbekannte Power-Methode: laser"))
        self.assertEqual(self.deferred, [])
        self.assertFalse(test.active)


if __name__ == "__main__":
    unittest.main()
