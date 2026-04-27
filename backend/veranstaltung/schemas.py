"""
Pydantic-Schemas für Veranstaltungsplaner API
"""
from typing import Optional, List
from datetime import datetime, date
from ninja import Schema


class VeranstaltungTerminSchema(Schema):
    id: int
    titel: str
    datum: date
    beginn: Optional[str]
    ende: Optional[str]

    @staticmethod
    def resolve_beginn(obj):
        return obj.beginn.strftime('%H:%M') if obj.beginn else None

    @staticmethod
    def resolve_ende(obj):
        return obj.ende.strftime('%H:%M') if obj.ende else None


def _profile_name(keycloak_id: str) -> tuple:
    """Liefert (first_name, last_name) für eine keycloak_id, leer wenn nicht gefunden."""
    if not keycloak_id:
        return ('', '')
    from users.models import UserProfile
    p = UserProfile.objects.filter(keycloak_id=keycloak_id).only('first_name', 'last_name').first()
    if p:
        return (p.first_name or '', p.last_name or '')
    return ('', '')


class ZuweisungSchema(Schema):
    id: int
    user_keycloak_id: str
    user_username: str
    user_first_name: str = ''
    user_last_name: str = ''
    user_email: str
    taetigkeit_id: Optional[int]
    taetigkeit_name: str
    zugewiesen_am: datetime

    @staticmethod
    def resolve_user_first_name(obj):
        return _profile_name(obj.user_keycloak_id)[0]

    @staticmethod
    def resolve_user_last_name(obj):
        return _profile_name(obj.user_keycloak_id)[1]

    @staticmethod
    def resolve_taetigkeit_id(obj):
        return obj.taetigkeit_id

    @staticmethod
    def resolve_taetigkeit_name(obj):
        return obj.taetigkeit.name if obj.taetigkeit else ''


class ChecklisteItemSchema(Schema):
    id: int
    titel: str
    erledigt: bool
    sortierung: int
    erledigt_am: Optional[datetime]
    deadline: Optional[datetime] = None


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


class MeldungSchema(Schema):
    id: int
    user_keycloak_id: str
    user_username: str
    user_first_name: str = ''
    user_last_name: str = ''
    kommentar: str
    erstellt_am: datetime

    @staticmethod
    def resolve_user_first_name(obj):
        return _profile_name(obj.user_keycloak_id)[0]

    @staticmethod
    def resolve_user_last_name(obj):
        return _profile_name(obj.user_keycloak_id)[1]


class MeldungSetSchema(Schema):
    kommentar: str = ''


class AbmeldungSchema(Schema):
    grund: str = ''


class AbmeldungLogSchema(Schema):
    id: int
    user_keycloak_id: str
    user_username: str
    user_first_name: str = ''
    user_last_name: str = ''
    grund: str
    erstellt_am: datetime

    @staticmethod
    def resolve_user_first_name(obj):
        return _profile_name(obj.user_keycloak_id)[0]

    @staticmethod
    def resolve_user_last_name(obj):
        return _profile_name(obj.user_keycloak_id)[1]


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
    effektiv_status: str
    effektiv_status_display: str
    zammad_ticket_id: Optional[int]
    zammad_ticket_number: str
    wiederholung: str
    wiederholung_ende: Optional[date]
    ausleihliste_id: Optional[int]
    anwesenheitsliste_id: Optional[int]
    anwesenheitsliste_titel: Optional[str]
    discord_event_id: str
    discord_channel_id: str
    erstellt_von: str
    erstellt_am: datetime
    aktualisiert_am: datetime
    termine: List[VeranstaltungTerminSchema]
    zuweisungen: List[ZuweisungSchema]
    meldungen: List[MeldungSchema]
    abmeldungen: List[AbmeldungLogSchema]
    checkliste: List[ChecklisteItemSchema]
    notizen: List[NotizSchema]
    anhaenge: List[AnhangSchema]
    erinnerungen: List[ErinnerungSchema]
    meldung_aktiv: bool = True
    ausgeblendete_user: list = []
    ist_zugewiesen: bool = False
    ist_gemeldet: bool = False
    erforderliche_kompetenzen_ids: List[int] = []
    empfohlene_kompetenzen_ids: List[int] = []

    @staticmethod
    def resolve_erforderliche_kompetenzen_ids(obj):
        return list(obj.erforderliche_kompetenzen.values_list('id', flat=True))

    @staticmethod
    def resolve_empfohlene_kompetenzen_ids(obj):
        return list(obj.empfohlene_kompetenzen.values_list('id', flat=True))

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
    def resolve_termine(obj):
        return obj.termine.all()

    @staticmethod
    def resolve_zuweisungen(obj):
        return obj.zuweisungen.select_related('taetigkeit').all()

    @staticmethod
    def resolve_meldungen(obj):
        return obj.meldungen.all()

    @staticmethod
    def resolve_abmeldungen(obj):
        return obj.abmeldungen.all()

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

    @staticmethod
    def resolve_anwesenheitsliste_id(obj):
        return obj.anwesenheitsliste_id if obj.anwesenheitsliste_id else None

    @staticmethod
    def resolve_anwesenheitsliste_titel(obj):
        return obj.anwesenheitsliste.titel if obj.anwesenheitsliste_id and obj.anwesenheitsliste else None


