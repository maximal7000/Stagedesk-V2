"""
Veranstaltungsplaner API: CRUD, Zammad, Zuweisungen, Checkliste, Notizen, Anhänge, Erinnerungen.
"""
from typing import List, Optional
from datetime import datetime as dt
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.db.models import Q
from ninja import Router, Query, File, Form
from ninja.files import UploadedFile
from django.http import HttpResponse
import csv
import io

from core.auth import keycloak_auth
from users.models import UserProfile
from users.api import get_or_create_profile, is_admin
from .models import (
    TaetigkeitsRolle,
    Veranstaltung,
    VeranstaltungZuweisung,
    VeranstaltungChecklisteItem,
    VeranstaltungNotiz,
    VeranstaltungAnhang,
    VeranstaltungErinnerung,
)
from .schemas import (
    VeranstaltungSchema,
    VeranstaltungListSchema,
    VeranstaltungCreateSchema,
    CreateVeranstaltungResponseSchema,
    VeranstaltungUpdateSchema,
    VeranstaltungFilterSchema,
    ZuweisungCreateSchema,
    ChecklisteItemCreateSchema,
    ChecklisteItemUpdateSchema,
    NotizCreateSchema,
    ErinnerungCreateSchema,
    ZammadTicketSchema,
)
from . import zammad_client

veranstaltung_router = Router(tags=["Veranstaltung"])


def get_user_id(request) -> str:
    return request.auth.get('sub', '')


def require_permission(request, code: str):
    """Prüft Permission, wirft 403 wenn nicht vorhanden. Admin hat immer Zugriff."""
    if is_admin(request):
        return
    keycloak_id = get_user_id(request)
    try:
        profile = UserProfile.objects.get(keycloak_id=keycloak_id)
        if profile.has_permission(code, False):
            return
    except UserProfile.DoesNotExist:
        pass
    from ninja.errors import HttpError
    raise HttpError(403, "Keine Berechtigung")


def _set_ist_zugewiesen(veranstaltung, keycloak_id: str):
    if not keycloak_id:
        return
    zuweisung_ids = set(veranstaltung.zuweisungen.values_list('user_keycloak_id', flat=True))
    setattr(veranstaltung, 'ist_zugewiesen', keycloak_id in zuweisung_ids)


# ========== Benutzer für Zuweisung ==========

@veranstaltung_router.get("/benutzer", response=List[dict], auth=keycloak_auth)
def list_benutzer(request):
    """Benutzer für Zuweisung (Keycloak-User aus UserProfile) inkl. discord_id und bereiche."""
    users = UserProfile.objects.prefetch_related('bereiche').all()
    return [
        {
            'id': u.id,
            'keycloak_id': u.keycloak_id,
            'username': u.username,
            'email': u.email,
            'discord_id': u.discord_id,
            'bereiche': [{'id': b.id, 'name': b.name} for b in u.bereiche.all()],
        }
        for u in users
    ]


@veranstaltung_router.get("/taetigkeitsrollen", response=List[dict], auth=keycloak_auth)
def list_taetigkeitsrollen(request):
    """Verfügbare Tätigkeitsrollen für Zuweisungen."""
    return list(TaetigkeitsRolle.objects.values('id', 'name'))


# WICHTIG: Literal-Pfade VOR {id}-Parametern registrieren (sonst 422 statt 404)
@veranstaltung_router.get("/anhaenge/{anhang_id}/download", auth=keycloak_auth)
def download_anhang_early(request, anhang_id: int):
    """Anhang-Download mit Authentifizierung (vermeidet Keycloak-Redirect)."""
    from django.http import FileResponse, HttpResponseRedirect
    anhang = get_object_or_404(VeranstaltungAnhang, id=anhang_id)
    if anhang.datei:
        return FileResponse(anhang.datei.open('rb'), as_attachment=True, filename=anhang.name)
    elif anhang.url:
        return HttpResponseRedirect(anhang.url)
    return {"error": "Kein Inhalt"}, 404


