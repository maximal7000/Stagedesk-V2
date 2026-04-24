"""
Monitor API — öffentliche + Admin-Endpunkte (Multi-Profil)
"""
import json
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
from .models import MonitorConfig, Ankuendigung, MonitorDatei, Bildschirm, Klausur
from .schemas import (
    MonitorConfigSchema, MonitorConfigUpdateSchema,
    MonitorProfileListSchema, MonitorProfileCreateSchema,
    AnkuendigungSchema, AnkuendigungCreateSchema,
    MonitorDateiSchema, OnAirSchema, NotfallSchema,
    BildschirmListSchema, BildschirmCreateSchema, BildschirmUpdateSchema,
    KlausurSchema, KlausurCreateSchema, KlausurUpdateSchema,
)
from . import oepnv

monitor_router = Router(tags=["Monitor"])


def _fetch_weather(config):
    """Wetter von OpenWeatherMap holen und cachen (15 Min)"""
    if not config.zeige_wetter or not config.wetter_stadt or not config.wetter_api_key:
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
            f"&appid={config.wetter_api_key}"
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
    if not config.zeige_raumplan or not config.raumplan_server or not config.raumplan_schule:
        return None

    # Cache noch gültig?
    if config.raumplan_cache and config.raumplan_cache_zeit:
        age = (timezone.now() - config.raumplan_cache_zeit).total_seconds()
        if age < 900:
            return config.raumplan_cache

    base_url = f"https://{config.raumplan_server}/WebUntis/jsonrpc.do?school={urllib.parse.quote(config.raumplan_schule)}"

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

        # 1. Authentifizieren (anonym oder mit Credentials)
        user = config.raumplan_benutzername or "#anonymous#"
        pwd = config.raumplan_passwort or ""
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
            klausur = {
                'titel': k.titel, 'text': k.text,
                'farbe': k.farbe, 'aktiv_bis': k.aktiv_bis,
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
            return 200, {"success": True, "on_air": payload.on_air}
        return 401, {"success": False, "message": "Ungültiges Token"}

    auth_result = keycloak_auth(request)
    if not auth_result:
        return 401, {"success": False, "message": "Nicht autorisiert"}
    request.auth = auth_result
    if not is_admin(request):
        return 403, {"success": False, "message": "Kein Admin"}
    MonitorConfig.objects.all().update(
        ist_on_air=payload.on_air,
        on_air_seit=timezone.now() if payload.on_air else None,
    )
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
            return 200, {"success": True}
        return 401, {"success": False, "message": "Ungültiges Token"}

    auth_result = keycloak_auth(request)
    if not auth_result:
        return 401, {"success": False, "message": "Nicht autorisiert"}
    request.auth = auth_result
    if not is_admin(request):
        return 403, {"success": False, "message": "Kein Admin"}
    MonitorConfig.objects.all().update(
        notfall_aktiv=payload.aktiv,
        notfall_text=payload.text,
    )
    return 200, {"success": True}


# ═══ Admin: Profile ══════════════════════════════════════════════

@monitor_router.get("/profile", response=list[MonitorProfileListSchema], auth=keycloak_auth)
def list_profiles(request):
    return MonitorConfig.objects.all()


@monitor_router.post("/profile", auth=keycloak_auth)
def create_profile(request, payload: MonitorProfileCreateSchema):
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
    config = get_object_or_404(MonitorConfig, id=id)
    if config.ist_standard:
        return {"success": False, "message": "Standard-Profil kann nicht gelöscht werden"}
    config.delete()
    return {"success": True}


# ═══ Admin: Config ════════════════════════════════════════════════

@monitor_router.get("/config", response=MonitorConfigSchema, auth=keycloak_auth)
def get_config(request, profil_id: int = None):
    if profil_id:
        return get_object_or_404(MonitorConfig, id=profil_id)
    return MonitorConfig.get()


@monitor_router.put("/config", response=MonitorConfigSchema, auth=keycloak_auth)
def update_config(request, payload: MonitorConfigUpdateSchema, profil_id: int = None):
    if profil_id:
        config = get_object_or_404(MonitorConfig, id=profil_id)
    else:
        config = MonitorConfig.get()

    data = payload.dict(exclude_unset=True)

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

    for key, value in data.items():
        setattr(config, key, value)
    config.save()
    return config


@monitor_router.post("/config/regenerate-token", auth=keycloak_auth)
def regenerate_token(request, profil_id: int = None):
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
    qs = MonitorDatei.objects.all()
    if typ:
        qs = qs.filter(typ=typ)
    return qs


@monitor_router.post("/dateien", auth=keycloak_auth)
def upload_datei(request, datei: UploadedFile = File(...), name: str = Form(""), typ: str = Form("bild")):
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
    d = get_object_or_404(MonitorDatei, id=id)
    # Datei vom Dateisystem entfernen
    if d.datei:
        d.datei.delete(save=False)
    d.delete()
    return {"success": True}


# ═══ Admin: Ankündigungen ═════════════════════════════════════════

@monitor_router.get("/ankuendigungen", response=list[AnkuendigungSchema], auth=keycloak_auth)
def list_ankuendigungen(request):
    return Ankuendigung.objects.all()


@monitor_router.post("/ankuendigungen", response=AnkuendigungSchema, auth=keycloak_auth)
def create_ankuendigung(request, payload: AnkuendigungCreateSchema):
    return Ankuendigung.objects.create(**payload.dict())


@monitor_router.put("/ankuendigungen/{id}", response=AnkuendigungSchema, auth=keycloak_auth)
def update_ankuendigung(request, id: int, payload: AnkuendigungCreateSchema):
    a = get_object_or_404(Ankuendigung, id=id)
    for key, value in payload.dict().items():
        setattr(a, key, value)
    a.save()
    return a


@monitor_router.delete("/ankuendigungen/{id}", auth=keycloak_auth)
def delete_ankuendigung(request, id: int):
    a = get_object_or_404(Ankuendigung, id=id)
    a.delete()
    return {"success": True}


# ═══ Admin: ÖPNV Stationssuche ═══════════════════════════════════

@monitor_router.get("/oepnv/suche", auth=keycloak_auth)
def search_oepnv_stations(request, q: str = "", results: int = 10,
                           use_db: bool = True, use_nahsh: bool = True):
    """Stationen für ÖPNV-Abfahrtsmonitor suchen"""
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
    return Bildschirm.objects.all()


@monitor_router.post("/bildschirme", auth=keycloak_auth)
def create_bildschirm(request, payload: BildschirmCreateSchema):
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
    bs = get_object_or_404(Bildschirm, id=id)
    data = payload.dict(exclude_unset=True)
    if 'default_profil_id' in data:
        val = data.pop('default_profil_id')
        bs.default_profil_id = val if val else None
    for key, value in data.items():
        setattr(bs, key, value)
    bs.save()
    return bs


@monitor_router.delete("/bildschirme/{id}", auth=keycloak_auth)
def delete_bildschirm(request, id: int):
    bs = get_object_or_404(Bildschirm, id=id)
    bs.delete()
    return {"success": True}


# ═══ Klausuren ════════════════════════════════════════════════════

@monitor_router.get("/klausuren", response=list[KlausurSchema], auth=keycloak_auth)
def list_klausuren(request):
    return list(Klausur.objects.prefetch_related('bildschirme').all())


@monitor_router.post("/klausuren", response=KlausurSchema, auth=keycloak_auth)
def create_klausur(request, payload: KlausurCreateSchema):
    data = payload.dict()
    bildschirm_ids = data.pop('bildschirm_ids', [])
    k = Klausur.objects.create(**data)
    if bildschirm_ids:
        k.bildschirme.set(Bildschirm.objects.filter(id__in=bildschirm_ids))
    return k


@monitor_router.put("/klausuren/{id}", response=KlausurSchema, auth=keycloak_auth)
def update_klausur(request, id: int, payload: KlausurUpdateSchema):
    k = get_object_or_404(Klausur, id=id)
    data = payload.dict(exclude_unset=True)
    bildschirm_ids = data.pop('bildschirm_ids', None)
    for key, value in data.items():
        setattr(k, key, value)
    k.save()
    if bildschirm_ids is not None:
        k.bildschirme.set(Bildschirm.objects.filter(id__in=bildschirm_ids))
    return k


@monitor_router.delete("/klausuren/{id}", auth=keycloak_auth)
def delete_klausur(request, id: int):
    k = get_object_or_404(Klausur, id=id)
    k.delete()
    return {"success": True}
