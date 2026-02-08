"""
Inventar & Ausleihe API v2
"""
from typing import List, Optional
from django.utils import timezone
from ninja import Router, Query, File
from ninja.files import UploadedFile
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.http import HttpResponse
import csv
import io

from core.auth import keycloak_auth
from .models import (
    InventarKategorie, Standort, Hersteller, Ausleiher,
    InventarItem, ItemQRCode, ItemSet, ItemSetPosition,
    Ausleihliste, AusleihePosition, Reservierung, GespeicherterFilter
)
from .schemas import (
    KategorieSchema, KategorieCreateSchema,
    StandortSchema, StandortCreateSchema,
    HerstellerSchema, HerstellerCreateSchema,
    AusleiherSchema, AusleiherCreateSchema, AusleiherUpdateSchema,
    ItemSchema, ItemListSchema, ItemCreateSchema, ItemUpdateSchema, ItemFilterSchema,
    QRCodeSchema, QRCodeCreateSchema,
    ItemSetSchema, ItemSetCreateSchema, ItemSetUpdateSchema,
    AusleiheListeSchema, AusleiheListeListSchema, AusleiheListeCreateSchema,
    AusleihePositionCreateSchema, AktivierenSchema,
    RueckgabeSchema, SchnellRueckgabeSchema, AusleiheFilterSchema,
    ReservierungSchema, ReservierungCreateSchema,
    GespeicherterFilterSchema, GespeicherterFilterCreateSchema
)

inventar_router = Router(tags=["Inventar"])


def get_user_id(request) -> str:
    return request.auth.get('sub', '')


# ========== Kategorien ==========

@inventar_router.get("/kategorien", response=List[KategorieSchema], auth=keycloak_auth)
def list_kategorien(request):
    return InventarKategorie.objects.select_related('parent').prefetch_related('items').all()


@inventar_router.post("/kategorien", response=KategorieSchema, auth=keycloak_auth)
def create_kategorie(request, payload: KategorieCreateSchema):
    data = payload.dict()
    if data.get('parent_id'):
        data['parent'] = get_object_or_404(InventarKategorie, id=data.pop('parent_id'))
    else:
        data.pop('parent_id', None)
    return InventarKategorie.objects.create(**data)


@inventar_router.delete("/kategorien/{id}", auth=keycloak_auth)
def delete_kategorie(request, id: int):
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
    return Standort.objects.create(**payload.dict())


@inventar_router.post("/lagerorte", response=StandortSchema, auth=keycloak_auth)
def create_lagerort(request, payload: StandortCreateSchema):
    return create_standort(request, payload)


@inventar_router.put("/standorte/{id}", response=StandortSchema, auth=keycloak_auth)
def update_standort(request, id: int, payload: StandortCreateSchema):
    s = get_object_or_404(Standort, id=id)
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(s, k, v)
    s.save()
    return s


@inventar_router.delete("/standorte/{id}", auth=keycloak_auth)
def delete_standort(request, id: int):
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
    return Hersteller.objects.create(**payload.dict())


@inventar_router.delete("/hersteller/{id}", auth=keycloak_auth)
def delete_hersteller(request, id: int):
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
    return Ausleiher.objects.create(**payload.dict())


@inventar_router.put("/ausleiher/{id}", response=AusleiherSchema, auth=keycloak_auth)
def update_ausleiher(request, id: int, payload: AusleiherUpdateSchema):
    a = get_object_or_404(Ausleiher, id=id)
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(a, k, v)
    a.save()
    return a


@inventar_router.delete("/ausleiher/{id}", auth=keycloak_auth)
def delete_ausleiher(request, id: int):
    a = get_object_or_404(Ausleiher, id=id)
    a.ist_aktiv = False
    a.save()
    return {"status": "deactivated"}


# ========== Items ==========

@inventar_router.get("/items", response=List[ItemListSchema], auth=keycloak_auth)
def list_items(request, filters: ItemFilterSchema = Query(...)):
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
    data = payload.dict(exclude={'qr_codes'})
    
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
    
    return get_item(request, item.id)


@inventar_router.put("/items/{id}", response=ItemSchema, auth=keycloak_auth)
def update_item(request, id: int, payload: ItemUpdateSchema):
    item = get_object_or_404(InventarItem, id=id)
    data = payload.dict(exclude_unset=True)
    
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
    
    return get_item(request, item.id)


