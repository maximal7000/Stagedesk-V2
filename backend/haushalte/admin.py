"""
Django Admin-Konfiguration für Haushalts-Management
"""
from django.contrib import admin
from .models import Haushalt, Artikel, Kategorie


@admin.register(Haushalt)
class HaushaltAdmin(admin.ModelAdmin):
    list_display = ('name', 'benutzer_id', 'budget_konsumitiv', 'budget_investiv', 'gesamt_ausgaben', 'verbleibendes_budget', 'erstellt_am')
    list_filter = ('erstellt_am', 'benutzer_id')
    search_fields = ('name', 'benutzer_id', 'beschreibung')
    readonly_fields = ('erstellt_am', 'aktualisiert_am', 'gesamt_konsumitiv', 'gesamt_investiv', 'gesamt_ausgaben', 'verbleibendes_budget_konsumitiv', 'verbleibendes_budget_investiv', 'verbleibendes_budget', 'gesamt_budget')
    
    fieldsets = (
        ('Allgemein', {
            'fields': ('name', 'beschreibung', 'benutzer_id')
        }),
        ('Budgets', {
            'fields': ('budget_konsumitiv', 'budget_investiv', 'gesamt_budget')
        }),
        ('Statistiken', {
            'fields': ('gesamt_konsumitiv', 'gesamt_investiv', 'gesamt_ausgaben', 'verbleibendes_budget_konsumitiv', 'verbleibendes_budget_investiv', 'verbleibendes_budget')
        }),
        ('Zeitstempel', {
            'fields': ('erstellt_am', 'aktualisiert_am')
        }),
    )


@admin.register(Kategorie)
class KategorieAdmin(admin.ModelAdmin):
    list_display = ('name', 'icon', 'farbe')
    search_fields = ('name', 'beschreibung')


@admin.register(Artikel)
class ArtikelAdmin(admin.ModelAdmin):
    list_display = ('name', 'haushalt', 'preis', 'anzahl', 'gesamtpreis', 'kategorie', 'erstellt_am')
    list_filter = ('kategorie', 'erstellt_am', 'haushalt', 'tag_kategorie')
    search_fields = ('name', 'beschreibung', 'haushalt__name')
    readonly_fields = ('erstellt_am', 'aktualisiert_am', 'gesamtpreis')
    
    fieldsets = (
        ('Allgemein', {
            'fields': ('haushalt', 'name', 'beschreibung')
        }),
        ('Preis & Anzahl', {
            'fields': ('preis', 'anzahl', 'gesamtpreis', 'kategorie')
        }),
        ('Zusatzinformationen', {
            'fields': ('tag_kategorie', 'link', 'bild_url', 'gekauft_am')
        }),
        ('Zeitstempel', {
            'fields': ('erstellt_am', 'aktualisiert_am')
        }),
    )
