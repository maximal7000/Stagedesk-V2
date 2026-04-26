"""
Veranstaltungsplaner API: CRUD, Zammad, Zuweisungen, Checkliste, Notizen, Anhänge, Erinnerungen.
"""
from typing import List, Optional
from datetime import datetime as dt
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.db.models import Q
from ninja import Router, Query, File, Form
from ninja.files import UploadedFile
from django.http import HttpResponse
import csv
import io

from core.auth import keycloak_auth
from core.audit import log as audit_log
from users.models import UserProfile
from users.api import get_or_create_profile, is_admin
from .models import (
    TaetigkeitsRolle,
    Veranstaltung,
    VeranstaltungTermin,
    VeranstaltungZuweisung,
    VeranstaltungMeldung,
    VeranstaltungAbmeldung,
    VeranstaltungChecklisteItem,
    VeranstaltungNotiz,
    VeranstaltungAnhang,
    VeranstaltungErinnerung,
)
from .schemas import (
    VeranstaltungSchema,
    VeranstaltungListSchema,
    VeranstaltungCreateSchema,
    CreateVeranstaltungResponseSchema,
    VeranstaltungUpdateSchema,
    VeranstaltungFilterSchema,
    VeranstaltungTermineSaveSchema,
    ZuweisungCreateSchema,
    MeldungSetSchema,
    AbmeldungSchema,
    ChecklisteItemCreateSchema,
    ChecklisteItemUpdateSchema,
    NotizCreateSchema,
    ErinnerungCreateSchema,
    ZammadTicketSchema,
)
from . import zammad_client

veranstaltung_router = Router(tags=["Veranstaltung"])


def get_user_id(request) -> str:
    return request.auth.get('sub', '')


def require_permission(request, code: str):
    """Prüft Permission, wirft 403 wenn nicht vorhanden. Admin hat immer Zugriff."""
    if is_admin(request):
        return
    keycloak_id = get_user_id(request)
    try:
        profile = UserProfile.objects.get(keycloak_id=keycloak_id)
        if profile.has_permission(code, False):
            return
    except UserProfile.DoesNotExist:
        pass
    from ninja.errors import HttpError
    raise HttpError(403, "Keine Berechtigung")


def _sync_kalender_events(v):
    """
    Synchronisiert Kalender-Events für eine Veranstaltung (ein Event pro Termin).
    Löscht alte auto-generierte Events und erstellt neue mit aktuellen Daten.
    Zugewiesene User werden in der Beschreibung aufgelistet.
    """
    try:
        from kalender.models import Event as KalenderEvent
        from django.utils import timezone as tz
        import datetime as dt_module

        # Zugewiesene Personen für Beschreibung sammeln
        zuweisungen = list(v.zuweisungen.select_related('taetigkeit').all()) if hasattr(v, '_prefetched_objects_cache') or v.pk else []
        if not zuweisungen:
            try:
                zuweisungen = list(v.zuweisungen.select_related('taetigkeit').all())
            except Exception:
                zuweisungen = []

        personen_lines = []
        for z in zuweisungen:
            line = z.user_username or z.user_keycloak_id
            if z.taetigkeit:
                line += f' ({z.taetigkeit.name})'
            personen_lines.append(line)

        beschreibung_parts = []
        if v.beschreibung:
            beschreibung_parts.append(v.beschreibung)
        if personen_lines:
            beschreibung_parts.append('Besetzung:\n' + '\n'.join(f'• {p}' for p in personen_lines))
        beschreibung = '\n\n'.join(beschreibung_parts)

        # Status auf vereinfachte Kalender-Choices mappen (nur geplant/abgesagt
        # werden gespeichert, alles andere wird vom Effektiv-Status abgeleitet).
        kalender_status = 'abgesagt' if v.status == 'abgesagt' else 'geplant'

        # Alte auto-erstellte Events löschen
        KalenderEvent.objects.filter(veranstaltung_id=v.id).delete()

        termine_qs = list(v.termine.all())
        if termine_qs:
            for t in termine_qs:
                start = dt_module.datetime.combine(t.datum, t.beginn or dt_module.time(0, 0))
                ende = dt_module.datetime.combine(t.datum, t.ende or dt_module.time(23, 59))
                start = tz.make_aware(start) if tz.is_naive(start) else start
                ende = tz.make_aware(ende) if tz.is_naive(ende) else ende
                KalenderEvent.objects.create(
                    titel=f"{v.titel}{(' – ' + t.titel) if t.titel else ''}",
                    beschreibung=beschreibung,
                    start=start,
                    ende=ende,
                    ort=v.ort or '',
                    status=kalender_status,
                    veranstaltung_id=v.id,
                    erstellt_von='system',
                )
        elif v.datum_von:
            KalenderEvent.objects.create(
                titel=v.titel,
                beschreibung=beschreibung,
                start=v.datum_von,
                ende=v.datum_bis or v.datum_von,
                ort=v.ort or '',
                status=kalender_status,
                veranstaltung_id=v.id,
                erstellt_von='system',
            )
    except Exception:
        pass  # Kalender-Sync ist best-effort


def _set_ist_zugewiesen(veranstaltung, keycloak_id: str):
    if not keycloak_id:
        return
    zuweisung_ids = set(veranstaltung.zuweisungen.values_list('user_keycloak_id', flat=True))
    setattr(veranstaltung, 'ist_zugewiesen', keycloak_id in zuweisung_ids)
    meldung_ids = set(veranstaltung.meldungen.values_list('user_keycloak_id', flat=True))
    setattr(veranstaltung, 'ist_gemeldet', keycloak_id in meldung_ids)


# ========== Benutzer für Zuweisung ==========

@veranstaltung_router.get("/benutzer", response=List[dict], auth=keycloak_auth)
def list_benutzer(request):
    """Benutzer für Zuweisung (Keycloak-User aus UserProfile) inkl. discord_id und bereiche."""
    require_permission(request, 'veranstaltung.zuweisungen')
    users = UserProfile.objects.prefetch_related('bereiche').all()
    return [
        {
            'id': u.id,
            'keycloak_id': u.keycloak_id,
            'username': u.username,
            'email': u.email,
            'discord_id': u.discord_id,
            'bereiche': [{'id': b.id, 'name': b.name} for b in u.bereiche.all()],
        }
        for u in users
    ]


