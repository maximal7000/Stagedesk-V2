"""
Farbschema der Anzeige (Spec §3.2): Ausnahme am Bildschirm vor der Einstellung für alle.
"""
from django.utils import timezone

from .sun import sun_times


def resolve(screen, settings, now) -> str:
    """'light' oder 'dark' für `screen` (oder ohne Bildschirm: nur die Einstellung) zum Zeitpunkt `now`."""
    if screen is not None and screen.color_scheme in ('light', 'dark'):
        return screen.color_scheme
    scheme = settings.color_scheme
    if scheme == 'daylight':
        rise, set_ = sun_times(timezone.localtime(now).date())
        return 'light' if rise <= now < set_ else 'dark'
    if scheme == 'schedule':
        # minutengenau, Ende eingeschlossen: 07:00–18:00 ist bis 18:00:59 hell
        current = timezone.localtime(now).strftime('%H:%M')
        return 'light' if settings.light_from <= current <= settings.light_until else 'dark'
    return 'dark' if scheme == 'dark' else 'light'