# ========== Veranstaltungen CRUD ==========

@veranstaltung_router.get("", response=List[VeranstaltungListSchema], auth=keycloak_auth)
def list_veranstaltungen(request, q: Query[VeranstaltungFilterSchema] = None):
    require_permission(request, 'veranstaltung.view')
    filters = q.dict() if q else {}
    qs = Veranstaltung.objects.prefetch_related('zuweisungen').order_by('-datum_von')

    if filters.get('status'):
        qs = qs.filter(status=filters['status'])
    if filters.get('datum_von'):
        qs = qs.filter(datum_bis__date__gte=filters['datum_von'])
    if filters.get('datum_bis'):
        qs = qs.filter(datum_von__date__lte=filters['datum_bis'])
    if filters.get('suche'):
        s = filters['suche'].strip()
        qs = qs.filter(
            Q(titel__icontains=s) | Q(beschreibung__icontains=s) | Q(ort__icontains=s)
        )
    if filters.get('nur_meine'):
        kid = get_user_id(request)
        qs = qs.filter(zuweisungen__user_keycloak_id=kid).distinct()

    result = list(qs)
    kid = get_user_id(request)
    for v in result:
        _set_ist_zugewiesen(v, kid)
    return result


@veranstaltung_router.get("/meine", response=List[VeranstaltungListSchema], auth=keycloak_auth)
def list_meine_veranstaltungen(request):
    """Veranstaltungen, denen der aktuelle User zugewiesen ist (für Dashboard)."""
    require_permission(request, 'veranstaltung.view')
    kid = get_user_id(request)
    qs = Veranstaltung.objects.prefetch_related('zuweisungen').filter(
        zuweisungen__user_keycloak_id=kid
    ).distinct().order_by('datum_von')
    result = list(qs)
    for v in result:
        _set_ist_zugewiesen(v, kid)
    return result


@veranstaltung_router.get("/{id}", response=VeranstaltungSchema, auth=keycloak_auth)
def get_veranstaltung(request, id: int):
    require_permission(request, 'veranstaltung.view')
    v = get_object_or_404(
        Veranstaltung.objects.prefetch_related(
            'zuweisungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'
        ),
        id=id
    )
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


def _parse_datetime(value):
    """String aus datetime-local (YYYY-MM-DDTHH:mm) in timezone-aware datetime."""
    if value is None:
        return None
    if hasattr(value, 'isoformat'):
        return timezone.make_aware(value) if timezone.is_naive(value) else value
    if isinstance(value, str):
        try:
            # Unterstützt "YYYY-MM-DDTHH:mm" und ISO mit Z/+00:00
            parsed = dt.fromisoformat(value.replace('Z', '+00:00'))
            return timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed
        except (ValueError, TypeError):
            pass
    return value


@veranstaltung_router.post("", response=CreateVeranstaltungResponseSchema, auth=keycloak_auth)
def create_veranstaltung(request, payload: VeranstaltungCreateSchema):
    require_permission(request, 'veranstaltung.create')
    profile = get_or_create_profile(request)
    data = payload.dict()
    data['erstellt_von'] = profile.keycloak_id
    data['datum_von'] = _parse_datetime(data.get('datum_von')) or timezone.now()
    data['datum_bis'] = _parse_datetime(data.get('datum_bis')) or timezone.now()
    ausleihliste_id = data.pop('ausleihliste_id', None)
    if ausleihliste_id:
        from inventar.models import Ausleihliste
        data['ausleihliste'] = get_object_or_404(Ausleihliste, id=ausleihliste_id)
    else:
        data['ausleihliste'] = None
    v = Veranstaltung.objects.create(**data)
    return {"id": v.id, "titel": v.titel}


