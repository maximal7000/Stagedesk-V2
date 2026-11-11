"""kiosk.sh against a fake wlr-randr that keeps the output's state in a file."""
import os
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

KIOSK_SH = Path(__file__).resolve().parent.parent / "kiosk" / "kiosk.sh"

FAKE_WLR_RANDR = r"""#!/bin/bash
dir="$(dirname "$0")"
[ -f "$dir/gone" ] && exit 1
read -r mode transform < "$dir/state"
if [ "$#" -eq 0 ]; then
  echo 'HDMI-A-1 "Fake TV"'
  echo "  Modes:"
  echo "    $mode px, 60.000000 Hz (current)"
  echo "  Transform: $transform"
  exit 0
fi
echo "$*" >> "$dir/calls"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --mode) mode="${2%%@*}"; shift ;;
    --transform) transform="$2"; shift ;;
  esac
  shift
done
[ "$mode" = "640x480" ] && exit 1  # the screen rejects this mode
echo "$mode $transform" > "$dir/state"
"""


def wait_until(check, timeout=5):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if check():
            return True
        time.sleep(0.05)
    return False


class KioskOutputTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir, True)
        fake = self.dir / "wlr-randr"
        fake.write_text(FAKE_WLR_RANDR)
        fake.chmod(0o755)
        self.reset()

    def reset(self):
        """What cage does when the TV reconnects."""
        (self.dir / "state").write_text("1920x1080 normal\n")

    def state(self):
        return (self.dir / "state").read_text().split()

    def calls(self):
        path = self.dir / "calls"
        return path.read_text().splitlines() if path.exists() else []

    def start(self, mode, transform, script):
        env = dict(os.environ, PATH=f"{self.dir}:{os.environ['PATH']}", OUTPUT_MODE=mode,
                   OUTPUT_TRANSFORM=transform, OUTPUT_CHECK_SECONDS="0.1")
        proc = subprocess.Popen(["bash", "-c", f'source "{KIOSK_SH}"; {script}'], env=env,
                                stderr=subprocess.DEVNULL)
        self.addCleanup(self.stop, proc)
        return proc

    @staticmethod
    def stop(proc):
        if proc.poll() is None:
            proc.kill()
        proc.wait()

    def test_output_settings_come_back_after_the_tv_reconnects(self):
        self.start("1280x720@60", "90", "apply_output; watch_output")
        self.assertTrue(wait_until(lambda: self.state() == ["1280x720", "90"]))
        self.assertEqual(self.calls(), ["--output HDMI-A-1 --mode 1280x720@60Hz --transform 90"])
        self.reset()
        self.assertTrue(wait_until(lambda: self.state() == ["1280x720", "90"]))
        self.assertEqual(len(self.calls()), 2)
        time.sleep(0.4)
        self.assertEqual(len(self.calls()), 2)  # nothing changed, nothing applied

    def test_rejected_mode_is_not_retried_until_the_output_changes(self):
        self.start("640x480", "", "apply_output; watch_output")
        self.assertTrue(wait_until(lambda: len(self.calls()) == 1))
        time.sleep(0.4)
        self.assertEqual(len(self.calls()), 1)
        (self.dir / "state").write_text("1920x1080 180\n")
        self.assertTrue(wait_until(lambda: len(self.calls()) == 2))

    def test_watcher_ends_with_cage(self):
        proc = self.start("1280x720", "", "watch_output")
        time.sleep(0.2)
        (self.dir / "gone").write_text("")
        self.assertEqual(proc.wait(timeout=5), 0)


if __name__ == "__main__":
    unittest.main()
