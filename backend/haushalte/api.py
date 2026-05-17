"""
Django Ninja API für Haushalts-Management
GLOBAL: Alle Benutzer teilen sich die gleichen Haushalte
"""
from typing import List, Optional
from ninja import Router, Schema
from ninja.errors import HttpError
from django.shortcuts import get_object_or_404
from django.http import HttpRequest
from django.db.models import Max

from core.auth import keycloak_auth
from core.audit import log as audit_log
from users.api import is_admin
from users.models import UserProfile
from .models import Haushalt, Artikel, Kategorie
from .schemas import (
    HaushaltSchema,
    HaushaltCreateSchema,
    HaushaltUpdateSchema,
    ArtikelSchema,
    ArtikelCreateSchema,
    ArtikelUpdateSchema,
    ArtikelReorderSchema,
    KategorieSchema,
    KategorieCreateSchema,
    LinkParseRequestSchema,
    LinkParseResponseSchema,
)
from .services import LinkParserService

# Router für Haushalte
haushalte_router = Router(tags=["Haushalte"])


def get_user_id_from_token(request: HttpRequest) -> str:
    """Extrahiert die Benutzer-ID aus dem Token (für Logging/Audit)"""
    if hasattr(request, 'auth') and request.auth:
        return request.auth.get('preferred_username') or request.auth.get('sub')
    return 'anonymous'


def require_perm(request, code: str):
    """Erlaubt Zugriff nur wenn der User Admin ist oder die Permission besitzt."""
    if is_admin(request):
        return
    kid = request.auth.get('sub', '')
    try:
        profile = UserProfile.objects.get(keycloak_id=kid)
        if profile.has_permission(code, False):
            return
    except UserProfile.DoesNotExist:
        pass
    raise HttpError(403, "Keine Berechtigung")


# ==================== Haushalt Endpoints (GLOBAL MIT AUTH) ====================

@haushalte_router.get("/", response=List[HaushaltSchema], auth=keycloak_auth)
def list_haushalte(request):
    """Alle Haushalte auflisten (global für alle authentifizierten Benutzer)"""
    require_perm(request, 'haushalte.view')
    haushalte = Haushalt.objects.all()
    return haushalte


@haushalte_router.get("/{haushalt_id}", response=HaushaltSchema, auth=keycloak_auth)
def get_haushalt(request, haushalt_id: int):
    """Einzelnen Haushalt abrufen"""
    require_perm(request, 'haushalte.view')
    haushalt = get_object_or_404(Haushalt, id=haushalt_id)
    return haushalt


@haushalte_router.post("/", response=HaushaltSchema, auth=keycloak_auth)
def create_haushalt(request, payload: HaushaltCreateSchema):
    """Neuen Haushalt erstellen"""
    require_perm(request, 'haushalte.create')
    user_id = get_user_id_from_token(request)
    haushalt = Haushalt.objects.create(
        name=payload.name,
        beschreibung=payload.beschreibung,
        budget_konsumitiv=payload.budget_konsumitiv,
        budget_investiv=payload.budget_investiv,
        benutzer_id=user_id,  # Wer hat erstellt (für Audit)
    )
    audit_log(request, 'erstellt', 'haushalt', haushalt.id, haushalt.name)
    return haushalt


@haushalte_router.put("/{haushalt_id}", response=HaushaltSchema, auth=keycloak_auth)
def update_haushalt(request, haushalt_id: int, payload: HaushaltUpdateSchema):
    """Haushalt aktualisieren"""
    require_perm(request, 'haushalte.edit')
    haushalt = get_object_or_404(Haushalt, id=haushalt_id)

    if payload.name is not None:
        haushalt.name = payload.name
    if payload.beschreibung is not None:
        haushalt.beschreibung = payload.beschreibung
    if payload.budget_konsumitiv is not None:
        haushalt.budget_konsumitiv = payload.budget_konsumitiv
    if payload.budget_investiv is not None:
        haushalt.budget_investiv = payload.budget_investiv

    haushalt.save()
    audit_log(request, 'aktualisiert', 'haushalt', haushalt.id, haushalt.name)
    return haushalt


