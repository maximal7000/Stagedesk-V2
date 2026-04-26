"""
Modul-übergreifendes Audit-Log.
Wir verwenden das bereits vorhandene inventar.AuditLog-Modell, damit es nur
EINE Tabelle gibt. Andere Module rufen `log(...)` auf.

Einsatz:
    from core.audit import log
    log(request, 'erstellt', 'veranstaltung', v.id, v.titel, {"status": v.status})
"""
from typing import Optional


def _user_info(request) -> tuple:
    if not request or not getattr(request, 'auth', None):
        return ('', 'system')
    return (
        request.auth.get('sub', ''),
        request.auth.get('preferred_username', '') or 'unbekannt',
    )


def log(request, aktion: str, entity_type: str, entity_id: int,
        entity_name: str = '', details: Optional[dict] = None) -> None:
    """Schreibt einen Audit-Log-Eintrag. Best-effort: Fehler werden geschluckt,
    damit der eigentliche Endpoint nie wegen Logging stirbt."""
    try:
        from inventar.models import AuditLog  # zentrales Modell
        kid, uname = _user_info(request)
        AuditLog.objects.create(
            aktion=aktion,
            entity_type=entity_type,
            entity_id=int(entity_id) if entity_id is not None else 0,
            entity_name=(entity_name or '')[:300],
            details=details or {},
            user_keycloak_id=kid,
            user_username=uname,
        )
    except Exception:
        return