@inventar_router.delete("/items/{id}", auth=keycloak_auth)
def delete_item(request, id: int):
    item = get_object_or_404(InventarItem, id=id)
    item.ist_aktiv = False
    item.save()
    return {"status": "deactivated"}


# ========== QR-Codes ==========

@inventar_router.post("/items/{item_id}/qr", response=QRCodeSchema, auth=keycloak_auth)
def add_qr_code(request, item_id: int, payload: QRCodeCreateSchema):
    item = get_object_or_404(InventarItem, id=item_id)
    return ItemQRCode.objects.create(item=item, **payload.dict())


@inventar_router.delete("/items/{item_id}/qr/{qr_id}", auth=keycloak_auth)
def delete_qr_code(request, item_id: int, qr_id: int):
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


@inventar_router.get("/ausleihlisten/{id}", response=AusleiheListeSchema, auth=keycloak_auth)
def get_ausleihliste(request, id: int):
    return get_object_or_404(
        Ausleihliste.objects.prefetch_related('positionen__item__qr_codes').select_related('ausleiher'),
        id=id
    )


@inventar_router.get("/ausleihen/{id}", response=AusleiheListeSchema, auth=keycloak_auth)
def get_ausleihe_alias(request, id: int):
    return get_ausleihliste(request, id)


@inventar_router.post("/ausleihlisten", response=AusleiheListeSchema, auth=keycloak_auth)
def create_ausleihliste(request, payload: AusleiheListeCreateSchema):
    """Neue Ausleihliste erstellen. Ohne positionen = Status 'offen', Items später hinzufügen."""
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
    
    data['erstellt_von'] = get_user_id(request)
    # Leere Liste = offen, sonst aktiv
    data['status'] = 'aktiv' if payload.positionen else 'offen'
    
    ausleihliste = Ausleihliste.objects.create(**data)
    
    # Positionen hinzufügen (falls vorhanden)
    for pos_data in payload.positionen:
        item = get_object_or_404(InventarItem, id=pos_data.item_id)
        
        if not item.ist_verfuegbar:
            ausleihliste.delete()
            return {"error": f"Item '{item.name}' nicht verfügbar"}, 400
        
        AusleihePosition.objects.create(
            ausleihliste=ausleihliste,
            item=item,
            unterschrift=pos_data.unterschrift,
            zustand_ausleihe=pos_data.zustand_ausleihe,
            foto_ausleihe=pos_data.foto_ausleihe,
        )
        
        item.status = 'ausgeliehen'
        item.save()
    
    return get_ausleihliste(request, ausleihliste.id)


@inventar_router.post("/ausleihlisten/{id}/positionen", response=AusleiheListeSchema, auth=keycloak_auth)
def add_position_ausleihliste(request, id: int, payload: AusleihePositionCreateSchema):
    """Item zu einer offenen Ausleihliste hinzufügen."""
    liste = get_object_or_404(Ausleihliste, id=id)
    if liste.status != 'offen':
        return {"error": "Nur bei offenen Listen können Items hinzugefügt werden"}, 400
    
    item = get_object_or_404(InventarItem, id=payload.item_id)
    if not item.ist_verfuegbar:
        return {"error": f"Item '{item.name}' nicht verfügbar"}, 400
    
    if liste.positionen.filter(item_id=item.id).exists():
        return {"error": "Item ist bereits in der Liste"}, 400
    
    AusleihePosition.objects.create(
        ausleihliste=liste,
        item=item,
        unterschrift=payload.unterschrift,
        zustand_ausleihe=payload.zustand_ausleihe,
        foto_ausleihe=payload.foto_ausleihe,
    )
    return get_ausleihliste(request, liste.id)


@inventar_router.delete("/ausleihlisten/{id}/positionen/{position_id}", auth=keycloak_auth)
def remove_position_ausleihliste(request, id: int, position_id: int):
    """Position aus offener Ausleihliste entfernen."""
    liste = get_object_or_404(Ausleihliste, id=id)
    if liste.status != 'offen':
        return {"error": "Nur bei offenen Listen können Items entfernt werden"}, 400
    
    position = get_object_or_404(AusleihePosition, id=position_id, ausleihliste=liste)
    position.delete()
    return {"status": "deleted"}


