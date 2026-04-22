"""
Users API - Permissions, Settings, Sessions
Rollen kommen aus Keycloak JWT, lokale Permissions für feinere Steuerung
"""
from typing import List
from django.utils import timezone
from ninja import Router
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.db import transaction

from core.auth import keycloak_auth
from .models import Permission, PermissionGroup, UserProfile, UserSession, GlobalSettings
from .schemas import (
    PermissionSchema, PermissionCreateSchema,
    PermissionGroupSchema, PermissionGroupCreateSchema, PermissionGroupUpdateSchema,
    UserProfileSchema, UserProfileUpdateSchema, UserProfileAdminUpdateSchema,
    SessionSchema, GlobalSettingSchema, GlobalSettingUpdateSchema,
    UserListSchema
)

users_router = Router(tags=["Users"])

# Keycloak Client ID für Client-Rollen
KEYCLOAK_CLIENT_ID = getattr(settings, 'KEYCLOAK_CLIENT_ID', 'stagedesk')


def get_keycloak_roles(request) -> List[str]:
    """Extrahiert Rollen aus dem Keycloak JWT Token"""
    roles = set()
    
    # Realm-Rollen: realm_access.roles
    realm_access = request.auth.get('realm_access', {})
    roles.update(realm_access.get('roles', []))
    
    # Client-Rollen: resource_access.<client_id>.roles
    resource_access = request.auth.get('resource_access', {})
    client_roles = resource_access.get(KEYCLOAK_CLIENT_ID, {})
    roles.update(client_roles.get('roles', []))
    
    return list(roles)


def is_admin(request) -> bool:
    """Prüft ob User Admin-Rolle in Keycloak hat"""
    roles = get_keycloak_roles(request)
    # Admin wenn "admin" oder "Admin" Rolle vorhanden
    return any(role.lower() == 'admin' for role in roles)


def get_or_create_profile(request) -> UserProfile:
    """Holt oder erstellt UserProfile basierend auf JWT"""
    keycloak_id = request.auth.get('sub')
    username = request.auth.get('preferred_username', '')
    email = request.auth.get('email', '')
    keycloak_roles = get_keycloak_roles(request)
    
    profile, created = UserProfile.objects.get_or_create(
        keycloak_id=keycloak_id,
        defaults={'username': username, 'email': email}
    )

    # Neue User bekommen Standard-Gruppen
    if created:
        default_groups = PermissionGroup.objects.filter(is_default=True)
        if default_groups.exists():
            profile.permission_groups.set(default_groups)

    admin_flag = is_admin(request)

    # Update profile wenn sich was geändert hat
    if not created:
        updated = False
        if profile.username != username:
            profile.username = username
            updated = True
        if profile.email != email:
            profile.email = email
            updated = True
        if profile.is_admin_cached != admin_flag:
            profile.is_admin_cached = admin_flag
            updated = True
        if updated:
            profile.save()
    else:
        profile.is_admin_cached = admin_flag
        profile.save()

    # Keycloak-Rollen an das Objekt anhängen (nicht in DB, nur für Response)
    profile._keycloak_roles = keycloak_roles
    profile._is_admin = admin_flag

    return profile


# ========== Current User ==========

@users_router.get("/me", response=UserProfileSchema, auth=keycloak_auth)
def get_current_user(request):
    """Aktuellen User-Profile abrufen"""
    profile = get_or_create_profile(request)
    profile.last_login = timezone.now()
    profile.save(update_fields=['last_login'])
    return profile


@users_router.put("/me", response=UserProfileSchema, auth=keycloak_auth)
def update_current_user(request, payload: UserProfileUpdateSchema):
    """Eigenes Profil aktualisieren"""
    profile = get_or_create_profile(request)
    
    if payload.theme and not profile.theme_locked:
        # Prüfe ob User Permission für Light Mode hat (Admin hat immer)
        if payload.theme == 'light' and not profile.has_permission('theme.light_mode', profile._is_admin):
            pass  # Ignoriere, keine Permission
        else:
            profile.theme = payload.theme
            profile.save()
    
    return profile


@users_router.get("/me/permissions", response=List[str], auth=keycloak_auth)
def get_my_permissions(request):
    """Eigene Permissions abrufen (Keycloak-Rollen + lokale Permissions)"""
    profile = get_or_create_profile(request)
    
    # Admin hat alle Permissions
    if profile._is_admin:
        return list(Permission.objects.values_list('code', flat=True))
    
    return profile.get_all_permissions()


