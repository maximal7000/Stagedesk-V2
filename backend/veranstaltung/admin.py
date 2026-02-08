from django.contrib import admin
from .models import (
    Veranstaltung, VeranstaltungZuweisung, VeranstaltungChecklisteItem,
    VeranstaltungNotiz, VeranstaltungAnhang, VeranstaltungErinnerung
)


@admin.register(Veranstaltung)
class VeranstaltungAdmin(admin.ModelAdmin):
    list_display = ('titel', 'datum_von', 'datum_bis', 'ort', 'status', 'zammad_ticket_number')
    list_filter = ('status',)
    search_fields = ('titel', 'ort', 'beschreibung')


@admin.register(VeranstaltungZuweisung)
class VeranstaltungZuweisungAdmin(admin.ModelAdmin):
    list_display = ('veranstaltung', 'user_username', 'rolle')


admin.site.register(VeranstaltungChecklisteItem)
admin.site.register(VeranstaltungNotiz)
admin.site.register(VeranstaltungAnhang)
admin.site.register(VeranstaltungErinnerung)