@inventar_router.post("/ausleihlisten/{id}/aktivieren", response=AusleiheListeSchema, auth=keycloak_auth)
def aktivieren_ausleihliste(request, id: int, payload: AktivierenSchema = None):
    """Offene Ausleihliste aktivieren (Items als ausgeliehen markieren)."""
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
        pos.item.status = 'ausgeliehen'
        pos.item.save()
    
    return get_ausleihliste(request, liste.id)


# Alias für Frontend
@inventar_router.post("/ausleihen", response=AusleiheListeSchema, auth=keycloak_auth)
def create_ausleihe_alias(request, payload: AusleiheListeCreateSchema):
    return create_ausleihliste(request, payload)


@inventar_router.post("/ausleihlisten/{id}/rueckgabe", response=AusleiheListeSchema, auth=keycloak_auth)
def rueckgabe(request, id: int, payload: RueckgabeSchema):
    """Rückgabe (komplett oder teilweise)"""
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
            position.zustand_rueckgabe = pos_update.get('zustand_rueckgabe', 'ok')
            position.foto_rueckgabe = pos_update.get('foto_rueckgabe', '')
            position.rueckgabe_notizen = pos_update.get('rueckgabe_notizen', '')
            position.save()
            
            item = position.item
            item.status = 'verfuegbar'
            item.save()
        except AusleihePosition.DoesNotExist:
            pass
    
    for pos in liste.positionen.all():
        if not pos.ist_zurueckgegeben:
            alle_zurueck = False
            break
    
    liste.status = 'abgeschlossen' if alle_zurueck else 'teilrueckgabe'
    if alle_zurueck:
        liste.rueckgabe_am = timezone.now()
    liste.save()
    
    return get_ausleihliste(request, liste.id)


# Alias für Frontend
@inventar_router.post("/ausleihen/{id}/rueckgabe", response=AusleiheListeSchema, auth=keycloak_auth)
def rueckgabe_alias(request, id: int, payload: RueckgabeSchema):
    return rueckgabe(request, id, payload)


@inventar_router.post("/schnellrueckgabe", auth=keycloak_auth)
def schnell_rueckgabe(request, payload: SchnellRueckgabeSchema):
    """Schnell-Rückgabe per QR-Code"""
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
    
    item.status = 'verfuegbar'
    item.save()
    
    # Prüfen ob alle Items der Liste zurück sind
    liste = position.ausleihliste
    alle_zurueck = not liste.positionen.filter(ist_zurueckgegeben=False).exists()
    
    if alle_zurueck:
        liste.status = 'abgeschlossen'
        liste.rueckgabe_am = timezone.now()
    else:
        liste.status = 'teilrueckgabe'
    liste.save()
    
    return {
        "status": "ok",
        "item_name": item.name,
        "ausleiher": liste.ausleiher_name,
        "liste_status": liste.status
    }


@inventar_router.post("/ausleihlisten/{id}/mahnung", auth=keycloak_auth)
def send_mahnung(request, id: int):
    """Mahnung per E-Mail senden"""
    liste = get_object_or_404(Ausleihliste, id=id)
    success, message = liste.send_mahnung()
    return {"success": success, "message": message}


@inventar_router.delete("/ausleihlisten/{id}", auth=keycloak_auth)
def cancel_ausleihliste(request, id: int):
    """Ausleihliste stornieren"""
    liste = get_object_or_404(Ausleihliste, id=id)
    
    for pos in liste.positionen.filter(ist_zurueckgegeben=False):
        pos.item.status = 'verfuegbar'
        pos.item.save()
    
    liste.status = 'abgebrochen'
    liste.save()
    
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
    data = payload.dict()
    
    item = get_object_or_404(InventarItem, id=data.pop('item_id'))
    data['item'] = item
    
    if data.get('ausleiher_id'):
        ausleiher = get_object_or_404(Ausleiher, id=data.pop('ausleiher_id'))
        data['ausleiher'] = ausleiher
        if not data.get('ausleiher_name'):
            data['ausleiher_name'] = ausleiher.name
    else:
        data.pop('ausleiher_id', None)
    
    data['erstellt_von'] = get_user_id(request)
    
    return Reservierung.objects.create(**data)


@inventar_router.delete("/reservierungen/{id}", auth=keycloak_auth)
def cancel_reservierung(request, id: int):
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