@veranstaltung_router.get("/taetigkeitsrollen", response=List[dict], auth=keycloak_auth)
def list_taetigkeitsrollen(request):
    """Verfügbare Tätigkeitsrollen für Zuweisungen."""
    require_permission(request, 'veranstaltung.view')
    return list(TaetigkeitsRolle.objects.values('id', 'name'))


# WICHTIG: Literal-Pfade VOR {id}-Parametern registrieren (sonst 422 statt 404)
@veranstaltung_router.get("/anhaenge/{anhang_id}/download", auth=keycloak_auth)
def download_anhang_early(request, anhang_id: int):
    """Anhang-Download mit Authentifizierung (vermeidet Keycloak-Redirect)."""
    require_permission(request, 'veranstaltung.view')
    import os
    from ninja.errors import HttpError
    from django.http import FileResponse, HttpResponseRedirect
    anhang = get_object_or_404(VeranstaltungAnhang, id=anhang_id)
    if anhang.datei:
        # Wenn anhang.name keine Endung enthält, die Endung der gespeicherten
        # Datei anhängen — sonst lädt der Browser eine endungslose Datei.
        original_ext = os.path.splitext(anhang.datei.name)[1]
        base, ext = os.path.splitext(anhang.name or '')
        if original_ext and not ext:
            filename = f"{anhang.name}{original_ext}"
        else:
            filename = anhang.name or os.path.basename(anhang.datei.name)
        return FileResponse(anhang.datei.open('rb'), as_attachment=True, filename=filename)
    elif anhang.url:
        return HttpResponseRedirect(anhang.url)
    raise HttpError(404, "Anhang hat weder Datei noch URL")


# ========== Veranstaltungen CRUD ==========

@veranstaltung_router.get("", response=List[VeranstaltungListSchema], auth=keycloak_auth)
def list_veranstaltungen(request, q: Query[VeranstaltungFilterSchema] = None):
    require_permission(request, 'veranstaltung.view')
    filters = q.dict() if q else {}
    kid = get_user_id(request)
    qs = Veranstaltung.objects.prefetch_related('zuweisungen', 'meldungen').order_by('-datum_von')

    # Ausgeblendete Events fuer diesen User filtern (Admins sehen alles)
    # Python-seitig filtern, da SQLite kein JSON-contains unterstuetzt
    ausblenden_filter = not is_admin(request)

    if filters.get('status'):
        qs = qs.filter(status=filters['status'])
    if filters.get('datum_von'):
        qs = qs.filter(datum_bis__date__gte=filters['datum_von'])
    if filters.get('datum_bis'):
        qs = qs.filter(datum_von__date__lte=filters['datum_bis'])
    if filters.get('suche'):
        s = filters['suche'].strip()
        qs = qs.filter(
            Q(titel__icontains=s) | Q(beschreibung__icontains=s) | Q(ort__icontains=s)
        )
    if filters.get('nur_meine'):
        qs = qs.filter(zuweisungen__user_keycloak_id=kid).distinct()

    result = list(qs)
    if ausblenden_filter:
        filtered = []
        for v in result:
            # Ausgeblendete Events filtern
            if kid in (v.ausgeblendete_user or []):
                continue
            # Wenn meldung_aktiv=False: nur zugewiesene User sehen das Event
            if not v.meldung_aktiv:
                zugewiesen_ids = set(v.zuweisungen.values_list('user_keycloak_id', flat=True))
                if kid not in zugewiesen_ids:
                    continue
            filtered.append(v)
        result = filtered
    for v in result:
        _set_ist_zugewiesen(v, kid)
    return result


@veranstaltung_router.get("/meine", response=List[VeranstaltungListSchema], auth=keycloak_auth)
def list_meine_veranstaltungen(request):
    """Veranstaltungen, denen der aktuelle User zugewiesen ist (für Dashboard)."""
    require_permission(request, 'veranstaltung.view')
    kid = get_user_id(request)
    qs = Veranstaltung.objects.prefetch_related('zuweisungen').filter(
        zuweisungen__user_keycloak_id=kid
    ).distinct().order_by('datum_von')
    result = list(qs)
    for v in result:
        _set_ist_zugewiesen(v, kid)
    return result


@veranstaltung_router.get("/{id}", response=VeranstaltungSchema, auth=keycloak_auth)
def get_veranstaltung(request, id: int):
    require_permission(request, 'veranstaltung.view')
    v = get_object_or_404(
        Veranstaltung.objects.prefetch_related(
            'termine', 'zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'
        ),
        id=id
    )
    kid = get_user_id(request)
    # Zugriffskontrolle: ausgeblendete User + meldung_aktiv=False fuer nicht-zugewiesene
    if not is_admin(request):
        if kid in (v.ausgeblendete_user or []):
            from ninja.errors import HttpError
            raise HttpError(404, "Veranstaltung nicht gefunden")
        if not v.meldung_aktiv:
            zugewiesen_ids = set(v.zuweisungen.values_list('user_keycloak_id', flat=True))
            if kid not in zugewiesen_ids:
                from ninja.errors import HttpError
                raise HttpError(404, "Veranstaltung nicht gefunden")
    _set_ist_zugewiesen(v, kid)
    return v


def _parse_datetime(value):
    """String aus datetime-local (YYYY-MM-DDTHH:mm) in timezone-aware datetime."""
    if value is None:
        return None
    if hasattr(value, 'isoformat'):
        return timezone.make_aware(value) if timezone.is_naive(value) else value
    if isinstance(value, str):
        try:
            # Unterstützt "YYYY-MM-DDTHH:mm" und ISO mit Z/+00:00
            parsed = dt.fromisoformat(value.replace('Z', '+00:00'))
            return timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed
        except (ValueError, TypeError):
            pass
    return value


