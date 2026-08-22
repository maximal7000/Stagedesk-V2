"""
Monitor API — öffentliche + Admin-Endpunkte (Multi-Profil)
"""
import json
import re
import uuid
import urllib.request
import urllib.parse
import http.cookiejar
from datetime import datetime as dt
from ninja import Router, File, Form
from ninja.files import UploadedFile
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.utils.text import slugify

from core.auth import keycloak_auth
from users.api import is_admin
from users.models import UserProfile
from ninja.errors import HttpError
from .models import (
    MonitorConfig, Ankuendigung, MonitorDatei, Bildschirm, Klausur, WebUntisLink,
    MonitorEvent, EventBildschirm, KlausurVorlage, MonitorGlobalSettings,
)


def _require_perm(request, code: str):
    """Admin oder Permission. Wirft 403 wenn nichts davon passt."""
    if is_admin(request):
        return
    kid = request.auth.get('sub', '') if request.auth else ''
    if kid:
        try:
            if UserProfile.objects.get(keycloak_id=kid).has_permission(code, False):
                return
        except UserProfile.DoesNotExist:
            pass
    raise HttpError(403, "Keine Berechtigung")


def _log_audit(request, aktion, detail='', via_token=False):
    """Schreibt in den globalen Audit-Log (core.audit → inventar.AuditLog)."""
    from core.audit import log as _corelog
    low = aktion.lower()
    if 'deaktiv' in low or ' aus' in low:
        a = 'status_geaendert'
    elif 'aktiv' in low or ' an' in low:
        a = 'aktiviert'
    else:
        a = 'status_geaendert'
    name = f"{aktion}: {detail}" if detail else aktion
    _corelog(request, a, 'monitor', 0, name, {'via': 'token'} if via_token else None)
from .schemas import (
    MonitorConfigSchema, MonitorConfigUpdateSchema,
    MonitorProfileListSchema, MonitorProfileCreateSchema,
    AnkuendigungSchema, AnkuendigungCreateSchema,
    MonitorDateiSchema, OnAirSchema, NotfallSchema, ConfigVersionSchema,
    BildschirmListSchema, BildschirmCreateSchema, BildschirmUpdateSchema,
    KlausurSchema, KlausurCreateSchema, KlausurUpdateSchema,
    WebUntisLinkSchema, WebUntisLinkCreateSchema,
    MonitorEventSchema, MonitorEventCreateSchema, MonitorEventUpdateSchema,
    KlausurVorlageSchema, KlausurVorlageCreateSchema,
    GlobalSettingsSchema, GlobalSettingsUpdateSchema,
)
from . import oepnv

monitor_router = Router(tags=["Monitor"])

_HEX_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


def _clamp_int(v, lo, hi):
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return None


def _validate_config_data(data: dict) -> dict:
    """Serverseitige Validierung/Sanitisierung der Config-Update-Daten.
    Klemmt Zahlenbereiche, verwirft ungültige Hex-Farben, prüft Zeitfenster."""
    for key, lo, hi in [
        ('split_links_prozent', 20, 80), ('split_prozent', 20, 80),
        ('bild_fokus_x', 0, 100), ('bild_fokus_y', 0, 100),
        ('webuntis_zoom', 25, 400), ('refresh_intervall', 3, 3600),
    ]:
        if key in data and data[key] is not None:
            c = _clamp_int(data[key], lo, hi)
            if c is not None:
                data[key] = c
    # Hex-Farben: ungültige verwerfen (alter Wert bleibt). on_air_farbe darf leer sein.
    for key in ['hintergrund_farbe', 'akzent_farbe', 'on_air_farbe']:
        if key in data and data[key]:
            if not _HEX_RE.match(str(data[key])):
                data.pop(key)
    # Zeitplan: von < bis erzwingen
    if 'zeitplan' in data and isinstance(data['zeitplan'], list):
        for e in data['zeitplan']:
            if isinstance(e, dict):
                von, bis = e.get('von'), e.get('bis')
                if von and bis and str(von) >= str(bis):
                    raise HttpError(422, f"Zeitfenster ungültig: {von} muss vor {bis} liegen")
    return data


def _validate_klausur_data(data: dict) -> dict:
    """Klausur-Daten prüfen: Zeitraum von<bis, split_prozent, Hex-Farbe."""
    von, bis = data.get('aktiv_von'), data.get('aktiv_bis')
    if von and bis and von >= bis:
        raise HttpError(422, "Klausur: Ende muss nach dem Beginn liegen")
    if 'split_prozent' in data and data['split_prozent'] is not None:
        c = _clamp_int(data['split_prozent'], 20, 80)
        if c is not None:
            data['split_prozent'] = c
    if data.get('farbe') and not _HEX_RE.match(str(data['farbe'])):
        data.pop('farbe')
    return data


def _fetch_weather(config):
    """Wetter von OpenWeatherMap holen und cachen (15 Min)"""
    gs = MonitorGlobalSettings.load()
    api_key = gs.wetter_api_key or config.wetter_api_key   # global hat Vorrang
    if not config.zeige_wetter or not config.wetter_stadt or not api_key:
        return None

    # Cache noch gültig?
    if config.wetter_cache and config.wetter_cache_zeit:
        age = (timezone.now() - config.wetter_cache_zeit).total_seconds()
        if age < 900:
            return config.wetter_cache

    try:
        url = (
            f"https://api.openweathermap.org/data/2.5/weather"
            f"?q={urllib.parse.quote(config.wetter_stadt)}"
            f"&appid={api_key}"
            f"&units=metric&lang=de"
        )
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read())

        wetter = {
            'temperatur': round(data['main']['temp'], 1),
            'feels_like': round(data['main']['feels_like'], 1),
            'beschreibung': data['weather'][0]['description'].capitalize(),
            'icon': data['weather'][0]['icon'],
            'luftfeuchtigkeit': data['main']['humidity'],
            'stadt': data['name'],
        }
        config.wetter_cache = wetter
        config.wetter_cache_zeit = timezone.now()
        config.save(update_fields=['wetter_cache', 'wetter_cache_zeit', 'aktualisiert_am'])
        return wetter
    except Exception:
        return config.wetter_cache or None


