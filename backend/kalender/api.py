"""
Kalender API - Events, Kategorien, Ressourcen
"""
from typing import List, Optional
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from ninja import Router, Query
from ninja.errors import HttpError
from django.shortcuts import get_object_or_404
from django.db.models import Q

from core.auth import keycloak_auth
from users.api import is_admin
from users.models import UserProfile
from .models import Event, EventKategorie, Ressource, EventRessource, EventErinnerung
from .schemas import (
    EventSchema, EventListSchema, EventCreateSchema, EventUpdateSchema, EventMoveSchema,
    EventKategorieSchema, EventKategorieCreateSchema, EventKategorieUpdateSchema,
    RessourceSchema, RessourceCreateSchema, RessourceUpdateSchema,
    EventRessourceCreateSchema, EventFilterSchema,
    RessourceVerfuegbarkeitSchema, VerfuegbarkeitResultSchema
)

kalender_router = Router(tags=["Kalender"])


def get_user_id(request) -> str:
    """Keycloak User ID aus Request"""
    return request.auth.get('sub', '')


def require_perm(request, code: str):
    if is_admin(request):
        return
    kid = request.auth.get('sub', '')
    try:
        if UserProfile.objects.get(keycloak_id=kid).has_permission(code, False):
            return
    except UserProfile.DoesNotExist:
        pass
    raise HttpError(403, "Keine Berechtigung")


# ========== Kategorien ==========

@kalender_router.get("/kategorien", response=List[EventKategorieSchema], auth=keycloak_auth)
def list_kategorien(request):
    """Alle Event-Kategorien auflisten"""
    require_perm(request, 'kalender.view')
    return EventKategorie.objects.filter(ist_aktiv=True)


@kalender_router.post("/kategorien", response=EventKategorieSchema, auth=keycloak_auth)
def create_kategorie(request, payload: EventKategorieCreateSchema):
    """Neue Kategorie erstellen"""
    require_perm(request, 'kalender.create')
    kategorie = EventKategorie.objects.create(**payload.dict())
    return kategorie


@kalender_router.put("/kategorien/{kategorie_id}", response=EventKategorieSchema, auth=keycloak_auth)
def update_kategorie(request, kategorie_id: int, payload: EventKategorieUpdateSchema):
    """Kategorie aktualisieren"""
    require_perm(request, 'kalender.edit')
    kategorie = get_object_or_404(EventKategorie, id=kategorie_id)

    for field, value in payload.dict(exclude_unset=True).items():
        setattr(kategorie, field, value)
    kategorie.save()

    return kategorie


@kalender_router.delete("/kategorien/{kategorie_id}", auth=keycloak_auth)
def delete_kategorie(request, kategorie_id: int):
    """Kategorie löschen (deaktivieren)"""
    require_perm(request, 'kalender.delete')
    kategorie = get_object_or_404(EventKategorie, id=kategorie_id)
    kategorie.ist_aktiv = False
    kategorie.save()
    return {"status": "deactivated"}


# ========== Ressourcen ==========

@kalender_router.get("/ressourcen", response=List[RessourceSchema], auth=keycloak_auth)
def list_ressourcen(request, typ: Optional[str] = None):
    """Alle Ressourcen auflisten"""
    require_perm(request, 'kalender.view')
    qs = Ressource.objects.all()
    if typ:
        qs = qs.filter(typ=typ)
    return qs


@kalender_router.get("/ressourcen/{ressource_id}", response=RessourceSchema, auth=keycloak_auth)
def get_ressource(request, ressource_id: int):
    """Ressource Details"""
    require_perm(request, 'kalender.view')
    return get_object_or_404(Ressource, id=ressource_id)


@kalender_router.post("/ressourcen", response=RessourceSchema, auth=keycloak_auth)
def create_ressource(request, payload: RessourceCreateSchema):
    """Neue Ressource erstellen"""
    require_perm(request, 'kalender.ressourcen')
    ressource = Ressource.objects.create(**payload.dict())
    return ressource