@veranstaltung_router.post("", response=CreateVeranstaltungResponseSchema, auth=keycloak_auth)
def create_veranstaltung(request, payload: VeranstaltungCreateSchema):
    require_permission(request, 'veranstaltung.create')
    profile = get_or_create_profile(request)
    data = payload.dict()
    data['erstellt_von'] = profile.keycloak_id
    data['datum_von'] = _parse_datetime(data.get('datum_von')) or timezone.now()
    data['datum_bis'] = _parse_datetime(data.get('datum_bis')) or data['datum_von']
    ausleihliste_id = data.pop('ausleihliste_id', None)
    if ausleihliste_id:
        from inventar.models import Ausleihliste
        data['ausleihliste'] = get_object_or_404(Ausleihliste, id=ausleihliste_id)
    else:
        data['ausleihliste'] = None
    v = Veranstaltung.objects.create(**data)
    audit_log(request, 'erstellt', 'veranstaltung', v.id, v.titel)
    return {"id": v.id, "titel": v.titel}


@veranstaltung_router.put("/{id}", response=VeranstaltungSchema, auth=keycloak_auth)
def update_veranstaltung(request, id: int, payload: VeranstaltungUpdateSchema):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung, id=id)
    data = payload.dict(exclude_unset=True)
    ausleihliste_id = data.pop('ausleihliste_id', None)
    erforderliche = data.pop('erforderliche_kompetenzen_ids', None)
    empfohlene = data.pop('empfohlene_kompetenzen_ids', None)
    if 'ausleihliste_id' in payload.dict():
        if ausleihliste_id:
            from inventar.models import Ausleihliste
            v.ausleihliste = get_object_or_404(Ausleihliste, id=ausleihliste_id)
        else:
            v.ausleihliste = None
    if 'datum_von' in data:
        data['datum_von'] = _parse_datetime(data['datum_von'])
    if 'datum_bis' in data:
        data['datum_bis'] = _parse_datetime(data['datum_bis'])
    for k, val in data.items():
        setattr(v, k, val)
    v.save()
    if erforderliche is not None:
        from kompetenzen.models import Kompetenz
        v.erforderliche_kompetenzen.set(Kompetenz.objects.filter(id__in=erforderliche))
    if empfohlene is not None:
        from kompetenzen.models import Kompetenz
        v.empfohlene_kompetenzen.set(Kompetenz.objects.filter(id__in=empfohlene))
    # Kalender-Events synchronisieren wenn vorhanden (Name/Status/Ort können sich geändert haben)
    _sync_kalender_events(v)
    _set_ist_zugewiesen(v, get_user_id(request))
    audit_log(request, 'aktualisiert', 'veranstaltung', v.id, v.titel)
    return v


@veranstaltung_router.delete("/{id}", auth=keycloak_auth)
def delete_veranstaltung(request, id: int):
    require_permission(request, 'veranstaltung.delete')
    v = get_object_or_404(Veranstaltung, id=id)
    # Kalender-Events auch löschen
    try:
        from kalender.models import Event as KalenderEvent
        KalenderEvent.objects.filter(veranstaltung_id=v.id).delete()
    except Exception:
        pass
    titel = v.titel
    vid = v.id
    v.delete()
    audit_log(request, 'geloescht', 'veranstaltung', vid, titel)
    return {"status": "deleted"}


# ========== Termine ==========

@veranstaltung_router.post("/{id}/termine", response=VeranstaltungSchema, auth=keycloak_auth)
def save_termine(request, id: int, payload: VeranstaltungTermineSaveSchema):
    """Termine einer Veranstaltung speichern (vollständige Ersetzung)."""
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(
        Veranstaltung.objects.prefetch_related(
            'termine', 'zuweisungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'
        ),
        id=id
    )
    from datetime import time as time_type
    import datetime as dt_module

    def parse_time(s):
        if not s:
            return None
        try:
            parts = s.split(':')
            return time_type(int(parts[0]), int(parts[1]))
        except Exception:
            return None

    incoming_ids = {t.id for t in payload.termine if t.id}
    # Lösche entfernte Termine
    v.termine.exclude(id__in=incoming_ids).delete()

    for termin_data in payload.termine:
        beginn = parse_time(termin_data.beginn)
        ende = parse_time(termin_data.ende)
        if termin_data.id:
            VeranstaltungTermin.objects.filter(id=termin_data.id, veranstaltung=v).update(
                titel=termin_data.titel,
                datum=termin_data.datum,
                beginn=beginn,
                ende=ende,
            )
        else:
            VeranstaltungTermin.objects.create(
                veranstaltung=v,
                titel=termin_data.titel,
                datum=termin_data.datum,
                beginn=beginn,
                ende=ende,
            )

    v.refresh_from_db()
    # Kalender-Events synchronisieren
    _sync_kalender_events(v)
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Anwesenheit ==========