def _fetch_raumplan(config):
    """Raumplan von WebUntis JSONRPC API holen und cachen (15 Min)"""
    gs = MonitorGlobalSettings.load()
    server = gs.raumplan_server or config.raumplan_server        # global hat Vorrang
    schule = gs.raumplan_schule or config.raumplan_schule
    if not config.zeige_raumplan or not server or not schule:
        return None

    # Cache noch gültig?
    if config.raumplan_cache and config.raumplan_cache_zeit:
        age = (timezone.now() - config.raumplan_cache_zeit).total_seconds()
        if age < 900:
            return config.raumplan_cache

    base_url = f"https://{server}/WebUntis/jsonrpc.do?school={urllib.parse.quote(schule)}"

    def _rpc(method, params=None, cookie_jar=None):
        body = json.dumps({
            "id": "1", "method": method,
            "params": params or {}, "jsonrpc": "2.0"
        }).encode()
        req = urllib.request.Request(base_url, data=body,
            headers={"Content-Type": "application/json"})
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
        with opener.open(req, timeout=5) as resp:
            return json.loads(resp.read())

    try:
        jar = http.cookiejar.CookieJar()

        # 1. Authentifizieren (anonym oder mit Credentials; global hat Vorrang)
        user = gs.raumplan_benutzername or config.raumplan_benutzername or "#anonymous#"
        pwd = gs.raumplan_passwort or config.raumplan_passwort or ""
        auth_resp = _rpc("authenticate", {"user": user, "password": pwd, "client": "stagedesk"}, jar)
        if "error" in auth_resp:
            return config.raumplan_cache or None

        # 2. Räume holen und Zielraum finden
        rooms_resp = _rpc("getRooms", {}, jar)
        rooms = rooms_resp.get("result", [])
        target_room = None
        raum_kuerzel = config.raumplan_raum.lower()
        for r in rooms:
            if r.get("name", "").lower() == raum_kuerzel or r.get("longName", "").lower() == raum_kuerzel:
                target_room = r
                break

        if not target_room:
            _rpc("logout", {}, jar)
            return config.raumplan_cache or None

        # 3. Stundenplan für heute holen
        today = dt.now().strftime("%Y%m%d")
        today_int = int(today)
        tt_resp = _rpc("getTimetable", {
            "options": {
                "element": {"id": target_room["id"], "type": 4},
                "startDate": today_int,
                "endDate": today_int,
                "showInfo": True,
                "showSubstText": True,
                "showLsText": True,
                "showStudentgroup": True,
            }
        }, jar)

        # 4. Logout
        _rpc("logout", {}, jar)

        # 5. Daten aufbereiten
        entries = []
        for lesson in tt_resp.get("result", []):
            start = str(lesson.get("startTime", "")).zfill(4)
            end = str(lesson.get("endTime", "")).zfill(4)
            subjects = [s.get("longname", s.get("name", "")) for s in lesson.get("su", [])]
            teachers = [t.get("longname", t.get("name", "")) for t in lesson.get("te", [])]
            classes = [k.get("name", "") for k in lesson.get("kl", [])]
            entries.append({
                'von': f"{start[:2]}:{start[2:]}",
                'bis': f"{end[:2]}:{end[2:]}",
                'fach': ", ".join(subjects) or "—",
                'lehrer': ", ".join(teachers) or "",
                'klassen': ", ".join(classes) or "",
                'info': lesson.get("info", "") or lesson.get("substText", "") or "",
            })

        entries.sort(key=lambda x: x['von'])

        raumplan = {
            'raum': target_room.get("longName", target_room.get("name", "")),
            'raum_kurz': target_room.get("name", ""),
            'eintraege': entries,
            'datum': dt.now().strftime("%d.%m.%Y"),
        }

        config.raumplan_cache = raumplan
        config.raumplan_cache_zeit = timezone.now()
        config.save(update_fields=['raumplan_cache', 'raumplan_cache_zeit', 'aktualisiert_am'])
        return raumplan

    except Exception as e:
        print(f"Raumplan-Fehler: {e}")
        return config.raumplan_cache or None


