from django.contrib import admin
from .models import AnwesenheitsListe, Termin, Teilnehmer, TerminAnwesenheit


@admin.register(AnwesenheitsListe)
class AnwesenheitsListeAdmin(admin.ModelAdmin):
    list_display = ('titel', 'ort', 'status', 'erstellt_von_username', 'erstellt_am')
    list_filter = ('status',)
    search_fields = ('titel', 'beschreibung')


@admin.register(Termin)
class TerminAdmin(admin.ModelAdmin):
    list_display = ('liste', 'titel', 'datum', 'beginn', 'ende')
    list_filter = ('datum',)


@admin.register(Teilnehmer)
class TeilnehmerAdmin(admin.ModelAdmin):
    list_display = ('name', 'liste', 'status', 'markiert_am')
    list_filter = ('status',)
    search_fields = ('name', 'email')


@admin.register(TerminAnwesenheit)
class TerminAnwesenheitAdmin(admin.ModelAdmin):
    list_display = ('teilnehmer', 'termin', 'status', 'markiert_am')
    list_filter = ('status',)
