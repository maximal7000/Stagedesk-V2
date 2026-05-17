"""Aufgaben-API + WebSocket-Broadcast."""
from typing import List, Optional
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Router, Schema
from ninja.errors import HttpError

from core.auth import keycloak_auth
from users.api import is_admin
from users.models import UserProfile
from .models import Aufgabe


aufgaben_router = Router(tags=["Aufgaben"])


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


def _short_name(p) -> str:
    """Für Monitor-Vollbild: Vorname → Nachname → Username → keycloak_id[:8]."""
    return p.first_name or p.last_name or p.username or p.keycloak_id[:8]


def _full_name(p) -> str:
    """Für Admin-Anzeigen: 'Vorname Nachname' wenn vorhanden, sonst Username."""
    full = ' '.join(s for s in (p.first_name, p.last_name) if s)
    return full or p.username or p.keycloak_id[:8]


def _user_dict(p) -> dict:
    return {
        "id": p.id, "keycloak_id": p.keycloak_id,
        "name": _full_name(p),
        "kurzname": _short_name(p),
        "first_name": p.first_name or '',
        "last_name": p.last_name or '',
        "username": p.username,
    }


def _aufgabe_to_dict(a: Aufgabe) -> dict:
    return {
        "id": a.id,
        "titel": a.titel,
        "beschreibung": a.beschreibung,
        "status": a.status,
        "sortierung": a.sortierung,
        "zugewiesene": [_user_dict(u) for u in a.zugewiesene.all()],
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
        async_to_sync(layer.group_send)('aufgaben', {'type': 'aufgaben_update'})
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


@aufgaben_router.get("", auth=keycloak_auth)
def list_aufgaben(request):
    """Liste aller Aufgaben mit Zuweisungen."""
    _require_perm(request, 'aufgaben.view')
    return [_aufgabe_to_dict(a) for a in
            Aufgabe.objects.prefetch_related('zugewiesene').all()]


@aufgaben_router.post("", auth=keycloak_auth)
def create_aufgabe(request, payload: AufgabeCreateSchema):
    _require_perm(request, 'aufgaben.manage')
    data = payload.dict()
    zugewiesene_ids = data.pop('zugewiesene_ids', [])
    a = Aufgabe.objects.create(**data)
    if zugewiesene_ids:
        a.zugewiesene.set(UserProfile.objects.filter(id__in=zugewiesene_ids))
    _broadcast()
    return _aufgabe_to_dict(a)


class ReorderSchema(Schema):
    ids: List[int]


# WICHTIG: alle Literal-Routen (/users, /display, /reorder) MÜSSEN vor
# der generischen /{aid}-Route stehen, sonst matched Ninja "users" gegen
# {aid:int} und liefert 405 statt der erwarteten Route.

@aufgaben_router.get("/users", auth=keycloak_auth)
def list_users_for_aufgaben(request):
    """Verfügbare User für Zuweisung."""
    _require_perm(request, 'aufgaben.manage')
    return [_user_dict(u) for u in UserProfile.objects.exclude(is_admin_cached=True)
            .order_by('last_name', 'first_name', 'username')]


@aufgaben_router.get("/display", auth=None)
def display_aufgaben(request):
    """Öffentlicher Read-Only-Endpoint für die Monitor-Vollbildansicht."""
    return [_aufgabe_to_dict(a) for a in
            Aufgabe.objects.prefetch_related('zugewiesene').all()]


@aufgaben_router.put("/reorder", auth=keycloak_auth)
def reorder_aufgaben(request, payload: ReorderSchema):
    """Setzt die Sortierung gemäß der übergebenen ID-Reihenfolge."""
    _require_perm(request, 'aufgaben.manage')
    for idx, aid in enumerate(payload.ids):
        Aufgabe.objects.filter(id=aid).update(sortierung=idx)
    _broadcast()
    return {"status": "ok", "count": len(payload.ids)}


@aufgaben_router.put("/{aid}", auth=keycloak_auth)
def update_aufgabe(request, aid: int, payload: AufgabeUpdateSchema):
    _require_perm(request, 'aufgaben.manage')
    a = get_object_or_404(Aufgabe, id=aid)
    data = payload.dict(exclude_unset=True)
    zugewiesene_ids = data.pop('zugewiesene_ids', None)
    if 'status' in data:
        a.erledigt_am = timezone.now() if data['status'] == 'abgeschlossen' else None
    for k, v in data.items():
        setattr(a, k, v)
    a.save()
    if zugewiesene_ids is not None:
        a.zugewiesene.set(UserProfile.objects.filter(id__in=zugewiesene_ids))
    _broadcast()
    return _aufgabe_to_dict(a)


@aufgaben_router.delete("/{aid}", auth=keycloak_auth)
def delete_aufgabe(request, aid: int):
    _require_perm(request, 'aufgaben.manage')
    get_object_or_404(Aufgabe, id=aid).delete()
    _broadcast()
    return {"status": "deleted"}
