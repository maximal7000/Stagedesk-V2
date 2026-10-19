"""
Monitor Schemas
"""
from typing import Optional, List
from datetime import datetime
from ninja import Schema


class MediaFileSchema(Schema):
    id: int
    name: str
    file_url: str = ''
    kind: str
    sort_order: int
    created_at: datetime

    @staticmethod
    def resolve_file_url(obj):
        return obj.file.url if obj.file else ''


class WebUntisLinkSchema(Schema):
    id: int
    name: str
    url: str
    note: str = ''
    created_at: datetime


class WebUntisLinkCreateSchema(Schema):
    name: str
    url: str
    note: str = ''


class DisplayViewListSchema(Schema):
    """Kurze Profil-Übersicht für die Liste"""
    id: int
    name: str
    slug: str
    is_default: bool
    sort_order: int = 0
    schedule: list = []
    layout: str
    is_on_air: bool
    emergency_active: bool


class DisplayViewSchema(Schema):
    """Admin: alle Felder eines Profils"""
    id: int
    name: str
    slug: str
    is_default: bool
    sort_order: int = 0
    schedule: list = []
    layout: str
    title: str
    subtitle: str
    background_color: str
    accent_color: str
    show_logo: bool
    logo_url: str
    active_logo_id: Optional[int] = None
    show_clock: bool
    show_events: bool
    show_announcements: bool
    show_on_air: bool
    show_countdown: bool
    emergency_active: bool
    emergency_text: str
    show_weather: bool
    weather_city: str
    weather_api_key: str
    show_slideshow: bool
    slideshow_interval: int
    show_pdf: bool
    active_pdf_id: Optional[int] = None
    fullscreen_header: bool = False
    pdf_mode: str = 'durchschalten'
    pdf_interval: int = 10
    pdf_per_screen: int = 1
    pdf_pages: str = ''
    pdf_static_page: int = 1
    active_image_id: Optional[int] = None
    image_fit: str = 'contain'
    image_focus_x: int = 50
    image_focus_y: int = 50
    split_left: str = 'klausur'
    split_right: str = 'webuntis'
    split_left_percent: int = 50
    theme_preset: str
    show_webuntis: bool
    webuntis_url: str
    webuntis_url_next_day: str = ''
    webuntis_link_id: Optional[int] = None
    webuntis_link_next_day_id: Optional[int] = None
    webuntis_zoom: int
    webuntis_dark_mode: bool
    show_background_image: bool
    active_background_image_id: Optional[int] = None
    show_qr_code: bool
    qr_code_url: str
    qr_code_label: str
    show_free_text: bool
    free_text_title: str
    free_text_content: str
    show_custom_countdown: bool
    custom_countdown_name: str
    custom_countdown_date: Optional[datetime] = None
    show_page_rotation: bool
    page_rotation_interval: int
    page_rotation_pages: list = []
    show_transit: bool
    transit_stops: list = []
    transit_duration: int
    transit_max_departures: int
    transit_show_bus: bool
    transit_show_rail: bool
    transit_show_long_distance: bool
    transit_source_db: bool
    transit_source_nahsh: bool
    transit_show_via: bool
    transit_show_relative: bool
    transit_color_coding: bool
    transit_highlight_next: bool
    transit_auto_scroll: bool
    transit_disruption_banner: bool
    transit_font_size: str
    transit_columns: int
    transit_strike_active: bool
    transit_strike_text: str
    transit_strike_lines: list = []
    transit_strike_types: list = []
    transit_disruption_rail: bool = True
    transit_disruption_bus: bool = True
    transit_disruption_rail_lines: list = []
    transit_disruption_bus_lines: list = []
    transit_disruption_manual: list = []
    transit_disruption_hidden: list = []
    transit_disruption_position: str = 'unten'
    is_on_air: bool
    on_air_text: str
    on_air_since: Optional[datetime] = None
    on_air_size: str
    on_air_position: str
    on_air_blink: bool
    on_air_color: str
    on_air_fullscreen: bool
    on_air_split: bool = False
    on_air_split_side: str = 'rechts'
    api_token: str
    refresh_interval: int