def _fetch_oepnv(config):
    """ÖPNV-Abfahrten holen und cachen (2 Min, bei Fehler 1 Min Pause)"""
    # Immer laden wenn Layout 'abfahrten', sonst nur wenn Widget aktiv
    if config.layout_modus != 'abfahrten' and not config.zeige_oepnv:
        return None
    if not config.oepnv_stationen:
        return None

    # Cache noch gültig? (1 Minute, bei Fehler auch 1 Min Pause)
    if config.oepnv_cache_zeit:
        age = (timezone.now() - config.oepnv_cache_zeit).total_seconds()
        if config.oepnv_cache and age < 60:
            return config.oepnv_cache
        # Auch bei leerem Cache: min. 60s warten (verhindert API-Spam bei Fehlern)
        if age < 60:
            return config.oepnv_cache

    try:
        result = oepnv.fetch_departures(
            stationen=config.oepnv_stationen,
            dauer=config.oepnv_dauer,
            max_pro_station=config.oepnv_max_abfahrten,
            zeige_bus=config.oepnv_zeige_bus,
            zeige_bahn=config.oepnv_zeige_bahn,
            zeige_fernverkehr=config.oepnv_zeige_fernverkehr,
            use_db=config.oepnv_api_db,
            use_nahsh=config.oepnv_api_nahsh,
            zeige_via=config.oepnv_zeige_via,
            streik_linien=config.oepnv_streik_linien if config.oepnv_streik_aktiv else None,
            streik_typen=config.oepnv_streik_typen if config.oepnv_streik_aktiv else None,
        )
        config.oepnv_cache = result
        config.oepnv_cache_zeit = timezone.now()
        config.save(update_fields=['oepnv_cache', 'oepnv_cache_zeit', 'aktualisiert_am'])
        return result
    except Exception as e:
        print(f"ÖPNV-Fehler: {e}")
        # Auch bei Fehler Timestamp setzen → nächster Retry frühestens in 60s
        config.oepnv_cache_zeit = timezone.now()
        config.save(update_fields=['oepnv_cache_zeit', 'aktualisiert_am'])
        return config.oepnv_cache or None


# ═══ Öffentlicher Endpunkt (kein Auth) ═══════════════════════════

@monitor_router.get("/display")
def get_display_data(request, profil: str = None, bildschirm: str = None):
    """Öffentlicher Endpunkt: Alle Daten für das Monitor-Display"""
    bs_obj = None
    if bildschirm:
        try:
            bs_obj = Bildschirm.objects.get(slug=bildschirm)
            config = bs_obj.get_active_profil()
        except Bildschirm.DoesNotExist:
            config = MonitorConfig.get(slug=profil)
    else:
        config = MonitorConfig.get(slug=profil)
    now = timezone.now()

    # Aktive Klausur (pro Bildschirm)
    klausur = None
    if bs_obj:
        k = bs_obj.get_active_klausur()
        if k:
            k_link = k.webuntis_link.url if k.webuntis_link else ''
            klausur = {
                'titel': k.titel, 'text': k.text,
                'farbe': k.farbe, 'aktiv_bis': k.aktiv_bis,
                'anzeige_modus': k.anzeige_modus,
                'split_seite': k.split_seite,
                'split_prozent': k.split_prozent,
                'webuntis_url': k_link,
            }

    # Ankündigungen: nur aktive + im Zeitfenster
    ankuendigungen = []
    for a in Ankuendigung.objects.filter(ist_aktiv=True):
        if a.aktiv_von and now < a.aktiv_von:
            continue
        if a.aktiv_bis and now > a.aktiv_bis:
            continue
        ankuendigungen.append({
            'id': a.id, 'titel': a.titel, 'text': a.text,
            'prioritaet': a.prioritaet, 'ist_aktiv': a.ist_aktiv,
            'aktiv_von': a.aktiv_von, 'aktiv_bis': a.aktiv_bis,
            'erstellt_am': a.erstellt_am,
        })

    # Veranstaltungen: nächste 7 Tage + aktuell laufende
    veranstaltungen = []
    if config.zeige_veranstaltungen:
        from veranstaltung.models import Veranstaltung
        sieben_tage = now + timezone.timedelta(days=7)
        events = Veranstaltung.objects.filter(
            status__in=['bestaetigt', 'laufend'],
            datum_bis__gte=now,
            datum_von__lte=sieben_tage,
        ).order_by('datum_von')[:10]

        for v in events:
            ist_laufend = v.status == 'laufend' or (
                v.datum_von and v.datum_bis and v.datum_von <= now <= v.datum_bis
            )
            veranstaltungen.append({
                'id': v.id, 'name': v.titel, 'ort': v.ort or '',
                'datum_von': v.datum_von, 'datum_bis': v.datum_bis,
                'status': v.status, 'ist_laufend': ist_laufend,
            })

    # Dateien
    dateien = []
    for d in MonitorDatei.objects.all():
        dateien.append({
            'id': d.id, 'name': d.name, 'typ': d.typ,
            'datei_url': d.datei.url if d.datei else '',
            'reihenfolge': d.reihenfolge,
        })

    # Wetter
    wetter = _fetch_weather(config)

    # Raumplan
    raumplan = _fetch_raumplan(config)

    # ÖPNV Abfahrten
    abfahrten = _fetch_oepnv(config)

    # Config (sensitive Felder entfernen)
    config_data = MonitorConfigSchema.from_orm(config).dict()
    config_data['api_token'] = ''
    config_data['wetter_api_key'] = ''
    config_data['raumplan_benutzername'] = ''
    config_data['raumplan_passwort'] = ''
    config_data['logo_url_resolved'] = config.get_logo_url()
    config_data['pdf_url_resolved'] = config.get_pdf_url()
    config_data['hintergrundbild_url_resolved'] = config.get_hintergrundbild_url()
    config_data['bild_url_resolved'] = config.get_bild_url()
    config_data['webuntis_url_resolved'] = config.get_webuntis_url()
    config_data['webuntis_url_1tag_resolved'] = config.get_webuntis_url_1tag()

    # Wenn on_air_vollbild aktiv → ON AIR Display Profil-Config mitliefern
    on_air_profil = None
    if config.on_air_vollbild:
        onair_config = MonitorConfig.objects.filter(layout_modus='onair').exclude(pk=config.pk).first()
        if onair_config:
            on_air_profil = {
                'on_air_farbe': onair_config.on_air_farbe,
                'on_air_text': onair_config.on_air_text,
                'on_air_groesse': onair_config.on_air_groesse,
                'on_air_position': onair_config.on_air_position,
                'on_air_blinken': onair_config.on_air_blinken,
                'zeige_uhr': onair_config.zeige_uhr,
            }

    return {
        'config': config_data,
        'ankuendigungen': ankuendigungen,
        'veranstaltungen': veranstaltungen,
        'dateien': dateien,
        'wetter': wetter,
        'raumplan': raumplan,
        'abfahrten': abfahrten,
        'on_air_profil': on_air_profil,
        'klausur': klausur,
    }


