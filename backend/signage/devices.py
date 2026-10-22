"""
Fachlogik für Geräte-Kopplung und Token-Verwaltung (Spec §3).

pairing_id und Geräte-Token liegen nur als SHA-256-Hash in der Datenbank.
"""
import hashlib
import json
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from core.notify import notify_many

from . import push
from .agent_package import agent_package_info
from .models import Device, DeviceCommand, DeviceEvent, MonitorSettings, PairingRequest, Screen

PAIRING_TTL = timedelta(minutes=15)
MAX_OPEN_REQUESTS = 10
MAX_PER_SERIAL = 3
COMMAND_TTL = timedelta(minutes=5)  # `pending`: so lange wartet ein Befehl auf ein offline Gerät
SENT_COMMAND_TTL = timedelta(minutes=75)  # `sent`: über dem apt-Limit von 60 Minuten (update_now)
EXPIRED_PENDING_TEXT = 'Das Gerät war 5 Minuten nicht verbunden.'
EXPIRED_SENT_TEXT = 'Keine Rückmeldung vom Gerät.'
MAX_TELEMETRY_BYTES = 64 * 1024
logger = logging.getLogger(__name__)


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
    pending = DeviceCommand.objects.filter(
        device=device, status='pending', created_at__lt=now - COMMAND_TTL,
    ).update(status='expired', result=EXPIRED_PENDING_TEXT, finished_at=now)
    sent = DeviceCommand.objects.filter(
        device=device, status='sent', created_at__lt=now - SENT_COMMAND_TTL,
    ).update(status='expired', result=EXPIRED_SENT_TEXT, finished_at=now)
    return pending + sent


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
    changed = DeviceCommand.objects.filter(
        pk=command_id, device=device, status__in=['pending', 'sent']).update(
        status='ok' if ok else 'failed', result=str(text or '')[:2000], finished_at=timezone.now())
    if not changed:
        return
    # Protokoll-Eintrag des Befehls bekommt das Ergebnis (Spec §5: Person, Zeit, Ergebnis)
    try:
        event = DeviceEvent.objects.filter(device=device, kind='command',
                                           data__command_id=int(command_id)).first()
    except (TypeError, ValueError):
        event = None
    if event is not None:
        label = COMMAND_LABELS.get(event.data.get('kind'), 'Befehl')
        outcome = str(text or '').strip() or ('ausgeführt' if ok else 'fehlgeschlagen')
        event.text = f"{label}: {outcome}"[:300]
        event.save(update_fields=['text'])


COMMAND_LABELS = {
    'reload': 'Neu laden', 'restart_browser': 'Browser neu starten', 'reboot': 'Pi neu starten',
    'power_on': 'Bildschirm an', 'power_off': 'Bildschirm aus', 'update_now': 'Jetzt aktualisieren',
    'screenshot': 'Screenshot', 'test_pattern': 'Testbild',
}


def create_command(device: Device, kind: str, user_id: str = '', user_name: str = '') -> DeviceCommand:
    """Befehl anlegen (Status `pending`) und im Protokoll vermerken. Senden: push.push_device_command
    nach dem Commit."""
    with transaction.atomic():
        command = DeviceCommand.objects.create(
            device=device, kind=kind, created_by_id=(user_id or '')[:64], created_by_name=(user_name or '')[:150])
        DeviceEvent.objects.create(
            device=device, screen=device.screen, kind='command',
            text=f"{COMMAND_LABELS.get(kind, kind)} angefordert"[:300],
            data={'command_id': command.id, 'kind': kind, 'created_by_name': command.created_by_name})
    return command


# ── Ampel (Spec §7.1) ────────────────────────────────────────────────

ONLINE_WINDOW = timedelta(minutes=2)


def device_status(device, screen, settings, now) -> tuple:
    """(status, Text) für die Ampel. `device` None oder zurückgezogen = kein Gerät; dann zeigt ein
    Bildschirm mit jungem `cec_status_at` den Rückfall „Altes Skript“. Die Warnungen kommen aus
    `device.active_warnings` (pflegt die Überwachung)."""
    from . import power
    if device is None or device.revoked_at is not None:
        if screen is not None and screen.cec_status_at and now - screen.cec_status_at <= ONLINE_WINDOW:
            return 'legacy', 'Altes Skript'
        return 'unpaired', 'Kein Gerät gekoppelt'
    seen = device.last_seen_at
    if seen is not None and now - seen <= ONLINE_WINDOW:
        warnings = device.active_warnings or []
        if warnings:
            first = warnings[0].get('text', '') if isinstance(warnings[0], dict) else str(warnings[0])
            return 'warning', f'Warnung · {first}'
        return 'online', 'Online'
    since = timezone.localtime(seen).strftime('%H:%M') if seen else None
    tail = f'zuletzt gesehen {since}' if since else 'noch nie gesehen'
    if screen is not None and not power.compute_power_state(screen, now):
        return 'off', f'Aus · {tail}'
    return 'offline', f'Offline · {tail}'


