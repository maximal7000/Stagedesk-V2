"""
Django Ninja API für Haushalts-Management
GLOBAL: Alle Benutzer teilen sich die gleichen Haushalte
"""
from typing import List
from ninja import Router
from ninja.errors import HttpError
from django.shortcuts import get_object_or_404
from django.http import HttpRequest

from core.auth import keycloak_auth
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
    return haushalt


@haushalte_router.delete("/{haushalt_id}", auth=keycloak_auth)
def delete_haushalt(request, haushalt_id: int):
    """Haushalt löschen"""
    require_perm(request, 'haushalte.delete')
    haushalt = get_object_or_404(Haushalt, id=haushalt_id)
    haushalt.delete()
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

    artikel = Artikel.objects.create(
        haushalt=haushalt,
        name=payload.name,
        beschreibung=payload.beschreibung or '',
        preis=payload.preis,
        anzahl=payload.anzahl,
        kategorie=payload.kategorie,
        link=payload.link or '',
        bild_url='',
    )
    return artikel


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