@monitor_router.get("/clock")
def get_clock_data(request):
    """Schlanker öffentlicher Endpunkt für externe Uhr-/Status-Displays:
    ON-AIR-Status + nächste Veranstaltungen. Kein Login nötig."""
    now = timezone.now()
    on_air = MonitorConfig.objects.filter(ist_on_air=True).exists()
    cfg = MonitorConfig.get()
    on_air_text = cfg.on_air_text if cfg else 'ON AIR'

    from veranstaltung.models import Veranstaltung
    events = (Veranstaltung.objects
              .exclude(status='abgesagt')
              .filter(datum_bis__gte=now)
              .order_by('datum_von')[:5])
    veranstaltungen = [{
        'titel': v.titel,
        'ort': v.ort or '',
        'datum_von': v.datum_von,
        'datum_bis': v.datum_bis,
        'status': v.effektiv_status,
        'ist_laufend': v.effektiv_status == 'laufend',
    } for v in events]

    return {
        'on_air': on_air,
        'on_air_text': on_air_text,
        'veranstaltungen': veranstaltungen,
    }


# ═══ ON AIR Endpunkt (Token-Auth) ════════════════════════════════

@monitor_router.post("/onair", response={200: dict, 401: dict, 403: dict})
def toggle_on_air(request, payload: OnAirSchema):
    """ON AIR Status ändern — betrifft ALLE Profile"""
    # Erst per Token prüfen
    token = request.headers.get('X-Monitor-Token', '')
    if token:
        config = MonitorConfig.objects.filter(api_token=token).first()
        if config:
            # Alle Profile updaten
            MonitorConfig.objects.all().update(
                ist_on_air=payload.on_air,
                on_air_seit=timezone.now() if payload.on_air else None,
            )
            _log_audit(request, 'ON AIR ' + ('an' if payload.on_air else 'aus'), via_token=True)
            return 200, {"success": True, "on_air": payload.on_air}
        return 401, {"success": False, "message": "Ungültiges Token"}

    auth_result = keycloak_auth(request)
    if not auth_result:
        return 401, {"success": False, "message": "Nicht autorisiert"}
    request.auth = auth_result
    try:
        _require_perm(request, 'monitor.onair')
    except HttpError as e:
        return 403, {"success": False, "message": e.message}
    MonitorConfig.objects.all().update(
        ist_on_air=payload.on_air,
        on_air_seit=timezone.now() if payload.on_air else None,
    )
    _log_audit(request, 'ON AIR ' + ('an' if payload.on_air else 'aus'))
    return 200, {"success": True, "on_air": payload.on_air}


# ═══ Notfall Endpunkt (Token-Auth) ═══════════════════════════════

@monitor_router.post("/notfall", response={200: dict, 401: dict, 403: dict})
def toggle_notfall(request, payload: NotfallSchema):
    """Notfall-Meldung aktivieren/deaktivieren — betrifft ALLE Profile"""
    token = request.headers.get('X-Monitor-Token', '')
    if token:
        config = MonitorConfig.objects.filter(api_token=token).first()
        if config:
            MonitorConfig.objects.all().update(
                notfall_aktiv=payload.aktiv,
                notfall_text=payload.text,
            )
            _log_audit(request, 'Notfall ' + ('an' if payload.aktiv else 'aus'), payload.text if payload.aktiv else '', via_token=True)
            return 200, {"success": True}
        return 401, {"success": False, "message": "Ungültiges Token"}

    auth_result = keycloak_auth(request)
    if not auth_result:
        return 401, {"success": False, "message": "Nicht autorisiert"}
    request.auth = auth_result
    try:
        _require_perm(request, 'monitor.notfall')
    except HttpError as e:
        return 403, {"success": False, "message": e.message}
    MonitorConfig.objects.all().update(
        notfall_aktiv=payload.aktiv,
        notfall_text=payload.text,
    )
    _log_audit(request, 'Notfall ' + ('an' if payload.aktiv else 'aus'), payload.text if payload.aktiv else '')
    return 200, {"success": True}


# ═══ Admin: Profile ══════════════════════════════════════════════

@monitor_router.get("/profile", response=list[MonitorProfileListSchema], auth=keycloak_auth)
def list_profiles(request):
    _require_perm(request, 'monitor.view')
    return MonitorConfig.objects.filter(geloescht_am__isnull=True).order_by('sortierung', 'name')


