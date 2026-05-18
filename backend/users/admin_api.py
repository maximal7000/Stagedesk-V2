"""
Erweiterte Admin-System-Endpoints: Branding, Wartungsmodus, Login-Banner,
Discord/Email-Test, App-Statistik, Backup-Liste, Update-Check.

Alle Endpoints prüfen is_admin().
"""
import os
import subprocess
from datetime import timedelta
from typing import Optional
from django.db.models import Count
from django.utils import timezone
from ninja import Router, Schema
from ninja.errors import HttpError

from core.auth import keycloak_auth
from .api import is_admin
from .models import (
    UserProfile, GlobalSettings, Permission, PermissionGroup, UserSession,
    Notification,
)


admin_router = Router(tags=["Admin-System"])


def _ensure_admin(request):
    if not is_admin(request):
        raise HttpError(403, "Admin erforderlich")


# ─── Branding + Wartung + Login-Banner (in GlobalSettings) ─────────

BRANDING_KEYS = {
    'branding.app_name':      'Stagedesk',
    'branding.accent_color':  '#3b82f6',
    'maintenance.enabled':    'false',
    'maintenance.message':    '',
    'login.banner':           '',
}


@admin_router.get("/global-settings", auth=keycloak_auth)
def get_global_settings(request):
    """Liefert die globalen Settings + Defaults für noch nicht gesetzte Keys."""
    _ensure_admin(request)
    out = {}
    db_values = dict(GlobalSettings.objects.filter(key__in=BRANDING_KEYS.keys())
                     .values_list('key', 'value'))
    for k, default in BRANDING_KEYS.items():
        out[k] = db_values.get(k, default)
    return out


@admin_router.get("/public-settings", auth=None)
def get_public_settings(request):
    """Öffentliche Settings die das Frontend OHNE Login lesen darf
    (Branding, Wartungsmodus, Login-Banner). Wird auf LoginPage/Topbar genutzt."""
    out = {}
    db_values = dict(GlobalSettings.objects.filter(key__in=BRANDING_KEYS.keys())
                     .values_list('key', 'value'))
    for k, default in BRANDING_KEYS.items():
        out[k] = db_values.get(k, default)
    out['maintenance.enabled'] = out.get('maintenance.enabled', 'false').lower() in ('1', 'true', 'yes')
    return out


class GlobalSettingsUpdateSchema(Schema):
    values: dict  # { 'branding.app_name': 'Foo', ... }


@admin_router.put("/global-settings", auth=keycloak_auth)
def update_global_settings(request, payload: GlobalSettingsUpdateSchema):
    _ensure_admin(request)
    profile = UserProfile.objects.filter(
        keycloak_id=request.auth.get('sub', '')
    ).first() if request.auth else None
    updated = []
    for k, v in (payload.values or {}).items():
        if k not in BRANDING_KEYS:
            continue
        GlobalSettings.set_value(k, str(v), updated_by=profile)
        updated.append(k)
    return {"updated": updated}


# ─── Discord-Test ──────────────────────────────────────────────────

@admin_router.post("/test-discord", auth=keycloak_auth)
def test_discord(request):
    """Prüft die Discord-Konfiguration (BOT-Token + Guild erreichbar)."""
    _ensure_admin(request)
    try:
        from veranstaltung import discord_client
        import requests
        if not discord_client.is_configured():
            return {"ok": False, "reason": "DISCORD_BOT_TOKEN oder DISCORD_GUILD_ID fehlt in .env"}
        r = requests.get(
            f'{discord_client.DISCORD_API}/guilds/{discord_client.GUILD_ID}',
            headers=discord_client._headers(), timeout=8,
        )
        if r.status_code != 200:
            return {"ok": False, "status": r.status_code, "reason": r.text[:200]}
        data = r.json()
        info_channel = getattr(discord_client, 'INFO_CHANNEL_ID', '')
        info_ok = None
        if info_channel:
            r2 = requests.get(
                f'{discord_client.DISCORD_API}/channels/{info_channel}',
                headers=discord_client._headers(), timeout=8,
            )
            info_ok = r2.status_code == 200
        return {
            "ok": True,
            "guild_name": data.get('name'),
            "guild_id": data.get('id'),
            "info_channel_konfiguriert": bool(info_channel),
            "info_channel_erreichbar": info_ok,
        }
    except Exception as e:
        return {"ok": False, "reason": str(e)[:200]}


# ─── Email-Test ────────────────────────────────────────────────────

class EmailTestSchema(Schema):
    to: Optional[str] = None  # leer = an angemeldeten User


@admin_router.post("/test-email", auth=keycloak_auth)
def test_email(request, payload: EmailTestSchema):
    _ensure_admin(request)
    from django.core.mail import send_mail
    from django.conf import settings as dj_settings
    to = payload.to or (request.auth.get('email', '') if request.auth else '')
    if not to:
        return {"ok": False, "reason": "Keine Ziel-Adresse"}
    try:
        send_mail(
            subject='Stagedesk Test-Mail',
            message='Diese Mail wurde aus dem Admin → System-Tab versendet.',
            from_email=getattr(dj_settings, 'DEFAULT_FROM_EMAIL', None),
            recipient_list=[to],
            fail_silently=False,
        )
        return {"ok": True, "to": to}
    except Exception as e:
        return {"ok": False, "reason": str(e)[:300]}