@veranstaltung_router.put("/{id}", response=VeranstaltungSchema, auth=keycloak_auth)
def update_veranstaltung(request, id: int, payload: VeranstaltungUpdateSchema):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung, id=id)
    data = payload.dict(exclude_unset=True)
    ausleihliste_id = data.pop('ausleihliste_id', None)
    if 'ausleihliste_id' in payload.dict():
        if ausleihliste_id:
            from inventar.models import Ausleihliste
            v.ausleihliste = get_object_or_404(Ausleihliste, id=ausleihliste_id)
        else:
            v.ausleihliste = None
    if 'datum_von' in data:
        data['datum_von'] = _parse_datetime(data['datum_von'])
    if 'datum_bis' in data:
        data['datum_bis'] = _parse_datetime(data['datum_bis'])
    for k, val in data.items():
        setattr(v, k, val)
    v.save()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.delete("/{id}", auth=keycloak_auth)
def delete_veranstaltung(request, id: int):
    require_permission(request, 'veranstaltung.delete')
    get_object_or_404(Veranstaltung, id=id).delete()
    return {"status": "deleted"}


# ========== Anwesenheit ==========

@veranstaltung_router.post("/{id}/anwesenheit/{liste_id}", auth=keycloak_auth)
def link_anwesenheit(request, id: int, liste_id: int):
    """Anwesenheitsliste mit Veranstaltung verknüpfen."""
    require_permission(request, 'veranstaltung.edit')
    from anwesenheit.models import AnwesenheitsListe
    v = get_object_or_404(Veranstaltung, id=id)
    liste = get_object_or_404(AnwesenheitsListe, id=liste_id)
    v.anwesenheitsliste = liste
    v.save(update_fields=['anwesenheitsliste'])
    return {"status": "linked", "liste_id": liste.id, "titel": liste.titel}


@veranstaltung_router.delete("/{id}/anwesenheit", auth=keycloak_auth)
def unlink_anwesenheit(request, id: int):
    """Anwesenheitsliste von Veranstaltung trennen."""
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung, id=id)
    v.anwesenheitsliste = None
    v.save(update_fields=['anwesenheitsliste'])
    return {"status": "unlinked"}


# ========== Zuweisungen ==========

@veranstaltung_router.post("/{id}/zuweisungen", response=VeranstaltungSchema, auth=keycloak_auth)
def add_zuweisung(request, id: int, payload: ZuweisungCreateSchema):
    require_permission(request, 'veranstaltung.zuweisungen')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    data = payload.dict()
    taetigkeit = None
    if data.get('taetigkeit_id'):
        taetigkeit = TaetigkeitsRolle.objects.filter(id=data['taetigkeit_id']).first()
    VeranstaltungZuweisung.objects.update_or_create(
        veranstaltung=v,
        user_keycloak_id=data['user_keycloak_id'],
        defaults={
            'user_username': data.get('user_username', ''),
            'user_email': data.get('user_email', ''),
            'taetigkeit': taetigkeit,
        }
    )

    # Discord-Channel-Zugriff automatisch gewähren
    if v.discord_channel_id:
        from . import discord_client
        try:
            profile = UserProfile.objects.get(keycloak_id=data['user_keycloak_id'])
            if profile.discord_id:
                discord_client.grant_channel_access(v.discord_channel_id, profile.discord_id)
        except UserProfile.DoesNotExist:
            pass

    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.delete("/{id}/zuweisungen/{user_keycloak_id}", response=VeranstaltungSchema, auth=keycloak_auth)
def remove_zuweisung(request, id: int, user_keycloak_id: str):
    require_permission(request, 'veranstaltung.zuweisungen')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)

    # Discord-Channel-Zugriff entziehen
    if v.discord_channel_id:
        from . import discord_client
        try:
            profile = UserProfile.objects.get(keycloak_id=user_keycloak_id)
            if profile.discord_id:
                discord_client.revoke_channel_access(v.discord_channel_id, profile.discord_id)
        except UserProfile.DoesNotExist:
            pass

    VeranstaltungZuweisung.objects.filter(veranstaltung=v, user_keycloak_id=user_keycloak_id).delete()
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Checkliste ==========