@monitor_router.post("/profile", auth=keycloak_auth)
def create_profile(request, payload: MonitorProfileCreateSchema):
    _require_perm(request, 'monitor.edit')
    slug = slugify(payload.slug or payload.name) or uuid.uuid4().hex[:8]

    # Slug-Kollision vermeiden
    base_slug = slug
    counter = 1
    while MonitorConfig.objects.filter(slug=slug).exists():
        slug = f"{base_slug}-{counter}"
        counter += 1

    if payload.clone_from_id:
        # Von bestehendem Profil klonen
        source = get_object_or_404(MonitorConfig, id=payload.clone_from_id)
        source.pk = None
        source.name = payload.name
        source.slug = slug
        source.ist_standard = False
        source.layout_modus = payload.layout_modus
        source.api_token = uuid.uuid4().hex
        source.save()
        return {'id': source.id, 'name': source.name, 'slug': source.slug}
    else:
        config = MonitorConfig(
            name=payload.name,
            slug=slug,
            ist_standard=False,
            layout_modus=payload.layout_modus,
        )
        config.save()
        return {'id': config.id, 'name': config.name, 'slug': config.slug}


@monitor_router.delete("/profile/{id}", auth=keycloak_auth)
def delete_profile(request, id: int):
    _require_perm(request, 'monitor.edit')
    config = get_object_or_404(MonitorConfig, id=id)
    if config.ist_standard:
        return {"success": False, "message": "Standard-Profil kann nicht gelöscht werden"}
    config.geloescht_am = timezone.now()
    config.save(update_fields=['geloescht_am', 'aktualisiert_am'])
    return {"success": True}


# ═══ Admin: Config ════════════════════════════════════════════════

@monitor_router.get("/config", response=MonitorConfigSchema, auth=keycloak_auth)
def get_config(request, profil_id: int = None):
    _require_perm(request, 'monitor.view')
    if profil_id:
        return get_object_or_404(MonitorConfig, id=profil_id)
    return MonitorConfig.get()


_VERSION_DENY = {'id', 'api_token', 'slug', 'erstellt_am', 'aktualisiert_am'}


def _snapshot_config(config):
    """Aktuellen Zustand als Version sichern; nur die letzten 15 behalten."""
    from .models import MonitorConfigVersion
    try:
        daten = json.loads(json.dumps(MonitorConfigSchema.from_orm(config).dict(), default=str))
        daten.pop('api_token', None)
        MonitorConfigVersion.objects.create(config=config, daten=daten)
        alte = list(MonitorConfigVersion.objects.filter(config=config).values_list('id', flat=True)[15:])
        if alte:
            MonitorConfigVersion.objects.filter(id__in=alte).delete()
    except Exception:
        pass  # Versionierung darf das Speichern nie blockieren


@monitor_router.put("/config", response=MonitorConfigSchema, auth=keycloak_auth)
def update_config(request, payload: MonitorConfigUpdateSchema, profil_id: int = None):
    _require_perm(request, 'monitor.edit')
    if profil_id:
        config = get_object_or_404(MonitorConfig, id=profil_id)
    else:
        config = MonitorConfig.get()

    _snapshot_config(config)  # Zustand vor der Änderung sichern

    data = payload.dict(exclude_unset=True)
    data = _validate_config_data(data)

    # FK-Felder separat behandeln
    if 'aktives_logo_id' in data:
        val = data.pop('aktives_logo_id')
        config.aktives_logo_id = val if val else None
    if 'aktive_pdf_id' in data:
        val = data.pop('aktive_pdf_id')
        config.aktive_pdf_id = val if val else None
    if 'aktives_hintergrundbild_id' in data:
        val = data.pop('aktives_hintergrundbild_id')
        config.aktives_hintergrundbild_id = val if val else None
    if 'aktives_bild_id' in data:
        val = data.pop('aktives_bild_id')
        config.aktives_bild_id = val if val else None
    if 'webuntis_link_id' in data:
        val = data.pop('webuntis_link_id')
        config.webuntis_link_id = val if val else None
    if 'webuntis_link_1tag_id' in data:
        val = data.pop('webuntis_link_1tag_id')
        config.webuntis_link_1tag_id = val if val else None

    for key, value in data.items():
        setattr(config, key, value)
    config.save()
    return config


@monitor_router.get("/config/versionen", response=list[ConfigVersionSchema], auth=keycloak_auth)
def list_config_versionen(request, profil_id: int):
    _require_perm(request, 'monitor.view')
    from .models import MonitorConfigVersion
    return list(MonitorConfigVersion.objects.filter(config_id=profil_id)[:15])


@monitor_router.post("/config/restore", response=MonitorConfigSchema, auth=keycloak_auth)
def restore_config_version(request, version_id: int):
    _require_perm(request, 'monitor.edit')
    from .models import MonitorConfigVersion
    version = get_object_or_404(MonitorConfigVersion, id=version_id)
    config = version.config
    _snapshot_config(config)  # aktuellen Stand vor dem Zurücksetzen ebenfalls sichern
    for key, value in (version.daten or {}).items():
        if key in _VERSION_DENY or not hasattr(config, key):
            continue
        try:
            setattr(config, key, value)
        except Exception:
            continue
    config.save()
    return config


@monitor_router.post("/config/regenerate-token", auth=keycloak_auth)
def regenerate_token(request, profil_id: int = None):
    _require_perm(request, 'monitor.edit')
    if profil_id:
        config = get_object_or_404(MonitorConfig, id=profil_id)
    else:
        config = MonitorConfig.get()
    config.api_token = uuid.uuid4().hex
    config.save(update_fields=['api_token', 'aktualisiert_am'])
    return {"api_token": config.api_token}


# ═══ Admin: Dateien (Upload/Manage) ══════════════════════════════

@monitor_router.get("/dateien", response=list[MonitorDateiSchema], auth=keycloak_auth)
def list_dateien(request, typ: str = None):
    _require_perm(request, 'monitor.view')
    qs = MonitorDatei.objects.filter(geloescht_am__isnull=True)
    if typ:
        qs = qs.filter(typ=typ)
    return qs