@haushalte_router.delete("/{haushalt_id}", auth=keycloak_auth)
def delete_haushalt(request, haushalt_id: int):
    """Haushalt löschen"""
    require_perm(request, 'haushalte.delete')
    haushalt = get_object_or_404(Haushalt, id=haushalt_id)
    name = haushalt.name
    hid = haushalt.id
    haushalt.delete()
    audit_log(request, 'geloescht', 'haushalt', hid, name)
    return {"success": True}


# ==================== Artikel Endpoints (GLOBAL MIT AUTH) ====================

@haushalte_router.get("/{haushalt_id}/artikel", response=List[ArtikelSchema], auth=keycloak_auth)
def list_artikel(request, haushalt_id: int):
    """Alle Artikel eines Haushalts auflisten"""
    require_perm(request, 'haushalte.view')
    haushalt = get_object_or_404(Haushalt, id=haushalt_id)
    artikel = haushalt.artikel.all()
    return artikel


@haushalte_router.post("/{haushalt_id}/artikel", response=ArtikelSchema, auth=keycloak_auth)
def create_artikel(request, haushalt_id: int, payload: ArtikelCreateSchema):
    """Neuen Artikel zu einem Haushalt hinzufügen"""
    require_perm(request, 'haushalte.edit')
    haushalt = get_object_or_404(Haushalt, id=haushalt_id)

    # Neue Artikel landen ganz unten in der Sortier-Reihenfolge.
    max_sort = haushalt.artikel.aggregate(s=Max('sortierung'))['s'] or 0

    artikel = Artikel.objects.create(
        haushalt=haushalt,
        name=payload.name,
        beschreibung=payload.beschreibung or '',
        preis=payload.preis,
        anzahl=payload.anzahl,
        kategorie=payload.kategorie,
        link=payload.link or '',
        bild_url=payload.bild_url or '',
        status=payload.status or 'beantragt',
        sortierung=max_sort + 1,
    )
    return artikel


@haushalte_router.put("/{haushalt_id}/artikel/reorder", auth=keycloak_auth)
def reorder_artikel(request, haushalt_id: int, payload: ArtikelReorderSchema):
    """Setzt sortierung gemäß übergebener ID-Reihenfolge (für Drag&Drop / ↑↓)."""
    require_perm(request, 'haushalte.edit')
    haushalt = get_object_or_404(Haushalt, id=haushalt_id)
    for idx, aid in enumerate(payload.ids):
        Artikel.objects.filter(id=aid, haushalt=haushalt).update(sortierung=idx)
    return {"status": "ok", "count": len(payload.ids)}


class ArtikelBulkUpdateSchema(Schema):
    ids: List[int]
    status: Optional[str] = None
    kategorie: Optional[str] = None


@haushalte_router.put("/{haushalt_id}/artikel/bulk", auth=keycloak_auth)
def bulk_update_artikel(request, haushalt_id: int, payload: ArtikelBulkUpdateSchema):
    """Aktualisiert mehrere Artikel auf einmal (Status / Kategorie)."""
    require_perm(request, 'haushalte.edit')
    haushalt = get_object_or_404(Haushalt, id=haushalt_id)
    qs = Artikel.objects.filter(id__in=payload.ids, haushalt=haushalt)
    update_fields = {}
    if payload.status:
        update_fields['status'] = payload.status
    if payload.kategorie:
        update_fields['kategorie'] = payload.kategorie
    if not update_fields:
        return {"updated": 0}
    count = qs.update(**update_fields)
    audit_log(request, 'aktualisiert', 'haushalt_bulk', haushalt.id,
              f"{count} Artikel: {', '.join(f'{k}={v}' for k, v in update_fields.items())}")
    return {"updated": count}


