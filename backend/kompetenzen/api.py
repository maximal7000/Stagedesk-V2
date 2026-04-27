"""Kompetenzen API - Django Ninja Router."""
from typing import List, Optional
from datetime import timedelta
from collections import defaultdict
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q
from django.utils import timezone
from ninja import Router
from ninja.errors import HttpError

from core.auth import keycloak_auth
from users.api import is_admin
from users.models import UserProfile
from .models import (
    KompetenzKategorie, KompetenzGruppe, Kompetenz,
    UserKompetenz, UserKompetenzHistorie, KompetenzBadge,
    KompetenzSettings, DEFAULT_ABLAUF_STUFEN,
)
from .schemas import (
    KategorieSchema, KategorieCreateSchema,
    GruppeSchema, GruppeCreateSchema,
    KompetenzSchema, KompetenzCreateSchema, KompetenzUpdateSchema,
    UserKompetenzSchema, UserKompetenzToggleSchema, UserKompetenzBulkSchema,
    UserKompetenzStufenUpdateSchema,
    ScoreboardEntrySchema, KategorieStatSchema, UserStatsSchema,
    SkillGapEntrySchema, BadgeSchema, BadgeCreateSchema, HistorieEntrySchema,
)


kompetenzen_router = Router(tags=["Kompetenzen"])


# ─── Helpers ──────────────────────────────────────────────────────

def get_user_id(request) -> str:
    return request.auth.get('sub', '')


def get_username(request) -> str:
    return request.auth.get('preferred_username', '')


def _has_permission(request, code: str) -> bool:
    if is_admin(request):
        return True
    kid = get_user_id(request)
    try:
        profile = UserProfile.objects.get(keycloak_id=kid)
        return profile.has_permission(code, False)
    except UserProfile.DoesNotExist:
        return False


def require_permission(request, code: str):
    if not _has_permission(request, code):
        raise HttpError(403, "Keine Berechtigung")


def _missing_voraussetzungen(user_kid: str, kompetenz) -> list:
    """Gibt Liste von Kompetenz-Namen zurück, die der User noch nicht aktiv
    erworben hat. Berücksichtigt nur direkte Voraussetzungen (keine Tiefe)."""
    required = list(kompetenz.voraussetzungen.values_list('id', flat=True))
    if not required:
        return []
    aktive = set(UserKompetenz.objects.filter(
        user_keycloak_id=user_kid,
        kompetenz_id__in=required,
        hat_kompetenz=True,
    ).values_list('kompetenz_id', flat=True))
    # ist_abgelaufen separat filtern
    valid = set()
    for uk in UserKompetenz.objects.filter(
        user_keycloak_id=user_kid, kompetenz_id__in=aktive,
    ).select_related('kompetenz'):
        if not uk.ist_abgelaufen:
            valid.add(uk.kompetenz_id)
    fehlend_ids = set(required) - valid
    if not fehlend_ids:
        return []
    return list(Kompetenz.objects.filter(id__in=fehlend_ids).values_list('name', flat=True))


def _kompetenz_to_schema(k: Kompetenz) -> dict:
    return {
        "id": k.id,
        "kategorie_id": k.kategorie_id,
        "kategorie_name": k.kategorie.name,
        "gruppe_id": k.gruppe_id,
        "gruppe_name": k.gruppe.name if k.gruppe else None,
        "name": k.name,
        "beschreibung": k.beschreibung,
        "punkte": k.punkte,
        "ablauf_stufen": k.ablauf_stufen or [],
        "aktiv": k.aktiv,
        "sortierung": k.sortierung,
        "voraussetzung_ids": list(k.voraussetzungen.values_list('id', flat=True)),
    }


