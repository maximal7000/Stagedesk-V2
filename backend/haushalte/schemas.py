"""
Pydantic Schemas für Django Ninja API
"""
from ninja import Schema
from datetime import datetime, date
from typing import Optional
from decimal import Decimal


# Haushalt Schemas
class HaushaltCreateSchema(Schema):
    """Schema für das Erstellen eines Haushalts"""
    name: str
    beschreibung: Optional[str] = ""
    budget_konsumitiv: Decimal
    budget_investiv: Decimal


class HaushaltUpdateSchema(Schema):
    """Schema für das Aktualisieren eines Haushalts"""
    name: Optional[str] = None
    beschreibung: Optional[str] = None
    budget_konsumitiv: Optional[Decimal] = None
    budget_investiv: Optional[Decimal] = None


class HaushaltSchema(Schema):
    """Schema für Haushalt-Response"""
    id: int
    name: str
    beschreibung: str
    budget_konsumitiv: Decimal
    budget_investiv: Decimal
    gesamt_budget: Decimal
    benutzer_id: str
    gesamt_konsumitiv: Decimal
    gesamt_investiv: Decimal
    gesamt_ausgaben: Decimal
    verbleibendes_budget_konsumitiv: Decimal
    verbleibendes_budget_investiv: Decimal
    verbleibendes_budget: Decimal
    erstellt_am: datetime
    aktualisiert_am: datetime


# Kategorie Schemas
class KategorieSchema(Schema):
    """Schema für Kategorie"""
    id: int
    name: str
    beschreibung: str
    icon: str
    farbe: str


class KategorieCreateSchema(Schema):
    """Schema für das Erstellen einer Kategorie"""
    name: str
    beschreibung: Optional[str] = ""
    icon: Optional[str] = "📦"
    farbe: Optional[str] = "#3B82F6"


# Artikel Schemas
class ArtikelCreateSchema(Schema):
    """Schema für das Erstellen eines Artikels"""
    # haushalt_id kommt aus der URL, nicht aus dem Body
    name: str
    beschreibung: Optional[str] = ""
    preis: Decimal
    anzahl: int = 1
    kategorie: str  # konsumitiv oder investiv - vom Benutzer gewählt
    link: Optional[str] = ""


class ArtikelUpdateSchema(Schema):
    """Schema für das Aktualisieren eines Artikels"""
    name: Optional[str] = None
    beschreibung: Optional[str] = None
    preis: Optional[Decimal] = None
    anzahl: Optional[int] = None
    link: Optional[str] = None
    bild_url: Optional[str] = None
    tag_kategorie_id: Optional[int] = None
    gekauft_am: Optional[date] = None


class ArtikelSchema(Schema):
    """Schema für Artikel-Response"""
    id: int
    haushalt_id: int
    name: str
    beschreibung: str
    preis: Decimal
    anzahl: int
    kategorie: str
    gesamtpreis: Decimal
    link: str
    bild_url: str
    tag_kategorie: Optional[KategorieSchema] = None
    gekauft_am: Optional[date] = None
    erstellt_am: datetime
    aktualisiert_am: datetime


# Link Parser Schema
class LinkParseRequestSchema(Schema):
    """Schema für Link-Parse-Request"""
    url: str


class LinkParseResponseSchema(Schema):
    """Schema für Link-Parse-Response"""
    name: Optional[str] = None
    preis: Optional[Decimal] = None
    beschreibung: Optional[str] = None
    bild_url: Optional[str] = None
