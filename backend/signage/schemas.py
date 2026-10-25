from typing import Dict, Literal, Optional, List
from datetime import date, datetime
from django.utils import timezone
from ninja import Schema

from .sun import sun_times


class MediaFileSchema(Schema):
    id: int
    name: str
    file_url: str = ''
    kind: str
    sort_order: int
    created_at: datetime
    status: str = 'ready'
    page_count: int = 0
    error: str = ''
    first_page_url: str = ''
    orientation: str = ''

    @staticmethod
    def resolve_file_url(obj):
        return obj.file.url if obj.file else ''

    @staticmethod
    def _first_page(obj):
        pages = list(obj.pages.all())   # uses prefetch_related('pages')
        return min(pages, key=lambda p: p.index) if pages else None

    @staticmethod
    def resolve_first_page_url(obj):
        page = MediaFileSchema._first_page(obj)
        return page.image.url if page else ''

    @staticmethod
    def resolve_orientation(obj):
        page = MediaFileSchema._first_page(obj)
        return page.orientation if page else ''


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
    id: int
    name: str
    slug: str
    is_default: bool
    sort_order: int = 0
    schedule: list = []
    kind: str
    rotation_items: list = []


class DisplayViewSchema(Schema):
    id: int
    name: str
    slug: str
    is_default: bool
    sort_order: int = 0
    schedule: list = []
    show_clock: bool
    show_events: bool
    show_announcements: bool
    show_countdown: bool
    show_weather: bool
    weather_city: str
    # Old per-view weather key: write-only, the global one wins
    weather_api_key: str = ''
    weather_api_key_set: bool = False
    pdf_mode: str = 'cycle'
    pdf_per_screen: int = 1
    pdf_pages: str = ''
    pdf_static_page: int = 1
    split_left: str = 'exam'
    split_right: str = 'webuntis'
    split_left_percent: int = 50
    webuntis_url: str
    webuntis_url_next_day: str = ''
    webuntis_link_id: Optional[int] = None
    webuntis_link_next_day_id: Optional[int] = None
    webuntis_zoom: int
    show_qr_code: bool
    qr_code_url: str
    qr_code_label: str
    show_custom_countdown: bool
    custom_countdown_name: str
    custom_countdown_date: Optional[datetime] = None
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
    transit_time_format: str
    transit_color_coding: bool
    transit_highlight_next: bool
    transit_auto_scroll: bool
    transit_show_disruptions: bool
    transit_strip_city: bool
    transit_disruption_column: Optional[int] = None
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
    on_air_split_side: str = 'right'
    kind: str = 'info'
    layout: str = 'auto'
    on_air_behavior: str = 'fullscreen'
    rotation_items: list = []
    media_items: list = []
    media_seconds: int = 10
    substitutions_next_day: bool = True
    substitutions_source: str = 'monitor'
    substitutions_format: str = 'students_2'
    substitutions_custom_format: str = ''
    substitutions_show_absences: bool = True
    substitutions_show_exams: Optional[bool] = None
    substitutions_next_day_from: str = '16:00'
    page_seconds: int = 15
    api_token: str

    @staticmethod
    def resolve_weather_api_key(obj):
        return ''

    @staticmethod
    def resolve_weather_api_key_set(obj):
        return bool(obj.weather_api_key)