@kalender_router.put("/ressourcen/{ressource_id}", response=RessourceSchema, auth=keycloak_auth)
def update_ressource(request, ressource_id: int, payload: RessourceUpdateSchema):
    """Ressource aktualisieren"""
    require_perm(request, 'kalender.ressourcen')
    ressource = get_object_or_404(Ressource, id=ressource_id)

    for field, value in payload.dict(exclude_unset=True).items():
        setattr(ressource, field, value)
    ressource.save()

    return ressource


@kalender_router.delete("/ressourcen/{ressource_id}", auth=keycloak_auth)
def delete_ressource(request, ressource_id: int):
    """Ressource löschen"""
    require_perm(request, 'kalender.ressourcen')
    ressource = get_object_or_404(Ressource, id=ressource_id)
    ressource.delete()
    return {"status": "deleted"}


@kalender_router.post("/ressourcen/verfuegbarkeit", response=VerfuegbarkeitResultSchema, auth=keycloak_auth)
def check_verfuegbarkeit(request, payload: RessourceVerfuegbarkeitSchema):
    """Prüft ob eine Ressource in einem Zeitraum verfügbar ist"""
    require_perm(request, 'kalender.view')
    ressource = get_object_or_404(Ressource, id=payload.ressource_id)
    
    if not ressource.ist_verfuegbar:
        return {"verfuegbar": False, "grund": "Ressource ist generell nicht verfügbar", "konflikte": []}
    
    # Überlappende Buchungen finden
    buchungen = EventRessource.objects.filter(
        ressource=ressource,
        von__lt=payload.bis,
        bis__gt=payload.von
    ).select_related('event')
    
    if payload.ausgenommen_event_id:
        buchungen = buchungen.exclude(event_id=payload.ausgenommen_event_id)
    
    # Anzahl der gleichzeitigen Buchungen zählen
    total_gebucht = sum(b.anzahl for b in buchungen)
    
    if total_gebucht >= ressource.max_gleichzeitig:
        konflikte = [
            {
                "event_id": b.event.id,
                "event_titel": b.event.titel,
                "von": b.von.isoformat(),
                "bis": b.bis.isoformat(),
                "anzahl": b.anzahl
            }
            for b in buchungen
        ]
        return {
            "verfuegbar": False, 
            "grund": f"Ressource bereits {total_gebucht}x gebucht (max: {ressource.max_gleichzeitig})",
            "konflikte": konflikte
        }
    
    return {"verfuegbar": True, "grund": None, "konflikte": []}


# ========== Events ==========

@kalender_router.get("/events", response=List[EventListSchema], auth=keycloak_auth)
def list_events(request, filters: EventFilterSchema = Query(...)):
    """Events auflisten mit Filtern"""
    require_perm(request, 'kalender.view')
    qs = Event.objects.select_related('kategorie').all()
    
    if filters.start_ab:
        qs = qs.filter(start__gte=filters.start_ab)
    if filters.start_bis:
        qs = qs.filter(start__lte=filters.start_bis)
    if filters.kategorie_id:
        qs = qs.filter(kategorie_id=filters.kategorie_id)
    if filters.status:
        qs = qs.filter(status=filters.status)
    if filters.haushalt_id:
        qs = qs.filter(haushalt_id=filters.haushalt_id)
    if filters.ressource_id:
        qs = qs.filter(event_ressourcen__ressource_id=filters.ressource_id).distinct()
    
    return qs


@kalender_router.get("/events/{event_id}", response=EventSchema, auth=keycloak_auth)
def get_event(request, event_id: int):
    """Event Details"""
    require_perm(request, 'kalender.view')
    event = get_object_or_404(
        Event.objects.select_related('kategorie', 'haushalt')
        .prefetch_related('event_ressourcen__ressource'),
        id=event_id
    )
    return event