def _uk_to_schema(uk: UserKompetenz) -> dict:
    k = uk.kompetenz
    return {
        "id": uk.id,
        "user_keycloak_id": uk.user_keycloak_id,
        "user_username": uk.user_username,
        "kompetenz_id": k.id,
        "kompetenz_name": k.name,
        "kategorie_id": k.kategorie_id,
        "kategorie_name": k.kategorie.name,
        "gruppe_id": k.gruppe_id,
        "gruppe_name": k.gruppe.name if k.gruppe else None,
        "punkte": k.punkte,
        "hat_kompetenz": uk.hat_kompetenz,
        "ist_aktiv": uk.ist_aktiv,
        "ist_abgelaufen": uk.ist_abgelaufen,
        "stufe": uk.stufe,
        "tage_bis_ablauf": uk.tage_bis_ablauf,
        "erworben_am": uk.erworben_am,
        "letzte_bestaetigung_am": uk.letzte_bestaetigung_am,
        "ablauf_am": uk.ablauf_am,
        "bestaetigt_von_username": uk.bestaetigt_von_username,
        "notiz": uk.notiz,
        "custom_ablauf_stufen": uk.custom_ablauf_stufen or [],
        "effektive_stufen": uk.get_effektive_stufen(),
    }


def _log_historie(uk: UserKompetenz, aktion: str, stufe_vorher: int,
                  stufe_nachher: int, username: str, notiz: str = ""):
    UserKompetenzHistorie.objects.create(
        user_kompetenz=uk,
        user_keycloak_id=uk.user_keycloak_id,
        aktion=aktion,
        stufe_vorher=stufe_vorher,
        stufe_nachher=stufe_nachher,
        geaendert_von_username=username,
        notiz=notiz,
    )


def _ermittle_badges(user_keycloak_id: str) -> List[str]:
    """Gibt erreichte Badge-Namen für einen User zurück."""
    aktive_uks = UserKompetenz.objects.filter(
        user_keycloak_id=user_keycloak_id,
        hat_kompetenz=True,
    ).select_related('kompetenz', 'kompetenz__kategorie')
    aktive_uks = [uk for uk in aktive_uks if not uk.ist_abgelaufen]

    aktive_komp_ids = {uk.kompetenz_id for uk in aktive_uks}
    punkte = sum(uk.kompetenz.punkte for uk in aktive_uks)

    badges = []
    for badge in KompetenzBadge.objects.all():
        if badge.typ == 'kategorie_komplett' and badge.kategorie_id:
            alle_ids = set(Kompetenz.objects.filter(
                kategorie_id=badge.kategorie_id, aktiv=True
            ).values_list('id', flat=True))
            if alle_ids and alle_ids.issubset(aktive_komp_ids):
                badges.append(badge.name)
        elif badge.typ == 'gruppe_komplett' and badge.gruppe_id:
            alle_ids = set(Kompetenz.objects.filter(
                gruppe_id=badge.gruppe_id, aktiv=True
            ).values_list('id', flat=True))
            if alle_ids and alle_ids.issubset(aktive_komp_ids):
                badges.append(badge.name)
        elif badge.typ == 'anzahl' and len(aktive_komp_ids) >= badge.schwelle:
            badges.append(badge.name)
        elif badge.typ == 'punkte' and punkte >= badge.schwelle:
            badges.append(badge.name)
    return badges


# ─── Kategorien ───────────────────────────────────────────────────

@kompetenzen_router.get("/kategorien", response=List[KategorieSchema], auth=keycloak_auth)
def list_kategorien(request):
    require_permission(request, 'kompetenzen.view')
    return list(KompetenzKategorie.objects.all())


@kompetenzen_router.post("/kategorien", response=KategorieSchema, auth=keycloak_auth)
def create_kategorie(request, payload: KategorieCreateSchema):
    require_permission(request, 'kompetenzen.edit_catalog')
    return KompetenzKategorie.objects.create(**payload.dict())


@kompetenzen_router.put("/kategorien/{kid}", response=KategorieSchema, auth=keycloak_auth)
def update_kategorie(request, kid: int, payload: KategorieCreateSchema):
    require_permission(request, 'kompetenzen.edit_catalog')
    kat = get_object_or_404(KompetenzKategorie, id=kid)
    for f, v in payload.dict().items():
        setattr(kat, f, v)
    kat.save()
    return kat


@kompetenzen_router.delete("/kategorien/{kid}", auth=keycloak_auth)
def delete_kategorie(request, kid: int):
    require_permission(request, 'kompetenzen.edit_catalog')
    get_object_or_404(KompetenzKategorie, id=kid).delete()
    return {"status": "deleted"}


# ─── Gruppen ──────────────────────────────────────────────────────

@kompetenzen_router.get("/gruppen", response=List[GruppeSchema], auth=keycloak_auth)
def list_gruppen(request):
    require_permission(request, 'kompetenzen.view')
    return list(KompetenzGruppe.objects.all())


