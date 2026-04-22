from django.contrib import admin
from .models import (
    KompetenzKategorie, KompetenzGruppe, Kompetenz,
    UserKompetenz, UserKompetenzHistorie, KompetenzBadge,
)


@admin.register(KompetenzKategorie)
class KategorieAdmin(admin.ModelAdmin):
    list_display = ('name', 'sortierung', 'icon', 'farbe')
    ordering = ('sortierung',)


@admin.register(KompetenzGruppe)
class GruppeAdmin(admin.ModelAdmin):
    list_display = ('name', 'kategorie', 'sortierung')
    list_filter = ('kategorie',)


@admin.register(Kompetenz)
class KompetenzAdmin(admin.ModelAdmin):
    list_display = ('name', 'kategorie', 'gruppe', 'punkte', 'aktiv')
    list_filter = ('kategorie', 'gruppe', 'aktiv')
    search_fields = ('name',)


@admin.register(UserKompetenz)
class UserKompetenzAdmin(admin.ModelAdmin):
    list_display = ('user_username', 'kompetenz', 'hat_kompetenz', 'stufe', 'ablauf_am')
    list_filter = ('hat_kompetenz', 'kompetenz__kategorie')
    search_fields = ('user_username', 'user_keycloak_id')


@admin.register(UserKompetenzHistorie)
class HistorieAdmin(admin.ModelAdmin):
    list_display = ('user_keycloak_id', 'aktion', 'stufe_nachher', 'geaendert_von_username', 'erstellt_am')
    list_filter = ('aktion',)


@admin.register(KompetenzBadge)
class BadgeAdmin(admin.ModelAdmin):
    list_display = ('name', 'typ', 'kategorie', 'schwelle')
    list_filter = ('typ',)
