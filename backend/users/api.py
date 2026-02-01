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
from .models import Permission, UserProfile, UserSession, GlobalSettings
from .schemas import (
    PermissionSchema, PermissionCreateSchema,
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
    
    # Update profile wenn sich was geändert hat
    if not created:
        updated = False
        if profile.username != username:
            profile.username = username
            updated = True
        if profile.email != email:
            profile.email = email
            updated = True
        if updated:
            profile.save()
    
    # Keycloak-Rollen an das Objekt anhängen (nicht in DB, nur für Response)
    profile._keycloak_roles = keycloak_roles
    profile._is_admin = is_admin(request)
    
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
    
    users = UserProfile.objects.prefetch_related('permissions').all()
    
    # Hinweis: Wir können die Keycloak-Rollen nicht für alle User abrufen
    # ohne deren Token zu haben. Daher sind keycloak_roles leer in der Liste.
    for user in users:
        user._keycloak_roles = []  # Unbekannt ohne deren Token
        user._is_admin = False  # Unbekannt
    
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
    
    if payload.forced_theme is not None:
        user.forced_theme = payload.forced_theme if payload.forced_theme else None
    if payload.theme_locked is not None:
        user.theme_locked = payload.theme_locked
    
    user.save()
    
    user._keycloak_roles = []  # Unbekannt
    user._is_admin = False  # Unbekannt
    return user


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


# ========== Setup: Initial Permissions ==========

@users_router.post("/setup/init", auth=keycloak_auth)
def initialize_system(request):
    """
    System initialisieren - erstellt Standard-Permissions
    Admin-Status kommt aus Keycloak (Rolle "admin" im Realm oder Client)
    """
    
    # Standard-Permissions erstellen
    default_permissions = [
        {'code': 'theme.light_mode', 'name': 'Light Mode aktivieren', 
         'description': 'Erlaubt das Wechseln zum Light Mode', 'category': 'appearance'},
        {'code': 'haushalte.view', 'name': 'Haushalte anzeigen', 
         'description': 'Erlaubt das Anzeigen von Haushalten', 'category': 'haushalte'},
        {'code': 'haushalte.create', 'name': 'Haushalte erstellen', 
         'description': 'Erlaubt das Erstellen von Haushalten', 'category': 'haushalte'},
        {'code': 'haushalte.edit', 'name': 'Haushalte bearbeiten', 
         'description': 'Erlaubt das Bearbeiten von Haushalten', 'category': 'haushalte'},
        {'code': 'haushalte.delete', 'name': 'Haushalte löschen', 
         'description': 'Erlaubt das Löschen von Haushalten', 'category': 'haushalte'},
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