@kompetenzen_router.post("/gruppen", response=GruppeSchema, auth=keycloak_auth)
def create_gruppe(request, payload: GruppeCreateSchema):
    require_permission(request, 'kompetenzen.edit_catalog')
    return KompetenzGruppe.objects.create(**payload.dict())


@kompetenzen_router.put("/gruppen/{gid}", response=GruppeSchema, auth=keycloak_auth)
def update_gruppe(request, gid: int, payload: GruppeCreateSchema):
    require_permission(request, 'kompetenzen.edit_catalog')
    g = get_object_or_404(KompetenzGruppe, id=gid)
    for f, v in payload.dict().items():
        setattr(g, f, v)
    g.save()
    return g


@kompetenzen_router.delete("/gruppen/{gid}", auth=keycloak_auth)
def delete_gruppe(request, gid: int):
    require_permission(request, 'kompetenzen.edit_catalog')
    get_object_or_404(KompetenzGruppe, id=gid).delete()
    return {"status": "deleted"}


# ─── Kompetenzen (Katalog) ────────────────────────────────────────

@kompetenzen_router.get("", response=List[KompetenzSchema], auth=keycloak_auth)
def list_kompetenzen(request):
    require_permission(request, 'kompetenzen.view')
    qs = Kompetenz.objects.select_related('kategorie', 'gruppe').filter(aktiv=True)
    return [_kompetenz_to_schema(k) for k in qs]


@kompetenzen_router.get("/alle", response=List[KompetenzSchema], auth=keycloak_auth)
def list_kompetenzen_alle(request):
    """Admin: auch inaktive."""
    require_permission(request, 'kompetenzen.edit_catalog')
    qs = Kompetenz.objects.select_related('kategorie', 'gruppe').all()
    return [_kompetenz_to_schema(k) for k in qs]


@kompetenzen_router.post("", response=KompetenzSchema, auth=keycloak_auth)
def create_kompetenz(request, payload: KompetenzCreateSchema):
    require_permission(request, 'kompetenzen.edit_catalog')
    data = payload.dict()
    voraussetzung_ids = data.pop('voraussetzung_ids', [])
    k = Kompetenz.objects.create(**data)
    if voraussetzung_ids:
        k.voraussetzungen.set(Kompetenz.objects.filter(id__in=voraussetzung_ids).exclude(id=k.id))
    return _kompetenz_to_schema(k)


# ─── User-Kompetenzen ─────────────────────────────────────────────

def _sync_user_kompetenzen(kid: str, username: str = ""):
    """Stellt sicher, dass für jede aktive Kompetenz ein UserKompetenz-Eintrag existiert."""
    vorhandene = set(UserKompetenz.objects.filter(
        user_keycloak_id=kid).values_list('kompetenz_id', flat=True))
    fehlende = Kompetenz.objects.filter(aktiv=True).exclude(id__in=vorhandene)
    UserKompetenz.objects.bulk_create([
        UserKompetenz(
            user_keycloak_id=kid,
            user_username=username,
            kompetenz=k,
            hat_kompetenz=False,
        ) for k in fehlende
    ])


@kompetenzen_router.get("/me", response=List[UserKompetenzSchema], auth=keycloak_auth)
def my_kompetenzen(request):
    require_permission(request, 'kompetenzen.view')
    kid = get_user_id(request)
    username = get_username(request)
    _sync_user_kompetenzen(kid, username)
    qs = UserKompetenz.objects.select_related(
        'kompetenz', 'kompetenz__kategorie', 'kompetenz__gruppe'
    ).filter(user_keycloak_id=kid, kompetenz__aktiv=True)
    return [_uk_to_schema(uk) for uk in qs]


@kompetenzen_router.get("/user/{user_kid}", response=List[UserKompetenzSchema], auth=keycloak_auth)
def user_kompetenzen(request, user_kid: str):
    require_permission(request, 'kompetenzen.view_all')
    try:
        profile = UserProfile.objects.get(keycloak_id=user_kid)
        username = profile.username
    except UserProfile.DoesNotExist:
        username = ""
    _sync_user_kompetenzen(user_kid, username)
    qs = UserKompetenz.objects.select_related(
        'kompetenz', 'kompetenz__kategorie', 'kompetenz__gruppe'
    ).filter(user_keycloak_id=user_kid, kompetenz__aktiv=True)
    return [_uk_to_schema(uk) for uk in qs]


