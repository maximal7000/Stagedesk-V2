"""AG-Aufgaben API + WebSocket-Broadcast."""
from typing import List, Optional
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Router, Schema
from ninja.errors import HttpError

from core.auth import keycloak_auth
from users.api import is_admin
from users.models import UserProfile
from .models import AgAufgabe


ag_router = Router(tags=["AG-Aufgaben"])


def _require_perm(request, code: str):
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


def _display_name(p) -> str:
    return p.first_name or p.last_name or p.username or p.keycloak_id[:8]


def _aufgabe_to_dict(a: AgAufgabe) -> dict:
    return {
        "id": a.id,
        "titel": a.titel,
        "beschreibung": a.beschreibung,
        "status": a.status,
        "sortierung": a.sortierung,
        "zugewiesene": [
            {
                "id": u.id, "keycloak_id": u.keycloak_id,
                "name": _display_name(u),
                "username": u.username,
            } for u in a.zugewiesene.all()
        ],
        "erstellt_am": a.erstellt_am.isoformat() if a.erstellt_am else None,
        "erledigt_am": a.erledigt_am.isoformat() if a.erledigt_am else None,
    }


def _broadcast():
    """Live-Update an Monitor-Clients."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        layer = get_channel_layer()
        if not layer:
            return
        async_to_sync(layer.group_send)('ag_aufgaben', {'type': 'aufgaben_update'})
    except Exception:
        pass


class AufgabeCreateSchema(Schema):
    titel: str
    beschreibung: str = ''
    status: str = 'offen'
    sortierung: int = 0
    zugewiesene_ids: List[int] = []


class AufgabeUpdateSchema(Schema):
    titel: Optional[str] = None
    beschreibung: Optional[str] = None
    status: Optional[str] = None
    sortierung: Optional[int] = None
    zugewiesene_ids: Optional[List[int]] = None


@ag_router.get("/aufgaben", auth=keycloak_auth)
def list_aufgaben(request):
    """Liste aller Aufgaben mit Zuweisungen."""
    _require_perm(request, 'ag.view')
    return [_aufgabe_to_dict(a) for a in
            AgAufgabe.objects.prefetch_related('zugewiesene').all()]


@ag_router.post("/aufgaben", auth=keycloak_auth)
def create_aufgabe(request, payload: AufgabeCreateSchema):
    _require_perm(request, 'ag.manage')
    data = payload.dict()
    zugewiesene_ids = data.pop('zugewiesene_ids', [])
    a = AgAufgabe.objects.create(**data)
    if zugewiesene_ids:
        a.zugewiesene.set(UserProfile.objects.filter(id__in=zugewiesene_ids))
    _broadcast()
    return _aufgabe_to_dict(a)


@ag_router.put("/aufgaben/{aid}", auth=keycloak_auth)
def update_aufgabe(request, aid: int, payload: AufgabeUpdateSchema):
    _require_perm(request, 'ag.manage')
    a = get_object_or_404(AgAufgabe, id=aid)
    data = payload.dict(exclude_unset=True)
    zugewiesene_ids = data.pop('zugewiesene_ids', None)
    if 'status' in data:
        a.erledigt_am = timezone.now() if data['status'] == 'fertig' else None
    for k, v in data.items():
        setattr(a, k, v)
    a.save()
    if zugewiesene_ids is not None:
        a.zugewiesene.set(UserProfile.objects.filter(id__in=zugewiesene_ids))
    _broadcast()
    return _aufgabe_to_dict(a)


@ag_router.delete("/aufgaben/{aid}", auth=keycloak_auth)
def delete_aufgabe(request, aid: int):
    _require_perm(request, 'ag.manage')
    get_object_or_404(AgAufgabe, id=aid).delete()
    _broadcast()
    return {"status": "deleted"}


@ag_router.get("/users", auth=keycloak_auth)
def list_users_for_ag(request):
    """Verfügbare User für Zuweisung."""
    _require_perm(request, 'ag.manage')
    return [
        {
            "id": u.id, "keycloak_id": u.keycloak_id,
            "name": _display_name(u),
            "username": u.username,
        }
        for u in UserProfile.objects.exclude(is_admin_cached=True).order_by('last_name', 'first_name', 'username')
    ]


# ─── Öffentlicher Endpoint für Monitor-Display ──────────────────────

@ag_router.get("/display", auth=None)
def display_aufgaben(request):
    """Öffentlicher Read-Only-Endpoint für die Monitor-Vollbildansicht."""
    return [_aufgabe_to_dict(a) for a in
            AgAufgabe.objects.prefetch_related('zugewiesene').all()]
