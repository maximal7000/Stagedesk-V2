"""
Globale Suche über mehrere Module.
Liefert maximal `limit` Treffer pro Kategorie. Ergebnisse sind nach Permission gefiltert.
"""
from typing import List
from ninja import Router
from django.db.models import Q

from core.auth import keycloak_auth
from users.api import is_admin
from users.models import UserProfile
from veranstaltung.models import Veranstaltung
from inventar.models import InventarItem
from anwesenheit.models import AnwesenheitsListe


search_router = Router(tags=["Search"])


def _has_perm(request, code: str) -> bool:
    if is_admin(request):
        return True
    kid = request.auth.get('sub', '')
    try:
        return UserProfile.objects.get(keycloak_id=kid).has_permission(code, False)
    except UserProfile.DoesNotExist:
        return False


@search_router.get("", auth=keycloak_auth)
def global_search(request, q: str = "", limit: int = 8):
    """Sucht in Veranstaltungen, Inventar-Items und Usern (jeweils Permission-gefiltert)."""
    q = (q or "").strip()
    if len(q) < 2:
        return {"veranstaltungen": [], "items": [], "user": [], "anwesenheit": []}

    results = {"veranstaltungen": [], "items": [], "user": [], "anwesenheit": []}

    if _has_perm(request, 'veranstaltung.view'):
        qs = Veranstaltung.objects.filter(
            Q(titel__icontains=q) | Q(ort__icontains=q) | Q(beschreibung__icontains=q)
        )[:limit]
        results["veranstaltungen"] = [
            {"id": v.id, "titel": v.titel, "ort": v.ort, "datum_von": v.datum_von.isoformat() if v.datum_von else None}
            for v in qs
        ]

    if _has_perm(request, 'inventar.view'):
        qs = InventarItem.objects.filter(
            Q(name__icontains=q) | Q(seriennummer__icontains=q),
            ist_aktiv=True,
        ).select_related('kategorie')[:limit]
        results["items"] = [
            {"id": i.id, "name": i.name, "kategorie": i.kategorie.name if i.kategorie else None}
            for i in qs
        ]

    if _has_perm(request, 'anwesenheit.view'):
        qs = AnwesenheitsListe.objects.filter(
            Q(titel__icontains=q) | Q(ort__icontains=q)
        )
        if not _has_perm(request, 'anwesenheit.view_all'):
            kid = request.auth.get('sub', '')
            qs = qs.filter(teilnehmer__keycloak_id=kid).distinct()
        qs = qs[:limit]
        results["anwesenheit"] = [
            {"id": a.id, "titel": a.titel, "status": a.status} for a in qs
        ]

    if is_admin(request):
        qs = UserProfile.objects.filter(
            Q(first_name__icontains=q) | Q(last_name__icontains=q) |
            Q(username__icontains=q) | Q(email__icontains=q)
        )[:limit]
        results["user"] = [
            {
                "id": u.id, "keycloak_id": u.keycloak_id,
                "name": f"{u.first_name} {u.last_name}".strip() or u.username,
                "email": u.email,
            } for u in qs
        ]

    return results
