from ninja import Router

from ..schemas import EmergencySchema, LegacyEmergencySchema, OnAirSchema
from .screens import get_screen_power, report_cec_status
from .settings import toggle_emergency, toggle_on_air

router = Router(tags=["Monitor"])


# For callers outside this repo. The aliases call the new functions so token and
# Keycloak checks stay identical.

@router.post("/onair", response={200: dict, 401: dict, 403: dict})
def legacy_toggle_on_air(request, payload: OnAirSchema):
    return toggle_on_air(request, payload)


@router.post("/notfall", response={200: dict, 401: dict, 403: dict})
def legacy_toggle_emergency(request, payload: LegacyEmergencySchema):
    return toggle_emergency(request, EmergencySchema(active=payload.aktiv, text=payload.text))


@router.get("/bildschirm/power")
def legacy_get_screen_power(request, slug: str):
    """Old response shape for Pi scripts installed before the rename."""
    result = get_screen_power(request, slug)
    if 'power_schedule' not in result:
        return result
    return {
        'slug': result['slug'],
        'power': result['power'],
        'power_zeitplan': result['power_schedule'],
        'ferien_modus': result['holiday_mode'],
        'power_ausnahmen': result['power_exceptions'],
        'cec_status': result['cec_status'],
        'cec_status_zeit': result['cec_status_at'],
    }


@router.post("/bildschirm/cec-status")
def legacy_report_cec_status(request, slug: str, status: str):
    return report_cec_status(request, slug, status)
