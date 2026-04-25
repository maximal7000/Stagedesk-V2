"""
Inventar & Ausleihe API v2
"""
import logging
from typing import List, Optional
from datetime import timedelta
from django.utils import timezone
from ninja import Router, Query, File, Schema
from ninja.files import UploadedFile
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count, F
from django.http import HttpResponse
from django.conf import settings
import csv
import io

from core.auth import keycloak_auth
from users.api import is_admin
from users.models import UserProfile
from .models import (
    InventarKategorie, Standort, Hersteller, Ausleiher,
    InventarItem, ItemQRCode, ItemSet, ItemSetPosition,
    Ausleihliste, AusleihePosition, Reservierung, GespeicherterFilter,
    AuditLog, ItemZustandsLog, ItemBild, MahnungsTemplate,
)
from .schemas import (
    KategorieSchema, KategorieCreateSchema,
    StandortSchema, StandortCreateSchema,
    HerstellerSchema, HerstellerCreateSchema,
    AusleiherSchema, AusleiherCreateSchema, AusleiherUpdateSchema,
    ItemSchema, ItemListSchema, ItemCreateSchema, ItemUpdateSchema, ItemFilterSchema,
    QRCodeSchema, QRCodeCreateSchema,
    ItemBildSchema,
    ItemSetSchema, ItemSetCreateSchema, ItemSetUpdateSchema,
    AusleiheListeSchema, AusleiheListeListSchema, AusleiheListeCreateSchema,
    AusleihePositionCreateSchema, BatchPositionenSchema, AktivierenSchema,
    RueckgabeSchema, SchnellRueckgabeSchema, AusleiheFilterSchema,
    ReservierungSchema, ReservierungCreateSchema,
    GespeicherterFilterSchema, GespeicherterFilterCreateSchema,
    AuditLogSchema, ZustandsLogSchema,
    MahnungsTemplateSchema, MahnungsTemplateCreateSchema,
)

logger = logging.getLogger(__name__)
inventar_router = Router(tags=["Inventar"])


def get_user_id(request) -> str:
    return request.auth.get('sub', '')


def get_username(request) -> str:
    return request.auth.get('preferred_username', '')


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


def log_action(request, aktion: str, entity_type: str, entity_id: int, entity_name: str = '', details: dict = None):
    """Erstellt einen Audit-Log-Eintrag."""
    AuditLog.objects.create(
        aktion=aktion,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        details=details or {},
        user_keycloak_id=get_user_id(request),
        user_username=get_username(request),
    )


def log_zustand(request, item, zustand_vorher: str, zustand_nachher: str, typ: str, ausleihliste=None, notizen: str = ''):
    """Erstellt einen Zustandslog-Eintrag."""
    if zustand_vorher != zustand_nachher:
        ItemZustandsLog.objects.create(
            item=item,
            zustand_vorher=zustand_vorher,
            zustand_nachher=zustand_nachher,
            typ=typ,
            ausleihliste=ausleihliste,
            notizen=notizen,
            user_keycloak_id=get_user_id(request),
            user_username=get_username(request),
        )


def check_item_conflicts(item_id: int, datum_von, datum_bis, exclude_reservierung_id: int = None):
    """Prüft ob ein Item im Zeitraum bereits reserviert/ausgeliehen ist."""
    conflicts = []
    # Aktive Reservierungen im Zeitraum
    qs = Reservierung.objects.filter(
        item_id=item_id,
        status__in=['aktiv', 'bestaetigt'],
        datum_von__lte=datum_bis,
        datum_bis__gte=datum_von,
    )
    if exclude_reservierung_id:
        qs = qs.exclude(id=exclude_reservierung_id)
    for r in qs:
        conflicts.append({
            'typ': 'reservierung',
            'id': r.id,
            'ausleiher': r.ausleiher_name,
            'von': str(r.datum_von),
            'bis': str(r.datum_bis),
        })
    # Aktive Ausleihen (Item ausgeliehen, Frist überlappt)
    aktive = AusleihePosition.objects.filter(
        item_id=item_id,
        ist_zurueckgegeben=False,
        ausleihliste__status__in=['aktiv', 'teilrueckgabe'],
    ).select_related('ausleihliste')
    for pos in aktive:
        conflicts.append({
            'typ': 'ausleihe',
            'id': pos.ausleihliste.id,
            'ausleiher': pos.ausleihliste.ausleiher_name,
            'von': str(pos.ausleihliste.erstellt_am.date()),
            'bis': str(pos.ausleihliste.frist) if pos.ausleihliste.frist else 'unbefristet',
        })
    return conflicts


# ========== Kategorien ==========

@inventar_router.get("/kategorien", response=List[KategorieSchema], auth=keycloak_auth)
def list_kategorien(request):
    return InventarKategorie.objects.select_related('parent').prefetch_related('items').all()


@inventar_router.post("/kategorien", response=KategorieSchema, auth=keycloak_auth)
def create_kategorie(request, payload: KategorieCreateSchema):
    require_permission(request, 'inventar.create')
    data = payload.dict()
    if data.get('parent_id'):
        data['parent'] = get_object_or_404(InventarKategorie, id=data.pop('parent_id'))
    else:
        data.pop('parent_id', None)
    return InventarKategorie.objects.create(**data)


@inventar_router.delete("/kategorien/{id}", auth=keycloak_auth)
def delete_kategorie(request, id: int):
    require_permission(request, 'inventar.delete')
    get_object_or_404(InventarKategorie, id=id).delete()
    return {"status": "deleted"}


# ========== Standorte ==========

@inventar_router.get("/standorte", response=List[StandortSchema], auth=keycloak_auth)
def list_standorte(request):
    return Standort.objects.filter(ist_aktiv=True).prefetch_related('items')


# Alias für Frontend-Kompatibilität
@inventar_router.get("/lagerorte", response=List[StandortSchema], auth=keycloak_auth)
def list_lagerorte(request):
    return list_standorte(request)


@inventar_router.post("/standorte", response=StandortSchema, auth=keycloak_auth)
def create_standort(request, payload: StandortCreateSchema):
    require_permission(request, 'inventar.create')
    return Standort.objects.create(**payload.dict())


@inventar_router.post("/lagerorte", response=StandortSchema, auth=keycloak_auth)
def create_lagerort(request, payload: StandortCreateSchema):
    return create_standort(request, payload)


@inventar_router.put("/standorte/{id}", response=StandortSchema, auth=keycloak_auth)
def update_standort(request, id: int, payload: StandortCreateSchema):
    require_permission(request, 'inventar.edit')
    s = get_object_or_404(Standort, id=id)
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(s, k, v)
    s.save()
    return s


@inventar_router.delete("/standorte/{id}", auth=keycloak_auth)
def delete_standort(request, id: int):
    require_permission(request, 'inventar.delete')
    s = get_object_or_404(Standort, id=id)
    s.ist_aktiv = False
    s.save()
    return {"status": "deactivated"}


# ========== Hersteller ==========

@inventar_router.get("/hersteller", response=List[HerstellerSchema], auth=keycloak_auth)
def list_hersteller(request):
    return Hersteller.objects.prefetch_related('items').all()


@inventar_router.post("/hersteller", response=HerstellerSchema, auth=keycloak_auth)
def create_hersteller(request, payload: HerstellerCreateSchema):
    require_permission(request, 'inventar.create')
    return Hersteller.objects.create(**payload.dict())


@inventar_router.delete("/hersteller/{id}", auth=keycloak_auth)
def delete_hersteller(request, id: int):
    require_permission(request, 'inventar.delete')
    get_object_or_404(Hersteller, id=id).delete()
    return {"status": "deleted"}


# ========== Ausleiher-Datenbank ==========

@inventar_router.get("/ausleiher", response=List[AusleiherSchema], auth=keycloak_auth)
def list_ausleiher(request, suche: Optional[str] = None):
    qs = Ausleiher.objects.filter(ist_aktiv=True)
    if suche:
        qs = qs.filter(Q(name__icontains=suche) | Q(organisation__icontains=suche))
    return qs


