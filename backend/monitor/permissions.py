"""
Rechteprüfung für die Monitor-Router (api.py und api_setup.py).

Eigenes Modul, damit api_setup nicht aus api importieren muss (Zirkelimport).
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
