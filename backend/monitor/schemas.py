"""
Monitor Schemas
"""
from typing import Optional, List
from datetime import datetime
from ninja import Schema


class MonitorConfigSchema(Schema):
    titel: str
    untertitel: str
    logo_url: str
    hintergrund_farbe: str
    zeige_uhr: bool
    zeige_veranstaltungen: bool
    zeige_ankuendigungen: bool
    zeige_onair: bool
    zeige_webuntis: bool
    zeige_logo: bool
    webuntis_url: str
    ist_on_air: bool
    on_air_text: str
    on_air_seit: Optional[datetime]
    api_token: str
    refresh_intervall: int


class MonitorConfigUpdateSchema(Schema):
    titel: Optional[str] = None
    untertitel: Optional[str] = None
    logo_url: Optional[str] = None
    hintergrund_farbe: Optional[str] = None
    zeige_uhr: Optional[bool] = None
    zeige_veranstaltungen: Optional[bool] = None
    zeige_ankuendigungen: Optional[bool] = None
    zeige_onair: Optional[bool] = None
    zeige_webuntis: Optional[bool] = None
    zeige_logo: Optional[bool] = None
    webuntis_url: Optional[str] = None
    on_air_text: Optional[str] = None
    refresh_intervall: Optional[int] = None


class AnkuendigungSchema(Schema):
    id: int
    titel: str
    text: str
    prioritaet: str
    ist_aktiv: bool
    aktiv_von: Optional[datetime]
    aktiv_bis: Optional[datetime]
    erstellt_am: datetime


class AnkuendigungCreateSchema(Schema):
    titel: str
    text: str = ''
    prioritaet: str = 'normal'
    ist_aktiv: bool = True
    aktiv_von: Optional[datetime] = None
    aktiv_bis: Optional[datetime] = None


class VeranstaltungDisplaySchema(Schema):
    id: int
    name: str
    ort: str
    datum_von: Optional[datetime]
    datum_bis: Optional[datetime]
    status: str
    ist_laufend: bool


class MonitorDisplaySchema(Schema):
    """Gesamtes Display-Datenpaket (öffentlich)"""
    config: MonitorConfigSchema
    ankuendigungen: List[AnkuendigungSchema]
    veranstaltungen: List[VeranstaltungDisplaySchema]


class OnAirSchema(Schema):
    on_air: bool
