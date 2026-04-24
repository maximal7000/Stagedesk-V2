"""
Pydantic Schemas für Users API
Rollen kommen aus Keycloak, lokale Permissions für feinere Steuerung
"""
from typing import Optional, List
from datetime import datetime
from ninja import Schema


class BereichSchema(Schema):
    id: int
    name: str


# Permission Schemas
class PermissionSchema(Schema):
    id: int
    code: str
    name: str
    description: str
    category: str


class PermissionCreateSchema(Schema):
    code: str
    name: str
    description: str = ""
    category: str = "general"


# Permission Group Schemas
class PermissionGroupSchema(Schema):
    id: int
    name: str
    description: str
    permissions: List[str]
    is_default: bool

    @staticmethod
    def resolve_permissions(obj):
        return list(obj.permissions.values_list('code', flat=True))


class PermissionGroupCreateSchema(Schema):
    name: str
    description: str = ''
    permission_codes: List[str] = []
    is_default: bool = False


class PermissionGroupUpdateSchema(Schema):
    name: Optional[str] = None
    description: Optional[str] = None
    permission_codes: Optional[List[str]] = None
    is_default: Optional[bool] = None


# User Profile Schemas
class UserProfileSchema(Schema):
    id: int
    keycloak_id: str
    username: str
    email: str
    first_name: str = ''
    last_name: str = ''
    discord_id: str
    bereiche: List[BereichSchema]
    theme: str
    theme_locked: bool
    forced_theme: Optional[str]
    effective_theme: str
    two_factor_enabled: bool
    is_admin: bool
    keycloak_roles: List[str]
    permissions: List[str]
    created_at: datetime
    last_login: Optional[datetime]

    @staticmethod
    def resolve_bereiche(obj):
        return obj.bereiche.all()

    @staticmethod
    def resolve_effective_theme(obj):
        return obj.get_effective_theme()
    
    @staticmethod
    def resolve_is_admin(obj):
        # Keycloak-Admin-Status (von api.py gesetzt)
        return getattr(obj, '_is_admin', False)
    
    @staticmethod
    def resolve_keycloak_roles(obj):
        # Keycloak-Rollen (von api.py gesetzt)
        return getattr(obj, '_keycloak_roles', [])
    
    @staticmethod
    def resolve_permissions(obj):
        # Lokale Permissions + Admin hat alle
        if getattr(obj, '_is_admin', False):
            from .models import Permission
            return list(Permission.objects.values_list('code', flat=True))
        return obj.get_all_permissions()


class UserProfileUpdateSchema(Schema):
    theme: Optional[str] = None


class UserProfileAdminUpdateSchema(Schema):
    forced_theme: Optional[str] = None
    theme_locked: Optional[bool] = None
    discord_id: Optional[str] = None
    bereich_ids: Optional[List[int]] = None
    # permission_codes für lokale Permissions (nicht Keycloak-Rollen)
    permission_codes: Optional[List[str]] = None
    # Berechtigungsgruppen
    group_ids: Optional[List[int]] = None


# Session Schemas
class SessionSchema(Schema):
    id: int
    keycloak_session_id: str
    ip_address: Optional[str]
    user_agent: str
    device_info: str
    is_current: bool
    started_at: datetime
    last_activity: datetime


# Settings Schemas
class GlobalSettingSchema(Schema):
    key: str
    value: str
    description: str


class GlobalSettingUpdateSchema(Schema):
    value: str
    description: str = ""


# Admin User List Schema
class PermissionGroupBriefSchema(Schema):
    id: int
    name: str


class UserListSchema(Schema):
    id: int
    keycloak_id: str
    username: str
    email: str
    first_name: str = ''
    last_name: str = ''
    discord_id: str
    bereiche: List[BereichSchema]
    permission_groups: List[PermissionGroupBriefSchema]
    theme: str
    forced_theme: Optional[str]
    two_factor_enabled: bool
    is_admin: bool
    keycloak_roles: List[str]
    last_login: Optional[datetime]

    @staticmethod
    def resolve_bereiche(obj):
        return obj.bereiche.all()

    @staticmethod
    def resolve_permission_groups(obj):
        return obj.permission_groups.all()

    @staticmethod
    def resolve_is_admin(obj):
        return getattr(obj, '_is_admin', False)

    @staticmethod
    def resolve_keycloak_roles(obj):
        return getattr(obj, '_keycloak_roles', [])