def update_gate(screen: Screen, now) -> tuple:
    """Darf der Agent jetzt aktualisieren oder neu starten? Gleiche Regeln wie `display._mode`
    (Notfall, Klausur mit Zwangsanzeige, On-Air der aktuellen Ansicht) plus ein aktiver Termin
    (Monitor-Event), der diesem Bildschirm zugewiesen ist."""
    cfg = MonitorSettings.load()
    if cfg.emergency_active:
        return False, "Notfall aktiv"
    exam = screen.get_active_exam()
    if exam is not None and exam.display_mode in ('fullscreen', 'split'):
        return False, f"Klausur „{exam.title}\" läuft"
    if cfg.on_air_active:
        view = screen.get_active_view()
        if view is not None and view.on_air_behavior != 'none':
            return False, "On-Air aktiv"
    for assignment in screen.event_assignments.select_related('event'):
        if assignment.event.is_active_now:
            return False, f"Termin „{assignment.event.name}\" läuft"
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


def record_agent_update(device: Device, event) -> None:
    """Ereignis `agent_updated` für ein abgeschlossenes Selbst-Update, einmal je from/to/at."""
    if not isinstance(event, dict):
        return
    old, new, at = event.get("from"), event.get("to"), event.get("at")
    if not (isinstance(old, str) and isinstance(new, str) and isinstance(at, str) and old and new and at):
        return
    old, new, at = old[:20], new[:20], at[:40]
    if any(e.data == {"from": old, "to": new, "at": at}
           for e in DeviceEvent.objects.filter(device=device, kind='agent_updated').order_by('-id')[:20]):
        return
    DeviceEvent.objects.create(device=device, screen=device.screen, kind='agent_updated',
                               text=f"Agent aktualisiert von {old} auf {new}", data={"from": old, "to": new, "at": at})


def store_telemetry(device: Device, data: dict) -> None:
    """Telemetrie speichern; das vom Server gesetzte `last_update` bleibt erhalten.
    Zu große Nachrichten (über 64 KB JSON) werden verworfen."""
    if len(json.dumps(data, default=str)) > MAX_TELEMETRY_BYTES:
        logger.warning("Telemetrie von Gerät %s verworfen: über %s Bytes", device.pk, MAX_TELEMETRY_BYTES)
        return
    current = Device.objects.filter(pk=device.pk).values_list('last_telemetry', flat=True).first() or {}
    telemetry = dict(data)
    record_agent_update(device, telemetry.pop("agent_updated", None))
    if "last_update" not in telemetry and "last_update" in current:
        telemetry["last_update"] = current["last_update"]
    fields = {"last_telemetry": telemetry}
    system = telemetry.get("system")
    version = system.get("agent_version") if isinstance(system, dict) else None
    if not (isinstance(version, str) and version):
        version = telemetry.get("agent_version")  # fallback: flat form
    if isinstance(version, str) and version:
        fields["agent_version"] = version[:20]
    Device.objects.filter(pk=device.pk).update(**fields)


# ── Warnungen und Überwachung (Spec §7.2, §7.3) ──────────────────────

EVENT_RETENTION = timedelta(days=90)
UPDATE_FAILED_LOOKBACK = timedelta(days=1)


def _number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _group(telemetry, name) -> dict:
    group = telemetry.get(name) if isinstance(telemetry, dict) else None
    return group if isinstance(group, dict) else {}


def _aware(value):
    parsed = parse_datetime(value) if isinstance(value, str) else None
    if parsed is not None and timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed


def compute_warnings(telemetry: dict, settings, now) -> list:
    """Warnungen `[{code, text}]` aus der Telemetrie. Fehlende Werte (null) erzeugen keine Warnung."""
    network, system = _group(telemetry, 'network'), _group(telemetry, 'system')
    display, updates = _group(telemetry, 'display'), _group(telemetry, 'updates')
    out = []
    temperature = _number(system.get('temperature_c'))
    if temperature is not None and temperature > settings.warn_temperature_c:
        out.append({'code': 'temperature', 'text': f'Temperatur {round(temperature)} °C'})
    if system.get('throttled_now') is True:
        out.append({'code': 'throttled', 'text': 'Drosselung aktiv'})
    disk = _number(system.get('disk_percent'))
    if disk is not None and disk > settings.warn_disk_percent:
        out.append({'code': 'disk', 'text': f'Speicher {round(disk)} % belegt'})
    signal = _number(network.get('signal_dbm'))
    if network.get('kind') == 'wifi' and signal is not None and signal < settings.warn_wifi_dbm:
        out.append({'code': 'wifi', 'text': f'WLAN schwach ({round(signal)} dBm)'})
    if display.get('browser_running') is False:
        out.append({'code': 'browser', 'text': 'Browser läuft nicht'})
    if updates.get('last_ok') is False:
        out.append({'code': 'update_failed', 'text': 'Letztes Update fehlgeschlagen'})
    since = _aware(updates.get('reboot_required_since'))
    if since is not None and now - since > timedelta(days=settings.warn_reboot_days):
        out.append({'code': 'reboot_pending', 'text': f'Neustart seit {(now - since).days} Tagen nötig'})
    return out


