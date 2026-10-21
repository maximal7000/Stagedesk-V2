"""Test doubles shared by all agent tests."""
import tempfile
from pathlib import Path

from stagedesk_agent.paths import Paths
from stagedesk_agent.runner import RunResult


class FakeRunner:
    """Records calls; answers from `responses` keyed by the argument tuple."""

    def __init__(self, responses=None):
        self.responses = dict(responses or {})
        self.calls = []
        self.inputs = []

    def run(self, args, timeout=30, user=None, input=None):
        self.calls.append((tuple(args), user))
        self.inputs.append(input)
        return self.responses.get(tuple(args), RunResult(0, "", ""))


def make_paths(testcase):
    tmp = tempfile.TemporaryDirectory()
    testcase.addCleanup(tmp.cleanup)
    return Paths(Path(tmp.name))