@inventar_router.post("/ausleiher", response=AusleiherSchema, auth=keycloak_auth)
def create_ausleiher(request, payload: AusleiherCreateSchema):
    require_permission(request, 'inventar.ausleihe')
    return Ausleiher.objects.create(**payload.dict())


@inventar_router.put("/ausleiher/{id}", response=AusleiherSchema, auth=keycloak_auth)
def update_ausleiher(request, id: int, payload: AusleiherUpdateSchema):
    require_permission(request, 'inventar.ausleihe')
    a = get_object_or_404(Ausleiher, id=id)
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(a, k, v)
    a.save()
    return a


@inventar_router.delete("/ausleiher/{id}", auth=keycloak_auth)
def delete_ausleiher(request, id: int):
    require_permission(request, 'inventar.ausleihe')
    a = get_object_or_404(Ausleiher, id=id)
    a.ist_aktiv = False
    a.save()
    return {"status": "deactivated"}


# ========== Items ==========

@inventar_router.get("/items", response=List[ItemListSchema], auth=keycloak_auth)
def list_items(request, filters: ItemFilterSchema = Query(...)):
    require_permission(request, 'inventar.view')
    qs = InventarItem.objects.select_related('kategorie', 'standort', 'hersteller').prefetch_related('qr_codes').filter(ist_aktiv=True)
    
    if filters.kategorie_id:
        qs = qs.filter(kategorie_id=filters.kategorie_id)
    if filters.standort_id:
        qs = qs.filter(standort_id=filters.standort_id)
    if filters.hersteller_id:
        qs = qs.filter(hersteller_id=filters.hersteller_id)
    if filters.status:
        qs = qs.filter(status=filters.status)
    if filters.suche:
        qs = qs.filter(
            Q(name__icontains=filters.suche) |
            Q(seriennummer__icontains=filters.suche) |
            Q(qr_codes__code__icontains=filters.suche)
        ).distinct()
    
    return qs


@inventar_router.get("/items/{id}", response=ItemSchema, auth=keycloak_auth)
def get_item(request, id: int):
    require_permission(request, 'inventar.view')
    return get_object_or_404(
        InventarItem.objects.select_related('kategorie', 'standort', 'hersteller').prefetch_related('qr_codes'),
        id=id
    )


@inventar_router.get("/items/qr/{qr_code}", response=ItemSchema, auth=keycloak_auth)
def get_item_by_qr(request, qr_code: str):
    """Item über QR-Code finden"""
    qr = get_object_or_404(ItemQRCode, code=qr_code)
    return get_item(request, qr.item.id)


@inventar_router.post("/items", response=ItemSchema, auth=keycloak_auth)
def create_item(request, payload: ItemCreateSchema):
    require_permission(request, 'inventar.create')
    data = payload.dict(exclude={'qr_codes'})

    # menge_verfuegbar = menge_gesamt bei Erstellung
    if 'menge_gesamt' in data:
        data['menge_verfuegbar'] = data['menge_gesamt']

    # Verknüpfungen
    for field in ['kategorie', 'standort', 'hersteller']:
        fk_id = data.pop(f'{field}_id', None)
        if fk_id:
            model = {'kategorie': InventarKategorie, 'standort': Standort, 'hersteller': Hersteller}[field]
            data[field] = get_object_or_404(model, id=fk_id)

    data['erstellt_von'] = get_user_id(request)
    item = InventarItem.objects.create(**data)

    # QR-Codes
    for qr_data in payload.qr_codes:
        ItemQRCode.objects.create(item=item, **qr_data.dict())

    log_action(request, 'erstellt', 'item', item.id, item.name)
    return get_item(request, item.id)


@inventar_router.put("/items/{id}", response=ItemSchema, auth=keycloak_auth)
def update_item(request, id: int, payload: ItemUpdateSchema):
    require_permission(request, 'inventar.edit')
    item = get_object_or_404(InventarItem, id=id)
    data = payload.dict(exclude_unset=True)
    old_status = item.status

    # Menge aktualisieren: Differenz auf menge_verfuegbar anwenden
    if 'menge_gesamt' in data and data['menge_gesamt'] != item.menge_gesamt:
        diff = data['menge_gesamt'] - item.menge_gesamt
        data['menge_verfuegbar'] = max(0, item.menge_verfuegbar + diff)

    for field in ['kategorie', 'standort', 'hersteller']:
        if f'{field}_id' in data:
            fk_id = data.pop(f'{field}_id')
            if fk_id:
                model = {'kategorie': InventarKategorie, 'standort': Standort, 'hersteller': Hersteller}[field]
                setattr(item, field, get_object_or_404(model, id=fk_id))
            else:
                setattr(item, field, None)

    for k, v in data.items():
        setattr(item, k, v)
    item.save()

    # Zustandslog bei Status-Änderung
    if 'status' in data and data['status'] != old_status:
        log_zustand(request, item, old_status, data['status'], 'manuell')

    log_action(request, 'aktualisiert', 'item', item.id, item.name)
    return get_item(request, item.id)


@inventar_router.delete("/items/{id}", auth=keycloak_auth)
def delete_item(request, id: int):
    require_permission(request, 'inventar.delete')
    item = get_object_or_404(InventarItem, id=id)
    item.ist_aktiv = False
    item.save()
    log_action(request, 'geloescht', 'item', item.id, item.name)
    return {"status": "deactivated"}


# ========== QR-Codes ==========

@inventar_router.post("/items/{item_id}/qr", response=QRCodeSchema, auth=keycloak_auth)
def add_qr_code(request, item_id: int, payload: QRCodeCreateSchema):
    require_permission(request, 'inventar.edit')
    item = get_object_or_404(InventarItem, id=item_id)
    return ItemQRCode.objects.create(item=item, **payload.dict())


@inventar_router.delete("/items/{item_id}/qr/{qr_id}", auth=keycloak_auth)
def delete_qr_code(request, item_id: int, qr_id: int):
    require_permission(request, 'inventar.edit')
    qr = get_object_or_404(ItemQRCode, id=qr_id, item_id=item_id)
    qr.delete()
    return {"status": "deleted"}


# ========== Item-Sets ==========

@inventar_router.get("/sets", response=List[ItemSetSchema], auth=keycloak_auth)
def list_sets(request):
    return ItemSet.objects.filter(ist_aktiv=True).prefetch_related('positionen__item')


@inventar_router.get("/sets/{id}", response=ItemSetSchema, auth=keycloak_auth)
def get_set(request, id: int):
    return get_object_or_404(ItemSet.objects.prefetch_related('positionen__item'), id=id)


@inventar_router.post("/sets", response=ItemSetSchema, auth=keycloak_auth)
def create_set(request, payload: ItemSetCreateSchema):
    require_permission(request, 'inventar.create')
    data = payload.dict(exclude={'positionen'})
    data['erstellt_von'] = get_user_id(request)
    item_set = ItemSet.objects.create(**data)
    
    for pos in payload.positionen:
        item = get_object_or_404(InventarItem, id=pos.get('item_id'))
        ItemSetPosition.objects.create(
            item_set=item_set,
            item=item,
            anzahl=pos.get('anzahl', 1),
            notizen=pos.get('notizen', '')
        )
    
    return get_set(request, item_set.id)


@inventar_router.put("/sets/{id}", response=ItemSetSchema, auth=keycloak_auth)
def update_set(request, id: int, payload: ItemSetUpdateSchema):
    require_permission(request, 'inventar.edit')
    item_set = get_object_or_404(ItemSet, id=id)
    data = payload.dict(exclude_unset=True, exclude={'positionen'})
    
    for k, v in data.items():
        setattr(item_set, k, v)
    item_set.save()
    
    # Positionen aktualisieren
    if payload.positionen is not None:
        item_set.positionen.all().delete()
        for pos in payload.positionen:
            item = get_object_or_404(InventarItem, id=pos.get('item_id'))
            ItemSetPosition.objects.create(
                item_set=item_set,
                item=item,
                anzahl=pos.get('anzahl', 1),
                notizen=pos.get('notizen', '')
            )
    
    return get_set(request, item_set.id)


