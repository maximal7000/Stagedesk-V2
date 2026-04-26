from django.contrib import admin
from .models import (
    TaetigkeitsRolle,
    Veranstaltung, VeranstaltungZuweisung, VeranstaltungChecklisteItem,
    VeranstaltungNotiz, VeranstaltungAnhang, VeranstaltungErinnerung
)


@admin.register(TaetigkeitsRolle)
class TaetigkeitsRolleAdmin(admin.ModelAdmin):
    list_display = ('name', 'sortierung')
    list_editable = ('sortierung',)
    search_fields = ('name',)


@admin.register(Veranstaltung)
class VeranstaltungAdmin(admin.ModelAdmin):
    list_display = ('titel', 'datum_von', 'datum_bis', 'ort', 'status', 'zammad_ticket_number')
    list_filter = ('status',)
    search_fields = ('titel', 'ort', 'beschreibung')


@admin.register(VeranstaltungZuweisung)
class VeranstaltungZuweisungAdmin(admin.ModelAdmin):
    list_display = ('veranstaltung', 'user_username', 'taetigkeit')


admin.site.register(VeranstaltungChecklisteItem)
admin.site.register(VeranstaltungNotiz)
admin.site.register(VeranstaltungAnhang)
admin.site.register(VeranstaltungErinnerung)


from .models import VeranstaltungTemplate

@admin.register(VeranstaltungTemplate)
class VeranstaltungTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'titel_vorlage', 'dauer_minuten', 'erstellt_am')
    search_fields = ('name', 'titel_vorlage')
    filter_horizontal = ('taetigkeiten', 'erforderliche_kompetenzen')
