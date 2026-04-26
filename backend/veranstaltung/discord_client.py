"""
Discord Bot-Integration für Veranstaltungsplaner.
Erstellt Discord Events, Textchannels und verwaltet Berechtigungen.

Benötigt in settings.py:
    DISCORD_BOT_TOKEN = 'your-bot-token'
    DISCORD_GUILD_ID = 'your-guild-id'
    DISCORD_CATEGORY_ID = 'your-category-id'  # optional, für Channel-Gruppierung
"""
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

DISCORD_API = 'https://discord.com/api/v10'
BOT_TOKEN = getattr(settings, 'DISCORD_BOT_TOKEN', '')
GUILD_ID = getattr(settings, 'DISCORD_GUILD_ID', '')
CATEGORY_ID = getattr(settings, 'DISCORD_CATEGORY_ID', '')


def _headers():
    return {
        'Authorization': f'Bot {BOT_TOKEN}',
        'Content-Type': 'application/json',
    }


def is_configured():
    """Prüft ob Discord-Integration konfiguriert ist."""
    return bool(BOT_TOKEN and GUILD_ID)


def create_scheduled_event(title, start_time, end_time, description='', location=''):
    """
    Erstellt ein Discord Scheduled Event (Guild Event).
    start_time/end_time: ISO 8601 Strings
    Returns: Event-ID oder None
    """
    if not is_configured():
        return None

    payload = {
        'name': title,
        'scheduled_start_time': start_time,
        'scheduled_end_time': end_time,
        'description': description[:1000] if description else '',
        'privacy_level': 2,  # GUILD_ONLY
        'entity_type': 3,  # EXTERNAL
        'entity_metadata': {'location': location or 'Stagedesk'},
    }

    try:
        res = requests.post(
            f'{DISCORD_API}/guilds/{GUILD_ID}/scheduled-events',
            headers=_headers(),
            json=payload,
            timeout=10,
        )
        res.raise_for_status()
        return res.json().get('id'), None
    except Exception as e:
        error_detail = ''
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_detail = e.response.json()
            except Exception:
                error_detail = e.response.text
        logger.error(f'Discord Event erstellen fehlgeschlagen: {e} - {error_detail}')
        return None, f'{e} - {error_detail}'


def delete_scheduled_event(event_id):
    """Löscht ein Discord Scheduled Event."""
    if not is_configured() or not event_id:
        return False
    try:
        res = requests.delete(
            f'{DISCORD_API}/guilds/{GUILD_ID}/scheduled-events/{event_id}',
            headers=_headers(),
            timeout=10,
        )
        return res.status_code in (200, 204)
    except Exception as e:
        logger.error(f'Discord Event löschen fehlgeschlagen: {e}')
        return False


def create_text_channel(name, topic=''):
    """
    Erstellt einen privaten Textchannel (nur Bot + zugewiesene User sehen ihn).
    Returns: Channel-ID oder None
    """
    if not is_configured():
        return None

    # Channel-Name: nur lowercase, Unterstriche/Bindestriche, max 100 Zeichen
    safe_name = name.lower().replace(' ', '-').replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    safe_name = ''.join(c for c in safe_name if c.isalnum() or c in '-_')[:100]

    payload = {
        'name': safe_name,
        'type': 0,  # GUILD_TEXT
        'topic': topic[:1024] if topic else '',
        'permission_overwrites': [
            {
                'id': GUILD_ID,  # @everyone
                'type': 0,  # role
                'deny': str(1 << 10),  # VIEW_CHANNEL denied
            },
        ],
    }
    if CATEGORY_ID:
        payload['parent_id'] = CATEGORY_ID

    try:
        res = requests.post(
            f'{DISCORD_API}/guilds/{GUILD_ID}/channels',
            headers=_headers(),
            json=payload,
            timeout=10,
        )
        res.raise_for_status()
        return res.json().get('id')
    except Exception as e:
        logger.error(f'Discord Channel erstellen fehlgeschlagen: {e}')
        return None