@kompetenzen_router.put("/user/{user_kid}/{komp_id}", response=UserKompetenzSchema, auth=keycloak_auth)
def set_user_kompetenz(request, user_kid: str, komp_id: int, payload: UserKompetenzToggleSchema):
    require_permission(request, 'kompetenzen.manage')
    try:
        profile = UserProfile.objects.get(keycloak_id=user_kid)
        target_username = profile.username
    except UserProfile.DoesNotExist:
        target_username = ""

    kompetenz = get_object_or_404(Kompetenz, id=komp_id)

    # Voraussetzungs-Check beim Bestätigen — gibt 400 mit fehlender Liste zurück
    if payload.hat_kompetenz:
        missing = _missing_voraussetzungen(user_kid, kompetenz)
        if missing:
            raise HttpError(400, f"Voraussetzungen fehlen: {', '.join(missing)}")

    uk, created = UserKompetenz.objects.get_or_create(
        user_keycloak_id=user_kid,
        kompetenz=kompetenz,
        defaults={'user_username': target_username},
    )
    username = get_username(request)
    stufe_vorher = uk.stufe

    if payload.hat_kompetenz:
        uk.bestaetigen(bestaetigt_von=username, erhoehe_stufe=not created and uk.hat_kompetenz)
        aktion = 'erworben' if stufe_vorher == 0 and not uk.letzte_bestaetigung_am else 'bestaetigt'
        # Nach save ist bereits bestätigt → Historie
        aktion = 'erworben' if not uk.erworben_am or stufe_vorher == 0 and created else 'bestaetigt'
        if created:
            aktion = 'erworben'
        _log_historie(uk, aktion, stufe_vorher, uk.stufe, username, payload.notiz or "")
    else:
        uk.entziehen()
        _log_historie(uk, 'entzogen', stufe_vorher, uk.stufe, username, payload.notiz or "")

    if payload.notiz is not None:
        uk.notiz = payload.notiz
        uk.save(update_fields=['notiz'])
    return _uk_to_schema(uk)


@kompetenzen_router.put("/user/{user_kid}/{komp_id}/stufen",
                        response=UserKompetenzSchema, auth=keycloak_auth)
def set_user_stufen(request, user_kid: str, komp_id: int, payload: UserKompetenzStufenUpdateSchema):
    """Admin kann für einzelne User-Kompetenz custom Ablauf-Stufen setzen."""
    require_permission(request, 'kompetenzen.manage')
    try:
        profile = UserProfile.objects.get(keycloak_id=user_kid)
        target_username = profile.username
    except UserProfile.DoesNotExist:
        target_username = ""

    kompetenz = get_object_or_404(Kompetenz, id=komp_id)
    uk, _ = UserKompetenz.objects.get_or_create(
        user_keycloak_id=user_kid,
        kompetenz=kompetenz,
        defaults={'user_username': target_username},
    )
    stufen = [int(n) for n in (payload.custom_ablauf_stufen or []) if n is not None and n >= 0]
    uk.custom_ablauf_stufen = stufen
    # Bei aktiver Kompetenz: ablauf_am neu berechnen, damit der Override sofort greift
    if uk.hat_kompetenz and uk.letzte_bestaetigung_am:
        tage = uk._tage_bis_ablauf_fuer_stufe(uk.stufe)
        uk.ablauf_am = None if tage <= 0 else uk.letzte_bestaetigung_am + timedelta(days=tage)
    uk.save()
    return _uk_to_schema(uk)