@veranstaltung_router.post("/{id}/anwesenheit-erstellen", auth=keycloak_auth)
def anwesenheit_erstellen(request, id: int):
    """
    Erstellt automatisch eine Anwesenheitsliste aus der Veranstaltung:
    - Zugewiesene User → Teilnehmer (TaetigkeitsRolle als Aufgabe)
    - VeranstaltungTermine → Anwesenheits-Termine
    Verknüpft die neue Liste mit der Veranstaltung.
    """
    require_permission(request, 'veranstaltung.edit')
    profile = get_or_create_profile(request)
    v = get_object_or_404(
        Veranstaltung.objects.prefetch_related('zuweisungen__taetigkeit', 'termine'),
        id=id
    )

    from anwesenheit.models import AnwesenheitsListe, Termin as AnwesenheitsTermin, Teilnehmer

    # Neue Anwesenheitsliste erstellen
    liste = AnwesenheitsListe.objects.create(
        titel=v.titel,
        beschreibung=v.beschreibung or '',
        ort=v.ort or '',
        erstellt_von_keycloak_id=profile.keycloak_id,
        erstellt_von_username=profile.username or '',
    )

    # Termine übernehmen: erst explizite Termine, dann Von-Bis als Fallback
    termine_qs = list(v.termine.all())
    if termine_qs:
        for vt in termine_qs:
            AnwesenheitsTermin.objects.get_or_create(
                liste=liste,
                datum=vt.datum,
                beginn=vt.beginn,
                defaults={
                    'titel': vt.titel or '',
                    'ende': vt.ende,
                }
            )
    elif v.datum_von:
        # Fallback: datum_von/datum_bis als einzelnen Termin
        from datetime import time as time_type
        beginn = v.datum_von.time() if v.datum_von else None
        ende = v.datum_bis.time() if v.datum_bis else None
        datum = v.datum_von.date()
        AnwesenheitsTermin.objects.get_or_create(
            liste=liste,
            datum=datum,
            beginn=beginn,
            defaults={
                'titel': '',
                'ende': ende,
            }
        )

    # Zugewiesene User als Teilnehmer hinzufügen
    for zuw in v.zuweisungen.all():
        aufgabe = zuw.taetigkeit.name if zuw.taetigkeit else ''
        Teilnehmer.objects.get_or_create(
            liste=liste,
            keycloak_id=zuw.user_keycloak_id,
            defaults={
                'name': zuw.user_username or zuw.user_keycloak_id,
                'email': zuw.user_email or '',
                'aufgabe': aufgabe,
            }
        )

    # Liste mit Veranstaltung verknüpfen
    v.anwesenheitsliste = liste
    v.save(update_fields=['anwesenheitsliste'])

    return {
        "status": "created",
        "liste_id": liste.id,
        "titel": liste.titel,
        "teilnehmer": liste.teilnehmer.count(),
        "termine": liste.termine.count(),
    }


@veranstaltung_router.post("/{id}/anwesenheit-sync", auth=keycloak_auth)
def anwesenheit_sync(request, id: int):
    """
    Synchronisiert die verknüpfte Anwesenheitsliste:
    - Termine: neue hinzufügen, veraltete löschen (TerminAnwesenheit bleibt erhalten)
    - Teilnehmer: neue Zuweisungen hinzufügen, entfernte Zuweisungen aus Liste entfernen
    """
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(
        Veranstaltung.objects.prefetch_related('termine', 'zuweisungen__taetigkeit'),
        id=id
    )
    if not v.anwesenheitsliste_id:
        from ninja.errors import HttpError
        raise HttpError(400, "Keine Anwesenheitsliste verknüpft")

    from anwesenheit.models import Termin as AnwesenheitsTermin, Teilnehmer

    liste = v.anwesenheitsliste
    termine_qs = list(v.termine.all())

    termine_added = 0
    termine_deleted = 0
    teilnehmer_added = 0
    teilnehmer_removed = 0

    # ─── Termine synchronisieren ───────────────────────────────
    if termine_qs:
        for vt in termine_qs:
            _, created = AnwesenheitsTermin.objects.get_or_create(
                liste=liste,
                datum=vt.datum,
                beginn=vt.beginn,
                defaults={'titel': vt.titel or '', 'ende': vt.ende}
            )
            if created:
                termine_added += 1

        # Veraltete Termine löschen
        expected_keys = {(vt.datum, vt.beginn) for vt in termine_qs}
        for at in AnwesenheitsTermin.objects.filter(liste=liste):
            if (at.datum, at.beginn) not in expected_keys:
                at.delete()
                termine_deleted += 1
    elif v.datum_von:
        _, created = AnwesenheitsTermin.objects.get_or_create(
            liste=liste,
            datum=v.datum_von.date(),
            beginn=v.datum_von.time(),
            defaults={'titel': '', 'ende': v.datum_bis.time() if v.datum_bis else None}
        )
        if created:
            termine_added += 1

    # ─── Teilnehmer synchronisieren ────────────────────────────
    # Zuweisungen → Soll-Stand
    zuweisungen = list(v.zuweisungen.all())
    soll_keycloak_ids = {z.user_keycloak_id for z in zuweisungen}

    # Ist-Stand der Teilnehmer
    ist_teilnehmer = {t.keycloak_id: t for t in Teilnehmer.objects.filter(liste=liste) if t.keycloak_id}

    # Neue hinzufügen / Aufgabe aktualisieren
    for zuw in zuweisungen:
        aufgabe = zuw.taetigkeit.name if zuw.taetigkeit else ''
        if zuw.user_keycloak_id in ist_teilnehmer:
            # Aufgabe aktualisieren falls nötig
            tn = ist_teilnehmer[zuw.user_keycloak_id]
            if aufgabe and tn.aufgabe != aufgabe:
                tn.aufgabe = aufgabe
                tn.save(update_fields=['aufgabe'])
        else:
            Teilnehmer.objects.create(
                liste=liste,
                keycloak_id=zuw.user_keycloak_id,
                name=zuw.user_username or zuw.user_keycloak_id,
                email=zuw.user_email or '',
                aufgabe=aufgabe,
            )
            teilnehmer_added += 1

    # Entfernte Zuweisungen aus Teilnehmerliste nehmen
    for kid, tn in ist_teilnehmer.items():
        if kid not in soll_keycloak_ids:
            tn.delete()
            teilnehmer_removed += 1

    return {
        "status": "synced",
        "termine_added": termine_added,
        "termine_deleted": termine_deleted,
        "teilnehmer_added": teilnehmer_added,
        "teilnehmer_removed": teilnehmer_removed,
        "termine_gesamt": AnwesenheitsTermin.objects.filter(liste=liste).count(),
        "teilnehmer_gesamt": Teilnehmer.objects.filter(liste=liste).count(),
    }