@haushalte_router.get("/{haushalt_id}/artikel.csv", auth=keycloak_auth)
def export_artikel_csv(request, haushalt_id: int):
    """Exportiert alle Artikel eines Haushalts als CSV."""
    require_perm(request, 'haushalte.view')
    from django.http import HttpResponse
    import csv, io
    haushalt = get_object_or_404(Haushalt, id=haushalt_id)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=';')
    w.writerow(['Status', 'Kategorie', 'Name', 'Anzahl', 'Preis', 'Gesamt',
                'Link', 'Beschreibung', 'Erstellt', 'Gekauft'])
    for a in haushalt.artikel.all().order_by('sortierung', '-erstellt_am'):
        w.writerow([
            a.get_status_display(),
            a.get_kategorie_display(),
            a.name,
            a.anzahl,
            f'{a.preis:.2f}',
            f'{a.gesamtpreis:.2f}',
            a.link or '',
            (a.beschreibung or '').replace('\n', ' '),
            a.erstellt_am.strftime('%Y-%m-%d %H:%M') if a.erstellt_am else '',
            a.gekauft_am.strftime('%Y-%m-%d') if a.gekauft_am else '',
        ])
    resp = HttpResponse(buf.getvalue().encode('utf-8-sig'), content_type='text/csv; charset=utf-8')
    safe_name = ''.join(c for c in haushalt.name if c.isalnum() or c in '-_ ').strip()
    resp['Content-Disposition'] = f'attachment; filename="{safe_name}_artikel.csv"'
    return resp


@haushalte_router.get("/{haushalt_id}/status-summary", auth=keycloak_auth)
def haushalt_status_summary(request, haushalt_id: int):
    """Budget-Aufteilung pro Artikel-Status: zeigt wie viel beantragt,
    bestellt, geliefert etc. ist — pro Kategorie."""
    require_perm(request, 'haushalte.view')
    from django.db.models import Sum, F, DecimalField
    from django.db.models.functions import Coalesce
    haushalt = get_object_or_404(Haushalt, id=haushalt_id)
    out = {'konsumitiv': {}, 'investiv': {}}
    rows = (haushalt.artikel
            .values('kategorie', 'status')
            .annotate(summe=Coalesce(Sum(F('preis') * F('anzahl'),
                                          output_field=DecimalField(max_digits=12, decimal_places=2)), 0))
            .annotate(anzahl=Sum('anzahl')))
    for r in rows:
        out[r['kategorie']][r['status']] = {
            'summe': float(r['summe'] or 0),
            'anzahl': int(r['anzahl'] or 0),
        }
    return out


@haushalte_router.put("/{haushalt_id}/artikel/{artikel_id}", response=ArtikelSchema, auth=keycloak_auth)
def update_artikel(request, haushalt_id: int, artikel_id: int, payload: ArtikelUpdateSchema):
    """Artikel aktualisieren"""
    require_perm(request, 'haushalte.edit')
    haushalt = get_object_or_404(Haushalt, id=haushalt_id)
    artikel = get_object_or_404(Artikel, id=artikel_id, haushalt=haushalt)

    for attr, value in payload.dict(exclude_unset=True).items():
        setattr(artikel, attr, value)

    artikel.save()
    return artikel


@haushalte_router.delete("/{haushalt_id}/artikel/{artikel_id}", auth=keycloak_auth)
def delete_artikel(request, haushalt_id: int, artikel_id: int):
    """Artikel löschen"""
    require_perm(request, 'haushalte.delete')
    haushalt = get_object_or_404(Haushalt, id=haushalt_id)
    artikel = get_object_or_404(Artikel, id=artikel_id, haushalt=haushalt)
    artikel.delete()
    return {"success": True}


# ==================== Kategorien Endpoints ====================

kategorien_router = Router(tags=["Kategorien"])


@kategorien_router.get("/", response=List[KategorieSchema])
def list_kategorien(request):
    """Alle verfügbaren Kategorien auflisten (öffentlich)"""
    kategorien = Kategorie.objects.all()
    return kategorien


@kategorien_router.post("/", response=KategorieSchema, auth=keycloak_auth)
def create_kategorie(request, payload: KategorieCreateSchema):
    """Neue Kategorie erstellen"""
    require_perm(request, 'haushalte.edit')
    kategorie = Kategorie.objects.create(
        name=payload.name,
        beschreibung=payload.beschreibung,
        icon=payload.icon,
        farbe=payload.farbe,
    )
    return kategorie


# ==================== Link Parser Endpoint ====================

@haushalte_router.post("/parse-link/", response=LinkParseResponseSchema, auth=keycloak_auth)
def parse_product_link(request, payload: LinkParseRequestSchema):
    """
    Produkt-Link parsen und Daten extrahieren
    """
    require_perm(request, 'haushalte.edit')
    parser = LinkParserService()
    data = parser.parse_url(payload.url)
    return data