# ========== Sessions ==========

@users_router.get("/me/sessions", response=List[SessionSchema], auth=keycloak_auth)
def get_my_sessions(request):
    """Eigene Sessions abrufen"""
    profile = get_or_create_profile(request)
    
    # Session-ID aus JWT
    current_session_id = request.auth.get('sid', '')
    
    # Markiere aktuelle Session
    sessions = profile.sessions.all()
    for session in sessions:
        session.is_current = (session.keycloak_session_id == current_session_id)
    
    return sessions


@users_router.post("/me/sessions/register", auth=keycloak_auth)
def register_session(request):
    """Aktuelle Session registrieren"""
    profile = get_or_create_profile(request)
    session_id = request.auth.get('sid', '')
    
    if not session_id:
        return {"status": "no_session_id"}
    
    # IP und User-Agent aus Request
    ip = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', ''))
    if ',' in ip:
        ip = ip.split(',')[0].strip()
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    
    # Device-Info extrahieren
    device_info = "Unbekannt"
    if 'Mobile' in user_agent:
        device_info = "Mobil"
    elif 'Windows' in user_agent:
        device_info = "Windows"
    elif 'Mac' in user_agent:
        device_info = "macOS"
    elif 'Linux' in user_agent:
        device_info = "Linux"
    
    try:
        with transaction.atomic():
            session, created = UserSession.objects.update_or_create(
                keycloak_session_id=session_id,
                defaults={
                    'user_profile': profile,
                    'ip_address': ip,
                    'user_agent': user_agent,
                    'device_info': device_info,
                }
            )
        return {"status": "registered", "created": created}
    except Exception as e:
        # Bei DB-Lock (SQLite) einfach OK zurückgeben, Session existiert wahrscheinlich schon
        print(f"Session-Registrierung fehlgeschlagen: {e}")
        return {"status": "skipped", "reason": "concurrent_access"}


@users_router.delete("/me/sessions/{session_id}", auth=keycloak_auth)
def revoke_session(request, session_id: int):
    """Session widerrufen (Logout von anderem Gerät)"""
    profile = get_or_create_profile(request)
    session = get_object_or_404(UserSession, id=session_id, user_profile=profile)
    
    # TODO: In Keycloak die Session auch widerrufen
    session.delete()
    
    return {"status": "revoked"}


# ========== Bereiche ==========

@users_router.get("/bereiche", response=List[dict], auth=keycloak_auth)
def list_bereiche(request):
    """Alle verfügbaren Bereiche auflisten."""
    from .models import Bereich
    return list(Bereich.objects.values('id', 'name'))


# ========== Permissions (Admin) ==========

@users_router.get("/permissions", response=List[PermissionSchema], auth=keycloak_auth)
def list_permissions(request):
    """Alle lokalen Permissions auflisten"""
    return Permission.objects.all()


@users_router.post("/permissions", response=PermissionSchema, auth=keycloak_auth)
def create_permission(request, payload: PermissionCreateSchema):
    """Permission erstellen (Admin - aus Keycloak-Rolle)"""
    if not is_admin(request):
        return {"error": "Keine Berechtigung"}, 403
    
    permission = Permission.objects.create(**payload.dict())
    return permission


@users_router.delete("/permissions/{perm_id}", auth=keycloak_auth)
def delete_permission(request, perm_id: int):
    """Permission löschen (Admin)"""
    if not is_admin(request):
        return {"error": "Keine Berechtigung"}, 403
    
    perm = get_object_or_404(Permission, id=perm_id)
    perm.delete()
    return {"status": "deleted"}


# ========== Users (Admin) ==========

@users_router.get("/users", response=List[UserListSchema], auth=keycloak_auth)
def list_users(request):
    """Alle User auflisten (Admin - aus Keycloak-Rolle)"""
    if not is_admin(request):
        return {"error": "Keine Berechtigung"}, 403
    
    users = UserProfile.objects.prefetch_related('permissions', 'bereiche', 'permission_groups').all()
    
    # Hinweis: Wir können die Keycloak-Rollen nicht für alle User abrufen
    # ohne deren Token zu haben. is_admin kommt aus dem gecachten Flag,
    # das beim letzten Login des jeweiligen Users gesetzt wurde.
    for user in users:
        user._keycloak_roles = []  # Unbekannt ohne deren Token
        user._is_admin = user.is_admin_cached

    return users