@kompetenzen_router.post("/bulk", auth=keycloak_auth)
def bulk_update(request, payload: UserKompetenzBulkSchema):
    require_permission(request, 'kompetenzen.manage')
    username = get_username(request)
    count = 0
    for item in payload.items:
        try:
            profile = UserProfile.objects.get(keycloak_id=item.user_keycloak_id)
            target_username = profile.username
        except UserProfile.DoesNotExist:
            target_username = ""
        kompetenz = Kompetenz.objects.filter(id=item.kompetenz_id).first()
        if not kompetenz:
            continue
        uk, created = UserKompetenz.objects.get_or_create(
            user_keycloak_id=item.user_keycloak_id,
            kompetenz=kompetenz,
            defaults={'user_username': target_username},
        )
        stufe_vorher = uk.stufe
        if item.hat_kompetenz:
            uk.bestaetigen(bestaetigt_von=username, erhoehe_stufe=not created and uk.hat_kompetenz)
            aktion = 'erworben' if created else 'bestaetigt'
            _log_historie(uk, aktion, stufe_vorher, uk.stufe, username)
        else:
            uk.entziehen()
            _log_historie(uk, 'entzogen', stufe_vorher, uk.stufe, username)
        count += 1
    return {"status": "ok", "count": count}


# ─── Scoreboard / Stats ───────────────────────────────────────────

@kompetenzen_router.get("/scoreboard", response=List[ScoreboardEntrySchema], auth=keycloak_auth)
def scoreboard(request):
    require_permission(request, 'kompetenzen.view')
    gesamt_kompetenzen = Kompetenz.objects.filter(aktiv=True).count()

    # Admins nicht im Scoreboard zeigen
    admin_kids = set(UserProfile.objects.filter(is_admin_cached=True)
                     .values_list('keycloak_id', flat=True))

    per_user = defaultdict(lambda: {"punkte": 0, "aktiv": 0, "username": "",
                                    "first_name": "", "last_name": ""})
    qs = UserKompetenz.objects.filter(
        hat_kompetenz=True, kompetenz__aktiv=True,
    ).exclude(user_keycloak_id__in=admin_kids).select_related('kompetenz')

    for uk in qs:
        if uk.ist_abgelaufen:
            continue
        per_user[uk.user_keycloak_id]["punkte"] += uk.kompetenz.punkte
        per_user[uk.user_keycloak_id]["aktiv"] += 1
        if uk.user_username:
            per_user[uk.user_keycloak_id]["username"] = uk.user_username

    # Vor-/Nachname + ggf. Username aus Profile nachladen
    for p in UserProfile.objects.filter(keycloak_id__in=list(per_user.keys())):
        per_user[p.keycloak_id]["first_name"] = p.first_name
        per_user[p.keycloak_id]["last_name"] = p.last_name
        if not per_user[p.keycloak_id]["username"]:
            per_user[p.keycloak_id]["username"] = p.username

    sortiert = sorted(per_user.items(), key=lambda x: -x[1]["punkte"])
    return [
        {
            "user_keycloak_id": kid,
            "user_username": d["username"] or kid[:8],
            "user_first_name": d["first_name"],
            "user_last_name": d["last_name"],
            "punkte": d["punkte"],
            "anzahl_aktiv": d["aktiv"],
            "anzahl_gesamt": gesamt_kompetenzen,
            "rang": i + 1,
        }
        for i, (kid, d) in enumerate(sortiert)
    ]


@kompetenzen_router.get("/stats/me", response=UserStatsSchema, auth=keycloak_auth)
def my_stats(request):
    require_permission(request, 'kompetenzen.view')
    kid = get_user_id(request)
    username = get_username(request)
    return _compute_user_stats(kid, username)


@kompetenzen_router.get("/stats/user/{user_kid}", response=UserStatsSchema, auth=keycloak_auth)
def user_stats(request, user_kid: str):
    require_permission(request, 'kompetenzen.view_all')
    username = ""
    try:
        username = UserProfile.objects.get(keycloak_id=user_kid).username
    except UserProfile.DoesNotExist:
        pass
    return _compute_user_stats(user_kid, username)


