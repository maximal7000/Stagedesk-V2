"""Persistent agent configuration (config.json, mode 600) and reconnect backoff."""
import json
import os
import random

DEFAULT_SERVER = "https://stagedesk.t410.de"
_HELLO_FIELDS = ("slug", "key", "kiosk_url", "power_method", "power_config",
                 "update_window", "auto_updates", "daily_reboot")


class Config:
    def __init__(self, paths):
        self.paths = paths
        self.server = DEFAULT_SERVER
        self.token = None
        self.slug = None
        self.key = None
        self.kiosk_url = None
        self.power_method = "cec"
        self.power_config = {}
        self.update_window = {}
        self.auto_updates = True
        self.daily_reboot = True

    @classmethod
    def load(cls, paths):
        cfg = cls(paths)
        try:
            data = json.loads(paths.config_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return cfg
        if not isinstance(data, dict):
            return cfg
        for name in ("server", "token") + _HELLO_FIELDS:
            if name in data:
                setattr(cfg, name, data[name])
        return cfg

    def as_dict(self):
        return {name: getattr(self, name) for name in ("server", "token") + _HELLO_FIELDS}

    def save(self):
        directory = self.paths.config_dir
        directory.mkdir(parents=True, exist_ok=True)
        target = self.paths.config_file
        tmp = target.with_name(target.name + ".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(self.as_dict(), handle, indent=2)
        os.chmod(tmp, 0o600)
        os.replace(tmp, target)

    def clear_pairing(self):
        self.token = self.slug = self.key = self.kiosk_url = None
        self.save()

    def apply_hello(self, message):
        """Take over the server's view (the slug may have changed) and persist it."""
        for name in _HELLO_FIELDS:
            if name in message and message[name] is not None:
                setattr(self, name, message[name])
        self.save()


def backoff_delays(jitter=True):
    """5, 10, 20, 40, 60, 60, ... seconds (optionally +-10 percent)."""
    delay = 5
    while True:
        yield delay * random.uniform(0.9, 1.1) if jitter else delay
        delay = min(delay * 2, 60)
