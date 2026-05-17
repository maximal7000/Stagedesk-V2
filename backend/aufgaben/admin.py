from django.contrib import admin
from .models import Aufgabe


@admin.register(Aufgabe)
class AufgabeAdmin(admin.ModelAdmin):
    list_display = ('titel', 'status', 'sortierung', 'aktualisiert_am')
    list_filter = ('status',)
    search_fields = ('titel', 'beschreibung')
    filter_horizontal = ('zugewiesene',)
