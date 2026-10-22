"""
Rechteprüfung und Audit-Log für die Signage-Router (Paket api/).

Eigenes Modul, damit die Teil-Router nicht untereinander importieren müssen (Zirkelimport).
"""
from ninja.errors import HttpError

from users.api import is_admin
from users.models import UserProfile


def _require_perm(request, code: str):
    """Admin oder Permission. Wirft 403 wenn nichts davon passt."""
    if is_admin(request):
        return
    kid = request.auth.get('sub', '') if request.auth else ''
    if kid:
        try:
            if UserProfile.objects.get(keycloak_id=kid).has_permission(code, False):
                return
        except UserProfile.DoesNotExist:
            pass
    raise HttpError(403, "Keine Berechtigung")


def _log_audit(request, action, detail='', via_token=False):
    """Schreibt in den globalen Audit-Log (core.audit → inventar.AuditLog)."""
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