@veranstaltung_router.post("/{id}/anwesenheit/{liste_id}", auth=keycloak_auth)
def link_anwesenheit(request, id: int, liste_id: int):
    """Anwesenheitsliste mit Veranstaltung verknüpfen."""
    require_permission(request, 'veranstaltung.edit')
    from anwesenheit.models import AnwesenheitsListe
    v = get_object_or_404(Veranstaltung, id=id)
    liste = get_object_or_404(AnwesenheitsListe, id=liste_id)
    v.anwesenheitsliste = liste
    v.save(update_fields=['anwesenheitsliste'])
    return {"status": "linked", "liste_id": liste.id, "titel": liste.titel}


@veranstaltung_router.delete("/{id}/anwesenheit", auth=keycloak_auth)
def unlink_anwesenheit(request, id: int):
    """Anwesenheitsliste von Veranstaltung trennen."""
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung, id=id)
    v.anwesenheitsliste = None
    v.save(update_fields=['anwesenheitsliste'])
    return {"status": "unlinked"}


# ========== Zuweisungen ==========

@veranstaltung_router.post("/{id}/zuweisungen", response=VeranstaltungSchema, auth=keycloak_auth)
def add_zuweisung(request, id: int, payload: ZuweisungCreateSchema):
    require_permission(request, 'veranstaltung.zuweisungen')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    data = payload.dict()
    taetigkeit = None
    if data.get('taetigkeit_id'):
        taetigkeit = TaetigkeitsRolle.objects.filter(id=data['taetigkeit_id']).first()
    VeranstaltungZuweisung.objects.update_or_create(
        veranstaltung=v,
        user_keycloak_id=data['user_keycloak_id'],
        defaults={
            'user_username': data.get('user_username', ''),
            'user_email': data.get('user_email', ''),
            'taetigkeit': taetigkeit,
        }
    )

    # Discord-Channel-Zugriff + DM-Benachrichtigung
    from . import discord_client
    try:
        profile = UserProfile.objects.get(keycloak_id=data['user_keycloak_id'])
        if profile.discord_id:
            if v.discord_channel_id:
                discord_client.grant_channel_access(v.discord_channel_id, profile.discord_id)
            # Best-effort DM, blockiert nie den Request
            discord_client.notify_zuweisung(v, profile.discord_id)
    except UserProfile.DoesNotExist:
        pass

    v.refresh_from_db()
    # Kalender-Events synchronisieren (Besetzung in Beschreibung aktualisieren)
    _sync_kalender_events(v)
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.delete("/{id}/zuweisungen/{user_keycloak_id}", response=VeranstaltungSchema, auth=keycloak_auth)
def remove_zuweisung(request, id: int, user_keycloak_id: str):
    require_permission(request, 'veranstaltung.zuweisungen')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)

    # Discord-Channel-Zugriff entziehen
    if v.discord_channel_id:
        from . import discord_client
        try:
            profile = UserProfile.objects.get(keycloak_id=user_keycloak_id)
            if profile.discord_id:
                discord_client.revoke_channel_access(v.discord_channel_id, profile.discord_id)
        except UserProfile.DoesNotExist:
            pass

    VeranstaltungZuweisung.objects.filter(veranstaltung=v, user_keycloak_id=user_keycloak_id).delete()
    v.refresh_from_db()
    # Kalender-Events aktualisieren (Besetzung in Beschreibung)
    _sync_kalender_events(v)
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Meldungen ==========

@veranstaltung_router.post("/{id}/melden", response=VeranstaltungSchema, auth=keycloak_auth)
def melden(request, id: int, payload: MeldungSetSchema):
    """Sich für eine Veranstaltung melden (= hab Zeit)."""
    require_permission(request, 'veranstaltung.view')
    profile = get_or_create_profile(request)
    v = get_object_or_404(
        Veranstaltung.objects.prefetch_related(
            'termine', 'zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'
        ),
        id=id
    )
    if not v.meldung_aktiv:
        from ninja.errors import HttpError
        raise HttpError(400, "Meldung ist für diese Veranstaltung deaktiviert")

    # Kompetenz-Check: User braucht alle erforderlichen Kompetenzen (nicht abgelaufen)
    # Admins sind vom Check ausgenommen
    erforderlich_ids = list(v.erforderliche_kompetenzen.values_list('id', flat=True))
    if erforderlich_ids and not is_admin(request):
        from kompetenzen.models import UserKompetenz
        user_uks = UserKompetenz.objects.filter(
            user_keycloak_id=profile.keycloak_id,
            kompetenz_id__in=erforderlich_ids,
            hat_kompetenz=True,
        ).select_related('kompetenz')
        erfuellt_ids = {uk.kompetenz_id for uk in user_uks if not uk.ist_abgelaufen}
        fehlend_ids = set(erforderlich_ids) - erfuellt_ids
        if fehlend_ids:
            from kompetenzen.models import Kompetenz
            from ninja.errors import HttpError
            fehlende_namen = list(Kompetenz.objects.filter(
                id__in=fehlend_ids).values_list('name', flat=True))
            raise HttpError(
                403,
                "Fehlende oder abgelaufene Kompetenzen: " + ", ".join(fehlende_namen)
            )

    VeranstaltungMeldung.objects.update_or_create(
        veranstaltung=v,
        user_keycloak_id=profile.keycloak_id,
        defaults={
            'user_username': profile.username or '',
            'kommentar': payload.kommentar,
        }
    )
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.post("/{id}/abmelden", response=VeranstaltungSchema, auth=keycloak_auth)
def abmelden(request, id: int, payload: AbmeldungSchema):
    """Sich von einer Veranstaltung abmelden (mit optionalem Grund)."""
    require_permission(request, 'veranstaltung.view')
    profile = get_or_create_profile(request)
    v = get_object_or_404(
        Veranstaltung.objects.prefetch_related(
            'termine', 'zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'
        ),
        id=id
    )
    deleted, _ = VeranstaltungMeldung.objects.filter(
        veranstaltung=v, user_keycloak_id=profile.keycloak_id
    ).delete()
    # Abmeldung ins Log schreiben wenn tatsaechlich eine Meldung existierte
    if deleted:
        VeranstaltungAbmeldung.objects.create(
            veranstaltung=v,
            user_keycloak_id=profile.keycloak_id,
            user_username=profile.username or '',
            grund=payload.grund,
        )
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.put("/{id}/sichtbarkeit", auth=keycloak_auth)
def set_sichtbarkeit(request, id: int, user_keycloak_id: str, ausblenden: bool = True):
    """Admin: Veranstaltung für einen User ein-/ausblenden."""
    require_permission(request, 'veranstaltung.zuweisungen')
    v = get_object_or_404(Veranstaltung, id=id)
    liste = v.ausgeblendete_user or []
    if ausblenden and user_keycloak_id not in liste:
        liste.append(user_keycloak_id)
    elif not ausblenden and user_keycloak_id in liste:
        liste.remove(user_keycloak_id)
    v.ausgeblendete_user = liste
    v.save(update_fields=['ausgeblendete_user', 'aktualisiert_am'])
    return {'success': True, 'ausgeblendete_user': v.ausgeblendete_user}


