"""
Pydantic Schemas für Inventar & Ausleihe API v2
"""
from typing import Optional, List
from datetime import datetime, date
from ninja import Schema


# ========== Kategorie ==========

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


# ========== Standort ==========

class StandortSchema(Schema):
    id: int
    name: str
    beschreibung: str
    adresse: str
    ist_aktiv: bool
    anzahl_items: int

    @staticmethod
    def resolve_anzahl_items(obj):
        return obj.items.filter(ist_aktiv=True).count()


class StandortCreateSchema(Schema):
    name: str
    beschreibung: str = ''
    adresse: str = ''


# ========== Hersteller ==========

class HerstellerSchema(Schema):
    id: int
    name: str
    website: str
    notizen: str
    anzahl_items: int

    @staticmethod
    def resolve_anzahl_items(obj):
        return obj.items.filter(ist_aktiv=True).count()


class HerstellerCreateSchema(Schema):
    name: str
    website: str = ''
    notizen: str = ''


# ========== Ausleiher ==========

class AusleiherSchema(Schema):
    id: int
    name: str
    organisation: str
    email: str
    telefon: str
    adresse: str
    notizen: str
    ist_aktiv: bool


class AusleiherCreateSchema(Schema):
    name: str
    organisation: str = ''
    email: str = ''
    telefon: str = ''
    adresse: str = ''
    notizen: str = ''


class AusleiherUpdateSchema(Schema):
    name: Optional[str] = None
    organisation: Optional[str] = None
    email: Optional[str] = None
    telefon: Optional[str] = None
    adresse: Optional[str] = None
    notizen: Optional[str] = None
    ist_aktiv: Optional[bool] = None


# ========== QR-Code ==========

class QRCodeSchema(Schema):
    id: int
    code: str
    bezeichnung: str
    ist_primaer: bool


class QRCodeCreateSchema(Schema):
    code: str
    bezeichnung: str = ''
    ist_primaer: bool = False


# ========== Item ==========

class ItemBildSchema(Schema):
    id: int
    bild_url: str
    ist_haupt: bool
    erstellt_am: datetime

    @staticmethod
    def resolve_bild_url(obj):
        return obj.bild.url if obj.bild else ''


class ItemListSchema(Schema):
    """Kompakte Liste"""
    id: int
    name: str
    beschreibung: str
    kategorie_id: Optional[int]
    kategorie_name: Optional[str]
    kategorie_farbe: Optional[str]
    standort_id: Optional[int]
    standort_name: Optional[str]
    hersteller_id: Optional[int]
    hersteller_name: Optional[str]
    status: str
    status_display: str
    seriennummer: str
    haupt_qr_code: Optional[str]
    bild_url: Optional[str]
    menge_gesamt: int
    menge_verfuegbar: int

    @staticmethod
    def resolve_kategorie_name(obj):
        return obj.kategorie.name if obj.kategorie else None

    @staticmethod
    def resolve_kategorie_farbe(obj):
        return obj.kategorie.farbe if obj.kategorie else '#6B7280'

    @staticmethod
    def resolve_standort_name(obj):
        return obj.standort.name if obj.standort else None

    @staticmethod
    def resolve_hersteller_name(obj):
        return obj.hersteller.name if obj.hersteller else None

    @staticmethod
    def resolve_status_display(obj):
        return obj.get_status_display()

    @staticmethod
    def resolve_bild_url(obj):
        return obj.bilder[0] if obj.bilder else None


class ItemSchema(Schema):
    """Vollständig"""
    id: int
    name: str
    beschreibung: str
    kategorie_id: Optional[int]
    kategorie_name: Optional[str]
    kategorie_farbe: Optional[str]
    standort_id: Optional[int]
    standort_name: Optional[str]
    hersteller_id: Optional[int]
    hersteller_name: Optional[str]
    seriennummer: str
    status: str
    status_display: str
    bilder: List[str]
    notizen: str
    ist_aktiv: bool
    ist_verfuegbar: bool
    menge_gesamt: int
    menge_verfuegbar: int
    qr_codes: List[QRCodeSchema]
    item_bilder: List[ItemBildSchema]
    haupt_qr_code: Optional[str]
    erstellt_am: datetime

    @staticmethod
    def resolve_kategorie_name(obj):
        return obj.kategorie.name if obj.kategorie else None

    @staticmethod
    def resolve_kategorie_farbe(obj):
        return obj.kategorie.farbe if obj.kategorie else '#6B7280'

    @staticmethod
    def resolve_standort_name(obj):
        return obj.standort.name if obj.standort else None

    @staticmethod
    def resolve_hersteller_name(obj):
        return obj.hersteller.name if obj.hersteller else None

    @staticmethod
    def resolve_status_display(obj):
        return obj.get_status_display()

    @staticmethod
    def resolve_qr_codes(obj):
        return obj.qr_codes.all()

    @staticmethod
    def resolve_item_bilder(obj):
        return obj.item_bilder.all()


