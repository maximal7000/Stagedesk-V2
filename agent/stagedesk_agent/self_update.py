"""Self-update of the agent: download, verify, unpack, swap, restart; roll back if not confirmed."""
import hashlib
import hmac
import json
import logging
import os
import re
import shutil
import sys
import tarfile
import urllib.request
from datetime import datetime, timezone

from .paths import Paths
from .timers import _write_if_changed

log = logging.getLogger("stagedesk_agent.self_update")
SERVICE = "stagedesk-agent"
ROLLBACK_UNIT = "stagedesk-agent-rollback"
ROLLBACK_MINUTES = 2
DOWNLOAD_TIMEOUT = 120
MAX_PACKAGE = 50 * 1024 * 1024
_VERSION = re.compile(r"^\d+(\.\d+){0,3}$")


def parse_version(text):
    text = (text or "").strip() if isinstance(text, str) else ""
    return tuple(int(p) for p in text.split(".")) if _VERSION.match(text) else None


def download(url, dest):
    with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT) as response, open(dest, "wb") as out:
        size = 0
        while True:
            chunk = response.read(64 * 1024)
            if not chunk:
                return
            size += len(chunk)
            if size > MAX_PACKAGE:
                raise ValueError("Paket ist größer als 50 MB")
            out.write(chunk)


def _safe_members(tar):
    members = tar.getmembers()
    for member in members:
        parts = member.name.replace("\\", "/").split("/")
        if member.name.startswith("/") or ".." in parts:
            raise ValueError(f"Unsicherer Pfad im Paket: {member.name}")
        if not (member.isfile() or member.isdir()):
            raise ValueError(f"Nicht erlaubter Eintrag im Paket: {member.name}")
    return members


def _extract(archive, target):
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True)
    with tarfile.open(archive, "r:gz") as tar:
        members = _safe_members(tar)
        if hasattr(tarfile, "data_filter"):
            tar.extractall(target, members=members, filter="data")
        else:
            tar.extractall(target, members=members)


def _read(path):
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


class SelfUpdater:
    def __init__(self, paths, runner, server, fetch=download):
        self.paths, self.runner, self.server, self.fetch = paths, runner, server.rstrip("/"), fetch

    def current_version(self):
        return parse_version(_read(self.paths.opt_dir / "VERSION"))

    def check(self, hello):
        """None when nothing to do; {"updated": v} after the swap (the service restarts); {"error": text}."""
        version = hello.get("agent_version")
        wanted, own = parse_version(version), self.current_version()
        if wanted is None or (own is not None and wanted <= own):
            return None
        if self.paths.pending_confirm.exists() or _read(self.paths.failed_version_file) == version:
            return None
        try:
            self._install(version, str(hello.get("agent_sha256") or ""))
        except Exception as exc:
            log.warning("self update to %s failed: %s", version, exc)
            shutil.rmtree(self.paths.opt_new, ignore_errors=True)
            return {"error": str(exc)}
        return {"updated": version}

    def _install(self, version, sha256):
        paths = self.paths
        archive = paths.opt_new.with_name("stagedesk-agent.download")
        archive.parent.mkdir(parents=True, exist_ok=True)
        try:
            self.fetch(f"{self.server}/api/monitor/agent/stagedesk-agent-{version}.tar.gz", archive)
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            if not sha256 or not hmac.compare_digest(digest.encode(), sha256.lower().encode()):
                raise ValueError("Prüfsumme des Pakets stimmt nicht, Update abgebrochen")
            _extract(archive, paths.opt_new)
        finally:
            archive.unlink(missing_ok=True)
        if _read(paths.opt_new / "VERSION") != version or not (paths.opt_new / "stagedesk_agent").is_dir():
            raise ValueError("Paketinhalt passt nicht zur Version, Update abgebrochen")
        shutil.rmtree(paths.opt_prev, ignore_errors=True)
        had_current = paths.opt_dir.exists()
        if had_current:
            os.rename(paths.opt_dir, paths.opt_prev)
        try:
            os.rename(paths.opt_new, paths.opt_dir)
        except OSError:
            if had_current:
                os.rename(paths.opt_prev, paths.opt_dir)
            raise
        paths.state_dir.mkdir(parents=True, exist_ok=True)
        old = _read(paths.opt_prev / "VERSION")
        paths.pending_confirm.write_text(json.dumps(
            {"at": datetime.now(timezone.utc).isoformat(), "from": old, "to": version}), encoding="utf-8")
        self._arm_rollback()
        self.runner.run(["systemctl", "--no-block", "restart", SERVICE])

    def _arm_rollback(self):
        paths = self.paths
        service = (f"[Unit]\nDescription=Stagedesk Agent: Rückfall auf die letzte Version\n\n[Service]\nType=oneshot\n"
                   f"Environment=PYTHONPATH={paths.opt_prev}\n"
                   f"ExecStart=/usr/bin/python3 -m stagedesk_agent.self_update rollback\n")
        timer = (f"[Unit]\nDescription=Stagedesk Agent: Rückfall nach {ROLLBACK_MINUTES} Minuten ohne Bestätigung\n\n"
                 f"[Timer]\nOnActiveSec={ROLLBACK_MINUTES}min\nOnBootSec={ROLLBACK_MINUTES}min\n\n"
                 "[Install]\nWantedBy=timers.target\n")
        _write_if_changed(paths.systemd_dir / f"{ROLLBACK_UNIT}.service", service)
        _write_if_changed(paths.systemd_dir / f"{ROLLBACK_UNIT}.timer", timer)
        self.runner.run(["systemctl", "daemon-reload"])
        self.runner.run(["systemctl", "enable", "--now", f"{ROLLBACK_UNIT}.timer"])

    def confirm(self):
        """Call after a successful hello. Returns the agent_updated event once, then None."""
        raw = _read(self.paths.pending_confirm)
        if not raw:
            return None
        try:
            event = json.loads(raw)
        except ValueError:
            event = {}
        self.paths.pending_confirm.unlink(missing_ok=True)
        self.runner.run(["systemctl", "disable", "--now", f"{ROLLBACK_UNIT}.timer"])
        return {"from": event.get("from"), "to": event.get("to"), "at": event.get("at")}


def rollback(paths, runner):
    """Restore .prev when the new version was never confirmed. True if a rollback happened."""
    raw = _read(paths.pending_confirm)
    if not raw or not paths.opt_prev.is_dir():
        return False
    try:
        failed = json.loads(raw).get("to") or ""
    except ValueError:
        failed = ""
    failed_dir = paths.opt_dir.with_name("stagedesk-agent.failed")
    shutil.rmtree(failed_dir, ignore_errors=True)
    if paths.opt_dir.exists():
        os.rename(paths.opt_dir, failed_dir)
    os.rename(paths.opt_prev, paths.opt_dir)
    shutil.rmtree(failed_dir, ignore_errors=True)
    if failed:
        paths.failed_version_file.write_text(failed, encoding="utf-8")
    paths.pending_confirm.unlink(missing_ok=True)
    runner.run(["systemctl", "disable", "--now", f"{ROLLBACK_UNIT}.timer"])
    runner.run(["systemctl", "--no-block", "restart", SERVICE])
    return True


if __name__ == "__main__":
    from .runner import Runner
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback(Paths(), Runner())