@users_router.get("/users/{user_id}", response=UserProfileSchema, auth=keycloak_auth)
def get_user(request, user_id: int):
    """User Details abrufen (Admin)"""
    if not is_admin(request):
        return {"error": "Keine Berechtigung"}, 403
    
    user = get_object_or_404(UserProfile, id=user_id)
    user._keycloak_roles = []  # Unbekannt ohne deren Token
    user._is_admin = False  # Unbekannt
    return user


@users_router.put("/users/{user_id}", response=UserProfileSchema, auth=keycloak_auth)
def update_user(request, user_id: int, payload: UserProfileAdminUpdateSchema):
    """User lokale Permissions/Theme aktualisieren (Admin)"""
    if not is_admin(request):
        return {"error": "Keine Berechtigung"}, 403
    
    user = get_object_or_404(UserProfile, id=user_id)
    
    # Lokale Permissions setzen
    if payload.permission_codes is not None:
        perms = Permission.objects.filter(code__in=payload.permission_codes)
        user.permissions.set(perms)
    
    # Discord-ID und Bereiche
    if payload.discord_id is not None:
        user.discord_id = payload.discord_id
    if payload.bereich_ids is not None:
        from .models import Bereich
        bereiche = Bereich.objects.filter(id__in=payload.bereich_ids)
        user.bereiche.set(bereiche)

    # Berechtigungsgruppen
    if payload.group_ids is not None:
        groups = PermissionGroup.objects.filter(id__in=payload.group_ids)
        user.permission_groups.set(groups)

    # forced_theme: Leerer String oder "none" = keine Erzwingung
    if payload.forced_theme is not None:
        if payload.forced_theme in ('', 'none', None):
            user.forced_theme = None
        else:
            user.forced_theme = payload.forced_theme
    if payload.theme_locked is not None:
        user.theme_locked = payload.theme_locked

    user.save()
    
    user._keycloak_roles = []  # Unbekannt
    user._is_admin = False  # Unbekannt
    return user


# ========== Permission Groups (Admin) ==========

@users_router.get("/groups", response=List[PermissionGroupSchema], auth=keycloak_auth)
def list_groups(request):
    """Alle Berechtigungsgruppen auflisten"""
    if not is_admin(request):
        from ninja.errors import HttpError
        raise HttpError(403, "Keine Berechtigung")
    return PermissionGroup.objects.prefetch_related('permissions').all()


@users_router.post("/groups", response=PermissionGroupSchema, auth=keycloak_auth)
def create_group(request, payload: PermissionGroupCreateSchema):
    """Berechtigungsgruppe erstellen"""
    if not is_admin(request):
        from ninja.errors import HttpError
        raise HttpError(403, "Keine Berechtigung")
    group = PermissionGroup.objects.create(
        name=payload.name,
        description=payload.description,
        is_default=payload.is_default,
    )
    if payload.permission_codes:
        perms = Permission.objects.filter(code__in=payload.permission_codes)
        group.permissions.set(perms)
    return group


@users_router.put("/groups/{group_id}", response=PermissionGroupSchema, auth=keycloak_auth)
def update_group(request, group_id: int, payload: PermissionGroupUpdateSchema):
    """Berechtigungsgruppe aktualisieren"""
    if not is_admin(request):
        from ninja.errors import HttpError
        raise HttpError(403, "Keine Berechtigung")
    group = get_object_or_404(PermissionGroup, id=group_id)
    if payload.name is not None:
        group.name = payload.name
    if payload.description is not None:
        group.description = payload.description
    if payload.is_default is not None:
        group.is_default = payload.is_default
    group.save()
    if payload.permission_codes is not None:
        perms = Permission.objects.filter(code__in=payload.permission_codes)
        group.permissions.set(perms)
    return group


@users_router.delete("/groups/{group_id}", auth=keycloak_auth)
def delete_group(request, group_id: int):
    """Berechtigungsgruppe löschen"""
    if not is_admin(request):
        from ninja.errors import HttpError
        raise HttpError(403, "Keine Berechtigung")
    group = get_object_or_404(PermissionGroup, id=group_id)
    group.delete()
    return {"status": "deleted"}


# ========== Global Settings (Admin) ==========

@users_router.get("/settings", response=List[GlobalSettingSchema], auth=keycloak_auth)
def list_settings(request):
    """Globale Einstellungen auflisten (Admin)"""
    if not is_admin(request):
        return {"error": "Keine Berechtigung"}, 403
    
    return GlobalSettings.objects.all()


