"""
Inventar & Ausleihe API
"""
from typing import List, Optional
from datetime import datetime
from django.utils import timezone
from ninja import Router, Query
from django.shortcuts import get_object_or_404
from django.db.models import Q

from core.auth import keycloak_auth
from .models import InventarKategorie, Lagerort, InventarItem, Ausleihe, AusleihePosition, Wartung
from .schemas import (
    KategorieSchema, KategorieCreateSchema, KategorieUpdateSchema,
    LagerortSchema, LagerortCreateSchema,
    ItemSchema, ItemListSchema, ItemCreateSchema, ItemUpdateSchema, ItemFilterSchema,
    AusleiheSchema, AusleiheListSchema, AusleiheCreateSchema, AusleiheRueckgabeSchema, AusleiheFilterSchema,
    WartungSchema, WartungCreateSchema
)

inventar_router = Router(tags=["Inventar"])


def get_user_id(request) -> str:
    return request.auth.get('sub', '')


# ========== Kategorien ==========

@inventar_router.get("/kategorien", response=List[KategorieSchema], auth=keycloak_auth)
def list_kategorien(request):
    """Alle Kategorien auflisten"""
    return InventarKategorie.objects.select_related('parent').prefetch_related('items').all()


@inventar_router.post("/kategorien", response=KategorieSchema, auth=keycloak_auth)
def create_kategorie(request, payload: KategorieCreateSchema):
    data = payload.dict()
    if data.get('parent_id'):
        data['parent'] = get_object_or_404(InventarKategorie, id=data.pop('parent_id'))
    else:
        data.pop('parent_id', None)
    kategorie = InventarKategorie.objects.create(**data)
    return kategorie


@inventar_router.put("/kategorien/{kategorie_id}", response=KategorieSchema, auth=keycloak_auth)
def update_kategorie(request, kategorie_id: int, payload: KategorieUpdateSchema):
    kategorie = get_object_or_404(InventarKategorie, id=kategorie_id)
    data = payload.dict(exclude_unset=True)
    if 'parent_id' in data:
        if data['parent_id']:
            kategorie.parent = get_object_or_404(InventarKategorie, id=data.pop('parent_id'))
        else:
            kategorie.parent = None
            data.pop('parent_id')
    for field, value in data.items():
        setattr(kategorie, field, value)
    kategorie.save()
    return kategorie


@inventar_router.delete("/kategorien/{kategorie_id}", auth=keycloak_auth)
def delete_kategorie(request, kategorie_id: int):
    kategorie = get_object_or_404(InventarKategorie, id=kategorie_id)
    kategorie.delete()
    return {"status": "deleted"}


# ========== Lagerorte ==========

@inventar_router.get("/lagerorte", response=List[LagerortSchema], auth=keycloak_auth)
def list_lagerorte(request):
    return Lagerort.objects.filter(ist_aktiv=True).prefetch_related('items')


@inventar_router.post("/lagerorte", response=LagerortSchema, auth=keycloak_auth)
def create_lagerort(request, payload: LagerortCreateSchema):
    return Lagerort.objects.create(**payload.dict())


@inventar_router.delete("/lagerorte/{lagerort_id}", auth=keycloak_auth)
def delete_lagerort(request, lagerort_id: int):
    lagerort = get_object_or_404(Lagerort, id=lagerort_id)
    lagerort.ist_aktiv = False
    lagerort.save()
    return {"status": "deactivated"}


# ========== Items ==========

@inventar_router.get("/items", response=List[ItemListSchema], auth=keycloak_auth)
def list_items(request, filters: ItemFilterSchema = Query(...)):
    qs = InventarItem.objects.select_related('kategorie', 'lagerort').filter(ist_aktiv=True)
    
    if filters.kategorie_id:
        qs = qs.filter(kategorie_id=filters.kategorie_id)
    if filters.lagerort_id:
        qs = qs.filter(lagerort_id=filters.lagerort_id)
    if filters.status:
        qs = qs.filter(status=filters.status)
    if filters.zustand:
        qs = qs.filter(zustand=filters.zustand)
    if filters.suche:
        qs = qs.filter(
            Q(name__icontains=filters.suche) |
            Q(inventar_nr__icontains=filters.suche) |
            Q(seriennummer__icontains=filters.suche) |
            Q(qr_code__icontains=filters.suche)
        )
    
    return qs


@inventar_router.get("/items/{item_id}", response=ItemSchema, auth=keycloak_auth)
def get_item(request, item_id: int):
    return get_object_or_404(
        InventarItem.objects.select_related('kategorie', 'lagerort'),
        id=item_id
    )


@inventar_router.get("/items/qr/{qr_code}", response=ItemSchema, auth=keycloak_auth)
def get_item_by_qr(request, qr_code: str):
    """Item über QR-Code finden"""
    return get_object_or_404(
        InventarItem.objects.select_related('kategorie', 'lagerort'),
        qr_code=qr_code
    )


