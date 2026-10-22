from django.utils import timezone

from .sun import sun_times


def resolve(screen, settings, now) -> str:
    if screen is not None and screen.color_scheme in ('light', 'dark'):
        return screen.color_scheme
    scheme = settings.color_scheme
    if scheme == 'daylight':
        rise, set_ = sun_times(timezone.localtime(now).date())
        return 'light' if rise <= now < set_ else 'dark'
    if scheme == 'schedule':
        # minute precision, end inclusive: 07:00-18:00 is light until 18:00:59
        current = timezone.localtime(now).strftime('%H:%M')
        return 'light' if settings.light_from <= current <= settings.light_until else 'dark'
    return 'dark' if scheme == 'dark' else 'light'