class DisplayViewUpdateSchema(Schema):
    name: Optional[str] = None
    slug: Optional[str] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None
    schedule: Optional[list] = None
    layout: Optional[str] = None
    title: Optional[str] = None
    subtitle: Optional[str] = None
    background_color: Optional[str] = None
    accent_color: Optional[str] = None
    show_logo: Optional[bool] = None
    logo_url: Optional[str] = None
    active_logo_id: Optional[int] = None
    show_clock: Optional[bool] = None
    show_events: Optional[bool] = None
    show_announcements: Optional[bool] = None
    show_on_air: Optional[bool] = None
    show_countdown: Optional[bool] = None
    emergency_active: Optional[bool] = None
    emergency_text: Optional[str] = None
    show_weather: Optional[bool] = None
    weather_city: Optional[str] = None
    weather_api_key: Optional[str] = None
    show_slideshow: Optional[bool] = None
    slideshow_interval: Optional[int] = None
    show_pdf: Optional[bool] = None
    active_pdf_id: Optional[int] = None
    fullscreen_header: Optional[bool] = None
    pdf_mode: Optional[str] = None
    pdf_interval: Optional[int] = None
    pdf_per_screen: Optional[int] = None
    pdf_pages: Optional[str] = None
    pdf_static_page: Optional[int] = None
    active_image_id: Optional[int] = None
    image_fit: Optional[str] = None
    image_focus_x: Optional[int] = None
    image_focus_y: Optional[int] = None
    split_left: Optional[str] = None
    split_right: Optional[str] = None
    split_left_percent: Optional[int] = None
    theme_preset: Optional[str] = None
    show_webuntis: Optional[bool] = None
    webuntis_url: Optional[str] = None
    webuntis_url_next_day: Optional[str] = None
    webuntis_link_id: Optional[int] = None
    webuntis_link_next_day_id: Optional[int] = None
    webuntis_zoom: Optional[int] = None
    webuntis_dark_mode: Optional[bool] = None
    show_background_image: Optional[bool] = None
    active_background_image_id: Optional[int] = None
    show_qr_code: Optional[bool] = None
    qr_code_url: Optional[str] = None
    qr_code_label: Optional[str] = None
    show_free_text: Optional[bool] = None
    free_text_title: Optional[str] = None
    free_text_content: Optional[str] = None
    show_custom_countdown: Optional[bool] = None
    custom_countdown_name: Optional[str] = None
    custom_countdown_date: Optional[datetime] = None
    show_page_rotation: Optional[bool] = None
    page_rotation_interval: Optional[int] = None
    page_rotation_pages: Optional[list] = None
    show_transit: Optional[bool] = None
    transit_stops: Optional[list] = None
    transit_duration: Optional[int] = None
    transit_max_departures: Optional[int] = None
    transit_show_bus: Optional[bool] = None
    transit_show_rail: Optional[bool] = None
    transit_show_long_distance: Optional[bool] = None
    transit_source_db: Optional[bool] = None
    transit_source_nahsh: Optional[bool] = None
    transit_show_via: Optional[bool] = None
    transit_show_relative: Optional[bool] = None
    transit_color_coding: Optional[bool] = None
    transit_highlight_next: Optional[bool] = None
    transit_auto_scroll: Optional[bool] = None
    transit_disruption_banner: Optional[bool] = None
    transit_font_size: Optional[str] = None
    transit_columns: Optional[int] = None
    transit_strike_active: Optional[bool] = None
    transit_strike_text: Optional[str] = None
    transit_strike_lines: Optional[list] = None
    transit_strike_types: Optional[list] = None
    transit_disruption_rail: Optional[bool] = None
    transit_disruption_bus: Optional[bool] = None
    transit_disruption_rail_lines: Optional[list] = None
    transit_disruption_bus_lines: Optional[list] = None
    transit_disruption_manual: Optional[list] = None
    transit_disruption_hidden: Optional[list] = None
    transit_disruption_position: Optional[str] = None
    on_air_text: Optional[str] = None
    on_air_size: Optional[str] = None
    on_air_position: Optional[str] = None
    on_air_blink: Optional[bool] = None
    on_air_color: Optional[str] = None
    on_air_fullscreen: Optional[bool] = None
    on_air_split: Optional[bool] = None
    on_air_split_side: Optional[str] = None
    refresh_interval: Optional[int] = None


class DisplayViewCreateSchema(Schema):
    """Neues Profil erstellen"""
    name: str
    slug: str = ''
    layout: str = 'standard'
    clone_from_id: Optional[int] = None


class AnnouncementSchema(Schema):
    id: int
    title: str
    text: str
    priority: str
    is_active: bool
    active_from: Optional[datetime] = None
    active_until: Optional[datetime] = None
    created_at: datetime


class AnnouncementCreateSchema(Schema):
    title: str
    text: str = ''
    priority: str = 'normal'
    is_active: bool = True
    active_from: Optional[datetime] = None
    active_until: Optional[datetime] = None


class UpcomingEventSchema(Schema):
    """Veranstaltung (Modul veranstaltung) in der Display-Antwort"""
    id: int
    name: str
    ort: str
    datum_von: Optional[datetime] = None
    datum_bis: Optional[datetime] = None
    status: str
    is_running: bool


