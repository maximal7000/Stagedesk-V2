"""Self-update of the agent: download, verify, unpack, swap, restart; roll back if not confirmed."""
import hashlib
import contextlib
import fcntl
import hmac
import json
import logging
import os
import re
import shutil
import stat
import sys
import tarfile
import time
import urllib.request
from datetime import datetime, timezone

from .paths import Paths
from .timers import _write_if_changed

log = logging.getLogger("stagedesk_agent.self_update")
SERVICE = "stagedesk-agent"
ROLLBACK_UNIT = "stagedesk-agent-rollback"
ROLLBACK_MINUTES = 2
BOOT_MINUTES = 5  # after a power cut WLAN and hello need longer: rollback waits for this uptime
DOWNLOAD_TIMEOUT = 30  # per read
DOWNLOAD_DEADLINE = 600  # whole download
MAX_PACKAGE = 50 * 1024 * 1024
_VERSION = re.compile(r"^\d+(\.\d+){0,3}$")


def parse_version(text):
    text = (text or "").strip() if isinstance(text, str) else ""
    return tuple(int(p) for p in text.split(".")) if _VERSION.match(text) else None


def _file_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(64 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url, dest, deadline=DOWNLOAD_DEADLINE):
    """Stream to `dest`, hashing on the way. Returns the SHA-256 hex digest."""
    digest = hashlib.sha256()
    end = time.monotonic() + deadline
    size = 0
    with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT) as response, open(dest, "wb") as out:
        while True:
            chunk = response.read(64 * 1024)
            if not chunk:
                return digest.hexdigest()
            if time.monotonic() > end:
                raise TimeoutError("Download dauert länger als 10 Minuten, Netz prüfen")
            size += len(chunk)
            if size > MAX_PACKAGE:
                raise ValueError("Paket ist größer als 50 MB")
            digest.update(chunk)
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


def _normalize(root):
    """root:root, no group/other write, no setuid bits, whatever the tarfile filter did."""
    entries = [root]
    for dirpath, dirs, files in os.walk(root):
        entries += [os.path.join(dirpath, name) for name in dirs + files]
    for entry in entries:
        info = os.lstat(entry)
        if stat.S_ISDIR(info.st_mode):
            mode = 0o755
        else:
            mode = 0o755 if info.st_mode & 0o100 else 0o644
        os.chmod(entry, mode)
        try:
            os.chown(entry, 0, 0)
        except PermissionError:
            pass  # not running as root (tests)


def _atomic_write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)
    try:
        fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except OSError:
        pass


@contextlib.contextmanager
def _locked(paths):
    """Confirm and rollback must not run at the same time (the timer fires 2 minutes after the swap)."""
    paths.state_dir.mkdir(parents=True, exist_ok=True)
    with open(paths.state_dir / "update.lock", "a") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def _read(path):
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _checked(runner, args):
    result = runner.run(list(args))
    if result.code != 0:
        raise RuntimeError(f"{' '.join(args)} fehlgeschlagen: {(result.err or result.out).strip()[-200:]}")


def _try(runner, args):
    result = runner.run(list(args))
    if result.code != 0:
        log.warning("%s failed: %s", " ".join(args), (result.err or result.out).strip()[-200:])
    return result.code == 0


def _abandoned(paths, event):
    """Pending-confirm written, but the install was interrupted before the first rename."""
    return bool(event) and not paths.opt_prev.exists() \
        and _read(paths.opt_dir / "VERSION") == event.get("from") != event.get("to")


def _clear_abandoned(paths, runner):
    log.warning("abandoned update: removing pending-confirm")
    paths.pending_confirm.unlink(missing_ok=True)
    _try(runner, ["systemctl", "disable", "--now", f"{ROLLBACK_UNIT}.timer"])


def _read_json(path):
    try:
        data = json.loads(_read(path))
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