def _compute_user_stats(kid: str, username: str) -> dict:
    _sync_user_kompetenzen(kid, username)
    aktive = UserKompetenz.objects.filter(
        user_keycloak_id=kid, hat_kompetenz=True, kompetenz__aktiv=True,
    ).select_related('kompetenz', 'kompetenz__kategorie')

    aktive = [uk for uk in aktive if not uk.ist_abgelaufen]
    punkte = sum(uk.kompetenz.punkte for uk in aktive)
    anzahl_aktiv = len(aktive)
    anzahl_gesamt = Kompetenz.objects.filter(aktiv=True).count()

    # pro Kategorie
    kategorien = []
    for kat in KompetenzKategorie.objects.all():
        gesamt = Kompetenz.objects.filter(kategorie=kat, aktiv=True).count()
        aktiv_cnt = sum(1 for uk in aktive if uk.kompetenz.kategorie_id == kat.id)
        prozent = (aktiv_cnt / gesamt * 100) if gesamt else 0.0
        kategorien.append({
            "kategorie_id": kat.id,
            "kategorie_name": kat.name,
            "anzahl_aktiv": aktiv_cnt,
            "anzahl_gesamt": gesamt,
            "prozent": round(prozent, 1),
        })

    return {
        "user_keycloak_id": kid,
        "user_username": username or kid[:8],
        "punkte": punkte,
        "anzahl_aktiv": anzahl_aktiv,
        "anzahl_gesamt": anzahl_gesamt,
        "kategorien": kategorien,
        "badges": _ermittle_badges(kid),
    }


# ─── Skill-Gap-Analyse ────────────────────────────────────────────

@kompetenzen_router.get("/skill-gap", response=List[SkillGapEntrySchema], auth=keycloak_auth)
def skill_gap(request):
    """Zeigt für jede Kompetenz, wie viele User sie aktiv haben."""
    require_permission(request, 'kompetenzen.view_all')
    ergebnis = []
    for k in Kompetenz.objects.select_related('kategorie').filter(aktiv=True):
        uks = UserKompetenz.objects.filter(
            kompetenz=k, hat_kompetenz=True,
        ).select_related()
        user_liste = [
            uk.user_username or uk.user_keycloak_id[:8]
            for uk in uks if not uk.ist_abgelaufen
        ]
        ergebnis.append({
            "kompetenz_id": k.id,
            "kompetenz_name": k.name,
            "kategorie_name": k.kategorie.name,
            "anzahl_user": len(user_liste),
            "user_liste": user_liste,
        })
    ergebnis.sort(key=lambda x: x["anzahl_user"])
    return ergebnis


# ─── Historie ─────────────────────────────────────────────────────

@kompetenzen_router.get("/historie/me", response=List[HistorieEntrySchema], auth=keycloak_auth)
def my_historie(request):
    require_permission(request, 'kompetenzen.view')
    kid = get_user_id(request)
    return _build_historie(kid)


@kompetenzen_router.get("/historie/user/{user_kid}", response=List[HistorieEntrySchema], auth=keycloak_auth)
def historie_user(request, user_kid: str):
    require_permission(request, 'kompetenzen.view_all')
    return _build_historie(user_kid)


def _build_historie(user_kid: str):
    qs = UserKompetenzHistorie.objects.filter(
        user_keycloak_id=user_kid,
    ).select_related(
        'user_kompetenz__kompetenz', 'user_kompetenz__kompetenz__kategorie',
    ).order_by('-erstellt_am')[:500]
    return [{
        "id": h.id,
        "aktion": h.aktion,
        "kompetenz_name": h.user_kompetenz.kompetenz.name,
        "kategorie_name": h.user_kompetenz.kompetenz.kategorie.name,
        "stufe_vorher": h.stufe_vorher,
        "stufe_nachher": h.stufe_nachher,
        "geaendert_von_username": h.geaendert_von_username,
        "erstellt_am": h.erstellt_am,
    } for h in qs]


# ─── Vorschlag passende User für VA ───────────────────────────────

@kompetenzen_router.get("/veranstaltung/{va_id}/vorschlaege", auth=keycloak_auth)
def user_vorschlaege(request, va_id: int):
    """Gibt User zurück, die die erforderlichen Kompetenzen einer VA haben."""
    require_permission(request, 'kompetenzen.view_all')
    from veranstaltung.models import Veranstaltung
    va = get_object_or_404(Veranstaltung, id=va_id)
    erforderlich_ids = list(va.erforderliche_kompetenzen.values_list('id', flat=True)) \
        if hasattr(va, 'erforderliche_kompetenzen') else []

    if not erforderlich_ids:
        return []

    # Alle User-Kompetenzen für die erforderlichen Skills
    kandidaten = defaultdict(set)
    qs = UserKompetenz.objects.filter(
        kompetenz_id__in=erforderlich_ids, hat_kompetenz=True,
    ).select_related('kompetenz')
    for uk in qs:
        if uk.ist_abgelaufen:
            continue
        kandidaten[(uk.user_keycloak_id, uk.user_username)].add(uk.kompetenz_id)

    ergebnis = []
    for (kid, uname), komp_ids in kandidaten.items():
        erfuellt = set(erforderlich_ids).issubset(komp_ids)
        if erfuellt:
            ergebnis.append({
                "user_keycloak_id": kid,
                "user_username": uname or kid[:8],
                "komplett": True,
                "abgedeckt": len(komp_ids),
                "gesamt": len(erforderlich_ids),
            })
    return sorted(ergebnis, key=lambda x: -x["abgedeckt"])