class ItemCreateSchema(Schema):
    name: str
    beschreibung: str = ''
    kategorie_id: Optional[int] = None
    standort_id: Optional[int] = None
    hersteller_id: Optional[int] = None
    seriennummer: str = ''
    bilder: List[str] = []
    notizen: str = ''
    menge_gesamt: int = 1
    qr_codes: List[QRCodeCreateSchema] = []


class ItemUpdateSchema(Schema):
    name: Optional[str] = None
    beschreibung: Optional[str] = None
    kategorie_id: Optional[int] = None
    standort_id: Optional[int] = None
    hersteller_id: Optional[int] = None
    seriennummer: Optional[str] = None
    status: Optional[str] = None
    bilder: Optional[List[str]] = None
    notizen: Optional[str] = None
    ist_aktiv: Optional[bool] = None
    menge_gesamt: Optional[int] = None


# ========== Item-Sets ==========

class ItemSetPositionSchema(Schema):
    id: int
    item_id: int
    item_name: str
    item_status: str
    anzahl: int
    notizen: str

    @staticmethod
    def resolve_item_name(obj):
        return obj.item.name

    @staticmethod
    def resolve_item_status(obj):
        return obj.item.status


class ItemSetSchema(Schema):
    id: int
    name: str
    beschreibung: str
    farbe: str
    ist_aktiv: bool
    anzahl_items: int
    positionen: List[ItemSetPositionSchema]

    @staticmethod
    def resolve_positionen(obj):
        return obj.positionen.select_related('item').all()


class ItemSetCreateSchema(Schema):
    name: str
    beschreibung: str = ''
    farbe: str = '#8B5CF6'
    positionen: List[dict] = []  # [{item_id, anzahl, notizen}]


class ItemSetUpdateSchema(Schema):
    name: Optional[str] = None
    beschreibung: Optional[str] = None
    farbe: Optional[str] = None
    ist_aktiv: Optional[bool] = None
    positionen: Optional[List[dict]] = None


# ========== Ausleihliste ==========

class AusleihePositionSchema(Schema):
    id: int
    item_id: int
    item_name: str
    item_qr_code: Optional[str]
    anzahl: int
    ausleiher_name: str
    ausleiher_ort: str
    unterschrift: str
    zustand_ausleihe: str
    zustand_rueckgabe: str
    foto_ausleihe: str
    foto_rueckgabe: str
    ist_zurueckgegeben: bool
    rueckgabe_am: Optional[datetime]
    rueckgabe_notizen: str

    @staticmethod
    def resolve_item_name(obj):
        return obj.item.name

    @staticmethod
    def resolve_item_qr_code(obj):
        return obj.item.haupt_qr_code


class AusleiheListeSchema(Schema):
    id: int
    titel: str
    ausleiher_id: Optional[int]
    ausleiher_name: str
    ausleiher_organisation: str
    ausleiher_ort: str
    ausleiher_email: Optional[str]
    zweck: str
    frist: Optional[date]
    modus: str
    modus_display: str
    status: str
    status_display: str
    unterschrift_ausleihe: str
    unterschrift_rueckgabe: str
    notizen: str
    notizen_rueckgabe: str
    rueckgabe_am: Optional[datetime]
    rueckgabe_zustand: str
    anzahl_items: int
    ist_ueberfaellig: bool
    letzte_mahnung_am: Optional[datetime]
    veranstaltung_id: Optional[int]
    positionen: List[AusleihePositionSchema]
    erstellt_am: datetime

    @staticmethod
    def resolve_modus_display(obj):
        return obj.get_modus_display()

    @staticmethod
    def resolve_status_display(obj):
        return obj.get_status_display()

    @staticmethod
    def resolve_ausleiher_email(obj):
        return obj.ausleiher.email if obj.ausleiher else None

    @staticmethod
    def resolve_positionen(obj):
        return obj.positionen.select_related('item').all()