@kalender_router.post("/events", response=EventSchema, auth=keycloak_auth)
def create_event(request, payload: EventCreateSchema):
    """Neues Event erstellen"""
    require_perm(request, 'kalender.create')
    data = payload.dict(exclude={'ressourcen'})
    
    # Kategorie und Haushalt verknüpfen
    if data.get('kategorie_id'):
        data['kategorie'] = get_object_or_404(EventKategorie, id=data.pop('kategorie_id'))
    else:
        data.pop('kategorie_id', None)
        data['kategorie'] = None
    
    if data.get('haushalt_id'):
        from haushalte.models import Haushalt
        data['haushalt'] = get_object_or_404(Haushalt, id=data.pop('haushalt_id'))
    else:
        data.pop('haushalt_id', None)
        data['haushalt'] = None
    
    data['erstellt_von'] = get_user_id(request)
    
    event = Event.objects.create(**data)
    
    # Ressourcen hinzufügen
    for res_data in payload.ressourcen:
        EventRessource.objects.create(
            event=event,
            ressource_id=res_data.ressource_id,
            anzahl=res_data.anzahl,
            von=res_data.von or event.start,
            bis=res_data.bis or event.ende,
            kosten=res_data.kosten or 0,
            kosten_berechnet=res_data.kosten_berechnet,
            notizen=res_data.notizen
        )
    
    # Wiederholungen erstellen wenn gewünscht
    if event.wiederholung != 'keine' and event.wiederholung_ende:
        create_wiederholungen(event)
    
    return get_event(request, event.id)


def create_wiederholungen(parent_event: Event):
    """Erstellt Wiederholungen für ein Event"""
    current_start = parent_event.start
    current_ende = parent_event.ende
    duration = current_ende - current_start
    
    while True:
        # Nächstes Datum berechnen
        if parent_event.wiederholung == 'taeglich':
            current_start += timedelta(days=1)
        elif parent_event.wiederholung == 'woechentlich':
            current_start += timedelta(weeks=1)
        elif parent_event.wiederholung == 'monatlich':
            current_start += relativedelta(months=1)
        elif parent_event.wiederholung == 'jaehrlich':
            current_start += relativedelta(years=1)
        else:
            break
        
        current_ende = current_start + duration
        
        # Prüfen ob Ende erreicht
        if current_start.date() > parent_event.wiederholung_ende:
            break
        
        # Wiederholung erstellen
        Event.objects.create(
            titel=parent_event.titel,
            beschreibung=parent_event.beschreibung,
            kategorie=parent_event.kategorie,
            start=current_start,
            ende=current_ende,
            ganztaegig=parent_event.ganztaegig,
            ort=parent_event.ort,
            adresse=parent_event.adresse,
            status='geplant',
            wiederholung='keine',
            parent_event=parent_event,
            haushalt=parent_event.haushalt,
            geschaetztes_budget=parent_event.geschaetztes_budget,
            verantwortlicher=parent_event.verantwortlicher,
            teilnehmer_anzahl=parent_event.teilnehmer_anzahl,
            notizen=parent_event.notizen,
            erstellt_von=parent_event.erstellt_von,
        )


@kalender_router.put("/events/{event_id}", response=EventSchema, auth=keycloak_auth)
def update_event(request, event_id: int, payload: EventUpdateSchema):
    """Event aktualisieren"""
    require_perm(request, 'kalender.edit')
    event = get_object_or_404(Event, id=event_id)
    
    data = payload.dict(exclude_unset=True)
    
    # Kategorie und Haushalt verknüpfen
    if 'kategorie_id' in data:
        if data['kategorie_id']:
            event.kategorie = get_object_or_404(EventKategorie, id=data.pop('kategorie_id'))
        else:
            event.kategorie = None
            data.pop('kategorie_id')
    
    if 'haushalt_id' in data:
        if data['haushalt_id']:
            from haushalte.models import Haushalt
            event.haushalt = get_object_or_404(Haushalt, id=data.pop('haushalt_id'))
        else:
            event.haushalt = None
            data.pop('haushalt_id')
    
    for field, value in data.items():
        setattr(event, field, value)
    
    event.save()
    
    return get_event(request, event.id)