@veranstaltung_router.post("/{id}/checkliste", response=VeranstaltungSchema, auth=keycloak_auth)
def add_checkliste_item(request, id: int, payload: ChecklisteItemCreateSchema):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    VeranstaltungChecklisteItem.objects.create(
        veranstaltung=v,
        titel=payload.titel,
        sortierung=payload.sortierung,
    )
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.put("/{id}/checkliste/{item_id}", response=VeranstaltungSchema, auth=keycloak_auth)
def update_checkliste_item(request, id: int, item_id: int, payload: ChecklisteItemUpdateSchema):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    item = get_object_or_404(VeranstaltungChecklisteItem, veranstaltung=v, id=item_id)
    data = payload.dict(exclude_unset=True)
    if 'erledigt' in data and data['erledigt']:
        data['erledigt_am'] = timezone.now()
    elif 'erledigt' in data and not data['erledigt']:
        data['erledigt_am'] = None
    for k, val in data.items():
        setattr(item, k, val)
    item.save()
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.delete("/{id}/checkliste/{item_id}", response=VeranstaltungSchema, auth=keycloak_auth)
def delete_checkliste_item(request, id: int, item_id: int):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    get_object_or_404(VeranstaltungChecklisteItem, veranstaltung=v, id=item_id).delete()
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Notizen ==========

@veranstaltung_router.post("/{id}/notizen", response=VeranstaltungSchema, auth=keycloak_auth)
def add_notiz(request, id: int, payload: NotizCreateSchema):
    require_permission(request, 'veranstaltung.edit')
    profile = get_or_create_profile(request)
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    VeranstaltungNotiz.objects.create(
        veranstaltung=v,
        text=payload.text,
        created_by_keycloak_id=profile.keycloak_id,
        created_by_username=profile.username or '',
    )
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Anhänge ==========

@veranstaltung_router.post("/{id}/anhaenge", response=VeranstaltungSchema, auth=keycloak_auth)
def add_anhang(request, id: int, name: str = Form(''), url: str = Form(''), datei: UploadedFile = File(None)):
    require_permission(request, 'veranstaltung.edit')
    import hashlib
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    anhang_name = name or (datei.name if datei else 'Anhang')

    # Unique-Key generieren um Duplikate zu verhindern
    key_source = f"{v.id}:{anhang_name}:{url or ''}"
    if datei:
        key_source += f":{datei.name}:{datei.size}"
    unique_key = hashlib.sha256(key_source.encode()).hexdigest()[:64]

    # Prüfen ob Anhang mit diesem Key bereits existiert
    if VeranstaltungAnhang.objects.filter(unique_key=unique_key).exists():
        # Kein Fehler, einfach die vorhandene Veranstaltung zurückgeben
        v.refresh_from_db()
        _set_ist_zugewiesen(v, get_user_id(request))
        return v

    anhang = VeranstaltungAnhang(veranstaltung=v, name=anhang_name, url=url or '', unique_key=unique_key)
    if datei:
        anhang.datei = datei
    anhang.save()
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.delete("/{id}/anhaenge/{anhang_id}", response=VeranstaltungSchema, auth=keycloak_auth)
def delete_anhang(request, id: int, anhang_id: int):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    get_object_or_404(VeranstaltungAnhang, veranstaltung=v, id=anhang_id).delete()
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Erinnerungen ==========

