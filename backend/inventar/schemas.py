"""
Pydantic Schemas für Inventar & Ausleihe API
"""
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
from ninja import Schema


# ========== Kategorie Schemas ==========

class KategorieSchema(Schema):
    id: int
    name: str
    farbe: str
    icon: str
    beschreibung: str
    parent_id: Optional[int]
    parent_name: Optional[str]
    sortierung: int
    anzahl_items: int

    @staticmethod
    def resolve_parent_name(obj):
        return obj.parent.name if obj.parent else None

    @staticmethod
    def resolve_anzahl_items(obj):
        return obj.items.filter(ist_aktiv=True).count()


class KategorieCreateSchema(Schema):
    name: str
    farbe: str = '#3B82F6'
    icon: str = 'package'
    beschreibung: str = ''
    parent_id: Optional[int] = None
    sortierung: int = 0


class KategorieUpdateSchema(Schema):
    name: Optional[str] = None
    farbe: Optional[str] = None
    icon: Optional[str] = None
    beschreibung: Optional[str] = None
    parent_id: Optional[int] = None
    sortierung: Optional[int] = None


# ========== Lagerort Schemas ==========

class LagerortSchema(Schema):
    id: int
    name: str
    beschreibung: str
    adresse: str
    ist_aktiv: bool
    anzahl_items: int

    @staticmethod
    def resolve_anzahl_items(obj):
        return obj.items.filter(ist_aktiv=True).count()


class LagerortCreateSchema(Schema):
    name: str
    beschreibung: str = ''
    adresse: str = ''


# ========== Item Schemas ==========

class ItemListSchema(Schema):
    """Kompakte Ansicht für Listen"""
    id: int
    name: str
    inventar_nr: str
    qr_code: str
    kategorie_id: Optional[int]
    kategorie_name: Optional[str]
    kategorie_farbe: Optional[str]
    status: str
    status_display: str
    zustand: str
    zustand_display: str
    lagerort_id: Optional[int]
    lagerort_name: Optional[str]
    lagerplatz: str
    menge: int
    einheit: str
    kaufpreis: Decimal
    bild_url: Optional[str]

    @staticmethod
    def resolve_kategorie_name(obj):
        return obj.kategorie.name if obj.kategorie else None

    @staticmethod
    def resolve_kategorie_farbe(obj):
        return obj.kategorie.farbe if obj.kategorie else '#6B7280'

    @staticmethod
    def resolve_status_display(obj):
        return obj.get_status_display()

    @staticmethod
    def resolve_zustand_display(obj):
        return obj.get_zustand_display()

    @staticmethod
    def resolve_lagerort_name(obj):
        return obj.lagerort.name if obj.lagerort else None

    @staticmethod
    def resolve_bild_url(obj):
        return obj.bilder[0] if obj.bilder else None


class ItemSchema(Schema):
    """Vollständige Item-Details"""
    id: int
    name: str
    beschreibung: str
    inventar_nr: str
    seriennummer: str
    qr_code: str
    barcode: str
    kategorie_id: Optional[int]
    kategorie_name: Optional[str]
    kategorie_farbe: Optional[str]
    status: str
    status_display: str
    zustand: str
    zustand_display: str
    zustand_notizen: str
    lagerort_id: Optional[int]
    lagerort_name: Optional[str]
    lagerplatz: str
    menge: int
    einheit: str
    mindestbestand: int
    kaufdatum: Optional[date]
    kaufpreis: Decimal
    lieferant: str
    garantie_bis: Optional[date]
    aktueller_wert: Decimal
    abschreibung_jahre: int
    bilder: List[str]
    technische_daten: dict
    letzte_wartung: Optional[date]
    naechste_wartung: Optional[date]
    wartungsintervall_tage: int
    braucht_wartung: bool
    notizen: str
    tags: List[str]
    ist_aktiv: bool
    ist_ausleihbar: bool
    erstellt_am: datetime
    aktualisiert_am: datetime

    @staticmethod
    def resolve_kategorie_name(obj):
        return obj.kategorie.name if obj.kategorie else None

    @staticmethod
    def resolve_kategorie_farbe(obj):
        return obj.kategorie.farbe if obj.kategorie else '#6B7280'

    @staticmethod
    def resolve_status_display(obj):
        return obj.get_status_display()

    @staticmethod
    def resolve_zustand_display(obj):
        return obj.get_zustand_display()

    @staticmethod
    def resolve_lagerort_name(obj):
        return obj.lagerort.name if obj.lagerort else None


class ItemCreateSchema(Schema):
    name: str
    beschreibung: str = ''
    kategorie_id: Optional[int] = None
    seriennummer: str = ''
    barcode: str = ''
    zustand: str = 'gut'
    zustand_notizen: str = ''
    lagerort_id: Optional[int] = None
    lagerplatz: str = ''
    menge: int = 1
    einheit: str = 'Stück'
    mindestbestand: int = 0
    kaufdatum: Optional[date] = None
    kaufpreis: Decimal = Decimal('0')
    lieferant: str = ''
    garantie_bis: Optional[date] = None
    aktueller_wert: Decimal = Decimal('0')
    abschreibung_jahre: int = 5
    bilder: List[str] = []
    technische_daten: dict = {}
    wartungsintervall_tage: int = 365
    notizen: str = ''
    tags: List[str] = []


