"""Das Agent-Paket, das der Server an die Geräte ausliefert (Spec §6, §9).

Das Paket ist ein deterministisches tar.gz aus agent/stagedesk_agent, agent/systemd, agent/kiosk und
agent/VERSION. Es wird je Version einmal gebaut und im Prozess gehalten."""
import gzip
import hashlib
import io
import tarfile
import threading
from pathlib import Path

from django.conf import settings

_PARTS = ('stagedesk_agent', 'systemd', 'kiosk')
_SKIP_DIRS = {'__pycache__', 'tests'}
_SKIP_NAMES = {'.env'}
_cache = {}
_lock = threading.Lock()


def agent_dir() -> Path:
    return Path(settings.BASE_DIR).parent / 'agent'


def package_version() -> str:
    try:
        return (agent_dir() / 'VERSION').read_text(encoding='utf-8').strip() or '0.0.0'
    except OSError:
        return '0.0.0'


def install_script_path() -> Path:
    return agent_dir() / 'install.sh'


def _files(root: Path):
    """(Name im Paket, Quelldatei), sortiert; ohne tests/, __pycache__, .pyc und .env."""
    found = {}
    if (root / 'VERSION').is_file():
        found['VERSION'] = root / 'VERSION'
    for part in _PARTS:
        base = root / part
        if not base.is_dir():
            continue
        for path in base.rglob('*'):
            relative = path.relative_to(root)
            if not path.is_file() or path.is_symlink():
                continue
            if _SKIP_DIRS & set(relative.parts) or path.suffix == '.pyc' or path.name in _SKIP_NAMES:
                continue
            found[relative.as_posix()] = path
    return sorted(found.items())


def _build(root: Path) -> bytes:
    raw = io.BytesIO()
    # mtime=0 und kein Dateiname im gzip-Kopf: gleiche Eingabe, gleiche Bytes.
    with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as gz:
        with tarfile.open(fileobj=gz, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            for name, path in _files(root):
                data = path.read_bytes()
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mtime = 0
                info.uid = info.gid = 0
                info.uname = info.gname = ''
                info.mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
                tar.addfile(info, io.BytesIO(data))
    return raw.getvalue()


def build_package() -> bytes:
    version = package_version()
    with _lock:
        cached = _cache.get(version)
        if cached is None:
            cached = _cache[version] = _build(agent_dir())
        return cached


def clear_cache() -> None:
    with _lock:
        _cache.clear()


def agent_package_info() -> tuple:
    """(Version aus agent/VERSION, SHA-256 des Pakets); ohne Paket ("0.0.0", "")."""
    version = package_version()
    if not (agent_dir() / 'stagedesk_agent').is_dir():
        return ('0.0.0', '')
    return (version, hashlib.sha256(build_package()).hexdigest())