@veranstaltung_router.post("/{id}/erinnerungen", response=VeranstaltungSchema, auth=keycloak_auth)
def add_erinnerung(request, id: int, payload: ErinnerungCreateSchema):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    VeranstaltungErinnerung.objects.create(
        veranstaltung=v,
        zeit_vorher=payload.zeit_vorher,
        einheit=payload.einheit,
    )
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.delete("/{id}/erinnerungen/{erinnerung_id}", response=VeranstaltungSchema, auth=keycloak_auth)
def delete_erinnerung(request, id: int, erinnerung_id: int):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    get_object_or_404(VeranstaltungErinnerung, veranstaltung=v, id=erinnerung_id).delete()
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Discord-Integration ==========

@veranstaltung_router.post("/{id}/discord/sync", auth=keycloak_auth)
def discord_sync(request, id: int):
    """
    Erstellt/aktualisiert Discord Event + Channel für diese Veranstaltung.
    Gibt allen zugewiesenen Usern (mit discord_id) Zugriff auf den Channel.
    Gibt Fehler zurück wenn User keine discord_id haben.
    """
    require_permission(request, 'veranstaltung.discord')
    from . import discord_client
    if not discord_client.is_configured():
        return {"success": False, "error": "Discord-Integration nicht konfiguriert"}

    v = get_object_or_404(
        Veranstaltung.objects.prefetch_related('zuweisungen', 'notizen'),
        id=id
    )

    errors = []
    synced_users = []

    # Discord-User-IDs der zugewiesenen Personen ermitteln
    zuweisungen = v.zuweisungen.all()
    for z in zuweisungen:
        try:
            profile = UserProfile.objects.get(keycloak_id=z.user_keycloak_id)
            if not profile.discord_id:
                errors.append(f"{z.user_username or z.user_keycloak_id}: Keine Discord-ID hinterlegt")
            else:
                synced_users.append({'username': z.user_username, 'discord_id': profile.discord_id})
        except UserProfile.DoesNotExist:
            errors.append(f"{z.user_username or z.user_keycloak_id}: Kein Profil gefunden")

    # Event erstellen wenn noch keins existiert
    if not v.discord_event_id:
        # Notizen als Event-Beschreibung
        notizen_texte = [n.text for n in v.notizen.all()]
        discord_description = '\n\n'.join(notizen_texte) if notizen_texte else v.beschreibung
        event_id, event_error = discord_client.create_scheduled_event(
            title=v.titel,
            start_time=v.datum_von.isoformat(),
            end_time=v.datum_bis.isoformat(),
            description=discord_description,
            location=v.ort,
        )
        if event_id:
            v.discord_event_id = event_id
            v.save(update_fields=['discord_event_id'])
        elif event_error:
            errors.append(f"Discord Event fehlgeschlagen: {event_error}")

    # Channel erstellen wenn noch keiner existiert
    if not v.discord_channel_id:
        channel_name = f"{v.titel}_{v.datum_von.year}"
        channel_id = discord_client.create_text_channel(
            name=channel_name,
            topic=f"Veranstaltung: {v.titel} ({v.datum_von.strftime('%d.%m.%Y')})",
        )
        if channel_id:
            v.discord_channel_id = channel_id
            v.save(update_fields=['discord_channel_id'])

    # Channel-Berechtigungen setzen
    if v.discord_channel_id:
        for user in synced_users:
            discord_client.grant_channel_access(v.discord_channel_id, user['discord_id'])

    return {
        "success": True,
        "discord_event_id": v.discord_event_id,
        "discord_channel_id": v.discord_channel_id,
        "synced_users": len(synced_users),
        "errors": errors,
    }


@veranstaltung_router.delete("/{id}/discord", auth=keycloak_auth)
def discord_cleanup(request, id: int):
    """Entfernt Discord Event und Channel für diese Veranstaltung."""
    require_permission(request, 'veranstaltung.discord')
    from . import discord_client
    v = get_object_or_404(Veranstaltung, id=id)

    if v.discord_event_id:
        discord_client.delete_scheduled_event(v.discord_event_id)
        v.discord_event_id = ''
    if v.discord_channel_id:
        discord_client.delete_channel(v.discord_channel_id)
        v.discord_channel_id = ''
    v.save(update_fields=['discord_event_id', 'discord_channel_id'])

    return {"success": True}