@inventar_router.post("/items", response=ItemSchema, auth=keycloak_auth)
def create_item(request, payload: ItemCreateSchema):
    data = payload.dict()
    
    if data.get('kategorie_id'):
        data['kategorie'] = get_object_or_404(InventarKategorie, id=data.pop('kategorie_id'))
    else:
        data.pop('kategorie_id', None)
    
    if data.get('lagerort_id'):
        data['lagerort'] = get_object_or_404(Lagerort, id=data.pop('lagerort_id'))
    else:
        data.pop('lagerort_id', None)
    
    data['erstellt_von'] = get_user_id(request)
    
    # Aktuellen Wert auf Kaufpreis setzen wenn nicht angegeben
    if not data.get('aktueller_wert') and data.get('kaufpreis'):
        data['aktueller_wert'] = data['kaufpreis']
    
    item = InventarItem.objects.create(**data)
    return get_item(request, item.id)


@inventar_router.put("/items/{item_id}", response=ItemSchema, auth=keycloak_auth)
def update_item(request, item_id: int, payload: ItemUpdateSchema):
    item = get_object_or_404(InventarItem, id=item_id)
    data = payload.dict(exclude_unset=True)
    
    if 'kategorie_id' in data:
        if data['kategorie_id']:
            item.kategorie = get_object_or_404(InventarKategorie, id=data.pop('kategorie_id'))
        else:
            item.kategorie = None
            data.pop('kategorie_id')
    
    if 'lagerort_id' in data:
        if data['lagerort_id']:
            item.lagerort = get_object_or_404(Lagerort, id=data.pop('lagerort_id'))
        else:
            item.lagerort = None
            data.pop('lagerort_id')
    
    for field, value in data.items():
        setattr(item, field, value)
    
    item.save()
    return get_item(request, item.id)


@inventar_router.delete("/items/{item_id}", auth=keycloak_auth)
def delete_item(request, item_id: int):
    item = get_object_or_404(InventarItem, id=item_id)
    item.ist_aktiv = False
    item.save()
    return {"status": "deactivated"}


# ========== Ausleihen ==========

@inventar_router.get("/ausleihen", response=List[AusleiheListSchema], auth=keycloak_auth)
def list_ausleihen(request, filters: AusleiheFilterSchema = Query(...)):
    qs = Ausleihe.objects.prefetch_related('positionen').all()
    
    if filters.status:
        qs = qs.filter(status=filters.status)
    if filters.ausleiher:
        qs = qs.filter(
            Q(ausleiher_name__icontains=filters.ausleiher) |
            Q(ausleiher_organisation__icontains=filters.ausleiher)
        )
    if filters.von:
        qs = qs.filter(ausleihe_von__gte=filters.von)
    if filters.bis:
        qs = qs.filter(ausleihe_bis__lte=filters.bis)
    if filters.item_id:
        qs = qs.filter(positionen__item_id=filters.item_id).distinct()
    if filters.nur_ueberfaellig:
        qs = qs.filter(status='aktiv', ausleihe_bis__lt=timezone.now())
    
    return qs


@inventar_router.get("/ausleihen/{ausleihe_id}", response=AusleiheSchema, auth=keycloak_auth)
def get_ausleihe(request, ausleihe_id: int):
    return get_object_or_404(
        Ausleihe.objects.prefetch_related('positionen__item').select_related('event'),
        id=ausleihe_id
    )


@inventar_router.post("/ausleihen", response=AusleiheSchema, auth=keycloak_auth)
def create_ausleihe(request, payload: AusleiheCreateSchema):
    """Neue Ausleihe erstellen"""
    data = payload.dict(exclude={'positionen'})
    
    if data.get('event_id'):
        from kalender.models import Event
        data['event'] = get_object_or_404(Event, id=data.pop('event_id'))
    else:
        data.pop('event_id', None)
    
    data['erstellt_von'] = get_user_id(request)
    data['status'] = 'aktiv'
    
    # Ausleihe erstellen
    ausleihe = Ausleihe.objects.create(**data)
    
    # Positionen hinzufügen
    for pos_data in payload.positionen:
        item = get_object_or_404(InventarItem, id=pos_data.item_id)
        
        # Prüfen ob Item ausleihbar
        if not item.ist_ausleihbar:
            ausleihe.delete()
            return {"error": f"Item '{item.name}' ist nicht ausleihbar (Status: {item.status})"}, 400
        
        # Position erstellen
        AusleihePosition.objects.create(
            ausleihe=ausleihe,
            item=item,
            menge=pos_data.menge,
            zustand_ausleihe=pos_data.zustand_ausleihe or item.zustand,
            notizen=pos_data.notizen,
            unterschrift=pos_data.unterschrift,
        )
        
        # Item-Status aktualisieren
        item.status = 'ausgeliehen'
        item.save()
    
    return get_ausleihe(request, ausleihe.id)