@users_router.put("/settings/{key}", response=GlobalSettingSchema, auth=keycloak_auth)
def update_setting(request, key: str, payload: GlobalSettingUpdateSchema):
    """Globale Einstellung aktualisieren (Admin)"""
    if not is_admin(request):
        return {"error": "Keine Berechtigung"}, 403
    
    profile = get_or_create_profile(request)
    setting = GlobalSettings.set_value(key, payload.value, payload.description, profile)
    return setting


# ========== Setup: Initial Permissions (Admin) ==========

@users_router.post("/setup/init", auth=keycloak_auth)
def initialize_system(request):
    """
    System initialisieren - erstellt Standard-Permissions (nur Admin)
    Admin-Status kommt aus Keycloak (Rolle "admin" im Realm oder Client)
    """
    if not is_admin(request):
        return {"error": "Keine Berechtigung - nur Admins können das System initialisieren"}, 403
    
    # Standard-Permissions erstellen
    default_permissions = [
        {'code': 'theme.light_mode', 'name': 'Light Mode aktivieren', 
         'description': 'Erlaubt das Wechseln zum Light Mode', 'category': 'appearance'},
        # Haushalte
        {'code': 'haushalte.view', 'name': 'Haushalte anzeigen', 
         'description': 'Erlaubt das Anzeigen von Haushalten', 'category': 'haushalte'},
        {'code': 'haushalte.create', 'name': 'Haushalte erstellen', 
         'description': 'Erlaubt das Erstellen von Haushalten', 'category': 'haushalte'},
        {'code': 'haushalte.edit', 'name': 'Haushalte bearbeiten', 
         'description': 'Erlaubt das Bearbeiten von Haushalten', 'category': 'haushalte'},
        {'code': 'haushalte.delete', 'name': 'Haushalte löschen', 
         'description': 'Erlaubt das Löschen von Haushalten', 'category': 'haushalte'},
        # Kalender
        {'code': 'kalender.view', 'name': 'Kalender anzeigen', 
         'description': 'Erlaubt das Anzeigen des Kalenders', 'category': 'kalender'},
        {'code': 'kalender.create', 'name': 'Events erstellen', 
         'description': 'Erlaubt das Erstellen von Events', 'category': 'kalender'},
        {'code': 'kalender.edit', 'name': 'Events bearbeiten', 
         'description': 'Erlaubt das Bearbeiten von Events', 'category': 'kalender'},
        {'code': 'kalender.delete', 'name': 'Events löschen', 
         'description': 'Erlaubt das Löschen von Events', 'category': 'kalender'},
        {'code': 'kalender.ressourcen', 'name': 'Ressourcen verwalten', 
         'description': 'Erlaubt das Verwalten von Ressourcen', 'category': 'kalender'},
        # Inventar
        {'code': 'inventar.view', 'name': 'Inventar anzeigen', 
         'description': 'Erlaubt das Anzeigen des Inventars', 'category': 'inventar'},
        {'code': 'inventar.create', 'name': 'Items erstellen', 
         'description': 'Erlaubt das Erstellen von Inventar-Items', 'category': 'inventar'},
        {'code': 'inventar.edit', 'name': 'Items bearbeiten', 
         'description': 'Erlaubt das Bearbeiten von Items', 'category': 'inventar'},
        {'code': 'inventar.delete', 'name': 'Items löschen', 
         'description': 'Erlaubt das Löschen von Items', 'category': 'inventar'},
        {'code': 'inventar.ausleihe', 'name': 'Ausleihen verwalten',
         'description': 'Erlaubt das Verwalten von Ausleihen', 'category': 'inventar'},
        # Veranstaltung
        {'code': 'veranstaltung.view', 'name': 'Veranstaltungen anzeigen',
         'description': 'Erlaubt das Anzeigen von Veranstaltungen', 'category': 'veranstaltung'},
        {'code': 'veranstaltung.create', 'name': 'Veranstaltungen erstellen',
         'description': 'Erlaubt das Erstellen von Veranstaltungen', 'category': 'veranstaltung'},
        {'code': 'veranstaltung.edit', 'name': 'Veranstaltungen bearbeiten',
         'description': 'Erlaubt das Bearbeiten von Veranstaltungen', 'category': 'veranstaltung'},
        {'code': 'veranstaltung.delete', 'name': 'Veranstaltungen löschen',
         'description': 'Erlaubt das Löschen von Veranstaltungen', 'category': 'veranstaltung'},
        {'code': 'veranstaltung.zuweisungen', 'name': 'Zuweisungen verwalten',
         'description': 'Erlaubt das Zuweisen von Personen zu Veranstaltungen', 'category': 'veranstaltung'},
        {'code': 'veranstaltung.discord', 'name': 'Discord verwalten',
         'description': 'Erlaubt das Synchronisieren mit Discord', 'category': 'veranstaltung'},
        # Monitor
        {'code': 'monitor.view', 'name': 'Monitor anzeigen',
         'description': 'Erlaubt den Zugriff auf die Monitor-Konfiguration', 'category': 'monitor'},
        {'code': 'monitor.edit', 'name': 'Monitor bearbeiten',
         'description': 'Erlaubt das Bearbeiten der Monitor-Konfiguration', 'category': 'monitor'},
        {'code': 'monitor.onair', 'name': 'ON AIR steuern',
         'description': 'Erlaubt das Aktivieren/Deaktivieren von ON AIR', 'category': 'monitor'},
        {'code': 'monitor.notfall', 'name': 'Notfall-Meldung verwalten',
         'description': 'Erlaubt das Aktivieren/Deaktivieren der Notfall-Meldung', 'category': 'monitor'},
        # Anwesenheit
        {'code': 'anwesenheit.view', 'name': 'Anwesenheit anzeigen',
         'description': 'Erlaubt das Anzeigen von Anwesenheitslisten', 'category': 'anwesenheit'},
        {'code': 'anwesenheit.create', 'name': 'Anwesenheit erstellen',
         'description': 'Erlaubt das Erstellen von Anwesenheitslisten', 'category': 'anwesenheit'},
        {'code': 'anwesenheit.edit', 'name': 'Anwesenheit bearbeiten',
         'description': 'Erlaubt das Bearbeiten von Anwesenheitseintraegen', 'category': 'anwesenheit'},
        {'code': 'anwesenheit.delete', 'name': 'Anwesenheit loeschen',
         'description': 'Erlaubt das Loeschen von Anwesenheitslisten', 'category': 'anwesenheit'},
        {'code': 'anwesenheit.statistik', 'name': 'Anwesenheit Statistik',
         'description': 'Erlaubt das Anzeigen der Anwesenheitsstatistik', 'category': 'anwesenheit'},
        {'code': 'anwesenheit.export', 'name': 'Anwesenheit Export',
         'description': 'Erlaubt den Export von Anwesenheitslisten', 'category': 'anwesenheit'},
        {'code': 'anwesenheit.view_all', 'name': 'Alle Anwesenheitslisten anzeigen',
         'description': 'Erlaubt das Anzeigen aller Listen (ohne diese Permission: nur eigene Listen)', 'category': 'anwesenheit'},
        # Kompetenzen
        {'code': 'kompetenzen.view', 'name': 'Kompetenzen anzeigen',
         'description': 'Erlaubt das Anzeigen der eigenen Kompetenzen', 'category': 'kompetenzen'},
        {'code': 'kompetenzen.view_all', 'name': 'Alle User-Kompetenzen anzeigen',
         'description': 'Erlaubt das Anzeigen der Kompetenzen aller User', 'category': 'kompetenzen'},
        {'code': 'kompetenzen.manage', 'name': 'Kompetenzen verwalten',
         'description': 'Erlaubt das Bestätigen und Entziehen von Kompetenzen bei Usern', 'category': 'kompetenzen'},
        {'code': 'kompetenzen.edit_catalog', 'name': 'Kompetenz-Katalog bearbeiten',
         'description': 'Erlaubt das Anlegen/Bearbeiten/Löschen von Kategorien, Gruppen und Kompetenzen', 'category': 'kompetenzen'},
    ]
    
    created_permissions = []
    for perm_data in default_permissions:
        perm, created = Permission.objects.get_or_create(
            code=perm_data['code'],
            defaults=perm_data
        )
        if created:
            created_permissions.append(perm.code)
    
    # Profil für aktuellen User erstellen/aktualisieren
    profile = get_or_create_profile(request)
    
    return {
        "status": "initialized",
        "created_permissions": created_permissions,
        "current_user_is_admin": profile._is_admin,
        "keycloak_roles": profile._keycloak_roles,
        "info": "Admin-Status kommt aus Keycloak. Füge die Rolle 'admin' in Keycloak hinzu."
    }