class ItemUpdateSchema(Schema):
    name: Optional[str] = None
    beschreibung: Optional[str] = None
    kategorie_id: Optional[int] = None
    seriennummer: Optional[str] = None
    barcode: Optional[str] = None
    status: Optional[str] = None
    zustand: Optional[str] = None
    zustand_notizen: Optional[str] = None
    lagerort_id: Optional[int] = None
    lagerplatz: Optional[str] = None
    menge: Optional[int] = None
    einheit: Optional[str] = None
    mindestbestand: Optional[int] = None
    kaufdatum: Optional[date] = None
    kaufpreis: Optional[Decimal] = None
    lieferant: Optional[str] = None
    garantie_bis: Optional[date] = None
    aktueller_wert: Optional[Decimal] = None
    abschreibung_jahre: Optional[int] = None
    bilder: Optional[List[str]] = None
    technische_daten: Optional[dict] = None
    letzte_wartung: Optional[date] = None
    naechste_wartung: Optional[date] = None
    wartungsintervall_tage: Optional[int] = None
    notizen: Optional[str] = None
    tags: Optional[List[str]] = None
    ist_aktiv: Optional[bool] = None


# ========== Ausleihe Schemas ==========

class AusleihePositionSchema(Schema):
    id: int
    item_id: int
    item_name: str
    item_inventar_nr: str
    item_qr_code: str
    menge: int
    zustand_ausleihe: str
    zustand_rueckgabe: str
    unterschrift: str
    notizen: str
    ist_zurueckgegeben: bool
    rueckgabe_am: Optional[datetime]

    @staticmethod
    def resolve_item_name(obj):
        return obj.item.name

    @staticmethod
    def resolve_item_inventar_nr(obj):
        return obj.item.inventar_nr

    @staticmethod
    def resolve_item_qr_code(obj):
        return obj.item.qr_code


class AusleihePositionCreateSchema(Schema):
    item_id: int
    menge: int = 1
    zustand_ausleihe: str = ''
    notizen: str = ''
    unterschrift: str = ''  # Base64 für individuelle Unterschrift


class AusleiheSchema(Schema):
    id: int
    ausleiher_name: str
    ausleiher_email: str
    ausleiher_telefon: str
    ausleiher_organisation: str
    zweck: str
    event_id: Optional[int]
    event_titel: Optional[str]
    ausleihe_von: datetime
    ausleihe_bis: datetime
    tatsaechliche_rueckgabe: Optional[datetime]
    unterschrift_modus: str
    unterschrift_modus_display: str
    unterschrift_ausleihe: str
    unterschrift_rueckgabe: str
    status: str
    status_display: str
    notizen_ausleihe: str
    notizen_rueckgabe: str
    anzahl_items: int
    ist_ueberfaellig: bool
    positionen: List[AusleihePositionSchema]
    erstellt_von: str
    erstellt_am: datetime

    @staticmethod
    def resolve_event_titel(obj):
        return obj.event.titel if obj.event else None

    @staticmethod
    def resolve_status_display(obj):
        return obj.get_status_display()

    @staticmethod
    def resolve_unterschrift_modus_display(obj):
        return obj.get_unterschrift_modus_display()

    @staticmethod
    def resolve_positionen(obj):
        return obj.positionen.select_related('item').all()


class AusleiheListSchema(Schema):
    """Kompakte Ansicht für Listen"""
    id: int
    ausleiher_name: str
    ausleiher_organisation: str
    zweck: str
    ausleihe_von: datetime
    ausleihe_bis: datetime
    status: str
    status_display: str
    anzahl_items: int
    ist_ueberfaellig: bool
    erstellt_am: datetime

    @staticmethod
    def resolve_status_display(obj):
        return obj.get_status_display()


class AusleiheCreateSchema(Schema):
    ausleiher_name: str
    ausleiher_email: str = ''
    ausleiher_telefon: str = ''
    ausleiher_organisation: str = ''
    zweck: str = ''
    event_id: Optional[int] = None
    ausleihe_von: datetime
    ausleihe_bis: datetime
    unterschrift_modus: str = 'global'
    unterschrift_ausleihe: str = ''  # Base64 für globale Unterschrift
    notizen_ausleihe: str = ''
    positionen: List[AusleihePositionCreateSchema]


class AusleiheRueckgabeSchema(Schema):
    """Schema für Rückgabe"""
    unterschrift_rueckgabe: str = ''  # Base64 Signatur
    notizen_rueckgabe: str = ''
    positionen: List[dict] = []  # [{item_id, zustand_rueckgabe, notizen}]


# ========== Wartung Schemas ==========

class WartungSchema(Schema):
    id: int
    item_id: int
    item_name: str
    typ: str
    typ_display: str
    datum: date
    beschreibung: str
    kosten: Decimal
    dienstleister: str
    zustand_vorher: str
    zustand_nachher: str
    erstellt_von: str
    erstellt_am: datetime

    @staticmethod
    def resolve_item_name(obj):
        return obj.item.name

    @staticmethod
    def resolve_typ_display(obj):
        return obj.get_typ_display()


class WartungCreateSchema(Schema):
    item_id: int
    typ: str = 'inspektion'
    datum: date
    beschreibung: str
    kosten: Decimal = Decimal('0')
    dienstleister: str = ''
    zustand_vorher: str = ''
    zustand_nachher: str = ''


# ========== Filter Schemas ==========

class ItemFilterSchema(Schema):
    kategorie_id: Optional[int] = None
    lagerort_id: Optional[int] = None
    status: Optional[str] = None
    zustand: Optional[str] = None
    suche: Optional[str] = None  # Suche in Name, Inventarnummer, Seriennummer


class AusleiheFilterSchema(Schema):
    status: Optional[str] = None
    ausleiher: Optional[str] = None
    von: Optional[datetime] = None
    bis: Optional[datetime] = None
    item_id: Optional[int] = None
    nur_ueberfaellig: bool = False
