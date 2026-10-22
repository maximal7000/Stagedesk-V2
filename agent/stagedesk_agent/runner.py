"""The only place that starts system commands. Tests use FakeRunner instead."""
import subprocess
from typing import NamedTuple


class RunResult(NamedTuple):
    code: int
    out: str
    err: str


class Runner:
    def run(self, args, timeout=30, user=None, input=None):
        """`args` is a list, never a shell string."""
        command = list(args)
        if user:
            command = ["runuser", "-u", user, "--"] + command
        try:
            done = subprocess.run(command, capture_output=True, text=True, timeout=timeout, input=input)
        except subprocess.TimeoutExpired:
            return RunResult(124, "", f"timeout after {timeout}s")
        except OSError as exc:
            return RunResult(127, "", str(exc))
        return RunResult(done.returncode, done.stdout, done.stderr)
