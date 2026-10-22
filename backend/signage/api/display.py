import secrets

from django.utils import timezone
from ninja import Router
from ninja.errors import HttpError

from core.auth import keycloak_auth
from .. import display as display_payload
from ..models import DisplayView, MonitorSettings, Screen
from ..permissions import _require_perm

router = Router(tags=["Monitor"])


def _display_key_ok(request, screen, key):
    """An invalid login never yields 401: /display stays public."""
    if screen and key and secrets.compare_digest(key.encode(), screen.access_key.encode()):
        return True
    if not request.headers.get('Authorization', '').startswith('Bearer '):
        return False
    try:
        auth = keycloak_auth(request)
        if not auth:
            return False
        request.auth = auth
        _require_perm(request, 'signage.view')
        return True
    except Exception:
        return False


@router.get("/display")
def get_display_data(request, view: str = None, screen: str = None,
                     profil: str = None, bildschirm: str = None,
                     key: str = None, preview: str = None):
    """The old query names `profil` and `bildschirm` still work (kiosk URLs)."""
    now = timezone.now()
    if preview:
        entry = display_payload.load_preview(preview)
        if entry is None:
            raise HttpError(404, "Die Vorschau ist abgelaufen. Bitte die Vorschau neu öffnen.")
        screen_obj = Screen.objects.filter(id=entry['screen_id']).first() if entry.get('screen_id') else None
        return display_payload.build_payload(screen_obj, display_payload.draft_view(entry['view']), key_ok=True, now=now,
                                     preview=True)

    screen_slug = screen or bildschirm
    screen_obj = None
    if screen_slug:
        screen_obj = Screen.objects.filter(slug=screen_slug).first()
        if screen_obj is None:
            return display_payload.build_payload(None, None, key_ok=False, now=now)
        view_obj = screen_obj.get_active_view()
    else:
        view_obj = DisplayView.get(slug=view or profil)
    key_ok = _display_key_ok(request, screen_obj, key)
    return display_payload.build_payload(screen_obj, view_obj, key_ok=key_ok, now=now)


@router.get("/clock")
def get_clock_data(request):
    """For external clock/status displays; the response shape stays unchanged for them."""
    now = timezone.now()
    settings = MonitorSettings.load()

    from veranstaltung.models import Veranstaltung
    upcoming = (Veranstaltung.objects
                .exclude(status='abgesagt')
                .filter(datum_bis__gte=now)
                .order_by('datum_von')[:5])
    events = [{
        'titel': v.titel,
        'ort': v.ort or '',
        'datum_von': v.datum_von,
        'datum_bis': v.datum_bis,
        'status': v.effektiv_status,
        'ist_laufend': v.effektiv_status == 'laufend',
    } for v in upcoming]

    return {
        'on_air': settings.on_air_active,
        'on_air_text': settings.on_air_text,
        'veranstaltungen': events,
    }
