"""Separate module so the sub-routers do not import each other (circular imports)."""
from ninja.errors import HttpError

from users.api import is_admin
from .roles import signage_roles


def _require_perm(request, code: str):
    if is_admin(request):
        return
    role = code.removeprefix('signage.')
    if role in signage_roles(request.auth):
        return
    raise HttpError(403, "Keine Berechtigung")


def _log_audit(request, action, detail='', via_token=False):
    from core.audit import log as _corelog
    low = action.lower()
    if 'deaktiv' in low or ' aus' in low:
        a = 'status_geaendert'
    elif 'aktiv' in low or ' an' in low:
        a = 'aktiviert'
    else:
        a = 'status_geaendert'
    name = f"{action}: {detail}" if detail else action
    _corelog(request, a, 'monitor', 0, name, {'via': 'token'} if via_token else None)