class SelfUpdater:
    def __init__(self, paths, runner, server, fetch=download, running_version=None):
        self.paths, self.runner, self.server, self.fetch = paths, runner, server.rstrip("/"), fetch
        # The version of this process, read once. confirm() only confirms the version that is really running.
        self.running_version = running_version or _read(paths.opt_dir / "VERSION")

    def current_version(self):
        return parse_version(_read(self.paths.opt_dir / "VERSION"))

    def check(self, hello):
        """None when nothing to do; {"updated": v} after the swap (the service restarts); {"error": text}."""
        version = hello.get("agent_version")
        sha256 = str(hello.get("agent_sha256") or "").lower()
        wanted, own = parse_version(version), self.current_version()
        if wanted is None or (own is not None and wanted <= own):
            return None
        with _locked(self.paths):
            event = _read_json(self.paths.pending_confirm)
            if _abandoned(self.paths, event):
                _clear_abandoned(self.paths, self.runner)
        failed = _read_json(self.paths.failed_version_file)
        if self.paths.pending_confirm.exists() or (failed.get("version") == version and failed.get("sha256") == sha256):
            return None
        try:
            self._install(version, sha256)
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
            digest = self.fetch(f"{self.server}/api/signage/agent/stagedesk-agent-{version}.tar.gz", archive)
            digest = digest or _file_sha256(archive)
            if not sha256 or not hmac.compare_digest(digest.encode(), sha256.encode()):
                raise ValueError("Prüfsumme des Pakets stimmt nicht, Update abgebrochen")
            _extract(archive, paths.opt_new)
            _normalize(paths.opt_new)
        finally:
            archive.unlink(missing_ok=True)
        if _read(paths.opt_new / "VERSION") != version or not (paths.opt_new / "stagedesk_agent").is_dir():
            raise ValueError("Paketinhalt passt nicht zur Version, Update abgebrochen")
        # Safety first: the rollback must be armed (and verified) before the install dir is touched.
        shutil.rmtree(paths.opt_prev, ignore_errors=True)  # a stale .prev must never be a rollback target
        try:
            with _locked(paths):
                _atomic_write(paths.pending_confirm, json.dumps(
                    {"at": datetime.now(timezone.utc).isoformat(), "from": _read(paths.opt_dir / "VERSION"),
                     "to": version, "sha256": sha256}))
                self._arm_rollback()
        except Exception:
            self._abort()
            raise
        had_current = paths.opt_dir.exists()
        try:
            if had_current:
                os.rename(paths.opt_dir, paths.opt_prev)
            os.rename(paths.opt_new, paths.opt_dir)
            _checked(self.runner, ["systemctl", "--no-block", "restart", SERVICE])
        except Exception:
            self._undo_swap()
            self._abort()
            raise

    def _undo_swap(self):
        paths = self.paths
        if paths.opt_prev.is_dir():
            if paths.opt_dir.exists():
                shutil.rmtree(paths.opt_dir, ignore_errors=True)
            os.rename(paths.opt_prev, paths.opt_dir)

    def _abort(self):
        _try(self.runner, ["systemctl", "disable", "--now", f"{ROLLBACK_UNIT}.timer"])
        self.paths.pending_confirm.unlink(missing_ok=True)
        shutil.rmtree(self.paths.opt_new, ignore_errors=True)

    def _arm_rollback(self):
        paths = self.paths
        timer_name = f"{ROLLBACK_UNIT}.timer"
        service = (f"[Unit]\nDescription=Stagedesk Agent: Rückfall auf die letzte Version\n\n[Service]\nType=oneshot\n"
                   f"Environment=PYTHONPATH={paths.opt_prev}\nWorkingDirectory=-{paths.opt_prev}\n"
                   f"ExecStart=/usr/bin/python3 -m stagedesk_agent.self_update rollback\n")
        timer = (f"[Unit]\nDescription=Stagedesk Agent: Rückfall nach {ROLLBACK_MINUTES} Minuten ohne Bestätigung\n\n"
                 f"[Timer]\nOnActiveSec={ROLLBACK_MINUTES}min\n\n"
                 "[Install]\nWantedBy=timers.target\n")
        _write_if_changed(paths.systemd_dir / f"{ROLLBACK_UNIT}.service", service)
        _write_if_changed(paths.systemd_dir / timer_name, timer)
        _checked(self.runner, ["systemctl", "daemon-reload"])
        _checked(self.runner, ["systemctl", "enable", "--now", timer_name])
        _checked(self.runner, ["systemctl", "restart", timer_name])  # enable --now does not re-arm an elapsed timer
        _checked(self.runner, ["systemctl", "is-active", timer_name])

    def confirm(self):
        """Call after a successful hello. Returns the agent_updated event once, then None.

        Only the version that is running right now can be confirmed."""
        with _locked(self.paths):
            event = _read_json(self.paths.pending_confirm)
            if not event:
                return None
            if _abandoned(self.paths, event):
                _clear_abandoned(self.paths, self.runner)
                return None
            if event.get("to") != self.running_version:
                log.warning("pending update to %s, but %s is running: not confirming", event.get("to"),
                            self.running_version)
                return None
            self.paths.pending_confirm.unlink(missing_ok=True)
            _try(self.runner, ["systemctl", "disable", "--now", f"{ROLLBACK_UNIT}.timer"])
        return {"from": event.get("from"), "to": event.get("to"), "at": event.get("at")}


def _uptime(paths):
    try:
        return float(_read(paths.proc / "uptime").split()[0])
    except (IndexError, ValueError):
        return None


def rollback(paths, runner, sleep=time.sleep, uptime=None):
    """Restore .prev when the new version was never confirmed. True if a rollback happened.

    Shortly after boot (power cut during the trial) the new version gets until BOOT_MINUTES of uptime;
    pending-confirm is re-checked under the lock afterwards."""
    current = (uptime or (lambda: _uptime(paths)))()
    if current is not None and current < BOOT_MINUTES * 60 and paths.pending_confirm.exists():
        sleep(BOOT_MINUTES * 60 - current)
    with _locked(paths):
        event = _read_json(paths.pending_confirm)  # re-checked under the lock: a confirm may have won
        if _abandoned(paths, event):
            _clear_abandoned(paths, runner)
            return False
        if not event or not paths.opt_prev.is_dir():
            return False
        had_active = paths.opt_dir.exists()
        failed_dir = paths.opt_dir.with_name("stagedesk-agent.failed")
        shutil.rmtree(failed_dir, ignore_errors=True)
        if paths.opt_dir.exists():  # missing after a power cut between the two renames
            os.rename(paths.opt_dir, failed_dir)
        os.rename(paths.opt_prev, paths.opt_dir)
        shutil.rmtree(failed_dir, ignore_errors=True)
        if event.get("to") and had_active:  # without an active dir the new version never ran
            _atomic_write(paths.failed_version_file,
                          json.dumps({"version": event["to"], "sha256": event.get("sha256", "")}))
        paths.pending_confirm.unlink(missing_ok=True)
    _try(runner, ["systemctl", "disable", "--now", f"{ROLLBACK_UNIT}.timer"])
    _try(runner, ["systemctl", "reset-failed", SERVICE])
    _try(runner, ["systemctl", "--no-block", "restart", SERVICE])
    return True


if __name__ == "__main__":
    from .runner import Runner
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback(Paths(), Runner())
