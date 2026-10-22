"""Relative to a root so tests can use a temp dir."""
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

    @property
    def runtime_dir(self):
        """Owned by pi and not world-writable."""
        return self.root / "run" / "user" / "1000"

    @property
    def opt_new(self):
        return self.root / "opt" / "stagedesk-agent.new"

    @property
    def opt_prev(self):
        return self.root / "opt" / "stagedesk-agent.prev"

    @property
    def systemd_dir(self):
        return self.root / "etc" / "systemd" / "system"

    @property
    def pending_confirm(self):
        return self.state_dir / "pending-confirm"

    @property
    def failed_version_file(self):
        return self.state_dir / "failed-version"

    @property
    def update_state(self):
        return self.state_dir / "update-state.json"

    @property
    def reboot_required(self):
        return self.root / "var" / "run" / "reboot-required"
