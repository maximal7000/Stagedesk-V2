"""
Fachlogik für Geräte-Kopplung und Token-Verwaltung (Spec §3).

pairing_id und Geräte-Token liegen nur als SHA-256-Hash in der Datenbank.
"""
import hashlib
import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from . import push
from .models import Device, DeviceEvent, PairingRequest, Screen

PAIRING_TTL = timedelta(minutes=15)
MAX_OPEN_REQUESTS = 10
MAX_PER_SERIAL = 3


class PairingGone(Exception):
    """Der Token wurde bereits ausgeliefert (HTTP 410)."""


class InvalidPairingCode(Exception):
    """Code unbekannt, abgelaufen oder schon verbraucht."""


def hash_pairing_id(pairing_id: str) -> str:
    return hashlib.sha256(pairing_id.encode()).hexdigest()


def _open_requests():
    return PairingRequest.objects.filter(expires_at__gt=timezone.now(), confirmed_device__isnull=True)


def _new_code(taken: set) -> str:
    while True:
        code = str(100000 + secrets.randbelow(900000))
        if code not in taken:
            return code


@transaction.atomic
def start_pairing(serial: str, model: str):
    """Legt einen PairingRequest an. Gibt (Request, Klartext-pairing_id) zurück."""
    now = timezone.now()
    PairingRequest.objects.filter(expires_at__lte=now).delete()
    open_qs = _open_requests()
    # Pro Seriennummer höchstens 3 (inklusive des neuen), insgesamt höchstens 10.
    if serial:
        same = list(open_qs.filter(serial=serial).order_by('created_at', 'id'))
        for old in same[:max(0, len(same) - (MAX_PER_SERIAL - 1))]:
            old.delete()
    rest = list(_open_requests().order_by('created_at', 'id'))
    for old in rest[:max(0, len(rest) - (MAX_OPEN_REQUESTS - 1))]:
        old.delete()
    taken = set(_open_requests().values_list('code', flat=True))
    pairing_id = secrets.token_urlsafe(32)
    req = PairingRequest.objects.create(
        code=_new_code(taken),
        pairing_id_hash=hash_pairing_id(pairing_id),
        serial=serial[:64], model=model[:120],
        expires_at=now + PAIRING_TTL,
    )
    return req, pairing_id


def poll_pairing(pairing_id: str):
    """None solange offen; einmalig die Zugangsdaten; danach PairingGone. Unbekannt: LookupError."""
    req = PairingRequest.objects.select_related('confirmed_device__screen').filter(
        pairing_id_hash=hash_pairing_id(pairing_id)).first()
    if req is None:
        raise LookupError('unknown')
    if req.confirmed_device_id is None:
        if req.expires_at <= timezone.now():
            raise LookupError('expired')
        return None
    with transaction.atomic():
        # Atomar als ausgeliefert markieren, damit zwei Polls nicht beide den Token bekommen.
        claimed = PairingRequest.objects.filter(pk=req.pk, token_delivered=False).update(token_delivered=True)
        if not claimed:
            raise PairingGone()
        device = req.confirmed_device
        screen = device.screen
        if device.revoked_at is not None or screen is None:
            raise LookupError('revoked')
        token = device.issue_token()
    return {"token": token, "slug": screen.slug if screen else '',
            "key": screen.access_key if screen else '',
            "screen_id": screen.id if screen else None}


def confirm_pairing(code: str, screen: Screen) -> Device:
    with transaction.atomic():
        req = _open_requests().select_for_update().filter(code=code).order_by('-created_at').first()
        if req is None:
            raise InvalidPairingCode()
        replaced = Device.objects.filter(screen=screen).first()
        if replaced is not None:
            replaced.screen = None
            replaced.revoked_at = timezone.now()
            replaced.save(update_fields=['screen', 'revoked_at'])
            DeviceEvent.objects.create(
                device=replaced, screen=screen, kind='token_revoked',
                text='Zugang entzogen, der Bildschirm wurde mit einem neuen Gerät gekoppelt.')
        device = Device.objects.create(screen=screen, serial=req.serial, model=req.model)
        req.confirmed_device = device
        req.save(update_fields=['confirmed_device'])
        DeviceEvent.objects.create(device=device, screen=screen, kind='paired',
                                   text=f'Gerät {req.serial or device.pk} mit {screen.name} gekoppelt.')
    if replaced is not None:
        push.close_device_sockets(replaced)
    return device


def unpair(device: Device) -> None:
    with transaction.atomic():
        screen = device.screen
        device.screen = None
        device.save(update_fields=['screen'])
        DeviceEvent.objects.create(device=device, screen=screen, kind='unpaired',
                                   text='Gerät vom Bildschirm gelöst.')
    push.close_device_sockets(device)


def revoke_token(device: Device) -> None:
    with transaction.atomic():
        device.revoked_at = timezone.now()
        device.save(update_fields=['revoked_at'])
        DeviceEvent.objects.create(device=device, screen=device.screen, kind='token_revoked',
                                   text='Token zurückgezogen.')
    push.close_device_sockets(device)
