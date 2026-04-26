"""
Zentraler `notify(...)` Helper. Schreibt eine In-App-Notification und (sobald
implementiert) sendet eine Web-Push-Notification.

Nutzung:
    from core.notify import notify
    notify(user_keycloak_id, 'zuweisung', 'Neue Veranstaltung',
           f'Du wurdest "{v.titel}" zugewiesen.', link=f'/veranstaltung/{v.id}')

Soft-fail: niemals den aufrufenden Endpoint stürzen lassen.
"""
from typing import Optional


def notify(user_keycloak_id: str, kind: str, title: str,
           body: str = '', link: str = '') -> Optional[int]:
    """Erzeugt eine Notification für einen User per keycloak_id.
    Gibt die Notification-ID zurück oder None bei Fehler/User-nicht-gefunden."""
    try:
        from users.models import UserProfile, Notification
        if not user_keycloak_id:
            return None
        profile = UserProfile.objects.filter(keycloak_id=user_keycloak_id).first()
        if not profile:
            return None
        n = Notification.objects.create(
            user=profile,
            kind=kind or 'info',
            title=(title or '')[:200],
            body=body or '',
            link=(link or '')[:500],
        )
        # Hook für Web-Push (sobald PushSubscription-Modell existiert)
        try:
            from .push import send_push_to_user  # noqa
            send_push_to_user(profile, title, body, link)
        except Exception:
            pass
        return n.id
    except Exception:
        return None


def notify_many(user_keycloak_ids, kind: str, title: str,
                body: str = '', link: str = '') -> int:
    """Versendet die gleiche Notification an mehrere User. Gibt Anzahl zurück."""
    sent = 0
    for kid in (user_keycloak_ids or []):
        if notify(kid, kind, title, body, link) is not None:
            sent += 1
    return sent
