import hashlib
import io
import tarfile
import unittest

from stagedesk_agent.self_update import SelfUpdater, rollback
from tests.fakes import FakeRunner, make_paths


def make_tarball(path, version="1.1.0", extra=None):
    with tarfile.open(path, "w:gz") as tar:
        files = {"VERSION": version + "\n", "stagedesk_agent/__init__.py": "", "systemd/a.service": "x",
                 "kiosk/k.sh": "y"}
        files.update(extra or {})
        for name, text in files.items():
            data = text.encode()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return path.read_bytes()


class SelfUpdateTests(unittest.TestCase):
    def setUp(self):
        self.paths = make_paths(self)
        self.paths.opt_dir.mkdir(parents=True)
        (self.paths.opt_dir / "VERSION").write_text("1.0.0\n")
        (self.paths.opt_dir / "OLD").write_text("old")
        self.runner = FakeRunner()
        self.fetched = []
        self.blob = make_tarball(self.paths.root / "pkg.tar.gz")
        self.updater = SelfUpdater(self.paths, self.runner, "https://srv", fetch=self.fetch)

    def fetch(self, url, dest):
        self.fetched.append(url)
        dest.write_bytes(self.blob)

    def hello(self, version="1.1.0", sha=None):
        return {"agent_version": version, "agent_sha256": sha or hashlib.sha256(self.blob).hexdigest()}

    def commands(self):
        return [c[0] for c in self.runner.calls]

    def test_self_update_rejects_bad_checksum(self):
        result = self.updater.check(self.hello(sha="0" * 64))
        self.assertIn("Prüfsumme", result["error"])
        self.assertEqual((self.paths.opt_dir / "VERSION").read_text(), "1.0.0\n")
        self.assertFalse(self.paths.opt_new.exists())
        self.assertFalse(self.paths.pending_confirm.exists())

    def test_not_newer_does_nothing(self):
        for v in ("1.0.0", "0.9.9", "garbage", None):
            self.assertIsNone(self.updater.check(self.hello(version=v)))
        self.assertEqual(self.fetched, [])

    def test_version_compare_is_numeric(self):
        (self.paths.opt_dir / "VERSION").write_text("1.9.0\n")
        self.blob = make_tarball(self.paths.root / "p.tar.gz", "1.10.0")
        self.assertEqual(self.updater.check(self.hello("1.10.0"))["updated"], "1.10.0")

    def test_self_update_swaps_and_marks_pending(self):
        result = self.updater.check(self.hello())
        self.assertEqual(result, {"updated": "1.1.0"})
        self.assertEqual(self.fetched, ["https://srv/api/monitor/agent/stagedesk-agent-1.1.0.tar.gz"])
        self.assertEqual((self.paths.opt_dir / "VERSION").read_text().strip(), "1.1.0")
        self.assertTrue((self.paths.opt_dir / "stagedesk_agent" / "__init__.py").exists())
        self.assertEqual((self.paths.opt_prev / "OLD").read_text(), "old")
        self.assertFalse(self.paths.opt_new.exists())
        self.assertTrue(self.paths.pending_confirm.read_text().strip())
        self.assertTrue((self.paths.systemd_dir / "stagedesk-agent-rollback.timer").exists())
        self.assertIn(("systemctl", "enable", "--now", "stagedesk-agent-rollback.timer"), self.commands())
        self.assertIn(("systemctl", "--no-block", "restart", "stagedesk-agent"), self.commands())

    def test_pending_blocks_further_update(self):
        self.updater.check(self.hello())
        self.fetched.clear()
        self.assertIsNone(self.updater.check(self.hello("1.2.0")))
        self.assertEqual(self.fetched, [])

    def test_rejects_unsafe_archives(self):
        for bad in ("../evil", "/etc/evil", "a/../../evil"):
            self.blob = make_tarball(self.paths.root / "bad.tar.gz", extra={bad: "x"})
            result = self.updater.check(self.hello())
            self.assertIn("error", result, bad)
            self.assertEqual((self.paths.opt_dir / "VERSION").read_text(), "1.0.0\n")
            self.assertFalse(self.paths.opt_new.exists())

    def test_rejects_archive_with_wrong_version(self):
        self.blob = make_tarball(self.paths.root / "w.tar.gz", "1.0.5")
        self.assertIn("error", self.updater.check(self.hello("1.1.0")))
        self.assertFalse(self.paths.pending_confirm.exists())

    def test_rollback_restores_prev_when_unconfirmed(self):
        self.updater.check(self.hello())
        self.runner.calls.clear()
        self.assertTrue(rollback(self.paths, self.runner))
        self.assertEqual((self.paths.opt_dir / "VERSION").read_text(), "1.0.0\n")
        self.assertFalse(self.paths.pending_confirm.exists())
        self.assertIn(("systemctl", "--no-block", "restart", "stagedesk-agent"), self.commands())
        self.assertEqual(self.paths.failed_version_file.read_text().strip(), "1.1.0")
        self.fetched.clear()
        self.assertIsNone(self.updater.check(self.hello()))  # the failed version is not tried again
        self.assertEqual(self.fetched, [])

    def test_rollback_does_nothing_when_confirmed(self):
        self.updater.check(self.hello())
        self.updater.confirm()
        self.assertFalse(rollback(self.paths, self.runner))
        self.assertEqual((self.paths.opt_dir / "VERSION").read_text().strip(), "1.1.0")

    def test_confirm_clears_pending_after_hello(self):
        self.assertIsNone(self.updater.confirm())  # nothing pending
        self.updater.check(self.hello())
        event = self.updater.confirm()
        self.assertEqual((event["from"], event["to"]), ("1.0.0", "1.1.0"))
        self.assertTrue(event["at"])
        self.assertFalse(self.paths.pending_confirm.exists())
        self.assertIn(("systemctl", "disable", "--now", "stagedesk-agent-rollback.timer"), self.commands())
        self.assertIsNone(self.updater.confirm())


if __name__ == "__main__":
    unittest.main()