@inventar_router.delete("/sets/{id}", auth=keycloak_auth)
def delete_set(request, id: int):
    require_permission(request, 'inventar.delete')
    s = get_object_or_404(ItemSet, id=id)
    s.ist_aktiv = False
    s.save()
    return {"status": "deactivated"}


# ========== Ausleihlisten ==========

@inventar_router.get("/ausleihlisten", response=List[AusleiheListeListSchema], auth=keycloak_auth)
def list_ausleihlisten(request, filters: AusleiheFilterSchema = Query(...)):
    qs = Ausleihliste.objects.prefetch_related('positionen').all()
    
    if filters.status:
        qs = qs.filter(status=filters.status)
    if filters.ausleiher:
        qs = qs.filter(
            Q(ausleiher_name__icontains=filters.ausleiher) |
            Q(ausleiher_organisation__icontains=filters.ausleiher)
        )
    if filters.nur_ueberfaellig:
        qs = qs.filter(status='aktiv', frist__lt=timezone.now().date())
    
    return qs


# Alias für Frontend-Kompatibilität
@inventar_router.get("/ausleihen", response=List[AusleiheListeListSchema], auth=keycloak_auth)
def list_ausleihen_alias(request, filters: AusleiheFilterSchema = Query(...)):
    return list_ausleihlisten(request, filters)


# WICHTIG: Literal-Pfade VOR {id}-Parametern registrieren
@inventar_router.get("/ausleihen/kalender", auth=keycloak_auth)
def ausleihe_kalender(request, monat: Optional[str] = None):
    """Ausleihen und Reservierungen für Kalenderansicht."""
    from datetime import date as date_cls
    if monat:
        try:
            jahr, mon = monat.split('-')
            start = date_cls(int(jahr), int(mon), 1)
        except (ValueError, IndexError):
            start = timezone.now().date().replace(day=1)
    else:
        start = timezone.now().date().replace(day=1)

    if start.month == 12:
        ende = date_cls(start.year + 1, 1, 1) - timedelta(days=1)
    else:
        ende = date_cls(start.year, start.month + 1, 1) - timedelta(days=1)

    ausleihen = list(
        Ausleihliste.objects.filter(
            status__in=['aktiv', 'teilrueckgabe'],
        ).values(
            'id', 'ausleiher_name', 'zweck', 'frist', 'status', 'erstellt_am'
        )
    )

    reservierungen = list(
        Reservierung.objects.filter(
            status__in=['aktiv', 'bestaetigt'],
            datum_bis__gte=start,
            datum_von__lte=ende,
        ).select_related('item').values(
            'id', 'item__name', 'item_id', 'ausleiher_name',
            'datum_von', 'datum_bis', 'zweck', 'status'
        )
    )

    return {
        "monat": str(start),
        "ausleihen": ausleihen,
        "reservierungen": reservierungen,
    }


@inventar_router.get("/ausleihlisten/{id}", response=AusleiheListeSchema, auth=keycloak_auth)
def get_ausleihliste(request, id: int):
    return get_object_or_404(
        Ausleihliste.objects.prefetch_related('positionen__item__qr_codes').select_related('ausleiher'),
        id=id
    )


@inventar_router.get("/ausleihen/{id}", response=AusleiheListeSchema, auth=keycloak_auth)
def get_ausleihe_alias(request, id: int):
    return get_ausleihliste(request, id)


@inventar_router.get("/ausleihlisten/veranstaltung/{veranstaltung_id}", response=List[AusleiheListeListSchema], auth=keycloak_auth)
def list_ausleihlisten_by_veranstaltung(request, veranstaltung_id: int):
    """Alle Ausleihlisten einer Veranstaltung."""
    return Ausleihliste.objects.filter(veranstaltung_id=veranstaltung_id).prefetch_related('positionen')


@inventar_router.post("/ausleihlisten/{id}/veranstaltung/{veranstaltung_id}", auth=keycloak_auth)
def link_ausleihliste_veranstaltung(request, id: int, veranstaltung_id: int):
    """Verknüpft eine bestehende Ausleihliste mit einer Veranstaltung."""
    require_permission(request, 'inventar.ausleihe')
    ausleihliste = get_object_or_404(Ausleihliste, id=id)
    from veranstaltung.models import Veranstaltung
    veranstaltung = get_object_or_404(Veranstaltung, id=veranstaltung_id)
    ausleihliste.veranstaltung = veranstaltung
    ausleihliste.save(update_fields=['veranstaltung'])
    log_action(request, 'aktualisiert', 'ausleihliste', ausleihliste.id,
               f'Ausleihliste mit Veranstaltung "{veranstaltung.titel}" verknüpft',
               {'veranstaltung_id': veranstaltung_id})
    return {"success": True}


@inventar_router.delete("/ausleihlisten/{id}/veranstaltung", auth=keycloak_auth)
def unlink_ausleihliste_veranstaltung(request, id: int):
    """Entfernt die Veranstaltungs-Verknüpfung einer Ausleihliste."""
    require_permission(request, 'inventar.ausleihe')
    ausleihliste = get_object_or_404(Ausleihliste, id=id)
    ausleihliste.veranstaltung = None
    ausleihliste.save(update_fields=['veranstaltung'])
    return {"success": True}


@inventar_router.post("/ausleihlisten", response=AusleiheListeSchema, auth=keycloak_auth)
def create_ausleihliste(request, payload: AusleiheListeCreateSchema):
    """Neue Ausleihliste erstellen. Ohne positionen = Status 'offen', Items später hinzufügen."""
    require_permission(request, 'inventar.ausleihe')
    data = payload.dict(exclude={'positionen'})

    # Ausleiher verknüpfen
    if data.get('ausleiher_id'):
        ausleiher = get_object_or_404(Ausleiher, id=data.pop('ausleiher_id'))
        data['ausleiher'] = ausleiher
        if not data.get('ausleiher_name'):
            data['ausleiher_name'] = ausleiher.name
        if not data.get('ausleiher_organisation'):
            data['ausleiher_organisation'] = ausleiher.organisation
    else:
        data.pop('ausleiher_id', None)

    # Veranstaltung verknüpfen
    if not data.get('veranstaltung_id'):
        data.pop('veranstaltung_id', None)

    data['erstellt_von'] = get_user_id(request)
    # Leere Liste = offen, sonst aktiv
    data['status'] = 'aktiv' if payload.positionen else 'offen'

    ausleihliste = Ausleihliste.objects.create(**data)

    # Positionen hinzufügen (falls vorhanden)
    for pos_data in payload.positionen:
        item = get_object_or_404(InventarItem, id=pos_data.item_id)
        anzahl = pos_data.anzahl if hasattr(pos_data, 'anzahl') else 1

        if not item.ist_verfuegbar:
            ausleihliste.delete()
            return {"error": f"Item '{item.name}' nicht verfügbar"}, 400

        AusleihePosition.objects.create(
            ausleihliste=ausleihliste,
            item=item,
            anzahl=anzahl,
            unterschrift=pos_data.unterschrift,
            zustand_ausleihe=pos_data.zustand_ausleihe,
            foto_ausleihe=pos_data.foto_ausleihe,
        )

        # Mengenbasiert oder Einzelstück
        if item.menge_gesamt > 1:
            item.menge_verfuegbar = max(0, item.menge_verfuegbar - anzahl)
            if item.menge_verfuegbar == 0:
                item.status = 'ausgeliehen'
        else:
            item.status = 'ausgeliehen'
        item.save()

        log_zustand(request, item, 'verfuegbar', item.status, 'ausleihe', ausleihliste)

    log_action(request, 'erstellt', 'ausleihliste', ausleihliste.id, f'Ausleihe an {ausleihliste.ausleiher_name}')
    return get_ausleihliste(request, ausleihliste.id)