# ========== Zammad ==========

@veranstaltung_router.get("/zammad/tickets", response=List[dict], auth=keycloak_auth)
def zammad_list_tickets(request, page: int = 1, per_page: int = 50):
    """Zammad-Tickets abrufen (für Auswahl 'Aus Ticket erstellen')."""
    return zammad_client.list_tickets(page=page, per_page=per_page)


@veranstaltung_router.get("/zammad/tickets/{ticket_id}", response=dict, auth=keycloak_auth)
def zammad_get_ticket(request, ticket_id: int):
    """Einzelnes Zammad-Ticket abrufen."""
    t = zammad_client.get_ticket(ticket_id)
    if t is None:
        return {"error": "Ticket nicht gefunden"}, 404
    return t


@veranstaltung_router.post("/aus-zammad", response=VeranstaltungSchema, auth=keycloak_auth)
def create_aus_zammad(request, ticket_id: int):
    """Veranstaltung aus einem Zammad-Ticket anlegen."""
    require_permission(request, 'veranstaltung.create')
    t = zammad_client.get_ticket(ticket_id)
    if t is None:
        return {"error": "Ticket nicht gefunden"}, 404
    if Veranstaltung.objects.filter(zammad_ticket_id=ticket_id).exists():
        return {"error": "Zu diesem Ticket existiert bereits eine Veranstaltung"}, 400
    profile = get_or_create_profile(request)
    from datetime import timedelta
    created = t.get('created_at') or ''
    try:
        if 'T' in created:
            datum_start = dt.fromisoformat(created.replace('Z', '+00:00'))
            if timezone.is_naive(datum_start):
                datum_start = timezone.make_aware(datum_start)
        else:
            datum_start = timezone.now()
    except Exception:
        datum_start = timezone.now()
    datum_ende = datum_start + timedelta(hours=2)
    v = Veranstaltung.objects.create(
        titel=t.get('title') or f"Ticket #{t.get('number', ticket_id)}",
        beschreibung=t.get('title') or '',
        datum_von=datum_start,
        datum_bis=datum_ende,
        ort='',
        adresse='',
        status='planung',
        zammad_ticket_id=ticket_id,
        zammad_ticket_number=str(t.get('number') or ticket_id),
        erstellt_von=profile.keycloak_id,
    )
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Export ==========

@veranstaltung_router.get("/export/csv", auth=keycloak_auth)
def export_veranstaltungen_csv(request, filters: VeranstaltungFilterSchema = Query(None)):
    """Veranstaltungen als CSV exportieren."""
    require_permission(request, 'veranstaltung.view')
    filters = (filters or VeranstaltungFilterSchema()).dict()
    qs = Veranstaltung.objects.prefetch_related('zuweisungen').order_by('-datum_von')
    if filters.get('status'):
        qs = qs.filter(status=filters['status'])
    if filters.get('datum_von'):
        qs = qs.filter(datum_bis__date__gte=filters['datum_von'])
    if filters.get('datum_bis'):
        qs = qs.filter(datum_von__date__lte=filters['datum_bis'])
    if filters.get('nur_meine'):
        qs = qs.filter(zuweisungen__user_keycloak_id=get_user_id(request)).distinct()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['ID', 'Titel', 'Von', 'Bis', 'Ort', 'Status', 'Zammad-Ticket'])
    for v in qs:
        w.writerow([
            v.id,
            v.titel,
            v.datum_von.strftime('%Y-%m-%d %H:%M') if v.datum_von else '',
            v.datum_bis.strftime('%Y-%m-%d %H:%M') if v.datum_bis else '',
            v.ort or '',
            v.get_status_display(),
            v.zammad_ticket_number or '',
        ])
    response = HttpResponse(buf.getvalue(), content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="veranstaltungen.csv"'
    return response
