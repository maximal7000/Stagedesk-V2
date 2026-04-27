"""
Web-Push-Versand. Wird von core.notify.notify() automatisch aufgerufen.

ENV (in backend/.env):
    VAPID_PUBLIC_KEY  = b64url-Public-Key
    VAPID_PRIVATE_KEY = b64url-Private-Key
    VAPID_SUBJECT     = mailto:admin@example.org   (oder URL)

Ohne VAPID-Keys ist Push einfach deaktiviert (no-op, Inbox läuft trotzdem).
"""
import json
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


def _vapid_claims():
    return {"sub": os.getenv('VAPID_SUBJECT', 'mailto:admin@stagedesk.local')}


def push_enabled() -> bool:
    return bool(os.getenv('VAPID_PRIVATE_KEY')) and bool(os.getenv('VAPID_PUBLIC_KEY'))


def get_public_key() -> Optional[str]:
    return os.getenv('VAPID_PUBLIC_KEY') or None


def send_push_to_user(profile, title: str, body: str = '', link: str = '') -> int:
    """Sendet eine Web-Push-Notification an alle Subscriptions eines Users.
    Subscriptions, die der Browser ablehnt (410/404), werden gelöscht.
    Returns: Anzahl erfolgreich versandter Pushes."""
    if not push_enabled():
        return 0
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning('pywebpush nicht installiert')
        return 0

    private_key = os.getenv('VAPID_PRIVATE_KEY')
    payload = json.dumps({
        'title': title or 'Stagedesk',
        'body': body or '',
        'url': link or '/',
    })
    sent = 0
    subs = list(profile.push_subscriptions.all())
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    'endpoint': sub.endpoint,
                    'keys': {'p256dh': sub.p256dh, 'auth': sub.auth},
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims=_vapid_claims(),
            )
            sent += 1
        except WebPushException as e:
            status = getattr(e.response, 'status_code', None) if e.response else None
            if status in (404, 410):
                # Subscription nicht mehr gültig — aufräumen
                sub.delete()
            else:
                logger.warning('Push fehlgeschlagen (status=%s): %s', status, e)
        except Exception as e:
            logger.warning('Push-Fehler: %s', e)
    return sent
