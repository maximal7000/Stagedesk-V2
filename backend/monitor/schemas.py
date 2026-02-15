"""
Monitor Schemas
"""
from typing import Optional, List
from datetime import datetime
from ninja import Schema


class MonitorDateiSchema(Schema):
    id: int
    name: str
    datei_url: str = ''
    typ: str
    reihenfolge: int
    erstellt_am: datetime

    @staticmethod
    def resolve_datei_url(obj):
        return obj.datei.url if obj.datei else ''


class MonitorProfileListSchema(Schema):
    """Kurze Profil-Übersicht für die Liste"""
    id: int
    name: str
    slug: str
    ist_standard: bool
    zeitplan: list = []
    layout_modus: str
    ist_on_air: bool
    notfall_aktiv: bool


class MonitorConfigSchema(Schema):
    """Admin: alle Felder eines Profils"""
    id: int
    name: str
    slug: str
    ist_standard: bool
    zeitplan: list = []
    layout_modus: str
    titel: str
    untertitel: str
    hintergrund_farbe: str
    akzent_farbe: str
    zeige_logo: bool
    logo_url: str
    aktives_logo_id: Optional[int] = None
    zeige_uhr: bool
    zeige_veranstaltungen: bool
    zeige_ankuendigungen: bool
    zeige_onair: bool
    zeige_countdown: bool
    zeige_ticker: bool
    ticker_text: str
    ticker_geschwindigkeit: int
    notfall_aktiv: bool
    notfall_text: str
    zeige_wetter: bool
    wetter_stadt: str
    wetter_api_key: str
    zeige_slideshow: bool
    slideshow_intervall: int
    zeige_pdf: bool
    aktive_pdf_id: Optional[int] = None
    theme_preset: str
    zeige_webuntis: bool
    webuntis_url: str
    webuntis_zoom: int
    webuntis_dark_mode: bool
    zeige_hintergrundbild: bool
    aktives_hintergrundbild_id: Optional[int] = None
    zeige_qr_code: bool
    qr_code_url: str
    qr_code_label: str
    zeige_freitext: bool
    freitext_titel: str
    freitext_inhalt: str
    zeige_raumplan: bool
    raumplan_server: str
    raumplan_schule: str
    raumplan_raum: str
    raumplan_benutzername: str
    raumplan_passwort: str
    zeige_eigener_countdown: bool
    eigener_countdown_name: str
    eigener_countdown_datum: Optional[datetime] = None
    zeige_bildschirmschoner: bool
    bildschirmschoner_timeout: int
    zeige_seitenrotation: bool
    seitenrotation_intervall: int
    seitenrotation_seiten: list = []
    zeige_oepnv: bool
    oepnv_stationen: list = []
    oepnv_dauer: int
    oepnv_max_abfahrten: int
    oepnv_zeige_bus: bool
    oepnv_zeige_bahn: bool
    oepnv_zeige_fernverkehr: bool
    oepnv_api_db: bool
    oepnv_api_nahsh: bool
    ist_on_air: bool
    on_air_text: str
    on_air_seit: Optional[datetime] = None
    on_air_groesse: str
    on_air_position: str
    on_air_blinken: bool
    on_air_farbe: str
    on_air_vollbild: bool
    api_token: str
    refresh_intervall: int


class MonitorConfigUpdateSchema(Schema):
    name: Optional[str] = None
    slug: Optional[str] = None
    ist_standard: Optional[bool] = None
    zeitplan: Optional[list] = None
    layout_modus: Optional[str] = None
    titel: Optional[str] = None
    untertitel: Optional[str] = None
    hintergrund_farbe: Optional[str] = None
    akzent_farbe: Optional[str] = None
    zeige_logo: Optional[bool] = None
    logo_url: Optional[str] = None
    aktives_logo_id: Optional[int] = None
    zeige_uhr: Optional[bool] = None
    zeige_veranstaltungen: Optional[bool] = None
    zeige_ankuendigungen: Optional[bool] = None
    zeige_onair: Optional[bool] = None
    zeige_countdown: Optional[bool] = None
    zeige_ticker: Optional[bool] = None
    ticker_text: Optional[str] = None
    ticker_geschwindigkeit: Optional[int] = None
    notfall_aktiv: Optional[bool] = None
    notfall_text: Optional[str] = None
    zeige_wetter: Optional[bool] = None
    wetter_stadt: Optional[str] = None
    wetter_api_key: Optional[str] = None
    zeige_slideshow: Optional[bool] = None
    slideshow_intervall: Optional[int] = None
    zeige_pdf: Optional[bool] = None
    aktive_pdf_id: Optional[int] = None
    theme_preset: Optional[str] = None
    zeige_webuntis: Optional[bool] = None
    webuntis_url: Optional[str] = None
    webuntis_zoom: Optional[int] = None
    webuntis_dark_mode: Optional[bool] = None
    zeige_hintergrundbild: Optional[bool] = None
    aktives_hintergrundbild_id: Optional[int] = None
    zeige_qr_code: Optional[bool] = None
    qr_code_url: Optional[str] = None
    qr_code_label: Optional[str] = None
    zeige_freitext: Optional[bool] = None
    freitext_titel: Optional[str] = None
    freitext_inhalt: Optional[str] = None
    zeige_raumplan: Optional[bool] = None
    raumplan_server: Optional[str] = None
    raumplan_schule: Optional[str] = None
    raumplan_raum: Optional[str] = None
    raumplan_benutzername: Optional[str] = None
    raumplan_passwort: Optional[str] = None
    zeige_eigener_countdown: Optional[bool] = None
    eigener_countdown_name: Optional[str] = None
    eigener_countdown_datum: Optional[datetime] = None
    zeige_bildschirmschoner: Optional[bool] = None
    bildschirmschoner_timeout: Optional[int] = None
    zeige_seitenrotation: Optional[bool] = None
    seitenrotation_intervall: Optional[int] = None
    seitenrotation_seiten: Optional[list] = None
    zeige_oepnv: Optional[bool] = None
    oepnv_stationen: Optional[list] = None
    oepnv_dauer: Optional[int] = None
    oepnv_max_abfahrten: Optional[int] = None
    oepnv_zeige_bus: Optional[bool] = None
    oepnv_zeige_bahn: Optional[bool] = None
    oepnv_zeige_fernverkehr: Optional[bool] = None
    oepnv_api_db: Optional[bool] = None
    oepnv_api_nahsh: Optional[bool] = None
    on_air_text: Optional[str] = None
    on_air_groesse: Optional[str] = None
    on_air_position: Optional[str] = None
    on_air_blinken: Optional[bool] = None
    on_air_farbe: Optional[str] = None
    on_air_vollbild: Optional[bool] = None
    refresh_intervall: Optional[int] = None


class MonitorProfileCreateSchema(Schema):
    """Neues Profil erstellen"""
    name: str
    slug: str = ''
    layout_modus: str = 'standard'
    clone_from_id: Optional[int] = None


class AnkuendigungSchema(Schema):
    id: int
    titel: str
    text: str
    prioritaet: str
    ist_aktiv: bool
    aktiv_von: Optional[datetime] = None
    aktiv_bis: Optional[datetime] = None
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
    datum_von: Optional[datetime] = None
    datum_bis: Optional[datetime] = None
    status: str
    ist_laufend: bool


class OnAirSchema(Schema):
    on_air: bool


class NotfallSchema(Schema):
    aktiv: bool
    text: str = ''