def delete_channel(channel_id):
    """Löscht einen Discord-Channel."""
    if not is_configured() or not channel_id:
        return False
    try:
        res = requests.delete(
            f'{DISCORD_API}/channels/{channel_id}',
            headers=_headers(),
            timeout=10,
        )
        return res.status_code in (200, 204)
    except Exception as e:
        logger.error(f'Discord Channel löschen fehlgeschlagen: {e}')
        return False


def grant_channel_access(channel_id, discord_user_id):
    """Gibt einem User VIEW_CHANNEL + SEND_MESSAGES Rechte auf einem Channel."""
    if not is_configured() or not channel_id or not discord_user_id:
        return False
    try:
        res = requests.put(
            f'{DISCORD_API}/channels/{channel_id}/permissions/{discord_user_id}',
            headers=_headers(),
            json={
                'type': 1,  # member
                'allow': str((1 << 10) | (1 << 11)),  # VIEW_CHANNEL + SEND_MESSAGES
            },
            timeout=10,
        )
        return res.status_code in (200, 204)
    except Exception as e:
        logger.error(f'Discord Channel-Zugriff gewähren fehlgeschlagen: {e}')
        return False


def revoke_channel_access(channel_id, discord_user_id):
    """Entfernt die Channel-Berechtigung eines Users."""
    if not is_configured() or not channel_id or not discord_user_id:
        return False
    try:
        res = requests.delete(
            f'{DISCORD_API}/channels/{channel_id}/permissions/{discord_user_id}',
            headers=_headers(),
            timeout=10,
        )
        return res.status_code in (200, 204)
    except Exception as e:
        logger.error(f'Discord Channel-Zugriff entfernen fehlgeschlagen: {e}')
        return False


def send_dm(discord_user_id, message):
    """Schickt eine Direktnachricht an einen Discord-User.
    Funktioniert nur, wenn der Bot mit dem User Server-Mitgliedschaft teilt.
    Returns True bei Erfolg, False sonst (best-effort, kein Re-Raise)."""
    if not is_configured() or not discord_user_id:
        return False
    try:
        # 1) DM-Channel öffnen
        r = requests.post(
            f'{DISCORD_API}/users/@me/channels',
            json={'recipient_id': str(discord_user_id)},
            headers=_headers(),
            timeout=8,
        )
        if r.status_code not in (200, 201):
            logger.warning('Discord open-DM fehlgeschlagen %s', r.status_code)
            return False
        channel_id = r.json().get('id')
        if not channel_id:
            return False
        # 2) Nachricht senden
        r2 = requests.post(
            f'{DISCORD_API}/channels/{channel_id}/messages',
            json={'content': message[:1900]},
            headers=_headers(),
            timeout=8,
        )
        return r2.status_code in (200, 201)
    except Exception as e:
        logger.warning('Discord DM error: %s', e)
        return False


def notify_zuweisung(veranstaltung, discord_user_id):
    """Schickt einem Helfer eine DM, dass er einer Veranstaltung zugewiesen wurde."""
    if not discord_user_id:
        return False
    when = veranstaltung.datum_von.strftime('%d.%m.%Y %H:%M') if veranstaltung.datum_von else 'noch offen'
    location = f'\n📍 {veranstaltung.ort}' if veranstaltung.ort else ''
    msg = (f'🎬 Du wurdest **{veranstaltung.titel}** zugewiesen.\n'
           f'🗓 {when}{location}')
    return send_dm(discord_user_id, msg)


def notify_event_reminder(veranstaltung, hours_until: int):
    """DM an alle zugewiesenen Helfer mit Discord-ID."""
    if not is_configured():
        return 0
    sent = 0
    when = veranstaltung.datum_von.strftime('%d.%m.%Y %H:%M') if veranstaltung.datum_von else ''
    location = f' @ {veranstaltung.ort}' if veranstaltung.ort else ''
    msg = f'⏰ Erinnerung: **{veranstaltung.titel}** in {hours_until}h ({when}{location})'
    try:
        from users.models import UserProfile
        zuw_ids = list(veranstaltung.zuweisungen.values_list('user_keycloak_id', flat=True))
        for p in UserProfile.objects.filter(keycloak_id__in=zuw_ids).exclude(discord_id=''):
            if send_dm(p.discord_id, msg):
                sent += 1
    except Exception as e:
        logger.warning('notify_event_reminder error: %s', e)
    return sent