# ─── Badges ──────────────────────────────────────────────────────

@kompetenzen_router.get("/badges", response=List[BadgeSchema], auth=keycloak_auth)
def list_badges(request):
    require_permission(request, 'kompetenzen.view')
    return list(KompetenzBadge.objects.all())


@kompetenzen_router.post("/badges", response=BadgeSchema, auth=keycloak_auth)
def create_badge(request, payload: BadgeCreateSchema):
    require_permission(request, 'kompetenzen.edit_catalog')
    return KompetenzBadge.objects.create(**payload.dict())


@kompetenzen_router.delete("/badges/{bid}", auth=keycloak_auth)
def delete_badge(request, bid: int):
    require_permission(request, 'kompetenzen.edit_catalog')
    get_object_or_404(KompetenzBadge, id=bid).delete()
    return {"status": "deleted"}


# ─── PDF-Export ──────────────────────────────────────────────────

@kompetenzen_router.get("/pdf/me", auth=keycloak_auth)
def pdf_me(request):
    require_permission(request, 'kompetenzen.view')
    kid = get_user_id(request)
    username = get_username(request)
    first_name = request.auth.get('given_name', '')
    last_name = request.auth.get('family_name', '')
    display = f"{first_name} {last_name}".strip() or username
    return _generate_pdf(kid, display, username)


@kompetenzen_router.get("/pdf/user/{user_kid}", auth=keycloak_auth)
def pdf_user(request, user_kid: str):
    require_permission(request, 'kompetenzen.view_all')
    username = ""
    display = ""
    try:
        p = UserProfile.objects.get(keycloak_id=user_kid)
        username = p.username
        display = f"{p.first_name} {p.last_name}".strip() or p.username
    except UserProfile.DoesNotExist:
        pass
    return _generate_pdf(user_kid, display, username)


def _generate_pdf(kid: str, display_name: str, username: str):
    from django.http import HttpResponse
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
    except ImportError:
        raise HttpError(500, "reportlab nicht installiert")

    import io
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = [Paragraph(f"Kompetenz-Pass: {display_name or username or kid}", styles['Title']),
             Spacer(1, 12),
             Paragraph(f"Stand: {timezone.now():%d.%m.%Y %H:%M}", styles['Normal']),
             Spacer(1, 18)]

    for kat in KompetenzKategorie.objects.all():
        story.append(Paragraph(kat.name, styles['Heading2']))
        rows = [["Kompetenz", "Status", "Erworben", "Gültig bis"]]
        uks = UserKompetenz.objects.filter(
            user_keycloak_id=kid, kompetenz__kategorie=kat, kompetenz__aktiv=True,
        ).select_related('kompetenz')
        for uk in uks:
            if uk.ist_aktiv:
                status = "✓ aktiv"
            elif uk.hat_kompetenz and uk.ist_abgelaufen:
                status = "⚠ abgelaufen"
            else:
                status = "—"
            rows.append([
                uk.kompetenz.name,
                status,
                uk.erworben_am.strftime('%d.%m.%Y') if uk.erworben_am else "",
                uk.ablauf_am.strftime('%d.%m.%Y') if uk.ablauf_am else "",
            ])
        t = Table(rows, colWidths=[240, 80, 80, 80])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 0.25, colors.grey),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
        ]))
        story.append(t)
        story.append(Spacer(1, 14))

    doc.build(story)
    pdf = buffer.getvalue()
    buffer.close()
    filename = f"kompetenzen_{username or kid[:8]}.pdf"
    resp = HttpResponse(pdf, content_type='application/pdf')
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
    return resp


# ─── Veranstaltung-Check ─────────────────────────────────────────

