"""
Modul-übergreifendes Audit-API. Liest aus inventar.AuditLog (zentrale Tabelle).
"""
from typing import Optional
from ninja import Router

from core.auth import keycloak_auth
from users.api import is_admin
from inventar.models import AuditLog


audit_router = Router(tags=["Audit"])


@audit_router.get("", auth=keycloak_auth)
def list_audit(request, entity_type: Optional[str] = None, q: Optional[str] = None,
               limit: int = 200):
    """Audit-Einträge auflisten (Admin-only)."""
    if not is_admin(request):
        return {"error": "Keine Berechtigung"}, 403
    qs = AuditLog.objects.all()
    if entity_type:
        qs = qs.filter(entity_type=entity_type)
    if q:
        qs = qs.filter(entity_name__icontains=q)
    qs = qs[:max(1, min(limit, 1000))]
    return [
        {
            "id": e.id,
            "aktion": e.aktion,
            "aktion_display": e.get_aktion_display(),
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "entity_name": e.entity_name,
            "details": e.details,
            "user_username": e.user_username,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
        } for e in qs
    ]


@audit_router.get("/entity-types", auth=keycloak_auth)
def list_entity_types(request):
    """Verfügbare entity_type-Werte (für Filter-Dropdown)."""
    if not is_admin(request):
        return {"error": "Keine Berechtigung"}, 403
    types = list(AuditLog.objects.values_list('entity_type', flat=True).distinct())
    return sorted(set(t for t in types if t))
