from django.contrib import admin
from .models import Permission, UserProfile, UserSession, GlobalSettings


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'category', 'created_at']
    list_filter = ['category']
    search_fields = ['code', 'name', 'description']


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['username', 'email', 'theme', 'two_factor_enabled', 'created_at']
    list_filter = ['theme', 'two_factor_enabled']
    search_fields = ['username', 'email', 'keycloak_id']
    filter_horizontal = ['permissions']


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    list_display = ['user_profile', 'ip_address', 'is_current', 'started_at', 'last_activity']
    list_filter = ['is_current']


@admin.register(GlobalSettings)
class GlobalSettingsAdmin(admin.ModelAdmin):
    list_display = ['key', 'value', 'updated_at']