@monitor_router.post("/dateien", auth=keycloak_auth)
def upload_datei(request, datei: UploadedFile = File(...), name: str = Form(""), typ: str = Form("bild")):
    _require_perm(request, 'monitor.edit')
    obj = MonitorDatei.objects.create(
        name=name or datei.name,
        datei=datei,
        typ=typ,
    )
    return {
        'id': obj.id, 'name': obj.name, 'typ': obj.typ,
        'datei_url': obj.datei.url, 'reihenfolge': obj.reihenfolge,
    }


@monitor_router.delete("/dateien/{id}", auth=keycloak_auth)
def delete_datei(request, id: int):
    _require_perm(request, 'monitor.edit')
    d = get_object_or_404(MonitorDatei, id=id)
    # Soft-Delete → Papierkorb (Datei bleibt für Wiederherstellung erhalten)
    d.geloescht_am = timezone.now()
    d.save(update_fields=['geloescht_am'])
    return {"success": True}


# ═══ Admin: Papierkorb (Soft-Delete) ═════════════════════════════

@monitor_router.get("/papierkorb", auth=keycloak_auth)
def get_papierkorb(request):
    _require_perm(request, 'monitor.view')
    ansichten = [
        {'id': c.id, 'name': c.name, 'geloescht_am': c.geloescht_am}
        for c in MonitorConfig.objects.filter(geloescht_am__isnull=False).order_by('-geloescht_am')
    ]
    medien = [
        {'id': d.id, 'name': d.name, 'typ': d.typ, 'geloescht_am': d.geloescht_am}
        for d in MonitorDatei.objects.filter(geloescht_am__isnull=False).order_by('-geloescht_am')
    ]
    return {'ansichten': ansichten, 'medien': medien}


@monitor_router.post("/papierkorb/wiederherstellen", auth=keycloak_auth)
def restore_papierkorb(request, art: str, id: int):
    _require_perm(request, 'monitor.edit')
    if art == 'ansicht':
        obj = get_object_or_404(MonitorConfig, id=id)
        obj.geloescht_am = None
        obj.save(update_fields=['geloescht_am', 'aktualisiert_am'])
    elif art == 'medium':
        obj = get_object_or_404(MonitorDatei, id=id)
        obj.geloescht_am = None
        obj.save(update_fields=['geloescht_am'])
    else:
        raise HttpError(400, "Unbekannte Art")
    return {"success": True}


@monitor_router.delete("/papierkorb/endgueltig", auth=keycloak_auth)
def delete_papierkorb_permanent(request, art: str, id: int):
    _require_perm(request, 'monitor.edit')
    if art == 'ansicht':
        obj = get_object_or_404(MonitorConfig, id=id, geloescht_am__isnull=False)
        obj.delete()
    elif art == 'medium':
        obj = get_object_or_404(MonitorDatei, id=id, geloescht_am__isnull=False)
        if obj.datei:
            obj.datei.delete(save=False)
        obj.delete()
    else:
        raise HttpError(400, "Unbekannte Art")
    return {"success": True}


# ═══ Admin: Ankündigungen ═════════════════════════════════════════

@monitor_router.get("/ankuendigungen", response=list[AnkuendigungSchema], auth=keycloak_auth)
def list_ankuendigungen(request):
    _require_perm(request, 'monitor.view')
    return Ankuendigung.objects.all()


@monitor_router.post("/ankuendigungen", response=AnkuendigungSchema, auth=keycloak_auth)
def create_ankuendigung(request, payload: AnkuendigungCreateSchema):
    _require_perm(request, 'monitor.edit')
    return Ankuendigung.objects.create(**payload.dict())


@monitor_router.put("/ankuendigungen/{id}", response=AnkuendigungSchema, auth=keycloak_auth)
def update_ankuendigung(request, id: int, payload: AnkuendigungCreateSchema):
    _require_perm(request, 'monitor.edit')
    a = get_object_or_404(Ankuendigung, id=id)
    for key, value in payload.dict().items():
        setattr(a, key, value)
    a.save()
    return a


@monitor_router.delete("/ankuendigungen/{id}", auth=keycloak_auth)
def delete_ankuendigung(request, id: int):
    _require_perm(request, 'monitor.edit')
    a = get_object_or_404(Ankuendigung, id=id)
    a.delete()
    return {"success": True}


# ═══ Admin: WebUntis-Link-Bibliothek ═════════════════════════════

@monitor_router.get("/webuntis-links", response=list[WebUntisLinkSchema], auth=keycloak_auth)
def list_webuntis_links(request):
    _require_perm(request, 'monitor.view')
    return WebUntisLink.objects.all()


@monitor_router.post("/webuntis-links", response=WebUntisLinkSchema, auth=keycloak_auth)
def create_webuntis_link(request, payload: WebUntisLinkCreateSchema):
    _require_perm(request, 'monitor.edit')
    return WebUntisLink.objects.create(**payload.dict())


@monitor_router.put("/webuntis-links/{id}", response=WebUntisLinkSchema, auth=keycloak_auth)
def update_webuntis_link(request, id: int, payload: WebUntisLinkCreateSchema):
    _require_perm(request, 'monitor.edit')
    link = get_object_or_404(WebUntisLink, id=id)
    for key, value in payload.dict().items():
        setattr(link, key, value)
    link.save()
    return link


@monitor_router.delete("/webuntis-links/{id}", auth=keycloak_auth)
def delete_webuntis_link(request, id: int):
    _require_perm(request, 'monitor.edit')
    get_object_or_404(WebUntisLink, id=id).delete()
    return {"success": True}


