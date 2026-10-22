"""All times are computed locally (settings.TIME_ZONE, Europe/Berlin)."""
from datetime import date, datetime, time, timedelta

from django.utils import timezone

from . import screen_schedule

# "Off until end of day" without a schedule: back on at this time the next day.
FALLBACK_ON_TIME = time(5, 0)
MAX_LOOKAHEAD_DAYS = 14


def time_in_window(hhmm: str, start: str, end: str) -> bool:
    if not start and not end:
        return True
    start = start or '00:00'
    end = end or '23:59'
    if start <= end:
        return start <= hhmm <= end
    return hhmm >= start or hhmm <= end


def active_exception(screen, day: date):
    for e in screen.power_exceptions or []:
        if not isinstance(e, dict):
            continue
        try:
            start_date = date.fromisoformat(e.get('from_date', ''))
            end_date = date.fromisoformat(e.get('until_date') or e.get('from_date', ''))
        except (ValueError, TypeError):
            continue
        if start_date <= day <= end_date:
            return e
    return None


def is_holiday(day: date) -> bool:
    from .models import HolidayPeriod
    return HolidayPeriod.objects.filter(start_date__lte=day, end_date__gte=day).exists()


def _emergency_active() -> bool:
    from .models import MonitorSettings
    return MonitorSettings.objects.filter(pk=1, emergency_active=True).exists()


def _schedule_entries(screen):
    return [e for e in (screen.schedule or [])
            if isinstance(e, dict) and isinstance(e.get('days', []), list)]


def compute_power_state(screen, now: datetime) -> bool:
    if _emergency_active():
        return True
    if screen.power_mode == 'manual_on':
        return True
    if screen.power_mode == 'manual_off':
        return False
    if screen.off_until and screen.off_until > now:
        return False

    local_now = timezone.localtime(now)
    hhmm = local_now.strftime('%H:%M')
    exception = active_exception(screen, local_now.date())
    if exception is not None:
        return time_in_window(hhmm, exception.get('from', ''), exception.get('until', ''))
    if screen.off_during_holidays and is_holiday(local_now.date()):
        return False
    # Schedule: union of all rows (empty = always on)
    return screen_schedule.is_on(screen.schedule, local_now)


def _parse_hhmm(value: str):
    try:
        return datetime.strptime(value or '00:00', '%H:%M').time()
    except (TypeError, ValueError):
        return None


def _at(day: date, at: time) -> datetime:
    return timezone.make_aware(datetime.combine(day, at), timezone.get_default_timezone())


def next_on_time(screen, now: datetime) -> datetime:
    """Start of the next schedule window that is not today. Days without a window are skipped
    (at most 14 days). Without a schedule or matching window: next day 05:00."""
    today = timezone.localtime(now).date()
    entries = _schedule_entries(screen)
    for offset in range(1, MAX_LOOKAHEAD_DAYS + 1):
        day = today + timedelta(days=offset)
        starts = [t for t in (_parse_hhmm(e.get('from', '')) for e in entries
                              if day.weekday() in e.get('days', [])) if t is not None]
        if starts:
            return _at(day, min(starts))
    return _at(today + timedelta(days=1), FALLBACK_ON_TIME)
