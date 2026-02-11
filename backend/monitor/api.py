"""
Monitor API — öffentliche + Admin-Endpunkte
"""
from ninja import Router
from django.utils import timezone
from django.shortcuts import get_object_or_404

from core.auth import keycloak_auth
from users.api import is_admin
from .models import MonitorConfig, Ankuendigung
from .schemas import (
    MonitorConfigSchema, MonitorConfigUpdateSchema,
    AnkuendigungSchema, AnkuendigungCreateSchema,
    VeranstaltungDisplaySchema, MonitorDisplaySchema,
    OnAirSchema,
)

monitor_router = Router(tags=["Monitor"])


def require_admin(request):
    if not is_admin(request):
        from django.http import JsonResponse
        raise Exception("Admin required")


# ═══ Öffentlicher Endpunkt (kein Auth) ═══════════════════════════

@monitor_router.get("/display", response=MonitorDisplaySchema)
def get_display_data(request):
    """Öffentlicher Endpunkt: Alle Daten für das Monitor-Display"""
    config = MonitorConfig.get()
    now = timezone.now()

    # Ankündigungen: nur aktive + im Zeitfenster
    ankuendigungen = []
    for a in Ankuendigung.objects.filter(ist_aktiv=True):
        if a.aktiv_von and now < a.aktiv_von:
            continue
        if a.aktiv_bis and now > a.aktiv_bis:
            continue
        ankuendigungen.append(a)

    # Veranstaltungen: nächste 7 Tage + aktuell laufende
    veranstaltungen = []
    if config.zeige_veranstaltungen:
        from veranstaltung.models import Veranstaltung
        sieben_tage = now + timezone.timedelta(days=7)

        events = Veranstaltung.objects.filter(
            status__in=['bestaetigt', 'laufend'],
            datum_bis__gte=now,
            datum_von__lte=sieben_tage,
        ).order_by('datum_von')[:10]

        for v in events:
            ist_laufend = v.status == 'laufend' or (
                v.datum_von and v.datum_bis and v.datum_von <= now <= v.datum_bis
            )
            veranstaltungen.append({
                'id': v.id,
                'name': v.titel,
                'ort': v.ort or '',
                'datum_von': v.datum_von,
                'datum_bis': v.datum_bis,
                'status': v.status,
                'ist_laufend': ist_laufend,
            })

    # Config ohne api_token im public endpoint
    config_data = MonitorConfigSchema.from_orm(config).dict()
    config_data['api_token'] = ''  # Token nicht öffentlich zeigen

    return {
        'config': config_data,
        'ankuendigungen': ankuendigungen,
        'veranstaltungen': veranstaltungen,
    }


# ═══ ON AIR Endpunkt (Token-Auth) ════════════════════════════════

@monitor_router.post("/onair", response={200: dict, 401: dict, 403: dict})
def toggle_on_air(request, payload: OnAirSchema):
    """ON AIR Status ändern — Auth per Token-Header oder Admin"""
    config = MonitorConfig.get()

    # Auth: entweder per Token-Header oder per Keycloak-Admin
    token = request.headers.get('X-Monitor-Token', '')
    if token and token == config.api_token:
        config.set_on_air(payload.on_air)
        return 200, {"success": True, "on_air": config.ist_on_air}

    # Fallback: Keycloak-Auth prüfen
    try:
        keycloak_auth(request)
        if not is_admin(request):
            return 403, {"success": False, "message": "Kein Admin"}
        config.set_on_air(payload.on_air)
        return 200, {"success": True, "on_air": config.ist_on_air}
    except Exception:
        return 401, {"success": False, "message": "Nicht autorisiert"}


# ═══ Admin: Config ════════════════════════════════════════════════

@monitor_router.get("/config", response=MonitorConfigSchema, auth=keycloak_auth)
def get_config(request):
    """Admin: Monitor-Konfiguration abrufen"""
    return MonitorConfig.get()


@monitor_router.put("/config", response=MonitorConfigSchema, auth=keycloak_auth)
def update_config(request, payload: MonitorConfigUpdateSchema):
    """Admin: Monitor-Konfiguration ändern"""
    config = MonitorConfig.get()
    data = payload.dict(exclude_unset=True)
    for key, value in data.items():
        setattr(config, key, value)
    config.save()
    return config


@monitor_router.post("/config/regenerate-token", auth=keycloak_auth)
def regenerate_token(request):
    """Admin: Neues API-Token generieren"""
    import uuid
    config = MonitorConfig.get()
    config.api_token = uuid.uuid4().hex
    config.save(update_fields=['api_token', 'aktualisiert_am'])
    return {"api_token": config.api_token}


# ═══ Admin: Ankündigungen ═════════════════════════════════════════

@monitor_router.get("/ankuendigungen", response=list[AnkuendigungSchema], auth=keycloak_auth)
def list_ankuendigungen(request):
    return Ankuendigung.objects.all()


@monitor_router.post("/ankuendigungen", response=AnkuendigungSchema, auth=keycloak_auth)
def create_ankuendigung(request, payload: AnkuendigungCreateSchema):
    return Ankuendigung.objects.create(**payload.dict())


@monitor_router.put("/ankuendigungen/{id}", response=AnkuendigungSchema, auth=keycloak_auth)
def update_ankuendigung(request, id: int, payload: AnkuendigungCreateSchema):
    a = get_object_or_404(Ankuendigung, id=id)
    for key, value in payload.dict().items():
        setattr(a, key, value)
    a.save()
    return a


@monitor_router.delete("/ankuendigungen/{id}", auth=keycloak_auth)
def delete_ankuendigung(request, id: int):
    a = get_object_or_404(Ankuendigung, id=id)
    a.delete()
    return {"success": True}
