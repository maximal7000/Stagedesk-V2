"""Pydantic Schemas für Kompetenzen-API."""
from typing import List, Optional
from datetime import datetime
from ninja import Schema


class KategorieSchema(Schema):
    id: int
    name: str
    beschreibung: str = ""
    icon: str = ""
    farbe: str = ""
    sortierung: int = 0


class KategorieCreateSchema(Schema):
    name: str
    beschreibung: str = ""
    icon: str = ""
    farbe: str = ""
    sortierung: int = 0


class GruppeSchema(Schema):
    id: int
    kategorie_id: int
    name: str
    sortierung: int = 0


class GruppeCreateSchema(Schema):
    kategorie_id: int
    name: str
    sortierung: int = 0


class KompetenzSchema(Schema):
    id: int
    kategorie_id: int
    kategorie_name: str
    gruppe_id: Optional[int] = None
    gruppe_name: Optional[str] = None
    name: str
    beschreibung: str = ""
    punkte: int = 1
    ablauf_stufen: List[int] = []
    aktiv: bool = True
    sortierung: int = 0
    voraussetzung_ids: List[int] = []


class KompetenzCreateSchema(Schema):
    kategorie_id: int
    gruppe_id: Optional[int] = None
    name: str
    beschreibung: str = ""
    punkte: int = 1
    ablauf_stufen: List[int] = []
    sortierung: int = 0
    aktiv: bool = True
    voraussetzung_ids: List[int] = []


class KompetenzUpdateSchema(Schema):
    kategorie_id: Optional[int] = None
    gruppe_id: Optional[int] = None
    name: Optional[str] = None
    beschreibung: Optional[str] = None
    punkte: Optional[int] = None
    ablauf_stufen: Optional[List[int]] = None
    sortierung: Optional[int] = None
    aktiv: Optional[bool] = None
    voraussetzung_ids: Optional[List[int]] = None


class UserKompetenzSchema(Schema):
    id: int
    user_keycloak_id: str
    user_username: str = ""
    kompetenz_id: int
    kompetenz_name: str
    kategorie_id: int
    kategorie_name: str
    gruppe_id: Optional[int] = None
    gruppe_name: Optional[str] = None
    punkte: int
    hat_kompetenz: bool
    ist_aktiv: bool
    ist_abgelaufen: bool
    stufe: int
    tage_bis_ablauf: Optional[int] = None
    erworben_am: Optional[datetime] = None
    letzte_bestaetigung_am: Optional[datetime] = None
    ablauf_am: Optional[datetime] = None
    bestaetigt_von_username: str = ""
    notiz: str = ""
    custom_ablauf_stufen: List[int] = []
    effektive_stufen: List[int] = []


class UserKompetenzToggleSchema(Schema):
    hat_kompetenz: bool
    notiz: Optional[str] = None


class UserKompetenzStufenUpdateSchema(Schema):
    custom_ablauf_stufen: List[int] = []


class UserKompetenzBulkItemSchema(Schema):
    user_keycloak_id: str
    kompetenz_id: int
    hat_kompetenz: bool


class UserKompetenzBulkSchema(Schema):
    items: List[UserKompetenzBulkItemSchema]


class HistorieSchema(Schema):
    id: int
    aktion: str
    stufe_vorher: int
    stufe_nachher: int
    notiz: str = ""
    geaendert_von_username: str = ""
    erstellt_am: datetime


class ScoreboardEntrySchema(Schema):
    user_keycloak_id: str
    user_username: str
    user_first_name: str = ""
    user_last_name: str = ""
    punkte: int
    anzahl_aktiv: int
    anzahl_gesamt: int
    rang: int


class KategorieStatSchema(Schema):
    kategorie_id: int
    kategorie_name: str
    anzahl_aktiv: int
    anzahl_gesamt: int
    prozent: float


class UserStatsSchema(Schema):
    user_keycloak_id: str
    user_username: str
    punkte: int
    anzahl_aktiv: int
    anzahl_gesamt: int
    kategorien: List[KategorieStatSchema]
    badges: List[str] = []


class SkillGapEntrySchema(Schema):
    kompetenz_id: int
    kompetenz_name: str
    kategorie_name: str
    anzahl_user: int
    user_liste: List[str]


class BadgeSchema(Schema):
    id: int
    name: str
    beschreibung: str = ""
    typ: str
    kategorie_id: Optional[int] = None
    gruppe_id: Optional[int] = None
    schwelle: int = 0
    icon: str = ""
    farbe: str = ""


class BadgeCreateSchema(Schema):
    name: str
    beschreibung: str = ""
    typ: str
    kategorie_id: Optional[int] = None
    gruppe_id: Optional[int] = None
    schwelle: int = 0
    icon: str = ""
    farbe: str = ""


class HistorieEntrySchema(Schema):
    id: int
    aktion: str
    kompetenz_name: str
    kategorie_name: str
    stufe_vorher: int
    stufe_nachher: int
    geaendert_von_username: str = ""
    erstellt_am: datetime


class VAKompetenzCheckSchema(Schema):
    erfuellt: bool
    fehlende: List[KompetenzSchema]
    abgelaufene: List[KompetenzSchema]
