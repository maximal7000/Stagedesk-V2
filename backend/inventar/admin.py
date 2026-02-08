from django.contrib import admin
from .models import (
    InventarKategorie, Standort, Hersteller, Ausleiher,
    InventarItem, ItemQRCode, ItemSet, ItemSetPosition,
    Ausleihliste, AusleihePosition, Reservierung, GespeicherterFilter
)


@admin.register(InventarKategorie)
class InventarKategorieAdmin(admin.ModelAdmin):
    list_display = ['name', 'parent', 'farbe']
    list_filter = ['parent']


@admin.register(Standort)
class StandortAdmin(admin.ModelAdmin):
    list_display = ['name', 'ist_aktiv']


@admin.register(Hersteller)
class HerstellerAdmin(admin.ModelAdmin):
    list_display = ['name', 'website']
    search_fields = ['name']


@admin.register(Ausleiher)
class AusleiherAdmin(admin.ModelAdmin):
    list_display = ['name', 'organisation', 'email', 'ist_aktiv']
    search_fields = ['name', 'organisation']


class ItemQRCodeInline(admin.TabularInline):
    model = ItemQRCode
    extra = 1


@admin.register(InventarItem)
class InventarItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'kategorie', 'standort', 'hersteller', 'status']
    list_filter = ['status', 'kategorie', 'standort', 'hersteller']
    search_fields = ['name', 'seriennummer']
    inlines = [ItemQRCodeInline]


class ItemSetPositionInline(admin.TabularInline):
    model = ItemSetPosition
    extra = 1


@admin.register(ItemSet)
class ItemSetAdmin(admin.ModelAdmin):
    list_display = ['name', 'anzahl_items', 'ist_aktiv']
    inlines = [ItemSetPositionInline]


class AusleihePositionInline(admin.TabularInline):
    model = AusleihePosition
    extra = 0


@admin.register(Ausleihliste)
class AusleihelisteAdmin(admin.ModelAdmin):
    list_display = ['id', 'ausleiher_name', 'status', 'frist', 'anzahl_items']
    list_filter = ['status', 'modus']
    inlines = [AusleihePositionInline]


@admin.register(Reservierung)
class ReservierungAdmin(admin.ModelAdmin):
    list_display = ['item', 'ausleiher_name', 'datum_von', 'datum_bis', 'status']
    list_filter = ['status']
