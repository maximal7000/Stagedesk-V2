from django.contrib import admin
from .models import Event, EventKategorie, Ressource, EventRessource, EventErinnerung


@admin.register(EventKategorie)
class EventKategorieAdmin(admin.ModelAdmin):
    list_display = ['name', 'farbe', 'ist_aktiv', 'sortierung']
    list_filter = ['ist_aktiv']
    search_fields = ['name']


@admin.register(Ressource)
class RessourceAdmin(admin.ModelAdmin):
    list_display = ['name', 'typ', 'ist_verfuegbar', 'kosten_pro_tag', 'kosten_pro_stunde']
    list_filter = ['typ', 'ist_verfuegbar']
    search_fields = ['name', 'beschreibung']


class EventRessourceInline(admin.TabularInline):
    model = EventRessource
    extra = 0


class EventErinnerungInline(admin.TabularInline):
    model = EventErinnerung
    extra = 0


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ['titel', 'start', 'ende', 'kategorie', 'status', 'ort']
    list_filter = ['status', 'kategorie', 'wiederholung']
    search_fields = ['titel', 'beschreibung', 'ort']
    date_hierarchy = 'start'
    inlines = [EventRessourceInline, EventErinnerungInline]


@admin.register(EventRessource)
class EventRessourceAdmin(admin.ModelAdmin):
    list_display = ['event', 'ressource', 'anzahl', 'von', 'bis', 'kosten']
    list_filter = ['ressource']