class DisplayViewUpdateSchema(Schema):
    name: Optional[str] = None
    slug: Optional[str] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None
    schedule: Optional[list] = None
    show_clock: Optional[bool] = None
    show_events: Optional[bool] = None
    show_announcements: Optional[bool] = None
    show_countdown: Optional[bool] = None
    show_weather: Optional[bool] = None
    weather_city: Optional[str] = None
    weather_api_key: Optional[str] = None
    pdf_mode: Optional[str] = None
    pdf_per_screen: Optional[int] = None
    pdf_pages: Optional[str] = None
    pdf_static_page: Optional[int] = None
    split_left: Optional[str] = None
    split_right: Optional[str] = None
    split_left_percent: Optional[int] = None
    webuntis_url: Optional[str] = None
    webuntis_url_next_day: Optional[str] = None
    webuntis_link_id: Optional[int] = None
    webuntis_link_next_day_id: Optional[int] = None
    webuntis_zoom: Optional[int] = None
    show_qr_code: Optional[bool] = None
    qr_code_url: Optional[str] = None
    qr_code_label: Optional[str] = None
    show_custom_countdown: Optional[bool] = None
    custom_countdown_name: Optional[str] = None
    # Text instead of datetime: validation.parse_countdown_date checks it with a German message (no zone = local time)
    custom_countdown_date: Optional[str] = None
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
    transit_time_format: Optional[str] = None
    transit_color_coding: Optional[bool] = None
    transit_highlight_next: Optional[bool] = None
    transit_auto_scroll: Optional[bool] = None
    transit_show_disruptions: Optional[bool] = None
    transit_strip_city: Optional[bool] = None
    transit_disruption_column: Optional[int] = None
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
    on_air_split_side: Optional[str] = None
    kind: Optional[str] = None
    layout: Optional[str] = None
    on_air_behavior: Optional[str] = None
    rotation_items: Optional[list] = None
    media_items: Optional[list] = None
    media_seconds: Optional[int] = None
    substitutions_next_day: Optional[bool] = None
    substitutions_source: Optional[str] = None
    substitutions_format: Optional[str] = None
    substitutions_custom_format: Optional[str] = None
    substitutions_show_absences: Optional[bool] = None
    # None means "as in the WebUntis format" here and may be set
    substitutions_show_exams: Optional[bool] = None
    substitutions_next_day_from: Optional[str] = None
    page_seconds: Optional[int] = None


class DisplayViewDraftSchema(DisplayViewUpdateSchema):
    """`id` = saved view used as the base."""
    id: Optional[int] = None


class ViewPreviewSchema(Schema):
    view: DisplayViewDraftSchema
    screen_id: Optional[int] = None


class DisplayViewCreateSchema(Schema):
    name: str
    slug: str = ''
    kind: str = 'info'
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
    power_exceptions: list = []
    power_mode: str = 'auto'
    cec_status: str = ''
    cec_status_at: Optional[datetime] = None
    location: str = ''
    scale: str = 'auto'
    orientation: str = 'landscape'
    access_key: str = ''
    off_during_holidays: bool = True
    off_until: Optional[datetime] = None
    power_method: str = 'none'
    power_config: dict = {}
    auto_updates: bool = True
    update_window: dict = {}
    daily_reboot: bool = True
    color_scheme: str = 'inherit'
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
    power_exceptions: Optional[list] = None
    power_mode: Optional[str] = None
    location: Optional[str] = None
    scale: Optional[str] = None
    orientation: Optional[str] = None
    off_during_holidays: Optional[bool] = None
    off_until: Optional[datetime] = None
    power_method: Optional[Literal['none', 'cec', 'hdmi', 'hybrid', 'ddc']] = None
    power_config: Optional[dict] = None
    auto_updates: Optional[bool] = None
    update_window: Optional[dict] = None
    daily_reboot: Optional[bool] = None
    color_scheme: Optional[Literal['inherit', 'light', 'dark']] = None


class DisplayViewVersionSchema(Schema):
    id: int
    created_at: datetime


class OnAirSchema(Schema):
    on_air: bool


class LegacyEmergencySchema(Schema):
    """Old ATEM format of POST /notfall."""
    aktiv: bool
    text: str = ''


class EmergencySchema(Schema):
    active: bool
    text: str = ''
    note: str = ''


class HolidayPeriodSchema(Schema):
    id: int
    name: str
    start_date: date
    end_date: date


class HolidayPeriodCreateSchema(Schema):
    name: str
    start_date: date
    end_date: date


class EmergencyTemplateSchema(Schema):
    id: int
    title: str
    text: str
    note: str
    sort_order: int


class EmergencyTemplateCreateSchema(Schema):
    title: str
    text: str
    note: str = ''
    sort_order: int = 0


class ScreenSelectionSchema(Schema):
    """Empty or missing = all screens."""
    screen_ids: Optional[List[int]] = None


class ExamSchema(Schema):
    id: int
    title: str
    text: str
    active_from: datetime
    active_until: datetime
    color: str
    screen_ids: List[int] = []
    display_mode: str = 'fullscreen'
    webuntis_link_id: Optional[int] = None
    split_side: str = 'left'
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
    display_mode: str = 'fullscreen'
    webuntis_link_id: Optional[int] = None
    split_side: str = 'right'
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
    display_mode: str = 'fullscreen'
    split_side: str = 'left'
    split_percent: int = 50


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
    display_mode: str = 'fullscreen'
    webuntis_link_id: Optional[int] = None
    split_side: str = 'right'
    split_percent: int = 50


