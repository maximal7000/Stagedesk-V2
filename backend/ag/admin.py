from django.contrib import admin
from .models import AgAufgabe


@admin.register(AgAufgabe)
class AgAufgabeAdmin(admin.ModelAdmin):
    list_display = ('titel', 'status', 'sortierung', 'aktualisiert_am')
    list_filter = ('status',)
    search_fields = ('titel', 'beschreibung')
    filter_horizontal = ('zugewiesene',)