# ═══ Admin: ÖPNV Stationssuche ═══════════════════════════════════

@monitor_router.get("/oepnv/suche", auth=keycloak_auth)
def search_oepnv_stations(request, q: str = "", results: int = 10,
                           use_db: bool = True, use_nahsh: bool = True):
    """Stationen für ÖPNV-Abfahrtsmonitor suchen"""
    _require_perm(request, 'monitor.edit')
    if len(q) < 2:
        return []
    return oepnv.search_stations(q, results=min(results, 20),
                                  use_db=use_db, use_nahsh=use_nahsh)


# ═══ Bildschirm: Power-Status (öffentlich, kein Auth) ═════════════

@monitor_router.get("/bildschirm/power")
def get_bildschirm_power(request, slug: str):
    """Öffentlicher Endpunkt: Soll der Bildschirm gerade an sein?
    Wird vom Raspberry Pi per Cronjob gepollt."""
    try:
        bs = Bildschirm.objects.get(slug=slug)
        return {
            'slug': bs.slug,
            'power': bs.get_power_state(),
            'power_zeitplan': bs.power_zeitplan,
            'ferien_modus': bs.ferien_modus,
            'power_ausnahmen': bs.power_ausnahmen,
            'cec_status': bs.cec_status,
            'cec_status_zeit': bs.cec_status_zeit,
        }
    except Bildschirm.DoesNotExist:
        return {'slug': slug, 'power': True, 'error': 'Bildschirm nicht gefunden'}


@monitor_router.post("/bildschirm/cec-status")
def report_cec_status(request, slug: str, status: str):
    """Öffentlicher Endpunkt: Pi meldet den tatsächlichen CEC-Status zurück.
    status: 'on', 'standby', 'unknown'"""
    try:
        bs = Bildschirm.objects.get(slug=slug)
        bs.cec_status = status[:20]
        bs.cec_status_zeit = timezone.now()
        bs.save(update_fields=['cec_status', 'cec_status_zeit', 'aktualisiert_am'])
        return {'success': True, 'slug': bs.slug, 'cec_status': bs.cec_status}
    except Bildschirm.DoesNotExist:
        return {'success': False, 'error': 'Bildschirm nicht gefunden'}


# ═══ Admin: Bildschirme ═══════════════════════════════════════════

@monitor_router.get("/bildschirme", response=list[BildschirmListSchema], auth=keycloak_auth)
def list_bildschirme(request):
    _require_perm(request, 'monitor.view')
    return Bildschirm.objects.all()


@monitor_router.post("/bildschirme", auth=keycloak_auth)
def create_bildschirm(request, payload: BildschirmCreateSchema):
    _require_perm(request, 'monitor.edit')
    slug = slugify(payload.slug or payload.name) or uuid.uuid4().hex[:8]
    base_slug = slug
    counter = 1
    while Bildschirm.objects.filter(slug=slug).exists():
        slug = f"{base_slug}-{counter}"
        counter += 1
    bs = Bildschirm.objects.create(
        name=payload.name,
        slug=slug,
        default_profil_id=payload.default_profil_id,
    )
    return {'id': bs.id, 'name': bs.name, 'slug': bs.slug}


@monitor_router.put("/bildschirme/{id}", response=BildschirmListSchema, auth=keycloak_auth)
def update_bildschirm(request, id: int, payload: BildschirmUpdateSchema):
    _require_perm(request, 'monitor.edit')
    bs = get_object_or_404(Bildschirm, id=id)
    data = payload.dict(exclude_unset=True)
    if 'default_profil_id' in data:
        val = data.pop('default_profil_id')
        bs.default_profil_id = val if val else None
    if 'override_profil_id' in data:
        val = data.pop('override_profil_id')
        bs.override_profil_id = val if val else None
    # Power-relevante Felder erkennen, damit wir den Pi sofort informieren
    power_keys = {'zeitplan', 'power_zeitplan', 'ferien_modus', 'power_ausnahmen', 'power_modus'}
    power_changed = bool(power_keys & set(data.keys()))
    for key, value in data.items():
        setattr(bs, key, value)
    bs.save()
    if power_changed:
        from .consumers import push_power_to_bildschirm
        push_power_to_bildschirm(bs.slug)
    return bs


@monitor_router.delete("/bildschirme/{id}", auth=keycloak_auth)
def delete_bildschirm(request, id: int):
    _require_perm(request, 'monitor.edit')
    bs = get_object_or_404(Bildschirm, id=id)
    bs.delete()
    return {"success": True}


# ═══ Klausuren ════════════════════════════════════════════════════

@monitor_router.get("/klausuren", response=list[KlausurSchema], auth=keycloak_auth)
def list_klausuren(request):
    _require_perm(request, 'monitor.view')
    return list(Klausur.objects.prefetch_related('bildschirme').all())


@monitor_router.post("/klausuren", response=KlausurSchema, auth=keycloak_auth)
def create_klausur(request, payload: KlausurCreateSchema):
    _require_perm(request, 'monitor.edit')
    data = payload.dict()
    _validate_klausur_data(data)
    bildschirm_ids = data.pop('bildschirm_ids', [])
    k = Klausur.objects.create(**data)
    if bildschirm_ids:
        k.bildschirme.set(Bildschirm.objects.filter(id__in=bildschirm_ids))
    return k