@inventar_router.post("/ausleihlisten/{id}/positionen", response=AusleiheListeSchema, auth=keycloak_auth)
def add_position_ausleihliste(request, id: int, payload: AusleihePositionCreateSchema):
    """Item zu einer Ausleihliste hinzufügen (offen, aktiv oder teilrueckgabe)."""
    require_permission(request, 'inventar.ausleihe')
    liste = get_object_or_404(Ausleihliste, id=id)
    if liste.status not in ('offen', 'aktiv', 'teilrueckgabe'):
        return {"error": "Items können nur zu offenen oder aktiven Listen hinzugefügt werden"}, 400

    item = get_object_or_404(InventarItem, id=payload.item_id)
    if not item.ist_verfuegbar:
        return {"error": f"Item '{item.name}' nicht verfügbar"}, 400

    if item.menge_gesamt > 1:
        if payload.anzahl > item.menge_verfuegbar:
            return {"error": f"Nur {item.menge_verfuegbar} verfügbar"}, 400
    elif liste.positionen.filter(item_id=item.id).exists():
        return {"error": "Item ist bereits in der Liste"}, 400

    position = AusleihePosition.objects.create(
        ausleihliste=liste,
        item=item,
        anzahl=payload.anzahl,
        ausleiher_name=payload.ausleiher_name,
        ausleiher_ort=payload.ausleiher_ort,
        unterschrift=payload.unterschrift,
        zustand_ausleihe=payload.zustand_ausleihe,
        foto_ausleihe=payload.foto_ausleihe,
    )

    # Auto-Aktivierung: Bei offen → aktiv setzen; bei aktiv/teilrueckgabe → Item sofort als ausgeliehen
    was_offen = liste.status == 'offen'
    if was_offen:
        liste.status = 'aktiv'
        liste.save(update_fields=['status'])

    # Item als ausgeliehen markieren
    old_status = item.status
    if item.menge_gesamt > 1:
        item.menge_verfuegbar = max(0, item.menge_verfuegbar - position.anzahl)
        if item.menge_verfuegbar == 0:
            item.status = 'ausgeliehen'
    else:
        item.status = 'ausgeliehen'
    item.save()
    log_zustand(request, item, old_status, item.status, 'ausleihe', liste)

    return get_ausleihliste(request, liste.id)


@inventar_router.post("/ausleihlisten/{id}/positionen/batch", response=AusleiheListeSchema, auth=keycloak_auth)
def batch_add_positionen(request, id: int, payload: BatchPositionenSchema):
    """Mehrere Items gleichzeitig hinzufügen + auto-aktivieren."""
    require_permission(request, 'inventar.ausleihe')
    liste = get_object_or_404(Ausleihliste, id=id)
    if liste.status not in ('offen', 'aktiv', 'teilrueckgabe'):
        return {"error": "Items können nur zu offenen oder aktiven Listen hinzugefügt werden"}, 400

    was_offen = liste.status == 'offen'

    # Globale Signatur setzen
    if payload.unterschrift_ausleihe:
        liste.unterschrift_ausleihe = payload.unterschrift_ausleihe
        liste.save(update_fields=['unterschrift_ausleihe'])

    added = 0
    new_positions = []
    for pos in payload.positionen:
        item = InventarItem.objects.filter(id=pos.item_id, ist_aktiv=True).first()
        if not item or not item.ist_verfuegbar:
            continue
        if item.menge_gesamt > 1:
            if pos.anzahl > item.menge_verfuegbar:
                continue
        elif liste.positionen.filter(item_id=item.id).exists():
            continue

        position = AusleihePosition.objects.create(
            ausleihliste=liste,
            item=item,
            anzahl=pos.anzahl,
            ausleiher_name=pos.ausleiher_name,
            ausleiher_ort=pos.ausleiher_ort,
            unterschrift=pos.unterschrift,
            zustand_ausleihe=pos.zustand_ausleihe,
            foto_ausleihe=pos.foto_ausleihe,
        )
        new_positions.append(position)
        added += 1

    # Auto-Aktivierung + Items als ausgeliehen markieren
    if added > 0:
        if was_offen:
            liste.status = 'aktiv'
            liste.save(update_fields=['status'])
            # Bei Auto-Aktivierung: ALLE Positionen als ausgeliehen markieren (auch vorher hinzugefuegte)
            for pos in liste.positionen.select_related('item').all():
                item = pos.item
                old_status = item.status
                if item.menge_gesamt > 1:
                    item.menge_verfuegbar = max(0, item.menge_verfuegbar - pos.anzahl)
                    if item.menge_verfuegbar == 0:
                        item.status = 'ausgeliehen'
                else:
                    item.status = 'ausgeliehen'
                item.save()
                log_zustand(request, item, old_status, item.status, 'ausleihe', liste)
        else:
            # Bereits aktive Liste: nur neue Positionen als ausgeliehen markieren
            for pos in new_positions:
                item = pos.item
                old_status = item.status
                if item.menge_gesamt > 1:
                    item.menge_verfuegbar = max(0, item.menge_verfuegbar - pos.anzahl)
                    if item.menge_verfuegbar == 0:
                        item.status = 'ausgeliehen'
                else:
                    item.status = 'ausgeliehen'
                item.save()
                log_zustand(request, item, old_status, item.status, 'ausleihe', liste)

    log_action(request, 'aktualisiert', 'ausleihliste', liste.id,
               f'{added} Positionen hinzugefügt' + (' (auto-aktiviert)' if was_offen and added > 0 else ''))
    return get_ausleihliste(request, liste.id)


@inventar_router.delete("/ausleihlisten/{id}/positionen/{position_id}", auth=keycloak_auth)
def remove_position_ausleihliste(request, id: int, position_id: int):
    """Position aus offener Ausleihliste entfernen."""
    require_permission(request, 'inventar.ausleihe')
    liste = get_object_or_404(Ausleihliste, id=id)
    if liste.status != 'offen':
        return {"error": "Nur bei offenen Listen können Items entfernt werden"}, 400
    
    position = get_object_or_404(AusleihePosition, id=position_id, ausleihliste=liste)
    position.delete()
    return {"status": "deleted"}


@inventar_router.post("/ausleihlisten/{id}/aktivieren", response=AusleiheListeSchema, auth=keycloak_auth)
def aktivieren_ausleihliste(request, id: int, payload: AktivierenSchema = None):
    """Offene Ausleihliste aktivieren (Items als ausgeliehen markieren)."""
    require_permission(request, 'inventar.ausleihe')
    liste = get_object_or_404(
        Ausleihliste.objects.prefetch_related('positionen__item').select_related('ausleiher'),
        id=id
    )
    if liste.status != 'offen':
        return {"error": "Liste ist nicht offen"}, 400
    
    if liste.positionen.count() == 0:
        return {"error": "Mindestens ein Item hinzufügen"}, 400
    
    # Unterschrift setzen
    if payload:
        liste.unterschrift_ausleihe = payload.unterschrift_ausleihe or ''
        if payload.positionen_unterschriften:
            for po in payload.positionen_unterschriften:
                pos = liste.positionen.filter(item_id=po.get('item_id')).first()
                if pos:
                    pos.unterschrift = po.get('unterschrift', '')
                    pos.save()
        liste.save(update_fields=['unterschrift_ausleihe'])
    
    # Status aktiv, Items auf ausgeliehen
    liste.status = 'aktiv'
    liste.save(update_fields=['status'])

    for pos in liste.positionen.all():
        old_status = pos.item.status
        if pos.item.menge_gesamt > 1:
            pos.item.menge_verfuegbar = max(0, pos.item.menge_verfuegbar - pos.anzahl)
            if pos.item.menge_verfuegbar == 0:
                pos.item.status = 'ausgeliehen'
        else:
            pos.item.status = 'ausgeliehen'
        pos.item.save()
        log_zustand(request, pos.item, old_status, pos.item.status, 'ausleihe', liste)

    log_action(request, 'aktiviert', 'ausleihliste', liste.id, f'Ausleihe an {liste.ausleiher_name}')
    return get_ausleihliste(request, liste.id)


# Alias für Frontend
@inventar_router.post("/ausleihen", response=AusleiheListeSchema, auth=keycloak_auth)
def create_ausleihe_alias(request, payload: AusleiheListeCreateSchema):
    return create_ausleihliste(request, payload)


