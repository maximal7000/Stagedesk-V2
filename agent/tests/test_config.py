import json
import os
import stat
import unittest

from stagedesk_agent.config import Config, backoff_delays
from tests.fakes import make_paths


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.paths = make_paths(self)

    def test_defaults_without_file(self):
        cfg = Config.load(self.paths)
        self.assertEqual(cfg.server, "https://stagedesk.t410.de")
        self.assertIsNone(cfg.token)
        self.assertEqual(cfg.power_method, "cec")

    def test_config_roundtrip_mode_600(self):
        cfg = Config.load(self.paths)
        cfg.token = "tok"
        cfg.slug = "mensa"
        cfg.power_config = {"cec_device": "0"}
        cfg.save()
        mode = stat.S_IMODE(os.stat(self.paths.config_file).st_mode)
        self.assertEqual(mode, 0o600)
        again = Config.load(self.paths)
        self.assertEqual((again.token, again.slug, again.power_config), ("tok", "mensa", {"cec_device": "0"}))

    def test_clear_pairing_keeps_server(self):
        cfg = Config.load(self.paths)
        cfg.server = "https://example.test"
        cfg.token, cfg.slug, cfg.key, cfg.kiosk_url = "t", "s", "k", "u"
        cfg.clear_pairing()
        again = Config.load(self.paths)
        self.assertEqual(again.server, "https://example.test")
        self.assertEqual((again.token, again.slug, again.key, again.kiosk_url), (None, None, None, None))

    def test_apply_hello_updates_and_saves(self):
        cfg = Config.load(self.paths)
        cfg.slug = "old"
        cfg.apply_hello({"type": "hello", "slug": "new", "key": "k2", "kiosk_url": "https://x/monitor",
                         "power_method": "hdmi", "power_config": {"output": "HDMI-A-1"},
                         "update_window": {"day": 0}, "auto_updates": False, "daily_reboot": False,
                         "agent_version": "9"})
        again = Config.load(self.paths)
        self.assertEqual((again.slug, again.key, again.power_method, again.auto_updates),
                         ("new", "k2", "hdmi", False))

    def test_corrupt_file_falls_back_to_defaults(self):
        self.paths.config_dir.mkdir(parents=True)
        self.paths.config_file.write_text("{nope")
        self.assertIsNone(Config.load(self.paths).token)

    def test_unknown_keys_ignored(self):
        self.paths.config_dir.mkdir(parents=True)
        self.paths.config_file.write_text(json.dumps({"token": "t", "future": 1}))
        self.assertEqual(Config.load(self.paths).token, "t")


class BackoffTests(unittest.TestCase):
    def test_backoff_sequence(self):
        gen = backoff_delays(jitter=False)
        self.assertEqual([next(gen) for _ in range(6)], [5, 10, 20, 40, 60, 60])

    def test_jitter_within_ten_percent(self):
        gen = backoff_delays(jitter=True)
        for base in (5, 10, 20, 40, 60, 60):
            self.assertTrue(base * 0.9 <= next(gen) <= base * 1.1)