def notification_recipients() -> list:
    """keycloak_ids aller Nutzer mit effektivem Recht `monitor.devices` (Admins zählen über das
    gecachte Admin-Flag am Profil)."""
    from users.models import UserProfile
    return [p.keycloak_id for p in UserProfile.objects.all()
            if p.keycloak_id and p.has_permission('monitor.devices', p.is_admin_cached)]


def _link(screen) -> str:
    return f'/monitor-admin/screens/{screen.id}'


def _watch_device(device_id, cfg, now, notify) -> None:
    """Zustand eines Geräts nachführen. Läuft unter Zeilensperre, damit zwei gleichzeitige Läufe
    nichts doppelt melden."""
    from . import power
    with transaction.atomic():
        device = Device.objects.select_for_update().select_related('screen').filter(
            pk=device_id, revoked_at__isnull=True, screen__isnull=False).first()
        if device is None:
            return
        screen, seen = device.screen, device.last_seen_at
        changed = set()

        def event(kind, text, **data):
            DeviceEvent.objects.create(device=device, screen=screen, kind=kind, text=text[:300], data=data)

        online = seen is not None and now - seen <= ONLINE_WINDOW
        if online:
            if device.offline_notified_at is not None:
                event('online', 'Wieder online.')
                notify(f'Bildschirm {screen.name} ist wieder online.')
                device.offline_notified_at = None
                changed.add('offline_notified_at')
            # Warnungen nur aus frischer Telemetrie; offline bleibt der letzte Stand stehen.
            current = compute_warnings(device.last_telemetry, cfg, now)
            known = {w.get('code') for w in device.active_warnings or [] if isinstance(w, dict)}
            for warning in current:
                if warning['code'] not in known:
                    event('warning', warning['text'], code=warning['code'])
                    notify(f"{screen.name}: {warning['text']}.")
            codes = {w['code'] for w in current}
            for old in device.active_warnings or []:
                if isinstance(old, dict) and old.get('code') not in codes:
                    event('warning_cleared', f"Warnung behoben: {old.get('text', '')}", code=old.get('code'))
            if current != (device.active_warnings or []):
                device.active_warnings = current
                changed.add('active_warnings')
        elif (seen is not None and now - seen >= timedelta(minutes=cfg.device_offline_minutes)
                and device.offline_notified_at is None and power.compute_power_state(screen, now)):
            minutes = int((now - seen).total_seconds() // 60)
            event('offline', f'Offline seit {minutes} Minuten.')
            notify(f'Bildschirm {screen.name} ist seit {minutes} Minuten offline.')
            device.offline_notified_at = now
            changed.add('offline_notified_at')

        failed = DeviceEvent.objects.filter(device=device, kind='update_failed',
                                            created_at__gte=now - UPDATE_FAILED_LOOKBACK)
        for item in failed.order_by('created_at', 'id'):
            if item.data.get('notified'):
                continue
            reason = str(item.data.get('error') or 'Grund unbekannt')[:200]
            notify(f'Update auf {screen.name} fehlgeschlagen: {reason}.')
            item.data = {**item.data, 'notified': True}
            item.save(update_fields=['data'])
        if changed:
            device.save(update_fields=sorted(changed))


def watch(now) -> None:
    """Ampel und Warnungen für alle Geräte nachführen, Übergänge als Ereignisse festhalten und
    Benachrichtigungen verschicken. Idempotent: der Zustand liegt am Gerät."""
    cfg = MonitorSettings.load()
    recipients = None
    for device_id in list(Device.objects.filter(revoked_at__isnull=True, screen__isnull=False)
                          .values_list('pk', flat=True)):
        try:
            pending = []
            _watch_device(device_id, cfg, now, pending.append)
            if not pending:
                continue
            screen = Device.objects.select_related('screen').get(pk=device_id).screen
            if screen is None:  # zwischenzeitlich entkoppelt: nichts mehr zu melden
                continue
            if recipients is None:
                recipients = notification_recipients()
            for body in pending:
                notify_many(recipients, 'system', 'Geräte-Überwachung', body, link=_link(screen))
        except Exception:
            logger.exception("Geräte-Überwachung für Gerät %s fehlgeschlagen", device_id)
    DeviceEvent.objects.filter(created_at__lt=now - EVENT_RETENTION).delete()