@inventar_router.post("/ausleihlisten/{id}/rueckgabe", response=AusleiheListeSchema, auth=keycloak_auth)
def rueckgabe(request, id: int, payload: RueckgabeSchema):
    """Rückgabe (komplett oder teilweise)"""
    require_permission(request, 'inventar.ausleihe')
    liste = get_object_or_404(Ausleihliste, id=id)
    
    liste.unterschrift_rueckgabe = payload.unterschrift_rueckgabe
    liste.notizen_rueckgabe = payload.notizen_rueckgabe
    liste.rueckgabe_zustand = payload.rueckgabe_zustand
    
    alle_zurueck = True
    
    for pos_update in payload.positionen:
        try:
            position = liste.positionen.get(item_id=pos_update.get('item_id'))
            position.ist_zurueckgegeben = True
            position.rueckgabe_am = timezone.now()
            zustand_rueckgabe = pos_update.get('zustand_rueckgabe', 'ok')
            position.zustand_rueckgabe = zustand_rueckgabe
            position.foto_rueckgabe = pos_update.get('foto_rueckgabe', '')
            position.rueckgabe_notizen = pos_update.get('rueckgabe_notizen', '')
            position.save()

            item = position.item
            old_status = item.status
            if item.menge_gesamt > 1:
                item.menge_verfuegbar = min(item.menge_gesamt, item.menge_verfuegbar + position.anzahl)
                if item.menge_verfuegbar > 0:
                    item.status = 'verfuegbar'
            else:
                item.status = 'verfuegbar'
            item.save()
            log_zustand(request, item, position.zustand_ausleihe, zustand_rueckgabe, 'rueckgabe', liste)
        except AusleihePosition.DoesNotExist:
            pass

    for pos in liste.positionen.all():
        if not pos.ist_zurueckgegeben:
            alle_zurueck = False
            break

    liste.status = 'teilrueckgabe'
    liste.save()

    log_action(request, 'zurueckgegeben', 'ausleihliste', liste.id, f'Rückgabe von {liste.ausleiher_name}',
               {'status': liste.status, 'alle_zurueck': alle_zurueck})
    return get_ausleihliste(request, liste.id)


# Alias für Frontend
@inventar_router.post("/ausleihen/{id}/rueckgabe", response=AusleiheListeSchema, auth=keycloak_auth)
def rueckgabe_alias(request, id: int, payload: RueckgabeSchema):
    return rueckgabe(request, id, payload)


@inventar_router.post("/schnellrueckgabe", auth=keycloak_auth)
def schnell_rueckgabe(request, payload: SchnellRueckgabeSchema):
    """Schnell-Rückgabe per QR-Code"""
    require_permission(request, 'inventar.ausleihe')
    try:
        qr = ItemQRCode.objects.get(code=payload.qr_code)
        item = qr.item
    except ItemQRCode.DoesNotExist:
        return {"error": "QR-Code nicht gefunden"}, 404
    
    if item.status != 'ausgeliehen':
        return {"error": "Item ist nicht ausgeliehen"}, 400
    
    # Finde aktive Ausleihe-Position
    position = AusleihePosition.objects.filter(
        item=item,
        ist_zurueckgegeben=False,
        ausleihliste__status='aktiv'
    ).first()
    
    if not position:
        # Keine Ausleihe gefunden, aber Status ist "ausgeliehen" - korrigieren
        item.status = 'verfuegbar'
        item.save()
        return {"status": "corrected", "message": "Item-Status korrigiert"}
    
    # Rückgabe durchführen
    position.ist_zurueckgegeben = True
    position.rueckgabe_am = timezone.now()
    position.zustand_rueckgabe = payload.zustand
    position.rueckgabe_notizen = payload.notizen
    position.save()

    if item.menge_gesamt > 1:
        item.menge_verfuegbar = min(item.menge_gesamt, item.menge_verfuegbar + position.anzahl)
        if item.menge_verfuegbar > 0:
            item.status = 'verfuegbar'
    else:
        item.status = 'verfuegbar'
    item.save()

    log_zustand(request, item, position.zustand_ausleihe, payload.zustand, 'rueckgabe', position.ausleihliste)
    
    # Prüfen ob alle Items der Liste zurück sind
    liste = position.ausleihliste
    alle_zurueck = not liste.positionen.filter(ist_zurueckgegeben=False).exists()
    
    liste.status = 'teilrueckgabe'
    liste.save()
    
    return {
        "status": "ok",
        "item_name": item.name,
        "ausleiher": liste.ausleiher_name,
        "liste_status": liste.status
    }


@inventar_router.post("/ausleihlisten/{id}/mahnung", auth=keycloak_auth)
def send_mahnung_endpoint(request, id: int):
    """Mahnung per E-Mail senden"""
    require_permission(request, 'inventar.ausleihe')
    liste = get_object_or_404(Ausleihliste, id=id)
    success, message = liste.send_mahnung()
    if success:
        log_action(request, 'mahnung', 'ausleihliste', liste.id, f'Mahnung an {liste.ausleiher_name}')
    return {"success": success, "message": message}


@inventar_router.post("/ausleihlisten/{id}/abschliessen", response=AusleiheListeSchema, auth=keycloak_auth)
def liste_abschliessen(request, id: int):
    """Liste manuell abschließen – nur wenn alle Positionen zurückgegeben sind."""
    require_permission(request, 'inventar.ausleihe')
    liste = get_object_or_404(Ausleihliste, id=id)

    if liste.status not in ('aktiv', 'teilrueckgabe'):
        return {"error": "Nur aktive Listen können abgeschlossen werden"}, 400

    offene = liste.positionen.filter(ist_zurueckgegeben=False).count()
    if offene > 0:
        return {"error": f"Es sind noch {offene} Positionen nicht zurückgegeben"}, 400

    liste.status = 'abgeschlossen'
    liste.rueckgabe_am = timezone.now()
    liste.save()

    log_action(request, 'abgeschlossen', 'ausleihliste', liste.id,
               f'Liste abgeschlossen: {liste.ausleiher_name or liste.titel}')
    return get_ausleihliste(request, liste.id)


class LeihscheinEmailSchema(Schema):
    email: str
    betreff: str = ''
    nachricht: str = ''
    pdf_base64: str  # Frontend-generiertes PDF als Base64


@inventar_router.post("/ausleihlisten/{id}/email", auth=keycloak_auth)
def send_leihschein_email(request, id: int, payload: LeihscheinEmailSchema):
    """Leihschein-PDF per E-Mail senden."""
    require_permission(request, 'inventar.ausleihe')
    import base64
    from django.core.mail import EmailMessage

    liste = get_object_or_404(Ausleihliste, id=id)

    betreff = payload.betreff or f'Leihschein #{liste.id} – {liste.titel or liste.ausleiher_name}'
    nachricht = payload.nachricht or f'Anbei der Leihschein für Ihre Ausleihe #{liste.id}.\n\nMit freundlichen Grüßen,\nStagedesk'

    try:
        pdf_data = base64.b64decode(payload.pdf_base64)
    except Exception:
        return {"success": False, "message": "Ungültige PDF-Daten"}

    email = EmailMessage(
        subject=betreff,
        body=nachricht,
        from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@stagedesk.de'),
        to=[payload.email],
    )
    email.attach(f'Leihschein_{liste.id}.pdf', pdf_data, 'application/pdf')

    try:
        email.send(fail_silently=False)
        log_action(request, 'mahnung', 'ausleihliste', liste.id,
                   f'Leihschein per E-Mail an {payload.email}',
                   {'email': payload.email})
        return {"success": True, "message": f"E-Mail an {payload.email} gesendet"}
    except Exception as e:
        return {"success": False, "message": str(e)}