class ScreenListSchema(Schema):
    id: int
    name: str
    slug: str
    default_view_id: Optional[int] = None
    override_view_id: Optional[int] = None
    override_until: Optional[datetime] = None
    schedule: list = []
    power_schedule: list = []
    holiday_mode: bool = False
    power_exceptions: list = []
    power_mode: str = 'auto'
    cec_status: str = ''
    cec_status_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ScreenCreateSchema(Schema):
    name: str
    slug: str = ''
    default_view_id: Optional[int] = None


class ScreenUpdateSchema(Schema):
    name: Optional[str] = None
    slug: Optional[str] = None
    default_view_id: Optional[int] = None
    override_view_id: Optional[int] = None
    override_until: Optional[datetime] = None
    schedule: Optional[list] = None
    power_schedule: Optional[list] = None
    holiday_mode: Optional[bool] = None
    power_exceptions: Optional[list] = None
    power_mode: Optional[str] = None


class DisplayViewVersionSchema(Schema):
    id: int
    created_at: datetime


class OnAirSchema(Schema):
    on_air: bool


class EmergencySchema(Schema):
    active: bool
    text: str = ''


class ExamSchema(Schema):
    id: int
    title: str
    text: str
    active_from: datetime
    active_until: datetime
    color: str
    screen_ids: List[int] = []
    display_mode: str = 'vollbild'
    webuntis_link_id: Optional[int] = None
    split_side: str = 'links'
    split_percent: int = 50

    @staticmethod
    def resolve_screen_ids(obj):
        return list(obj.screens.values_list('id', flat=True))


class ExamCreateSchema(Schema):
    title: str = 'Klausur'
    text: str = ''
    active_from: datetime
    active_until: datetime
    color: str = '#1e40af'
    screen_ids: List[int] = []
    display_mode: str = 'vollbild'
    webuntis_link_id: Optional[int] = None
    split_side: str = 'links'
    split_percent: int = 50


class ExamUpdateSchema(Schema):
    title: Optional[str] = None
    text: Optional[str] = None
    active_from: Optional[datetime] = None
    active_until: Optional[datetime] = None
    color: Optional[str] = None
    screen_ids: Optional[List[int]] = None
    display_mode: Optional[str] = None
    webuntis_link_id: Optional[int] = None
    split_side: Optional[str] = None
    split_percent: Optional[int] = None


class ExamDisplaySchema(Schema):
    title: str
    text: str
    color: str
    active_until: datetime
    display_mode: str = 'vollbild'
    split_side: str = 'links'
    split_percent: int = 50


# ─── Events ──────────────────────────────────────────────────
class EventAssignmentSchema(Schema):
    screen_id: int
    view_id: int
    screen_name: str = ''
    view_name: str = ''


class DisplayEventSchema(Schema):
    id: int
    name: str
    description: str = ''
    color: str
    is_active: bool
    active_from: Optional[datetime] = None
    active_until: Optional[datetime] = None
    assignments: List[EventAssignmentSchema] = []

    @staticmethod
    def resolve_assignments(obj):
        return [
            {'screen_id': a.screen_id, 'view_id': a.view_id,
             'screen_name': a.screen.name, 'view_name': a.view.name}
            for a in obj.assignments.select_related('screen', 'view').all()
        ]


class DisplayEventCreateSchema(Schema):
    name: str
    description: str = ''
    color: str = '#7c3aed'
    active_from: Optional[datetime] = None
    active_until: Optional[datetime] = None
    assignments: List[EventAssignmentSchema] = []


class DisplayEventUpdateSchema(Schema):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    active_from: Optional[datetime] = None
    active_until: Optional[datetime] = None
    assignments: Optional[List[EventAssignmentSchema]] = None


# ─── Klausur-Vorlagen ────────────────────────────────────────
class ExamTemplateSchema(Schema):
    id: int
    name: str
    duration_minutes: int
    title: str
    text: str = ''
    color: str
    display_mode: str
    webuntis_link_id: Optional[int] = None
    split_side: str
    split_percent: int


class ExamTemplateCreateSchema(Schema):
    name: str
    duration_minutes: int = 90
    title: str = 'Klausur'
    text: str = ''
    color: str = '#1e40af'
    display_mode: str = 'vollbild'
    webuntis_link_id: Optional[int] = None
    split_side: str = 'links'
    split_percent: int = 50


# ─── Globale Einstellungen ───────────────────────────────────
class MonitorSettingsSchema(Schema):
    weather_api_key: str = ''
    webuntis_server: str = ''
    webuntis_school: str = ''
    webuntis_username: str = ''
    webuntis_password: str = ''


class MonitorSettingsUpdateSchema(Schema):
    weather_api_key: Optional[str] = None
    webuntis_server: Optional[str] = None
    webuntis_school: Optional[str] = None
    webuntis_username: Optional[str] = None
    webuntis_password: Optional[str] = None
