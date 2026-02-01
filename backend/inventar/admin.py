from django.contrib import admin
from .models import InventarKategorie, Lagerort, InventarItem, Ausleihe, AusleihePosition, Wartung


@admin.register(InventarKategorie)
class InventarKategorieAdmin(admin.ModelAdmin):
    list_display = ['name', 'parent', 'farbe', 'sortierung']
    list_filter = ['parent']
    search_fields = ['name']


@admin.register(Lagerort)
class LagerortAdmin(admin.ModelAdmin):
    list_display = ['name', 'ist_aktiv']
    list_filter = ['ist_aktiv']


class WartungInline(admin.TabularInline):
    model = Wartung
    extra = 0


@admin.register(InventarItem)
class InventarItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'inventar_nr', 'kategorie', 'status', 'zustand', 'lagerort', 'menge']
    list_filter = ['status', 'zustand', 'kategorie', 'lagerort']
    search_fields = ['name', 'inventar_nr', 'seriennummer', 'qr_code']
    readonly_fields = ['qr_code', 'inventar_nr']
    inlines = [WartungInline]


class AusleihePositionInline(admin.TabularInline):
    model = AusleihePosition
    extra = 0
    readonly_fields = ['item']


@admin.register(Ausleihe)
class AusleiheAdmin(admin.ModelAdmin):
    list_display = ['id', 'ausleiher_name', 'status', 'ausleihe_von', 'ausleihe_bis', 'anzahl_items']
    list_filter = ['status']
    search_fields = ['ausleiher_name', 'ausleiher_organisation']
    inlines = [AusleihePositionInline]


@admin.register(Wartung)
class WartungAdmin(admin.ModelAdmin):
    list_display = ['item', 'typ', 'datum', 'kosten']
    list_filter = ['typ']
    date_hierarchy = 'datum'