@inventar_router.delete("/ausleihlisten/{id}", auth=keycloak_auth)
def cancel_ausleihliste(request, id: int):
    """Ausleihliste stornieren"""
    require_permission(request, 'inventar.ausleihe')
    liste = get_object_or_404(Ausleihliste, id=id)

    for pos in liste.positionen.filter(ist_zurueckgegeben=False):
        if pos.item.menge_gesamt > 1:
            pos.item.menge_verfuegbar = min(pos.item.menge_gesamt, pos.item.menge_verfuegbar + pos.anzahl)
            if pos.item.menge_verfuegbar > 0:
                pos.item.status = 'verfuegbar'
        else:
            pos.item.status = 'verfuegbar'
        pos.item.save()

    liste.status = 'abgebrochen'
    liste.save()

    log_action(request, 'geloescht', 'ausleihliste', liste.id, f'Ausleihe storniert: {liste.ausleiher_name}')
    return {"status": "cancelled"}


# ========== Reservierungen ==========

@inventar_router.get("/reservierungen", response=List[ReservierungSchema], auth=keycloak_auth)
def list_reservierungen(request, item_id: Optional[int] = None):
    qs = Reservierung.objects.select_related('item', 'ausleiher').filter(status__in=['aktiv', 'bestaetigt'])
    if item_id:
        qs = qs.filter(item_id=item_id)
    return qs


@inventar_router.post("/reservierungen", response=ReservierungSchema, auth=keycloak_auth)
def create_reservierung(request, payload: ReservierungCreateSchema):
    require_permission(request, 'inventar.ausleihe')
    data = payload.dict()

    item = get_object_or_404(InventarItem, id=data.pop('item_id'))
    data['item'] = item

    # Konflikterkennung
    conflicts = check_item_conflicts(item.id, data['datum_von'], data['datum_bis'])
    if conflicts:
        return {"error": "Konflikte im Zeitraum", "conflicts": conflicts}, 409

    if data.get('ausleiher_id'):
        ausleiher = get_object_or_404(Ausleiher, id=data.pop('ausleiher_id'))
        data['ausleiher'] = ausleiher
        if not data.get('ausleiher_name'):
            data['ausleiher_name'] = ausleiher.name
    else:
        data.pop('ausleiher_id', None)

    data['erstellt_von'] = get_user_id(request)

    res = Reservierung.objects.create(**data)
    log_action(request, 'erstellt', 'reservierung', res.id, f'{item.name} für {res.ausleiher_name}')
    return res


@inventar_router.delete("/reservierungen/{id}", auth=keycloak_auth)
def cancel_reservierung(request, id: int):
    require_permission(request, 'inventar.ausleihe')
    r = get_object_or_404(Reservierung, id=id)
    r.status = 'storniert'
    r.save()
    return {"status": "cancelled"}


# ========== Gespeicherte Filter ==========

@inventar_router.get("/filter", response=List[GespeicherterFilterSchema], auth=keycloak_auth)
def list_filter(request):
    return GespeicherterFilter.objects.filter(benutzer_id=get_user_id(request))


@inventar_router.post("/filter", response=GespeicherterFilterSchema, auth=keycloak_auth)
def create_filter(request, payload: GespeicherterFilterCreateSchema):
    return GespeicherterFilter.objects.create(
        benutzer_id=get_user_id(request),
        **payload.dict()
    )


@inventar_router.delete("/filter/{id}", auth=keycloak_auth)
def delete_filter(request, id: int):
    f = get_object_or_404(GespeicherterFilter, id=id, benutzer_id=get_user_id(request))
    f.delete()
    return {"status": "deleted"}


# ========== Export ==========

