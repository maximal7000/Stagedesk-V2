"""
Pydantic-Schemas für Veranstaltungsplaner API
"""
from typing import Optional, List
from datetime import datetime, date
from ninja import Schema


class ZuweisungSchema(Schema):
    id: int
    user_keycloak_id: str
    user_username: str
    user_email: str
    rolle: str
    rolle_display: str
    zugewiesen_am: datetime

    @staticmethod
    def resolve_rolle_display(obj):
        return obj.get_rolle_display()


class ChecklisteItemSchema(Schema):
    id: int
    titel: str
    erledigt: bool
    sortierung: int
    erledigt_am: Optional[datetime]


class NotizSchema(Schema):
    id: int
    text: str
    created_by_username: str
    created_at: datetime


class AnhangSchema(Schema):
    id: int
    name: str
    url: str
    datei_url: Optional[str]
    created_at: datetime

    @staticmethod
    def resolve_datei_url(obj):
        if obj.datei:
            return obj.datei.url
        return None


class ErinnerungSchema(Schema):
    id: int
    zeit_vorher: int
    einheit: str
    einheit_display: str
    gesendet: bool

    @staticmethod
    def resolve_einheit_display(obj):
        return obj.get_einheit_display()


class VeranstaltungSchema(Schema):
    id: int
    titel: str
    beschreibung: str
    datum_von: datetime
    datum_bis: datetime
    ort: str
    adresse: str
    status: str
    status_display: str
    zammad_ticket_id: Optional[int]
    zammad_ticket_number: str
    wiederholung: str
    wiederholung_ende: Optional[date]
    ausleihliste_id: Optional[int]
    erstellt_von: str
    erstellt_am: datetime
    aktualisiert_am: datetime
    zuweisungen: List[ZuweisungSchema]
    checkliste: List[ChecklisteItemSchema]
    notizen: List[NotizSchema]
    anhaenge: List[AnhangSchema]
    erinnerungen: List[ErinnerungSchema]
    ist_zugewiesen: bool = False

    @staticmethod
    def resolve_status_display(obj):
        return obj.get_status_display()

    @staticmethod
    def resolve_zuweisungen(obj):
        return obj.zuweisungen.all()

    @staticmethod
    def resolve_checkliste(obj):
        return obj.checkliste.all()

    @staticmethod
    def resolve_notizen(obj):
        return obj.notizen.all()

    @staticmethod
    def resolve_anhaenge(obj):
        return obj.anhaenge.all()

    @staticmethod
    def resolve_erinnerungen(obj):
        return obj.erinnerungen.all()

    @staticmethod
    def resolve_ausleihliste_id(obj):
        return obj.ausleihliste_id if obj.ausleihliste_id else None


class VeranstaltungListSchema(Schema):
    id: int
    titel: str
    datum_von: datetime
    datum_bis: datetime
    ort: str
    status: str
    status_display: str
    zammad_ticket_number: str
    anzahl_zuweisungen: int
    ist_zugewiesen: bool = False

    @staticmethod
    def resolve_status_display(obj):
        return obj.get_status_display()

    @staticmethod
    def resolve_anzahl_zuweisungen(obj):
        return obj.zuweisungen.count()


class VeranstaltungCreateSchema(Schema):
    titel: str
    beschreibung: str = ''
    datum_von: Optional[str] = None  # ISO-String z.B. "2025-01-15T14:00"
    datum_bis: Optional[str] = None
    ort: str = ''
    adresse: str = ''
    status: str = 'planung'
    zammad_ticket_id: Optional[int] = None
    zammad_ticket_number: str = ''
    wiederholung: str = 'keine'
    wiederholung_ende: Optional[date] = None
    ausleihliste_id: Optional[int] = None


class CreateVeranstaltungResponseSchema(Schema):
    """Einfache Response nach Erstellen – garantiert id für Redirect."""
    id: int
    titel: str


class VeranstaltungUpdateSchema(Schema):
    titel: Optional[str] = None
    beschreibung: Optional[str] = None
    datum_von: Optional[datetime] = None
    datum_bis: Optional[datetime] = None
    ort: Optional[str] = None
    adresse: Optional[str] = None
    status: Optional[str] = None
    wiederholung: Optional[str] = None
    wiederholung_ende: Optional[date] = None
    ausleihliste_id: Optional[int] = None


class ZuweisungCreateSchema(Schema):
    user_keycloak_id: str
    user_username: str = ''
    user_email: str = ''
    rolle: str = 'team'


class ChecklisteItemCreateSchema(Schema):
    titel: str
    sortierung: int = 0


class ChecklisteItemUpdateSchema(Schema):
    titel: Optional[str] = None
    erledigt: Optional[bool] = None
    sortierung: Optional[int] = None


class NotizCreateSchema(Schema):
    text: str


class ErinnerungCreateSchema(Schema):
    zeit_vorher: int = 1
    einheit: str = 'tage'


class VeranstaltungFilterSchema(Schema):
    status: Optional[str] = None
    nur_meine: bool = False
    datum_von: Optional[date] = None
    datum_bis: Optional[date] = None
    suche: Optional[str] = None


# Zammad
class ZammadTicketSchema(Schema):
    id: int
    number: Optional[str] = None
    title: Optional[str] = None
    state_id: Optional[int] = None
    group_id: Optional[int] = None
    owner_id: Optional[int] = None
    customer_id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
