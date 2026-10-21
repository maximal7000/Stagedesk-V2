"""All file system locations of the agent, relative to a root so tests can use a temp dir."""
from pathlib import Path


class Paths:
    def __init__(self, root="/"):
        self.root = Path(root)

    @property
    def config_dir(self):
        return self.root / "etc" / "stagedesk-agent"

    @property
    def config_file(self):
        return self.config_dir / "config.json"

    @property
    def kiosk_env(self):
        return self.config_dir / "kiosk.env"

    @property
    def opt_dir(self):
        return self.root / "opt" / "stagedesk-agent"

    @property
    def proc(self):
        return self.root / "proc"

    @property
    def sys(self):
        return self.root / "sys"

    @property
    def state_dir(self):
        return self.root / "var" / "lib" / "stagedesk-agent"