@veranstaltung_router.put("/{id}/meldung-aktiv", auth=keycloak_auth)
def toggle_meldung_aktiv(request, id: int, aktiv: bool = True):
    """Admin: Meldefunktion für eine Veranstaltung ein-/ausschalten."""
    require_permission(request, 'veranstaltung.zuweisungen')
    v = get_object_or_404(Veranstaltung, id=id)
    v.meldung_aktiv = aktiv
    v.save(update_fields=['meldung_aktiv', 'aktualisiert_am'])
    return {'success': True, 'meldung_aktiv': v.meldung_aktiv}


# ========== Checkliste ==========

@veranstaltung_router.post("/{id}/checkliste", response=VeranstaltungSchema, auth=keycloak_auth)
def add_checkliste_item(request, id: int, payload: ChecklisteItemCreateSchema):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    VeranstaltungChecklisteItem.objects.create(
        veranstaltung=v,
        titel=payload.titel,
        sortierung=payload.sortierung,
    )
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.put("/{id}/checkliste/{item_id}", response=VeranstaltungSchema, auth=keycloak_auth)
def update_checkliste_item(request, id: int, item_id: int, payload: ChecklisteItemUpdateSchema):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    item = get_object_or_404(VeranstaltungChecklisteItem, veranstaltung=v, id=item_id)
    data = payload.dict(exclude_unset=True)
    if 'erledigt' in data and data['erledigt']:
        data['erledigt_am'] = timezone.now()
    elif 'erledigt' in data and not data['erledigt']:
        data['erledigt_am'] = None
    for k, val in data.items():
        setattr(item, k, val)
    item.save()
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.delete("/{id}/checkliste/{item_id}", response=VeranstaltungSchema, auth=keycloak_auth)
def delete_checkliste_item(request, id: int, item_id: int):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    get_object_or_404(VeranstaltungChecklisteItem, veranstaltung=v, id=item_id).delete()
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Notizen ==========

@veranstaltung_router.post("/{id}/notizen", response=VeranstaltungSchema, auth=keycloak_auth)
def add_notiz(request, id: int, payload: NotizCreateSchema):
    require_permission(request, 'veranstaltung.edit')
    profile = get_or_create_profile(request)
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    VeranstaltungNotiz.objects.create(
        veranstaltung=v,
        text=payload.text,
        created_by_keycloak_id=profile.keycloak_id,
        created_by_username=profile.username or '',
    )
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Anhänge ==========

@veranstaltung_router.post("/{id}/anhaenge", response=VeranstaltungSchema, auth=keycloak_auth)
def add_anhang(request, id: int, name: str = Form(''), url: str = Form(''), datei: UploadedFile = File(None)):
    require_permission(request, 'veranstaltung.edit')
    import hashlib
    from ninja.errors import HttpError
    if not datei and not (url or '').strip():
        raise HttpError(400, "Bitte Datei oder URL angeben")
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    anhang_name = name or (datei.name if datei else 'Anhang')

    # Unique-Key generieren um Duplikate zu verhindern
    key_source = f"{v.id}:{anhang_name}:{url or ''}"
    if datei:
        key_source += f":{datei.name}:{datei.size}"
    unique_key = hashlib.sha256(key_source.encode()).hexdigest()[:64]

    # Prüfen ob Anhang mit diesem Key bereits existiert
    if VeranstaltungAnhang.objects.filter(unique_key=unique_key).exists():
        # Kein Fehler, einfach die vorhandene Veranstaltung zurückgeben
        v.refresh_from_db()
        _set_ist_zugewiesen(v, get_user_id(request))
        return v

    anhang = VeranstaltungAnhang(veranstaltung=v, name=anhang_name, url=url or '', unique_key=unique_key)
    if datei:
        anhang.datei = datei
    anhang.save()
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.delete("/{id}/anhaenge/{anhang_id}", response=VeranstaltungSchema, auth=keycloak_auth)
def delete_anhang(request, id: int, anhang_id: int):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    get_object_or_404(VeranstaltungAnhang, veranstaltung=v, id=anhang_id).delete()
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Erinnerungen ==========

@veranstaltung_router.post("/{id}/erinnerungen", response=VeranstaltungSchema, auth=keycloak_auth)
def add_erinnerung(request, id: int, payload: ErinnerungCreateSchema):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    VeranstaltungErinnerung.objects.create(
        veranstaltung=v,
        zeit_vorher=payload.zeit_vorher,
        einheit=payload.einheit,
    )
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


@veranstaltung_router.delete("/{id}/erinnerungen/{erinnerung_id}", response=VeranstaltungSchema, auth=keycloak_auth)
def delete_erinnerung(request, id: int, erinnerung_id: int):
    require_permission(request, 'veranstaltung.edit')
    v = get_object_or_404(Veranstaltung.objects.prefetch_related('zuweisungen', 'meldungen', 'abmeldungen', 'checkliste', 'notizen', 'anhaenge', 'erinnerungen'), id=id)
    get_object_or_404(VeranstaltungErinnerung, veranstaltung=v, id=erinnerung_id).delete()
    v.refresh_from_db()
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Discord-Integration ==========

