"""Anzeige-Endpunkte: /display (Vertrag für Bildschirme und vplan-Vorschau) und /clock."""
import secrets

from django.utils import timezone
from ninja import Router
from ninja.errors import HttpError

from core.auth import keycloak_auth
from .. import display as display_payload
from ..models import DisplayView, MonitorSettings, Screen
from ..permissions import _require_perm

router = Router(tags=["Monitor"])


# ═══ Öffentlicher Endpunkt (kein Auth) ═══════════════════════════

def _display_key_ok(request, screen, key):
    """Vertretungsdaten nur mit Schlüssel des Bildschirms oder angemeldet mit signage.view (Spec §4.1).
    Ein ungültiger Login führt nie zu 401: /display bleibt öffentlich."""
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
    """Öffentlicher Endpunkt: Display-Vertrag (display_payload.build_payload).
    Die alten Query-Namen `profil` und `bildschirm` gelten weiter (Kiosk-URLs)."""
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
    """Schlanker öffentlicher Endpunkt für externe Uhr-/Status-Displays:
    ON-AIR-Status + nächste Veranstaltungen. Kein Login nötig.
    Die Antwortform bleibt für externe Aufrufer unverändert."""
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