@monitor_router.put("/klausuren/{id}", response=KlausurSchema, auth=keycloak_auth)
def update_klausur(request, id: int, payload: KlausurUpdateSchema):
    _require_perm(request, 'monitor.edit')
    k = get_object_or_404(Klausur, id=id)
    data = payload.dict(exclude_unset=True)
    _validate_klausur_data(data)
    bildschirm_ids = data.pop('bildschirm_ids', None)
    for key, value in data.items():
        setattr(k, key, value)
    k.save()
    if bildschirm_ids is not None:
        k.bildschirme.set(Bildschirm.objects.filter(id__in=bildschirm_ids))
    return k


@monitor_router.delete("/klausuren/{id}", auth=keycloak_auth)
def delete_klausur(request, id: int):
    _require_perm(request, 'monitor.edit')
    k = get_object_or_404(Klausur, id=id)
    k.delete()
    return {"success": True}


# ═══ Admin: Events (aktivierbare Modi) ═══════════════════════════

def _apply_event_zuweisungen(event, zuweisungen):
    """Setzt die Bildschirm→Profil-Zuweisungen eines Events neu."""
    event.zuweisungen.all().delete()
    for z in zuweisungen or []:
        d = z if isinstance(z, dict) else z.dict()
        if d.get('bildschirm_id') and d.get('profil_id'):
            EventBildschirm.objects.create(
                event=event, bildschirm_id=d['bildschirm_id'], profil_id=d['profil_id'])


@monitor_router.get("/events", response=list[MonitorEventSchema], auth=keycloak_auth)
def list_events(request):
    _require_perm(request, 'monitor.view')
    return MonitorEvent.objects.all()


@monitor_router.post("/events", response=MonitorEventSchema, auth=keycloak_auth)
def create_event(request, payload: MonitorEventCreateSchema):
    _require_perm(request, 'monitor.edit')
    data = payload.dict()
    zuweisungen = data.pop('zuweisungen', [])
    event = MonitorEvent.objects.create(**data)
    _apply_event_zuweisungen(event, zuweisungen)
    return event


@monitor_router.put("/events/{id}", response=MonitorEventSchema, auth=keycloak_auth)
def update_event(request, id: int, payload: MonitorEventUpdateSchema):
    _require_perm(request, 'monitor.edit')
    event = get_object_or_404(MonitorEvent, id=id)
    data = payload.dict(exclude_unset=True)
    zuweisungen = data.pop('zuweisungen', None)
    for key, value in data.items():
        setattr(event, key, value)
    event.save()
    if zuweisungen is not None:
        _apply_event_zuweisungen(event, zuweisungen)
    return event


@monitor_router.delete("/events/{id}", auth=keycloak_auth)
def delete_event(request, id: int):
    _require_perm(request, 'monitor.edit')
    get_object_or_404(MonitorEvent, id=id).delete()
    return {"success": True}


@monitor_router.post("/events/{id}/aktivieren", response=MonitorEventSchema, auth=keycloak_auth)
def activate_event(request, id: int):
    _require_perm(request, 'monitor.edit')
    event = get_object_or_404(MonitorEvent, id=id)
    event.aktiv = True
    event.save(update_fields=['aktiv'])
    _log_audit(request, 'Event aktiviert', event.name)
    return event


@monitor_router.post("/events/{id}/deaktivieren", response=MonitorEventSchema, auth=keycloak_auth)
def deactivate_event(request, id: int):
    _require_perm(request, 'monitor.edit')
    event = get_object_or_404(MonitorEvent, id=id)
    event.aktiv = False
    event.save(update_fields=['aktiv'])
    _log_audit(request, 'Event deaktiviert', event.name)
    return event


# ═══ Admin: Klausur-Vorlagen ═════════════════════════════════════

@monitor_router.get("/klausur-vorlagen", response=list[KlausurVorlageSchema], auth=keycloak_auth)
def list_klausur_vorlagen(request):
    _require_perm(request, 'monitor.view')
    return KlausurVorlage.objects.all()


@monitor_router.post("/klausur-vorlagen", response=KlausurVorlageSchema, auth=keycloak_auth)
def create_klausur_vorlage(request, payload: KlausurVorlageCreateSchema):
    _require_perm(request, 'monitor.edit')
    return KlausurVorlage.objects.create(**payload.dict())


@monitor_router.put("/klausur-vorlagen/{id}", response=KlausurVorlageSchema, auth=keycloak_auth)
def update_klausur_vorlage(request, id: int, payload: KlausurVorlageCreateSchema):
    _require_perm(request, 'monitor.edit')
    v = get_object_or_404(KlausurVorlage, id=id)
    for key, value in payload.dict().items():
        setattr(v, key, value)
    v.save()
    return v


@monitor_router.delete("/klausur-vorlagen/{id}", auth=keycloak_auth)
def delete_klausur_vorlage(request, id: int):
    _require_perm(request, 'monitor.edit')
    get_object_or_404(KlausurVorlage, id=id).delete()
    return {"success": True}


# ═══ Admin: Globale Einstellungen (Wetter/Raumplan-Zugang) ═══════

@monitor_router.get("/global-settings", response=GlobalSettingsSchema, auth=keycloak_auth)
def get_global_settings(request):
    _require_perm(request, 'monitor.view')
    return MonitorGlobalSettings.load()


@monitor_router.put("/global-settings", response=GlobalSettingsSchema, auth=keycloak_auth)
def update_global_settings(request, payload: GlobalSettingsUpdateSchema):
    _require_perm(request, 'monitor.edit')
    gs = MonitorGlobalSettings.load()
    for key, value in payload.dict(exclude_unset=True).items():
        setattr(gs, key, value)
    gs.save()
    return gs
