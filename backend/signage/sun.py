"""Sunrise and sunset for Lübeck, computed offline (NOAA approximation, ignores clouds).
Solar altitude -0.833° (refraction and solar radius). Accuracy: a few minutes."""
import math
from datetime import date, datetime, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.conf import settings

LAT = 53.8655
LON = 10.6866
SUN_ALTITUDE = -0.833


def _utc_minutes(day: date):
    """Minutes after 00:00 UTC for sunrise and sunset (NOAA, fractional year at noon)."""
    gamma = 2 * math.pi / 365 * (day.timetuple().tm_yday - 1)
    eqtime = 229.18 * (0.000075 + 0.001868 * math.cos(gamma) - 0.032077 * math.sin(gamma)
                       - 0.014615 * math.cos(2 * gamma) - 0.040849 * math.sin(2 * gamma))
    decl = (0.006918 - 0.399912 * math.cos(gamma) + 0.070257 * math.sin(gamma)
            - 0.006758 * math.cos(2 * gamma) + 0.000907 * math.sin(2 * gamma)
            - 0.002697 * math.cos(3 * gamma) + 0.00148 * math.sin(3 * gamma))
    lat = math.radians(LAT)
    cos_ha = (math.sin(math.radians(SUN_ALTITUDE)) - math.sin(lat) * math.sin(decl)) / (
        math.cos(lat) * math.cos(decl))
    hour_angle = math.degrees(math.acos(max(-1.0, min(1.0, cos_ha))))
    noon = 720 - 4 * LON - eqtime
    return noon - 4 * hour_angle, noon + 4 * hour_angle


def sun_times(day: date) -> tuple[datetime, datetime]:
    """(sunrise, sunset) on `day` as aware local time (settings.TIME_ZONE)."""
    local = ZoneInfo(settings.TIME_ZONE)
    midnight = datetime(day.year, day.month, day.day, tzinfo=dt_timezone.utc)
    rise, set_ = _utc_minutes(day)
    return ((midnight + timedelta(minutes=rise)).astimezone(local),
            (midnight + timedelta(minutes=set_)).astimezone(local))