@veranstaltung_router.post("/{id}/discord/sync", auth=keycloak_auth)
def discord_sync(request, id: int):
    """
    Erstellt/aktualisiert Discord Event + Channel für diese Veranstaltung.
    Gibt allen zugewiesenen Usern (mit discord_id) Zugriff auf den Channel.
    Gibt Fehler zurück wenn User keine discord_id haben.
    """
    require_permission(request, 'veranstaltung.discord')
    from . import discord_client
    if not discord_client.is_configured():
        return {"success": False, "error": "Discord-Integration nicht konfiguriert"}

    v = get_object_or_404(
        Veranstaltung.objects.prefetch_related('zuweisungen', 'notizen'),
        id=id
    )

    errors = []
    synced_users = []

    # Discord-User-IDs der zugewiesenen Personen ermitteln
    zuweisungen = v.zuweisungen.all()
    for z in zuweisungen:
        try:
            profile = UserProfile.objects.get(keycloak_id=z.user_keycloak_id)
            if not profile.discord_id:
                errors.append(f"{z.user_username or z.user_keycloak_id}: Keine Discord-ID hinterlegt")
            else:
                synced_users.append({'username': z.user_username, 'discord_id': profile.discord_id})
        except UserProfile.DoesNotExist:
            errors.append(f"{z.user_username or z.user_keycloak_id}: Kein Profil gefunden")

    # Event erstellen wenn noch keins existiert
    if not v.discord_event_id:
        # Notizen als Event-Beschreibung
        notizen_texte = [n.text for n in v.notizen.all()]
        discord_description = '\n\n'.join(notizen_texte) if notizen_texte else v.beschreibung
        event_id, event_error = discord_client.create_scheduled_event(
            title=v.titel,
            start_time=v.datum_von.isoformat(),
            end_time=v.datum_bis.isoformat(),
            description=discord_description,
            location=v.ort,
        )
        if event_id:
            v.discord_event_id = event_id
            v.save(update_fields=['discord_event_id'])
        elif event_error:
            errors.append(f"Discord Event fehlgeschlagen: {event_error}")

    # Channel erstellen wenn noch keiner existiert
    if not v.discord_channel_id:
        channel_name = f"{v.titel}_{v.datum_von.year}"
        channel_id = discord_client.create_text_channel(
            name=channel_name,
            topic=f"Veranstaltung: {v.titel} ({v.datum_von.strftime('%d.%m.%Y')})",
        )
        if channel_id:
            v.discord_channel_id = channel_id
            v.save(update_fields=['discord_channel_id'])

    # Channel-Berechtigungen setzen
    if v.discord_channel_id:
        for user in synced_users:
            discord_client.grant_channel_access(v.discord_channel_id, user['discord_id'])

    return {
        "success": True,
        "discord_event_id": v.discord_event_id,
        "discord_channel_id": v.discord_channel_id,
        "synced_users": len(synced_users),
        "errors": errors,
    }


@veranstaltung_router.delete("/{id}/discord", auth=keycloak_auth)
def discord_cleanup(request, id: int):
    """Entfernt Discord Event und Channel für diese Veranstaltung."""
    require_permission(request, 'veranstaltung.discord')
    from . import discord_client
    v = get_object_or_404(Veranstaltung, id=id)

    if v.discord_event_id:
        discord_client.delete_scheduled_event(v.discord_event_id)
        v.discord_event_id = ''
    if v.discord_channel_id:
        discord_client.delete_channel(v.discord_channel_id)
        v.discord_channel_id = ''
    v.save(update_fields=['discord_event_id', 'discord_channel_id'])

    return {"success": True}


# ========== Zammad ==========

@veranstaltung_router.get("/zammad/tickets", response=List[dict], auth=keycloak_auth)
def zammad_list_tickets(request, page: int = 1, per_page: int = 50):
    """Zammad-Tickets abrufen (für Auswahl 'Aus Ticket erstellen')."""
    return zammad_client.list_tickets(page=page, per_page=per_page)


@veranstaltung_router.get("/zammad/tickets/{ticket_id}", response=dict, auth=keycloak_auth)
def zammad_get_ticket(request, ticket_id: int):
    """Einzelnes Zammad-Ticket abrufen."""
    t = zammad_client.get_ticket(ticket_id)
    if t is None:
        return {"error": "Ticket nicht gefunden"}, 404
    return t


@veranstaltung_router.post("/aus-zammad", response=VeranstaltungSchema, auth=keycloak_auth)
def create_aus_zammad(request, ticket_id: int):
    """Veranstaltung aus einem Zammad-Ticket anlegen."""
    require_permission(request, 'veranstaltung.create')
    t = zammad_client.get_ticket(ticket_id)
    if t is None:
        return {"error": "Ticket nicht gefunden"}, 404
    if Veranstaltung.objects.filter(zammad_ticket_id=ticket_id).exists():
        return {"error": "Zu diesem Ticket existiert bereits eine Veranstaltung"}, 400
    profile = get_or_create_profile(request)
    from datetime import timedelta
    created = t.get('created_at') or ''
    try:
        if 'T' in created:
            datum_start = dt.fromisoformat(created.replace('Z', '+00:00'))
            if timezone.is_naive(datum_start):
                datum_start = timezone.make_aware(datum_start)
        else:
            datum_start = timezone.now()
    except Exception:
        datum_start = timezone.now()
    datum_ende = datum_start + timedelta(hours=2)
    v = Veranstaltung.objects.create(
        titel=t.get('title') or f"Ticket #{t.get('number', ticket_id)}",
        beschreibung=t.get('title') or '',
        datum_von=datum_start,
        datum_bis=datum_ende,
        ort='',
        adresse='',
        status='planung',
        zammad_ticket_id=ticket_id,
        zammad_ticket_number=str(t.get('number') or ticket_id),
        erstellt_von=profile.keycloak_id,
    )
    _set_ist_zugewiesen(v, get_user_id(request))
    return v