class VeranstaltungListSchema(Schema):
    id: int
    titel: str
    datum_von: datetime
    datum_bis: datetime
    ort: str
    status: str
    status_display: str
    effektiv_status: str
    effektiv_status_display: str
    zammad_ticket_number: str
    anzahl_zuweisungen: int
    anzahl_termine: int
    meldung_aktiv: bool = True
    ist_zugewiesen: bool = False
    ist_gemeldet: bool = False

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
    def resolve_anzahl_zuweisungen(obj):
        return obj.zuweisungen.count()

    @staticmethod
    def resolve_anzahl_termine(obj):
        return obj.termine.count()


class VeranstaltungCreateSchema(Schema):
    titel: str
    beschreibung: str = ''
    datum_von: Optional[str] = None  # ISO-String z.B. "2025-01-15T14:00"
    datum_bis: Optional[str] = None
    ort: str = ''
    adresse: str = ''
    status: str = 'geplant'
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
    erforderliche_kompetenzen_ids: Optional[List[int]] = None
    empfohlene_kompetenzen_ids: Optional[List[int]] = None


class ZuweisungCreateSchema(Schema):
    user_keycloak_id: str
    user_username: str = ''
    user_email: str = ''
    taetigkeit_id: Optional[int] = None


class ChecklisteItemCreateSchema(Schema):
    titel: str
    sortierung: int = 0
    deadline: Optional[datetime] = None


class ChecklisteItemUpdateSchema(Schema):
    titel: Optional[str] = None
    erledigt: Optional[bool] = None
    sortierung: Optional[int] = None
    deadline: Optional[datetime] = None


class NotizCreateSchema(Schema):
    text: str


class ErinnerungCreateSchema(Schema):
    zeit_vorher: int = 1
    einheit: str = 'tage'


class VeranstaltungTerminCreateSchema(Schema):
    id: Optional[int] = None
    titel: str = ''
    datum: date
    beginn: Optional[str] = None
    ende: Optional[str] = None


class VeranstaltungTermineSaveSchema(Schema):
    termine: List[VeranstaltungTerminCreateSchema]


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


# ─── Templates ─────────────────────────────────────────────────────

class TemplateErinnerungEntry(Schema):
    zeit_vorher: int = 1
    einheit: str = 'tage'


class TemplateSchema(Schema):
    id: int
    name: str
    beschreibung: str
    titel_vorlage: str
    beschreibung_vorlage: str
    ort_vorlage: str
    dauer_minuten: int
    taetigkeit_ids: List[int] = []
    taetigkeit_namen: List[str] = []
    erinnerungen: List[TemplateErinnerungEntry] = []
    erforderliche_kompetenzen_ids: List[int] = []
    erstellt_am: datetime

    @staticmethod
    def resolve_taetigkeit_ids(obj):
        return list(obj.taetigkeiten.values_list('id', flat=True))

    @staticmethod
    def resolve_taetigkeit_namen(obj):
        return list(obj.taetigkeiten.values_list('name', flat=True))

    @staticmethod
    def resolve_erforderliche_kompetenzen_ids(obj):
        return list(obj.erforderliche_kompetenzen.values_list('id', flat=True))


class TemplateCreateSchema(Schema):
    name: str
    beschreibung: str = ''
    titel_vorlage: str = ''
    beschreibung_vorlage: str = ''
    ort_vorlage: str = ''
    dauer_minuten: int = 120
    taetigkeit_ids: List[int] = []
    erinnerungen: List[TemplateErinnerungEntry] = []
    erforderliche_kompetenzen_ids: List[int] = []


class TemplateUpdateSchema(Schema):
    name: Optional[str] = None
    beschreibung: Optional[str] = None
    titel_vorlage: Optional[str] = None
    beschreibung_vorlage: Optional[str] = None
    ort_vorlage: Optional[str] = None
    dauer_minuten: Optional[int] = None
    taetigkeit_ids: Optional[List[int]] = None
    erinnerungen: Optional[List[TemplateErinnerungEntry]] = None
    erforderliche_kompetenzen_ids: Optional[List[int]] = None


class CreateFromTemplateSchema(Schema):
    template_id: int
    datum_von: datetime  # User wählt Start; Ende = Start + dauer_minuten