@inventar_router.post("/ausleihen/{ausleihe_id}/rueckgabe", response=AusleiheSchema, auth=keycloak_auth)
def rueckgabe_ausleihe(request, ausleihe_id: int, payload: AusleiheRueckgabeSchema):
    """Rückgabe einer Ausleihe (komplett oder teilweise)"""
    ausleihe = get_object_or_404(Ausleihe, id=ausleihe_id)
    
    ausleihe.unterschrift_rueckgabe = payload.unterschrift_rueckgabe
    ausleihe.notizen_rueckgabe = payload.notizen_rueckgabe
    
    alle_zurueck = True
    
    for pos_update in payload.positionen:
        try:
            position = ausleihe.positionen.get(item_id=pos_update.get('item_id'))
            position.ist_zurueckgegeben = True
            position.rueckgabe_am = timezone.now()
            position.zustand_rueckgabe = pos_update.get('zustand_rueckgabe', '')
            if pos_update.get('notizen'):
                position.notizen = pos_update.get('notizen')
            position.save()
            
            # Item-Status und Zustand aktualisieren
            item = position.item
            item.status = 'verfuegbar'
            if position.zustand_rueckgabe:
                item.zustand = position.zustand_rueckgabe
            item.save()
        except AusleihePosition.DoesNotExist:
            pass
    
    # Prüfen ob alle Positionen zurück sind
    for position in ausleihe.positionen.all():
        if not position.ist_zurueckgegeben:
            alle_zurueck = False
            break
    
    if alle_zurueck:
        ausleihe.status = 'zurueckgegeben'
        ausleihe.tatsaechliche_rueckgabe = timezone.now()
    else:
        ausleihe.status = 'teilrueckgabe'
    
    ausleihe.save()
    
    return get_ausleihe(request, ausleihe.id)


@inventar_router.delete("/ausleihen/{ausleihe_id}", auth=keycloak_auth)
def cancel_ausleihe(request, ausleihe_id: int):
    """Ausleihe abbrechen"""
    ausleihe = get_object_or_404(Ausleihe, id=ausleihe_id)
    
    # Items wieder freigeben
    for position in ausleihe.positionen.all():
        if not position.ist_zurueckgegeben:
            position.item.status = 'verfuegbar'
            position.item.save()
    
    ausleihe.status = 'abgebrochen'
    ausleihe.save()
    
    return {"status": "cancelled"}


# ========== Wartung ==========

@inventar_router.get("/wartungen", response=List[WartungSchema], auth=keycloak_auth)
def list_wartungen(request, item_id: Optional[int] = None):
    qs = Wartung.objects.select_related('item').all()
    if item_id:
        qs = qs.filter(item_id=item_id)
    return qs[:100]


@inventar_router.post("/wartungen", response=WartungSchema, auth=keycloak_auth)
def create_wartung(request, payload: WartungCreateSchema):
    data = payload.dict()
    item = get_object_or_404(InventarItem, id=data.pop('item_id'))
    
    data['item'] = item
    data['erstellt_von'] = get_user_id(request)
    
    wartung = Wartung.objects.create(**data)
    
    # Item aktualisieren
    item.letzte_wartung = wartung.datum
    if wartung.zustand_nachher:
        item.zustand = wartung.zustand_nachher
    # Nächste Wartung berechnen
    from datetime import timedelta
    item.naechste_wartung = wartung.datum + timedelta(days=item.wartungsintervall_tage)
    item.save()
    
    return wartung


# ========== Statistiken ==========

@inventar_router.get("/stats", auth=keycloak_auth)
def get_stats(request):
    """Inventar-Statistiken"""
    from django.db.models import Count, Sum
    
    total_items = InventarItem.objects.filter(ist_aktiv=True).count()
    total_wert = InventarItem.objects.filter(ist_aktiv=True).aggregate(Sum('aktueller_wert'))['aktueller_wert__sum'] or 0
    
    status_counts = dict(
        InventarItem.objects.filter(ist_aktiv=True)
        .values_list('status')
        .annotate(count=Count('id'))
    )
    
    zustand_counts = dict(
        InventarItem.objects.filter(ist_aktiv=True)
        .values_list('zustand')
        .annotate(count=Count('id'))
    )
    
    aktive_ausleihen = Ausleihe.objects.filter(status='aktiv').count()
    ueberfaellige_ausleihen = Ausleihe.objects.filter(status='aktiv', ausleihe_bis__lt=timezone.now()).count()
    
    wartung_faellig = InventarItem.objects.filter(
        ist_aktiv=True,
        naechste_wartung__lte=timezone.now().date()
    ).count()
    
    return {
        "total_items": total_items,
        "total_wert": float(total_wert),
        "status_counts": status_counts,
        "zustand_counts": zustand_counts,
        "aktive_ausleihen": aktive_ausleihen,
        "ueberfaellige_ausleihen": ueberfaellige_ausleihen,
        "wartung_faellig": wartung_faellig,
    }
