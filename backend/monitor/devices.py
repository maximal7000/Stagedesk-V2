"""
Fachlogik für Geräte-Kopplung und Token-Verwaltung (Spec §3).

pairing_id und Geräte-Token liegen nur als SHA-256-Hash in der Datenbank.
"""
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from . import push
from .agent_package import agent_package_info
from .models import Device, DeviceCommand, DeviceEvent, MonitorSettings, PairingRequest, Screen

PAIRING_TTL = timedelta(minutes=15)
MAX_OPEN_REQUESTS = 10
MAX_PER_SERIAL = 3
COMMAND_TTL = timedelta(minutes=5)


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
    # Bestätigte, noch nicht ausgelieferte Requests bleiben nach Ablauf noch eine Karenzzeit erhalten.
    PairingRequest.objects.filter(expires_at__lte=now, confirmed_device__isnull=True).delete()
    PairingRequest.objects.filter(expires_at__lte=now - PAIRING_TTL).delete()
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
        screen = Screen.objects.select_for_update().get(pk=screen.pk)
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
            transaction.on_commit(lambda: push.close_device_sockets(replaced))
    return device


def unpair(device: Device) -> None:
    with transaction.atomic():
        screen = device.screen
        device.screen = None
        device.revoked_at = timezone.now()  # der Pi koppelt danach als neues Gerät
        device.save(update_fields=['screen', 'revoked_at'])
        DeviceEvent.objects.create(device=device, screen=screen, kind='unpaired',
                                   text='Gerät vom Bildschirm gelöst.')
        transaction.on_commit(lambda: push.close_device_sockets(device))


def revoke_token(device: Device) -> None:
    with transaction.atomic():
        device.revoked_at = timezone.now()
        device.save(update_fields=['revoked_at'])
        DeviceEvent.objects.create(device=device, screen=device.screen, kind='token_revoked',
                                   text='Token zurückgezogen.')
        transaction.on_commit(lambda: push.close_device_sockets(device))


# ── Agent-Protokoll (Spec §4.2, §5, §6) ──────────────────────────────

def hello_payload(device: Device) -> dict:
    """Konfiguration, die der Agent nach dem Verbinden und bei Änderungen bekommt."""
    screen = device.screen
    version, sha256 = agent_package_info()
    return {
        "type": "hello",
        "slug": screen.slug,
        "key": screen.access_key,
        "kiosk_url": f"{settings.PUBLIC_BASE_URL}/monitor?screen={screen.slug}&key={screen.access_key}",
        "power_method": screen.power_method,
        "power_config": screen.power_config or {},
        "update_window": screen.update_window or {},
        "auto_updates": screen.auto_updates,
        "daily_reboot": screen.daily_reboot,
        "agent_version": version,
        "agent_sha256": sha256,
    }


def command_message(command: DeviceCommand) -> dict:
    return {"type": "command", "id": command.id, "kind": command.kind, "params": command.params or {}}


def expire_old_commands(device: Device) -> int:
    now = timezone.now()
    return DeviceCommand.objects.filter(
        device=device, status='pending', created_at__lt=now - COMMAND_TTL,
    ).update(status='expired', finished_at=now)


def send_pending_commands(device: Device) -> list:
    """Abgelaufene Befehle auf `expired` setzen, die übrigen `pending` auf `sent` setzen und als
    Nachrichten zurückgeben (der Consumer sendet sie)."""
    expire_old_commands(device)
    messages = []
    for command in DeviceCommand.objects.filter(device=device, status='pending').order_by('created_at', 'id'):
        if DeviceCommand.objects.filter(pk=command.pk, status='pending').update(status='sent'):
            messages.append(command_message(command))
    return messages


def claim_command(device: Device, command_id: int):
    """Einen `pending`-Befehl dieses Geräts auf `sent` setzen; Nachricht oder None."""
    command = DeviceCommand.objects.filter(pk=command_id, device=device).first()
    if command is None or command.created_at < timezone.now() - COMMAND_TTL:
        return None
    if not DeviceCommand.objects.filter(pk=command.pk, status='pending').update(status='sent'):
        return None
    return command_message(command)


def finish_command(device: Device, command_id, ok: bool, text: str) -> None:
    DeviceCommand.objects.filter(pk=command_id, device=device, status__in=['pending', 'sent']).update(
        status='ok' if ok else 'failed', result=str(text or '')[:2000], finished_at=timezone.now())


def update_gate(screen: Screen, now) -> tuple:
    """Darf der Agent jetzt aktualisieren oder neu starten? Gleiche Vorrangfolge wie `display._mode`:
    Notfall, Klausur, On-Air; zusätzlich laufende Termine."""
    from veranstaltung.models import Veranstaltung
    cfg = MonitorSettings.load()
    if cfg.emergency_active:
        return False, "Notfall aktiv"
    exam = screen.exams.filter(active_from__lte=now, active_until__gte=now).order_by('active_from').first()
    if exam is not None:
        return False, f"Klausur „{exam.title}\" läuft"
    if cfg.on_air_active:
        return False, "On-Air aktiv"
    event = (Veranstaltung.objects.exclude(status='abgesagt')
             .filter(datum_von__lte=now, datum_bis__gte=now).order_by('datum_von').first())
    if event is not None:
        return False, f"Termin „{event.titel}\" läuft"
    return True, ""


def record_update_result(device: Device, data: dict) -> None:
    error = data.get("error")
    info = {"at": data.get("at"), "packages": data.get("packages"),
            "rebooted": bool(data.get("rebooted")), "error": error or None}
    if error:
        text = f"Update fehlgeschlagen: {str(error)[:200]}"
        kind = 'update_failed'
    else:
        packages = data.get("packages")
        text = f"Update abgeschlossen ({packages} Pakete)" if packages is not None else "Update abgeschlossen"
        if info["rebooted"]:
            text += ", Neustart ausgeführt"
        kind = 'update'
    DeviceEvent.objects.create(device=device, screen=device.screen, kind=kind, text=text[:300], data=info)
    telemetry = dict(device.last_telemetry or {})
    telemetry["last_update"] = {**info, "ok": not error}
    Device.objects.filter(pk=device.pk).update(last_telemetry=telemetry)


def store_telemetry(device: Device, data: dict) -> None:
    """Telemetrie speichern; das vom Server gesetzte `last_update` bleibt erhalten."""
    current = Device.objects.filter(pk=device.pk).values_list('last_telemetry', flat=True).first() or {}
    telemetry = dict(data)
    if "last_update" not in telemetry and "last_update" in current:
        telemetry["last_update"] = current["last_update"]
    fields = {"last_telemetry": telemetry}
    version = telemetry.get("agent_version")
    if isinstance(version, str) and version:
        fields["agent_version"] = version[:20]
    Device.objects.filter(pk=device.pk).update(**fields)