# ========== Export ==========

@veranstaltung_router.get("/export/csv", auth=keycloak_auth)
def export_veranstaltungen_csv(request, filters: VeranstaltungFilterSchema = Query(None)):
    """Veranstaltungen als CSV exportieren."""
    require_permission(request, 'veranstaltung.view')
    filters = (filters or VeranstaltungFilterSchema()).dict()
    qs = Veranstaltung.objects.prefetch_related('zuweisungen').order_by('-datum_von')
    if filters.get('status'):
        qs = qs.filter(status=filters['status'])
    if filters.get('datum_von'):
        qs = qs.filter(datum_bis__date__gte=filters['datum_von'])
    if filters.get('datum_bis'):
        qs = qs.filter(datum_von__date__lte=filters['datum_bis'])
    if filters.get('nur_meine'):
        qs = qs.filter(zuweisungen__user_keycloak_id=get_user_id(request)).distinct()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['ID', 'Titel', 'Von', 'Bis', 'Ort', 'Status', 'Zammad-Ticket'])
    for v in qs:
        w.writerow([
            v.id,
            v.titel,
            v.datum_von.strftime('%Y-%m-%d %H:%M') if v.datum_von else '',
            v.datum_bis.strftime('%Y-%m-%d %H:%M') if v.datum_bis else '',
            v.ort or '',
            v.get_status_display(),
            v.zammad_ticket_number or '',
        ])
    response = HttpResponse(buf.getvalue(), content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="veranstaltungen.csv"'
    return response


# ─── Veranstaltungs-Templates ────────────────────────────────────

from .models import VeranstaltungTemplate
from .schemas import (
    TemplateSchema, TemplateCreateSchema, TemplateUpdateSchema,
    CreateFromTemplateSchema,
)


@veranstaltung_router.get("/templates", response=List[TemplateSchema], auth=keycloak_auth)
def list_templates(request):
    require_permission(request, 'veranstaltung.view')
    return VeranstaltungTemplate.objects.prefetch_related('taetigkeiten').all()


@veranstaltung_router.post("/templates", response=TemplateSchema, auth=keycloak_auth)
def create_template(request, payload: TemplateCreateSchema):
    require_permission(request, 'veranstaltung.create')
    data = payload.dict()
    taetigkeit_ids = data.pop('taetigkeit_ids', [])
    komp_ids = data.pop('erforderliche_kompetenzen_ids', [])
    erinnerungen = [e.dict() if hasattr(e, 'dict') else e for e in data.pop('erinnerungen', [])]
    tpl = VeranstaltungTemplate.objects.create(erinnerungen=erinnerungen, **data)
    if taetigkeit_ids:
        tpl.taetigkeiten.set(TaetigkeitsRolle.objects.filter(id__in=taetigkeit_ids))
    if komp_ids:
        from kompetenzen.models import Kompetenz
        tpl.erforderliche_kompetenzen.set(Kompetenz.objects.filter(id__in=komp_ids))
    return tpl


@veranstaltung_router.put("/templates/{tpl_id}", response=TemplateSchema, auth=keycloak_auth)
def update_template(request, tpl_id: int, payload: TemplateUpdateSchema):
    require_permission(request, 'veranstaltung.create')
    tpl = get_object_or_404(VeranstaltungTemplate, id=tpl_id)
    data = payload.dict(exclude_unset=True)
    taetigkeit_ids = data.pop('taetigkeit_ids', None)
    komp_ids = data.pop('erforderliche_kompetenzen_ids', None)
    if 'erinnerungen' in data and data['erinnerungen'] is not None:
        data['erinnerungen'] = [e.dict() if hasattr(e, 'dict') else e for e in data['erinnerungen']]
    for k, v in data.items():
        setattr(tpl, k, v)
    tpl.save()
    if taetigkeit_ids is not None:
        tpl.taetigkeiten.set(TaetigkeitsRolle.objects.filter(id__in=taetigkeit_ids))
    if komp_ids is not None:
        from kompetenzen.models import Kompetenz
        tpl.erforderliche_kompetenzen.set(Kompetenz.objects.filter(id__in=komp_ids))
    return tpl


@veranstaltung_router.delete("/templates/{tpl_id}", auth=keycloak_auth)
def delete_template(request, tpl_id: int):
    require_permission(request, 'veranstaltung.create')
    get_object_or_404(VeranstaltungTemplate, id=tpl_id).delete()
    return {"status": "deleted"}


@veranstaltung_router.post("/templates/{tpl_id}/anlegen",
                           response=CreateVeranstaltungResponseSchema, auth=keycloak_auth)
def create_from_template(request, tpl_id: int, payload: CreateFromTemplateSchema):
    """Erzeugt eine neue Veranstaltung basierend auf einer Vorlage."""
    require_permission(request, 'veranstaltung.create')
    from datetime import timedelta
    tpl = get_object_or_404(VeranstaltungTemplate, id=tpl_id)
    profile = get_or_create_profile(request)
    datum_bis = payload.datum_von + timedelta(minutes=tpl.dauer_minuten or 120)
    v = Veranstaltung.objects.create(
        titel=tpl.titel_vorlage or tpl.name,
        beschreibung=tpl.beschreibung_vorlage,
        datum_von=payload.datum_von,
        datum_bis=datum_bis,
        ort=tpl.ort_vorlage,
        status='geplant',
        erstellt_von=profile.keycloak_id,
    )
    # Erinnerungen kopieren
    for er in (tpl.erinnerungen or []):
        try:
            VeranstaltungErinnerung.objects.create(
                veranstaltung=v,
                zeit_vorher=int(er.get('zeit_vorher', 1)),
                einheit=er.get('einheit', 'tage'),
            )
        except Exception:
            pass
    # Erforderliche Kompetenzen kopieren
    komp_ids = list(tpl.erforderliche_kompetenzen.values_list('id', flat=True))
    if komp_ids:
        v.erforderliche_kompetenzen.set(komp_ids)
    return v
