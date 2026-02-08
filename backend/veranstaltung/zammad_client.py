"""
Zammad REST API Client für Ticket-Abruf und optional Updates.
Verwendet ZAMMAD_URL und ZAMMAD_TOKEN aus Django-Settings.
"""
import logging
from typing import Optional, List, Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _get_config():
    url = getattr(settings, 'ZAMMAD_URL', None) or ''
    token = getattr(settings, 'ZAMMAD_TOKEN', None) or ''
    return url.rstrip('/'), token


def list_tickets(
    page: int = 1,
    per_page: int = 50,
    state: Optional[str] = None,
    order_by: str = 'created_at',
    order_direction: str = 'desc',
) -> List[dict]:
    """
    Tickets von Zammad abrufen.
    Returns list of ticket dicts with id, number, title, state_id, created_at, updated_at, etc.
    """
    base_url, token = _get_config()
    if not base_url or not token:
        logger.warning("Zammad not configured: ZAMMAD_URL or ZAMMAD_TOKEN missing")
        return []

    url = f"{base_url}/api/v1/tickets"
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    params = {'page': page, 'per_page': per_page, 'order_by': order_by, 'order_direction': order_direction}
    if state:
        params['state'] = state

    try:
        r = requests.get(url, headers=headers, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.exception("Zammad list_tickets failed: %s", e)
        return []


def get_ticket(ticket_id: int) -> Optional[dict]:
    """Einzelnes Ticket nach ID abrufen."""
    base_url, token = _get_config()
    if not base_url or not token:
        return None

    url = f"{base_url}/api/v1/tickets/{ticket_id}"
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    try:
        r = requests.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.exception("Zammad get_ticket %s failed: %s", ticket_id, e)
        return None


def update_ticket_state(ticket_id: int, state_id: int) -> bool:
    """Ticket-State in Zammad setzen (optional)."""
    base_url, token = _get_config()
    if not base_url or not token:
        return False

    url = f"{base_url}/api/v1/tickets/{ticket_id}"
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    payload = {'state_id': state_id}

    try:
        r = requests.put(url, headers=headers, json=payload, timeout=15)
        r.raise_for_status()
        return True
    except Exception as e:
        logger.exception("Zammad update_ticket_state %s failed: %s", ticket_id, e)
        return False