@inventar_router.get("/export/items", auth=keycloak_auth)
def export_items_csv(request, filters: ItemFilterSchema = Query(...)):
    """Inventar als CSV exportieren"""
    items = list_items(request, filters)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Name', 'Kategorie', 'Standort', 'Hersteller', 'Seriennummer', 'Status', 'QR-Code'])
    
    for item in items:
        writer.writerow([
            item.name,
            item.kategorie.name if item.kategorie else '',
            item.standort.name if item.standort else '',
            item.hersteller.name if item.hersteller else '',
            item.seriennummer,
            item.get_status_display(),
            item.haupt_qr_code or ''
        ])
    
    response = HttpResponse(output.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="inventar.csv"'
    return response


@inventar_router.get("/export/ausleihen", auth=keycloak_auth)
def export_ausleihen_csv(request, filters: AusleiheFilterSchema = Query(...)):
    """Ausleihen als CSV exportieren"""
    ausleihen = list_ausleihlisten(request, filters)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Ausleiher', 'Organisation', 'Zweck', 'Frist', 'Status', 'Items', 'Erstellt am'])
    
    for a in ausleihen:
        writer.writerow([
            a.id,
            a.ausleiher_name,
            a.ausleiher_organisation,
            a.zweck,
            a.frist.strftime('%d.%m.%Y') if a.frist else '',
            a.get_status_display(),
            a.anzahl_items,
            a.erstellt_am.strftime('%d.%m.%Y %H:%M')
        ])
    
    response = HttpResponse(output.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="ausleihen.csv"'
    return response


# ========== Statistiken ==========

@inventar_router.get("/stats", auth=keycloak_auth)
def get_stats(request):
    """Statistiken für Dashboard"""
    require_permission(request, 'inventar.view')
    from django.db.models import Count

    total_items = InventarItem.objects.filter(ist_aktiv=True).count()
    
    status_counts = dict(
        InventarItem.objects.filter(ist_aktiv=True)
        .values_list('status')
        .annotate(count=Count('id'))
    )
    
    aktive_ausleihen = Ausleihliste.objects.filter(status='aktiv').count()
    ueberfaellige = Ausleihliste.objects.filter(
        status='aktiv',
        frist__lt=timezone.now().date()
    ).count()
    
    # Überfällige Details für Dashboard
    ueberfaellige_liste = list(
        Ausleihliste.objects.filter(status='aktiv', frist__lt=timezone.now().date())
        .values('id', 'ausleiher_name', 'frist')[:10]
    )
    
    # Kategorien und Standorte Statistiken
    kategorien_stats = list(
        InventarKategorie.objects.annotate(
            count=Count('items', filter=Q(items__ist_aktiv=True))
        ).values('id', 'name', 'farbe', 'count')[:10]
    )
    
    standorte_stats = list(
        Standort.objects.filter(ist_aktiv=True).annotate(
            count=Count('items', filter=Q(items__ist_aktiv=True))
        ).values('id', 'name', 'count')[:10]
    )
    
    return {
        "total_items": total_items,
        "status_counts": status_counts,
        "aktive_ausleihen": aktive_ausleihen,
        "ueberfaellige_ausleihen": ueberfaellige,
        "ueberfaellige_liste": ueberfaellige_liste,
        "kategorien_stats": kategorien_stats,
        "standorte_stats": standorte_stats,
    }


# ========== Audit-Log ==========

@inventar_router.get("/audit-log", response=List[AuditLogSchema], auth=keycloak_auth)
def list_audit_log(request, entity_type: Optional[str] = None, entity_id: Optional[int] = None, limit: int = 50):
    """Audit-Log abrufen, optional gefiltert nach Entity."""
    require_permission(request, 'inventar.view')
    qs = AuditLog.objects.all()
    if entity_type:
        qs = qs.filter(entity_type=entity_type)
    if entity_id:
        qs = qs.filter(entity_id=entity_id)
    return qs[:limit]


# ========== Zustandslog ==========

@inventar_router.get("/items/{item_id}/zustandslog", response=List[ZustandsLogSchema], auth=keycloak_auth)
def list_zustandslog(request, item_id: int, limit: int = 50):
    """Zustandsveränderungen für ein Item abrufen."""
    item = get_object_or_404(InventarItem, id=item_id)
    return ItemZustandsLog.objects.filter(item=item)[:limit]


# ========== Item-Bilder ==========

@inventar_router.get("/items/{item_id}/bilder", response=List[ItemBildSchema], auth=keycloak_auth)
def list_item_bilder(request, item_id: int):
    """Bilder für ein Item auflisten."""
    item = get_object_or_404(InventarItem, id=item_id)
    return item.item_bilder.all()


@inventar_router.post("/items/{item_id}/bilder", response=ItemBildSchema, auth=keycloak_auth)
def upload_item_bild(request, item_id: int, bild: UploadedFile = File(...), ist_haupt: bool = False):
    """Bild für ein Item hochladen."""
    require_permission(request, 'inventar.edit')
    item = get_object_or_404(InventarItem, id=item_id)
    item_bild = ItemBild.objects.create(item=item, bild=bild, ist_haupt=ist_haupt)
    log_action(request, 'aktualisiert', 'item', item.id, item.name, {'aktion': 'Bild hochgeladen'})
    return item_bild


@inventar_router.delete("/items/{item_id}/bilder/{bild_id}", auth=keycloak_auth)
def delete_item_bild(request, item_id: int, bild_id: int):
    """Bild eines Items löschen."""
    require_permission(request, 'inventar.edit')
    bild = get_object_or_404(ItemBild, id=bild_id, item_id=item_id)
    bild.bild.delete(save=False)
    bild.delete()
    return {"status": "deleted"}


# ========== Item-Duplikation ==========

@inventar_router.post("/items/{item_id}/duplizieren", response=ItemSchema, auth=keycloak_auth)
def duplizieren_item(request, item_id: int):
    """Item kopieren mit neuem Namen."""
    require_permission(request, 'inventar.create')
    original = get_object_or_404(InventarItem, id=item_id)

    neues_item = InventarItem.objects.create(
        name=f"{original.name} (Kopie)",
        beschreibung=original.beschreibung,
        kategorie=original.kategorie,
        standort=original.standort,
        hersteller=original.hersteller,
        notizen=original.notizen,
        menge_gesamt=original.menge_gesamt,
        menge_verfuegbar=original.menge_gesamt,
        status='verfuegbar',
        erstellt_von=get_user_id(request),
    )

    log_action(request, 'dupliziert', 'item', neues_item.id, neues_item.name,
               {'original_id': original.id, 'original_name': original.name})
    return get_item(request, neues_item.id)


# ========== Bulk-Import ==========

@inventar_router.post("/import/items", auth=keycloak_auth)
def import_items_csv(request, datei: UploadedFile = File(...)):
    """Items aus CSV importieren. Spalten: Name,Seriennummer,Kategorie,Standort,Hersteller,Menge,Notizen"""
    require_permission(request, 'inventar.create')

    content = datei.read().decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(content))

    importiert = 0
    fehler = []

    for i, row in enumerate(reader, start=2):
        try:
            name = row.get('Name', '').strip()
            if not name:
                fehler.append(f"Zeile {i}: Name fehlt")
                continue

            # Kategorie auto-erstellen
            kategorie = None
            kat_name = row.get('Kategorie', '').strip()
            if kat_name:
                kategorie, _ = InventarKategorie.objects.get_or_create(name=kat_name)

            # Standort auto-erstellen
            standort = None
            standort_name = row.get('Standort', '').strip()
            if standort_name:
                standort, _ = Standort.objects.get_or_create(name=standort_name)

            # Hersteller auto-erstellen
            hersteller = None
            hersteller_name = row.get('Hersteller', '').strip()
            if hersteller_name:
                hersteller, _ = Hersteller.objects.get_or_create(name=hersteller_name)

            menge = int(row.get('Menge', '1').strip() or '1')

            item = InventarItem.objects.create(
                name=name,
                seriennummer=row.get('Seriennummer', '').strip(),
                kategorie=kategorie,
                standort=standort,
                hersteller=hersteller,
                menge_gesamt=menge,
                menge_verfuegbar=menge,
                notizen=row.get('Notizen', '').strip(),
                erstellt_von=get_user_id(request),
            )
            log_action(request, 'importiert', 'item', item.id, item.name)
            importiert += 1
        except Exception as e:
            fehler.append(f"Zeile {i}: {str(e)}")

    return {"importiert": importiert, "fehler": fehler}


# ========== Mahnungs-Templates ==========

@inventar_router.get("/mahnungs-templates", response=List[MahnungsTemplateSchema], auth=keycloak_auth)
def list_mahnungs_templates(request):
    """Alle Mahnungs-Templates auflisten."""
    return MahnungsTemplate.objects.all()


@inventar_router.post("/mahnungs-templates", response=MahnungsTemplateSchema, auth=keycloak_auth)
def create_mahnungs_template(request, payload: MahnungsTemplateCreateSchema):
    """Neues Mahnungs-Template erstellen."""
    if not is_admin(request):
        from ninja.errors import HttpError
        raise HttpError(403, "Nur Admins können Templates erstellen")
    data = payload.dict()
    if data.get('ist_standard'):
        MahnungsTemplate.objects.filter(ist_standard=True).update(ist_standard=False)
    return MahnungsTemplate.objects.create(**data)


@inventar_router.put("/mahnungs-templates/{tmpl_id}", response=MahnungsTemplateSchema, auth=keycloak_auth)
def update_mahnungs_template(request, tmpl_id: int, payload: MahnungsTemplateCreateSchema):
    """Mahnungs-Template aktualisieren."""
    if not is_admin(request):
        from ninja.errors import HttpError
        raise HttpError(403, "Nur Admins können Templates bearbeiten")
    tmpl = get_object_or_404(MahnungsTemplate, id=tmpl_id)
    data = payload.dict()
    if data.get('ist_standard'):
        MahnungsTemplate.objects.filter(ist_standard=True).exclude(id=tmpl_id).update(ist_standard=False)
    for k, v in data.items():
        setattr(tmpl, k, v)
    tmpl.save()
    return tmpl


@inventar_router.delete("/mahnungs-templates/{tmpl_id}", auth=keycloak_auth)
def delete_mahnungs_template(request, tmpl_id: int):
    """Mahnungs-Template löschen."""
    if not is_admin(request):
        from ninja.errors import HttpError
        raise HttpError(403, "Nur Admins können Templates löschen")
    get_object_or_404(MahnungsTemplate, id=tmpl_id).delete()
    return {"status": "deleted"}


# ========== Konflikterkennung ==========

@inventar_router.get("/items/{item_id}/konflikte", auth=keycloak_auth)
def get_item_konflikte(request, item_id: int, datum_von: str = None, datum_bis: str = None):
    """Konflikte für ein Item prüfen (Reservierungen + Ausleihen)."""
    from datetime import date
    item = get_object_or_404(InventarItem, id=item_id)
    von = date.fromisoformat(datum_von) if datum_von else timezone.now().date()
    bis = date.fromisoformat(datum_bis) if datum_bis else von + timedelta(days=30)
    conflicts = check_item_conflicts(item.id, von, bis)
    return {"item_id": item.id, "item_name": item.name, "konflikte": conflicts}


# ========== Set-Ausleihe ==========

@inventar_router.post("/sets/{set_id}/ausleihen", response=AusleiheListeSchema, auth=keycloak_auth)
def ausleihe_aus_set(request, set_id: int, payload: AusleiheListeCreateSchema):
    """Alle Items eines Sets als Ausleihliste erstellen."""
    require_permission(request, 'inventar.ausleihe')
    item_set = get_object_or_404(ItemSet.objects.prefetch_related('positionen__item'), id=set_id)

    # Verfügbarkeit aller Items prüfen
    nicht_verfuegbar = []
    for pos in item_set.positionen.all():
        if pos.item.menge_gesamt > 1:
            if pos.item.menge_verfuegbar < pos.anzahl:
                nicht_verfuegbar.append(f"{pos.item.name} (nur {pos.item.menge_verfuegbar} verfügbar)")
        elif not pos.item.ist_verfuegbar:
            nicht_verfuegbar.append(pos.item.name)
    if nicht_verfuegbar:
        return {"error": "Folgende Items nicht verfügbar", "items": nicht_verfuegbar}, 400

    # Ausleihliste erstellen
    data = payload.dict(exclude={'positionen'})
    if data.get('ausleiher_id'):
        ausleiher = get_object_or_404(Ausleiher, id=data.pop('ausleiher_id'))
        data['ausleiher'] = ausleiher
        if not data.get('ausleiher_name'):
            data['ausleiher_name'] = ausleiher.name
        if not data.get('ausleiher_organisation'):
            data['ausleiher_organisation'] = ausleiher.organisation
    else:
        data.pop('ausleiher_id', None)

    data['erstellt_von'] = get_user_id(request)
    data['status'] = 'offen'
    ausleihliste = Ausleihliste.objects.create(**data)

    # Positionen aus Set übernehmen
    for pos in item_set.positionen.all():
        AusleihePosition.objects.create(
            ausleihliste=ausleihliste,
            item=pos.item,
            anzahl=pos.anzahl,
        )

    log_action(request, 'erstellt', 'ausleihliste', ausleihliste.id,
               f'Ausleihe aus Set "{item_set.name}" an {ausleihliste.ausleiher_name}',
               {'set_id': item_set.id, 'set_name': item_set.name})
    return get_ausleihliste(request, ausleihliste.id)


# ========== Verfügbarkeit ==========

@inventar_router.get("/items/{item_id}/verfuegbarkeit", auth=keycloak_auth)
def get_item_verfuegbarkeit(request, item_id: int, tage: int = 30):
    """Verfügbarkeits-Timeline für ein Item (nächste X Tage)."""
    from datetime import date
    item = get_object_or_404(InventarItem, id=item_id)
    heute = timezone.now().date()
    bis = heute + timedelta(days=tage)

    # Reservierungen im Zeitraum
    reservierungen = list(
        Reservierung.objects.filter(
            item=item,
            status__in=['aktiv', 'bestaetigt'],
            datum_bis__gte=heute,
            datum_von__lte=bis,
        ).values('id', 'ausleiher_name', 'datum_von', 'datum_bis', 'zweck')
    )

    # Aktive Ausleihen
    ausleihen = list(
        AusleihePosition.objects.filter(
            item=item,
            ist_zurueckgegeben=False,
            ausleihliste__status__in=['aktiv', 'teilrueckgabe'],
        ).select_related('ausleihliste').values(
            'ausleihliste__id', 'ausleihliste__ausleiher_name',
            'ausleihliste__erstellt_am', 'ausleihliste__frist'
        )
    )

    return {
        "item_id": item.id,
        "item_name": item.name,
        "status": item.status,
        "menge_gesamt": item.menge_gesamt,
        "menge_verfuegbar": item.menge_verfuegbar,
        "reservierungen": reservierungen,
        "aktive_ausleihen": ausleihen,
    }


# ========== Erweiterte Statistiken ==========

@inventar_router.get("/stats/erweitert", auth=keycloak_auth)
def get_erweiterte_stats(request):
    """Erweiterte Statistiken für Dashboard und Charts."""
    from django.db.models.functions import TruncMonth
    from datetime import date

    heute = timezone.now().date()

    # Ausleihen pro Monat (letzte 12 Monate)
    vor_12_monaten = heute - timedelta(days=365)
    ausleihen_pro_monat = list(
        Ausleihliste.objects.filter(erstellt_am__gte=vor_12_monaten)
        .annotate(monat=TruncMonth('erstellt_am'))
        .values('monat')
        .annotate(anzahl=Count('id'))
        .order_by('monat')
    )

    # Top-Kategorien nach Ausleihhäufigkeit
    top_kategorien = list(
        InventarKategorie.objects.annotate(
            ausleihen=Count(
                'items__ausleihe_positionen',
                filter=Q(items__ist_aktiv=True)
            )
        ).values('id', 'name', 'farbe', 'ausleihen')
        .order_by('-ausleihen')[:10]
    )

    # Meistgeliehene Items (Top 10)
    top_items = list(
        InventarItem.objects.filter(ist_aktiv=True)
        .annotate(ausleihen_count=Count('ausleihe_positionen'))
        .values('id', 'name', 'ausleihen_count')
        .order_by('-ausleihen_count')[:10]
    )

    # Heute fällig
    heute_faellig = Ausleihliste.objects.filter(status='aktiv', frist=heute).count()

    # Diese Woche fällig
    woche_ende = heute + timedelta(days=(6 - heute.weekday()))
    woche_faellig = Ausleihliste.objects.filter(
        status='aktiv', frist__gte=heute, frist__lte=woche_ende
    ).count()

    # Items nach Status (Pie Chart)
    items_nach_status = dict(
        InventarItem.objects.filter(ist_aktiv=True)
        .values_list('status')
        .annotate(count=Count('id'))
    )

    return {
        "ausleihen_pro_monat": [
            {"monat": str(e['monat'].date()), "anzahl": e['anzahl']}
            for e in ausleihen_pro_monat
        ],
        "top_kategorien": top_kategorien,
        "top_items": top_items,
        "heute_faellig": heute_faellig,
        "woche_faellig": woche_faellig,
        "items_nach_status": items_nach_status,
    }


# ========== Bulk-Operationen ==========

@inventar_router.post("/items/bulk/status", auth=keycloak_auth)
def bulk_status_update(request, item_ids: List[int], status: str):
    """Status mehrerer Items ändern."""
    require_permission(request, 'inventar.edit')
    valid_status = [s[0] for s in InventarItem.STATUS_CHOICES]
    if status not in valid_status:
        return {"error": f"Ungültiger Status. Erlaubt: {valid_status}"}, 400

    items = InventarItem.objects.filter(id__in=item_ids, ist_aktiv=True)
    updated = 0
    for item in items:
        old_status = item.status
        item.status = status
        item.save()
        if old_status != status:
            log_zustand(request, item, old_status, status, 'manuell')
            log_action(request, 'status_geaendert', 'item', item.id, item.name,
                       {'von': old_status, 'zu': status})
        updated += 1

    return {"updated": updated}


@inventar_router.post("/items/bulk/delete", auth=keycloak_auth)
def bulk_delete_items(request, item_ids: List[int]):
    """Mehrere Items deaktivieren."""
    require_permission(request, 'inventar.delete')
    items = InventarItem.objects.filter(id__in=item_ids, ist_aktiv=True)
    count = 0
    for item in items:
        item.ist_aktiv = False
        item.save()
        log_action(request, 'geloescht', 'item', item.id, item.name)
        count += 1
    return {"deleted": count}


@inventar_router.post("/items/bulk/kategorie", auth=keycloak_auth)
def bulk_kategorie_update(request, item_ids: List[int], kategorie_id: int):
    """Kategorie mehrerer Items ändern."""
    require_permission(request, 'inventar.edit')
    kategorie = get_object_or_404(InventarKategorie, id=kategorie_id)
    updated = InventarItem.objects.filter(id__in=item_ids, ist_aktiv=True).update(kategorie=kategorie)
    return {"updated": updated}


@inventar_router.post("/ausleihen/bulk/abschliessen", auth=keycloak_auth)
def bulk_ausleihen_abschliessen(request, liste_ids: List[int]):
    """Mehrere Ausleihen abschließen (Rückgabe aller Items)."""
    require_permission(request, 'inventar.ausleihe')
    abgeschlossen = 0
    for liste_id in liste_ids:
        try:
            liste = Ausleihliste.objects.get(id=liste_id, status__in=['aktiv', 'teilrueckgabe'])
            for pos in liste.positionen.filter(ist_zurueckgegeben=False):
                pos.ist_zurueckgegeben = True
                pos.rueckgabe_am = timezone.now()
                pos.zustand_rueckgabe = 'ok'
                pos.save()
                if pos.item.menge_gesamt > 1:
                    pos.item.menge_verfuegbar = min(pos.item.menge_gesamt, pos.item.menge_verfuegbar + pos.anzahl)
                    if pos.item.menge_verfuegbar > 0:
                        pos.item.status = 'verfuegbar'
                else:
                    pos.item.status = 'verfuegbar'
                pos.item.save()
            liste.status = 'abgeschlossen'
            liste.rueckgabe_am = timezone.now()
            liste.save()
            log_action(request, 'zurueckgegeben', 'ausleihliste', liste.id, f'Bulk-Rückgabe: {liste.ausleiher_name}')
            abgeschlossen += 1
        except Ausleihliste.DoesNotExist:
            pass
    return {"abgeschlossen": abgeschlossen}