@kompetenzen_router.get("/veranstaltung/{va_id}/check", auth=keycloak_auth)
def check_va(request, va_id: int):
    """Prüft ob aktueller User Kompetenzen für VA hat."""
    require_permission(request, 'kompetenzen.view')
    from veranstaltung.models import Veranstaltung
    va = get_object_or_404(Veranstaltung, id=va_id)
    kid = get_user_id(request)

    erforderlich = list(va.erforderliche_kompetenzen.all()) \
        if hasattr(va, 'erforderliche_kompetenzen') else []

    user_uks = {uk.kompetenz_id: uk for uk in UserKompetenz.objects.filter(
        user_keycloak_id=kid, kompetenz__in=erforderlich,
    ).select_related('kompetenz', 'kompetenz__kategorie')}

    fehlende = []
    abgelaufene = []
    for k in erforderlich:
        uk = user_uks.get(k.id)
        if not uk or not uk.hat_kompetenz:
            fehlende.append(_kompetenz_to_schema(k))
        elif uk.ist_abgelaufen:
            abgelaufene.append(_kompetenz_to_schema(k))

    return {
        "erfuellt": not fehlende and not abgelaufene,
        "fehlende": fehlende,
        "abgelaufene": abgelaufene,
    }


# ─── Settings (globale Defaults) ───────────────────────────────────

@kompetenzen_router.get("/settings", auth=keycloak_auth)
def get_settings(request):
    s = KompetenzSettings.get_solo()
    return {
        "standard_ablauf_stufen": s.standard_ablauf_stufen or [],
        "system_default": DEFAULT_ABLAUF_STUFEN,
        "effektiv": s.get_stufen(),
    }


@kompetenzen_router.put("/settings", auth=keycloak_auth)
def update_settings(request, payload: dict):
    require_permission(request, 'kompetenzen.edit_catalog')
    s = KompetenzSettings.get_solo()
    stufen = payload.get("standard_ablauf_stufen", [])
    if not isinstance(stufen, list) or not all(isinstance(n, int) and n >= 0 for n in stufen):
        raise HttpError(400, "Ungültige Stufen (Liste aus positiven Zahlen)")
    s.standard_ablauf_stufen = stufen
    s.save()
    return {"standard_ablauf_stufen": s.standard_ablauf_stufen, "effektiv": s.get_stufen()}


@kompetenzen_router.post("/settings/apply-all", auth=keycloak_auth)
def apply_stufen_to_all(request, payload: dict):
    """Setzt ablauf_stufen bei ALLEN Kompetenzen (overwrite oder nur wenn leer)."""
    require_permission(request, 'kompetenzen.edit_catalog')
    stufen = payload.get("ablauf_stufen", [])
    overwrite = bool(payload.get("overwrite", False))
    if not isinstance(stufen, list):
        raise HttpError(400, "ablauf_stufen muss Liste sein")
    qs = Kompetenz.objects.all()
    if not overwrite:
        qs = qs.filter(Q(ablauf_stufen=[]) | Q(ablauf_stufen__isnull=True))
    count = qs.update(ablauf_stufen=stufen)
    return {"aktualisiert": count}


# ─── Kompetenz-CRUD by ID (MUST be last to not shadow specific paths) ──

@kompetenzen_router.put("/{komp_id}", response=KompetenzSchema, auth=keycloak_auth)
def update_kompetenz(request, komp_id: int, payload: KompetenzUpdateSchema):
    require_permission(request, 'kompetenzen.edit_catalog')
    k = get_object_or_404(Kompetenz, id=komp_id)
    data = payload.dict(exclude_unset=True)
    voraussetzung_ids = data.pop('voraussetzung_ids', None)
    for f, v in data.items():
        setattr(k, f, v)
    k.save()
    if voraussetzung_ids is not None:
        # Selbst-Referenz und Zyklen einfach abfangen: alle IDs außer der eigenen.
        k.voraussetzungen.set(Kompetenz.objects.filter(id__in=voraussetzung_ids).exclude(id=k.id))
    return _kompetenz_to_schema(k)


@kompetenzen_router.delete("/{komp_id}", auth=keycloak_auth)
def delete_kompetenz(request, komp_id: int):
    require_permission(request, 'kompetenzen.edit_catalog')
    get_object_or_404(Kompetenz, id=komp_id).delete()
    return {"status": "deleted"}