@kalender_router.patch("/events/{event_id}/move", response=EventSchema, auth=keycloak_auth)
def move_event(request, event_id: int, payload: EventMoveSchema):
    """Event verschieben (Drag & Drop)"""
    require_perm(request, 'kalender.edit')
    event = get_object_or_404(Event, id=event_id)
    
    event.start = payload.start
    event.ende = payload.ende
    event.save()
    
    # Event-Ressourcen auch anpassen
    for er in event.event_ressourcen.all():
        er.von = payload.start
        er.bis = payload.ende
        er.save()
    
    return get_event(request, event.id)


@kalender_router.delete("/events/{event_id}", auth=keycloak_auth)
def delete_event(request, event_id: int, mit_wiederholungen: bool = False):
    """Event löschen"""
    require_perm(request, 'kalender.delete')
    event = get_object_or_404(Event, id=event_id)
    
    if mit_wiederholungen:
        # Alle Wiederholungen löschen
        Event.objects.filter(parent_event=event).delete()
    
    event.delete()
    return {"status": "deleted"}


# ========== Event-Ressourcen ==========

@kalender_router.post("/events/{event_id}/ressourcen", response=EventSchema, auth=keycloak_auth)
def add_ressource_to_event(request, event_id: int, payload: EventRessourceCreateSchema):
    """Ressource zu Event hinzufügen"""
    require_perm(request, 'kalender.edit')
    event = get_object_or_404(Event, id=event_id)
    ressource = get_object_or_404(Ressource, id=payload.ressource_id)
    
    EventRessource.objects.create(
        event=event,
        ressource=ressource,
        anzahl=payload.anzahl,
        von=payload.von or event.start,
        bis=payload.bis or event.ende,
        kosten=payload.kosten or 0,
        kosten_berechnet=payload.kosten_berechnet,
        notizen=payload.notizen
    )
    
    return get_event(request, event.id)


@kalender_router.delete("/events/{event_id}/ressourcen/{buchung_id}", auth=keycloak_auth)
def remove_ressource_from_event(request, event_id: int, buchung_id: int):
    """Ressource von Event entfernen"""
    require_perm(request, 'kalender.edit')
    buchung = get_object_or_404(EventRessource, id=buchung_id, event_id=event_id)
    buchung.delete()
    return {"status": "deleted"}


# ========== iCal Export ==========

@kalender_router.get("/export/ical", auth=keycloak_auth)
def export_ical(request, filters: EventFilterSchema = Query(...)):
    """Events als iCal exportieren"""
    require_perm(request, 'kalender.view')
    from django.http import HttpResponse
    
    events = list_events(request, filters)
    
    ical = "BEGIN:VCALENDAR\r\n"
    ical += "VERSION:2.0\r\n"
    ical += "PRODID:-//Stagedesk//Kalender//DE\r\n"
    ical += "CALSCALE:GREGORIAN\r\n"
    ical += "METHOD:PUBLISH\r\n"
    
    for event in events:
        ical += "BEGIN:VEVENT\r\n"
        ical += f"UID:{event.id}@stagedesk\r\n"
        ical += f"DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}\r\n"
        ical += f"DTSTART:{event.start.strftime('%Y%m%dT%H%M%SZ')}\r\n"
        ical += f"DTEND:{event.ende.strftime('%Y%m%dT%H%M%SZ')}\r\n"
        ical += f"SUMMARY:{event.titel}\r\n"
        if event.ort:
            ical += f"LOCATION:{event.ort}\r\n"
        ical += "END:VEVENT\r\n"
    
    ical += "END:VCALENDAR\r\n"
    
    response = HttpResponse(ical, content_type='text/calendar')
    response['Content-Disposition'] = 'attachment; filename="stagedesk-kalender.ics"'
    return response