class AusleiheListeListSchema(Schema):
    """Kompakt für Listen"""
    id: int
    titel: str
    ausleiher_name: str
    ausleiher_organisation: str
    ausleiher_ort: str
    zweck: str
    frist: Optional[date]
    modus: str
    status: str
    status_display: str
    anzahl_items: int
    ist_ueberfaellig: bool
    erstellt_am: datetime
    veranstaltung_id: Optional[int]

    @staticmethod
    def resolve_status_display(obj):
        return obj.get_status_display()


class AusleihePositionCreateSchema(Schema):
    item_id: int
    anzahl: int = 1
    ausleiher_name: str = ''
    ausleiher_ort: str = ''
    unterschrift: str = ''
    zustand_ausleihe: str = 'ok'
    foto_ausleihe: str = ''


class AusleiheListeCreateSchema(Schema):
    titel: str = ''
    ausleiher_id: Optional[int] = None
    ausleiher_name: str = ''
    ausleiher_ort: str = ''
    zweck: str = ''
    frist: Optional[date] = None
    modus: str = 'global'
    unterschrift_ausleihe: str = ''
    notizen: str = ''
    veranstaltung_id: Optional[int] = None
    positionen: List[AusleihePositionCreateSchema] = []  # leer = Liste "offen", Items später hinzufügen


class RueckgabeSchema(Schema):
    unterschrift_rueckgabe: str = ''
    notizen_rueckgabe: str = ''
    rueckgabe_zustand: str = 'ok'
    positionen: List[dict] = []  # [{item_id, zustand_rueckgabe, foto_rueckgabe, rueckgabe_notizen}]


class SchnellRueckgabeSchema(Schema):
    """Für Schnell-Rückgabe per QR"""
    qr_code: str
    zustand: str = 'ok'
    notizen: str = ''


class AktivierenSchema(Schema):
    """Zum Aktivieren einer offenen Ausleihliste"""
    unterschrift_ausleihe: str = ''
    positionen_unterschriften: List[dict] = []  # [{item_id, unterschrift}] für modus individuell


# ========== Reservierung ==========

class ReservierungSchema(Schema):
    id: int
    item_id: int
    item_name: str
    ausleiher_id: Optional[int]
    ausleiher_name: str
    datum_von: date
    datum_bis: date
    zweck: str
    status: str
    status_display: str
    notizen: str
    erstellt_am: datetime

    @staticmethod
    def resolve_item_name(obj):
        return obj.item.name

    @staticmethod
    def resolve_status_display(obj):
        return obj.get_status_display()


class ReservierungCreateSchema(Schema):
    item_id: int
    ausleiher_id: Optional[int] = None
    ausleiher_name: str = ''
    datum_von: date
    datum_bis: date
    zweck: str = ''
    notizen: str = ''


# ========== Gespeicherte Filter ==========

class GespeicherterFilterSchema(Schema):
    id: int
    name: str
    filter_json: dict


class GespeicherterFilterCreateSchema(Schema):
    name: str
    filter_json: dict


# ========== Filter ==========

class ItemFilterSchema(Schema):
    kategorie_id: Optional[int] = None
    standort_id: Optional[int] = None
    hersteller_id: Optional[int] = None
    status: Optional[str] = None
    suche: Optional[str] = None


class AusleiheFilterSchema(Schema):
    status: Optional[str] = None
    ausleiher: Optional[str] = None
    nur_ueberfaellig: bool = False


# ========== Audit-Log ==========

class AuditLogSchema(Schema):
    id: int
    aktion: str
    aktion_display: str
    entity_type: str
    entity_id: int
    entity_name: str
    details: dict
    user_username: str
    timestamp: datetime

    @staticmethod
    def resolve_aktion_display(obj):
        return obj.get_aktion_display()


# ========== Zustandslog ==========

class ZustandsLogSchema(Schema):
    id: int
    zustand_vorher: str
    zustand_nachher: str
    typ: str
    typ_display: str
    ausleihliste_id: Optional[int]
    notizen: str
    user_username: str
    erstellt_am: datetime

    @staticmethod
    def resolve_typ_display(obj):
        return obj.get_typ_display()


# ========== Mahnungs-Templates ==========

class MahnungsTemplateSchema(Schema):
    id: int
    name: str
    betreff: str
    text: str
    ist_standard: bool

class MahnungsTemplateCreateSchema(Schema):
    name: str
    betreff: str = 'Mahnung: Rückgabe überfällig - Ausleihe #{ausleihe_id}'
    text: str = ''
    ist_standard: bool = False