# ─── App-Statistik ─────────────────────────────────────────────────

@admin_router.get("/stats", auth=keycloak_auth)
def app_stats(request):
    _ensure_admin(request)
    now = timezone.now()
    active_sessions = UserSession.objects.filter(
        last_activity__gte=now - timedelta(minutes=30)
    ).count()
    return {
        "user_count": UserProfile.objects.count(),
        "admin_count": UserProfile.objects.filter(is_admin_cached=True).count(),
        "active_sessions_30min": active_sessions,
        "total_sessions": UserSession.objects.count(),
        "permissions": Permission.objects.count(),
        "groups": PermissionGroup.objects.count(),
        "notifications_unread": Notification.objects.filter(read_at__isnull=True).count(),
    }


# ─── Backups auflisten ─────────────────────────────────────────────

@admin_router.get("/backups", auth=keycloak_auth)
def list_backups(request):
    """Liest /var/backups/stagedesk/{daily,weekly}/ und gibt die vorhandenen
    Backup-Dateien zurück."""
    _ensure_admin(request)
    root = '/var/backups/stagedesk'
    out = {'daily': [], 'weekly': []}
    for kind in ('daily', 'weekly'):
        d = os.path.join(root, kind)
        if not os.path.isdir(d):
            continue
        try:
            for name in sorted(os.listdir(d), reverse=True):
                full = os.path.join(d, name)
                try:
                    st = os.stat(full)
                except OSError:
                    continue
                out[kind].append({
                    'name': name,
                    'size': st.st_size,
                    'mtime': timezone.make_aware(
                        timezone.datetime.fromtimestamp(st.st_mtime)
                    ).isoformat() if not timezone.is_aware(
                        timezone.datetime.fromtimestamp(st.st_mtime)
                    ) else timezone.datetime.fromtimestamp(st.st_mtime).isoformat(),
                })
        except (PermissionError, OSError) as e:
            out[f'{kind}_error'] = str(e)
    return out


# ─── Background-Jobs Übersicht ─────────────────────────────────────

@admin_router.get("/jobs", auth=keycloak_auth)
def list_jobs(request, limit: int = 50):
    """Letzte Runs von Background-Jobs (Cron, Management-Commands).
    Quelle: AuditLog mit entity_type='job_run'."""
    _ensure_admin(request)
    from inventar.models import AuditLog
    qs = AuditLog.objects.filter(entity_type='job_run').order_by('-timestamp')[:max(1, min(limit, 200))]
    return [{
        'id': r.id,
        'name': r.entity_name,
        'timestamp': r.timestamp.isoformat() if r.timestamp else None,
        'status': (r.details or {}).get('status', '–'),
        'message': (r.details or {}).get('message', ''),
        'duration_ms': (r.details or {}).get('duration_ms', 0),
    } for r in qs]


# ─── Login-Historie (erfolgreiche Logins) ─────────────────────────

@admin_router.get("/login-history", auth=keycloak_auth)
def login_history(request, limit: int = 50):
    """Letzte aktive Sessions / Logins."""
    _ensure_admin(request)
    from users.models import UserSession
    qs = UserSession.objects.select_related('user_profile').order_by('-last_activity')[:max(1, min(limit, 200))]
    return [{
        'id': s.id,
        'username': s.user_profile.username,
        'email': s.user_profile.email,
        'ip_address': s.ip_address,
        'device_info': s.device_info or '',
        'is_current': s.is_current,
        'started_at': s.started_at.isoformat() if s.started_at else None,
        'last_activity': s.last_activity.isoformat() if s.last_activity else None,
    } for s in qs]


# ─── Update-Check (aktueller git commit) ───────────────────────────

@admin_router.get("/version", auth=keycloak_auth)
def app_version(request):
    _ensure_admin(request)
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    try:
        commit = subprocess.check_output(
            ['git', '-C', project_root, 'rev-parse', '--short', 'HEAD'],
            stderr=subprocess.DEVNULL, timeout=3,
        ).decode().strip()
        date = subprocess.check_output(
            ['git', '-C', project_root, 'log', '-1', '--format=%cI'],
            stderr=subprocess.DEVNULL, timeout=3,
        ).decode().strip()
        try:
            subprocess.check_call(['git', '-C', project_root, 'fetch', '--quiet'],
                                  timeout=5, stderr=subprocess.DEVNULL)
            behind = int(subprocess.check_output(
                ['git', '-C', project_root, 'rev-list', '--count', 'HEAD..@{u}'],
                stderr=subprocess.DEVNULL, timeout=3,
            ).decode().strip() or '0')
        except Exception:
            behind = None
        return {"commit": commit, "commit_date": date, "behind": behind}
    except Exception as e:
        return {"error": str(e)[:200]}
