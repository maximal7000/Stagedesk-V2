"""
Pydantic Schemas für Kalender API
"""
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
from ninja import Schema


# ========== Kategorie Schemas ==========

class EventKategorieSchema(Schema):
    id: int
    name: str
    farbe: str
    icon: str
    beschreibung: str
    ist_aktiv: bool
    sortierung: int


class EventKategorieCreateSchema(Schema):
    name: str
    farbe: str = '#3B82F6'
    icon: str = ''
    beschreibung: str = ''
    sortierung: int = 0


class EventKategorieUpdateSchema(Schema):
    name: Optional[str] = None
    farbe: Optional[str] = None
    icon: Optional[str] = None
    beschreibung: Optional[str] = None
    ist_aktiv: Optional[bool] = None
    sortierung: Optional[int] = None


# ========== Ressource Schemas ==========

class RessourceSchema(Schema):
    id: int
    name: str
    typ: str
    typ_display: str
    beschreibung: str
    farbe: str
    ist_verfuegbar: bool
    max_gleichzeitig: int
    kosten_pro_tag: Decimal
    kosten_pro_stunde: Decimal
    notizen: str

    @staticmethod
    def resolve_typ_display(obj):
        return obj.get_typ_display()


class RessourceCreateSchema(Schema):
    name: str
    typ: str = 'equipment'
    beschreibung: str = ''
    farbe: str = '#6B7280'
    ist_verfuegbar: bool = True
    max_gleichzeitig: int = 1
    kosten_pro_tag: Decimal = Decimal('0')
    kosten_pro_stunde: Decimal = Decimal('0')
    notizen: str = ''


class RessourceUpdateSchema(Schema):
    name: Optional[str] = None
    typ: Optional[str] = None
    beschreibung: Optional[str] = None
    farbe: Optional[str] = None
    ist_verfuegbar: Optional[bool] = None
    max_gleichzeitig: Optional[int] = None
    kosten_pro_tag: Optional[Decimal] = None
    kosten_pro_stunde: Optional[Decimal] = None
    notizen: Optional[str] = None


# ========== Event-Ressource Schemas ==========

class EventRessourceSchema(Schema):
    id: int
    ressource_id: int
    ressource_name: str
    ressource_typ: str
    ressource_farbe: str
    anzahl: int
    von: datetime
    bis: datetime
    kosten: Decimal
    notizen: str

    @staticmethod
    def resolve_ressource_name(obj):
        return obj.ressource.name

    @staticmethod
    def resolve_ressource_typ(obj):
        return obj.ressource.typ

    @staticmethod
    def resolve_ressource_farbe(obj):
        return obj.ressource.farbe


class EventRessourceCreateSchema(Schema):
    ressource_id: int
    anzahl: int = 1
    von: Optional[datetime] = None  # Falls leer: Event-Start
    bis: Optional[datetime] = None  # Falls leer: Event-Ende
    kosten: Optional[Decimal] = None
    kosten_berechnet: bool = True
    notizen: str = ''


# ========== Event Schemas ==========

class EventSchema(Schema):
    id: int
    titel: str
    beschreibung: str
    kategorie_id: Optional[int]
    kategorie_name: Optional[str]
    kategorie_farbe: Optional[str]
    start: datetime
    ende: datetime
    ganztaegig: bool
    ort: str
    adresse: str
    status: str
    status_display: str
    effektiv_status: str
    effektiv_status_display: str
    wiederholung: str
    wiederholung_display: str
    wiederholung_ende: Optional[date]
    parent_event_id: Optional[int]
    haushalt_id: Optional[int]
    haushalt_name: Optional[str]
    geschaetztes_budget: Decimal
    verantwortlicher: str
    teilnehmer_anzahl: int
    notizen: str
    dauer_stunden: float
    ressourcen_kosten: Decimal
    ressourcen: List[EventRessourceSchema]
    erstellt_von: str
    erstellt_am: datetime

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
    def resolve_effektiv_status(obj):
        return obj.effektiv_status

    @staticmethod
    def resolve_effektiv_status_display(obj):
        return obj.effektiv_status_display

    @staticmethod
    def resolve_wiederholung_display(obj):
        return obj.get_wiederholung_display()

    @staticmethod
    def resolve_haushalt_name(obj):
        return obj.haushalt.name if obj.haushalt else None

    @staticmethod
    def resolve_ressourcen(obj):
        return obj.event_ressourcen.select_related('ressource').all()


class EventListSchema(Schema):
    """Kompakte Version für Kalender-Ansicht"""
    id: int
    titel: str
    start: datetime
    ende: datetime
    ganztaegig: bool
    kategorie_id: Optional[int]
    kategorie_farbe: Optional[str]
    status: str
    effektiv_status: str = 'geplant'
    ort: str

    @staticmethod
    def resolve_kategorie_farbe(obj):
        return obj.kategorie.farbe if obj.kategorie else '#6B7280'

    @staticmethod
    def resolve_effektiv_status(obj):
        return obj.effektiv_status


class EventCreateSchema(Schema):
    titel: str
    beschreibung: str = ''
    kategorie_id: Optional[int] = None
    start: datetime
    ende: datetime
    ganztaegig: bool = False
    ort: str = ''
    adresse: str = ''
    status: str = 'geplant'
    wiederholung: str = 'keine'
    wiederholung_ende: Optional[date] = None
    haushalt_id: Optional[int] = None
    geschaetztes_budget: Decimal = Decimal('0')
    verantwortlicher: str = ''
    teilnehmer_anzahl: int = 0
    notizen: str = ''
    ressourcen: List[EventRessourceCreateSchema] = []


class EventUpdateSchema(Schema):
    titel: Optional[str] = None
    beschreibung: Optional[str] = None
    kategorie_id: Optional[int] = None
    start: Optional[datetime] = None
    ende: Optional[datetime] = None
    ganztaegig: Optional[bool] = None
    ort: Optional[str] = None
    adresse: Optional[str] = None
    status: Optional[str] = None
    wiederholung: Optional[str] = None
    wiederholung_ende: Optional[date] = None
    haushalt_id: Optional[int] = None
    geschaetztes_budget: Optional[Decimal] = None
    verantwortlicher: Optional[str] = None
    teilnehmer_anzahl: Optional[int] = None
    notizen: Optional[str] = None


class EventMoveSchema(Schema):
    """Für Drag & Drop im Kalender"""
    start: datetime
    ende: datetime


# ========== Filter/Query Schemas ==========

class EventFilterSchema(Schema):
    start_ab: Optional[datetime] = None
    start_bis: Optional[datetime] = None
    kategorie_id: Optional[int] = None
    status: Optional[str] = None
    ressource_id: Optional[int] = None
    haushalt_id: Optional[int] = None


class RessourceVerfuegbarkeitSchema(Schema):
    """Prüft Verfügbarkeit einer Ressource"""
    ressource_id: int
    von: datetime
    bis: datetime
    ausgenommen_event_id: Optional[int] = None  # Event das ignoriert werden soll (für Updates)


class VerfuegbarkeitResultSchema(Schema):
    verfuegbar: bool
    grund: Optional[str] = None
    konflikte: List[dict] = []