class MonitorSettingsSchema(Schema):
    # Credentials are write-only: always '' plus *_set
    weather_api_key: str = ''
    weather_api_key_set: bool = False
    webuntis_server: str = ''
    webuntis_school: str = ''
    webuntis_username: str = ''
    webuntis_password: str = ''
    webuntis_password_set: bool = False
    on_air_active: bool = False
    on_air_since: Optional[datetime] = None
    on_air_text: str = 'ON AIR'
    on_air_animation: str = 'pulse'
    on_air_show_clock: bool = True
    emergency_active: bool = False
    emergency_text: str = ''
    emergency_note: str = ''
    emergency_since: Optional[datetime] = None
    webuntis_source: str = ''
    webuntis_checked_at: Optional[datetime] = None
    device_offline_minutes: int = 10
    warn_temperature_c: int = 80
    warn_disk_percent: int = 90
    warn_wifi_dbm: int = -75
    warn_reboot_days: int = 7
    require_device_token: bool = False
    color_scheme: str = 'light'
    light_from: str = '07:00'
    light_until: str = '18:00'
    daylight_today: Dict[str, str] = {}

    @staticmethod
    def resolve_daylight_today(obj):
        sunrise, sunset = sun_times(timezone.localdate())
        return {'sunrise': sunrise.strftime('%H:%M'), 'sunset': sunset.strftime('%H:%M')}

    @staticmethod
    def resolve_weather_api_key(obj):
        return ''

    @staticmethod
    def resolve_webuntis_password(obj):
        return ''

    @staticmethod
    def resolve_weather_api_key_set(obj):
        return bool(obj.weather_api_key)

    @staticmethod
    def resolve_webuntis_password_set(obj):
        return bool(obj.webuntis_password)


class MonitorSettingsUpdateSchema(Schema):
    weather_api_key: Optional[str] = None
    webuntis_server: Optional[str] = None
    webuntis_school: Optional[str] = None
    webuntis_username: Optional[str] = None
    webuntis_password: Optional[str] = None
    # Empty credentials stay unchanged; clearing only via these switches
    webuntis_password_clear: Optional[bool] = None
    weather_api_key_clear: Optional[bool] = None
    on_air_text: Optional[str] = None
    on_air_animation: Optional[Literal['still', 'pulse', 'blink']] = None
    on_air_show_clock: Optional[bool] = None
    device_offline_minutes: Optional[int] = None
    warn_temperature_c: Optional[int] = None
    warn_disk_percent: Optional[int] = None
    warn_wifi_dbm: Optional[int] = None
    warn_reboot_days: Optional[int] = None
    require_device_token: Optional[bool] = None
    color_scheme: Optional[Literal['light', 'dark', 'daylight', 'schedule']] = None
    light_from: Optional[str] = None
    light_until: Optional[str] = None


class PairStartSchema(Schema):
    serial: str = ''
    model: str = ''


class PairPollSchema(Schema):
    pairing_id: str


class NewScreenSchema(Schema):
    name: str
    location: str = ''


class DevicePairSchema(Schema):
    code: str
    screen_id: Optional[int] = None
    new_screen: Optional[NewScreenSchema] = None


class DeviceSchema(Schema):
    """`id` is empty for screens with the legacy script.
    serial, telemetry.network.ip/mac: only with signage.devices, otherwise null."""
    id: Optional[int] = None
    screen_id: Optional[int] = None
    serial: Optional[str] = None
    model: str = ''
    status: str
    status_text: str
    agent_version: str = ''
    last_seen_at: Optional[datetime] = None
    token_created_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    telemetry: dict = {}
    warnings: list = []
    last_screenshot_url: Optional[str] = None
    last_screenshot_at: Optional[datetime] = None
    legacy: bool = False


DEVICE_COMMAND_KINDS = Literal['reload', 'restart_browser', 'reboot', 'power_on', 'power_off',
                               'update_now', 'screenshot', 'test_pattern',
                               'power_probe', 'power_test', 'power_test_end']


class DeviceCommandCreateSchema(Schema):
    kind: DEVICE_COMMAND_KINDS
    params: dict = {}


class DeviceCommandSchema(Schema):
    id: int
    kind: str
    status: str
    result: str = ''
    created_at: datetime
    finished_at: Optional[datetime] = None
    created_by_name: str = ''


class DeviceEventSchema(Schema):
    id: int
    kind: str
    text: str
    created_at: datetime
    person: str = ''

    @staticmethod
    def resolve_person(obj):
        return (obj.data or {}).get('created_by_name', '') if isinstance(obj.data, dict) else ''
