"""
Anwesenheits-API — Django Ninja Router
"""
import csv
import io
import json
from typing import List
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.http import HttpResponse
from ninja import Router

from core.auth import keycloak_auth
from users.api import is_admin
from users.models import UserProfile
from .models import AnwesenheitsListe, Termin, Teilnehmer, TerminAnwesenheit
from .schemas import (
    AnwesenheitsListeSchema, AnwesenheitsListeListSchema,
    ListeCreateSchema, ListeUpdateSchema,
    TermineSaveSchema,
    TeilnehmerBulkAddSchema,
    StatusUpdateSchema, TerminStatusUpdateSchema, BulkStatusUpdateSchema,
    KlonSchema,
)

anwesenheit_router = Router(tags=["Anwesenheit"])


# ─── Helpers ──────────────────────────────────────────────────────

def get_user_id(request) -> str:
    return request.auth.get('sub', '')


def get_username(request) -> str:
    return request.auth.get('preferred_username', '')


def require_permission(request, code: str):
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


# ─── Listen CRUD ──────────────────────────────────────────────────

@anwesenheit_router.get("", response=List[AnwesenheitsListeListSchema], auth=keycloak_auth)
def list_listen(request):
    require_permission(request, 'anwesenheit.view')
    return AnwesenheitsListe.objects.prefetch_related('teilnehmer', 'termine').all()


@anwesenheit_router.post("", response=AnwesenheitsListeSchema, auth=keycloak_auth)
def create_liste(request, payload: ListeCreateSchema):
    require_permission(request, 'anwesenheit.create')
    liste = AnwesenheitsListe.objects.create(
        titel=payload.titel,
        beschreibung=payload.beschreibung,
        ort=payload.ort,
        erstellt_von_keycloak_id=get_user_id(request),
        erstellt_von_username=get_username(request),
    )
    return liste


# ─── Teilnehmer (literal routes BEFORE /{id}) ───────────────────

@anwesenheit_router.get("/verfuegbare-benutzer", response=list, auth=keycloak_auth)
def verfuegbare_benutzer(request):
    require_permission(request, 'anwesenheit.edit')
    profiles = UserProfile.objects.all().order_by('username')
    return [
        {'keycloak_id': p.keycloak_id, 'name': p.username, 'email': p.email}
        for p in profiles
    ]


@anwesenheit_router.get("/{id}", response=AnwesenheitsListeSchema, auth=keycloak_auth)
def get_liste(request, id: int):
    require_permission(request, 'anwesenheit.view')
    return get_object_or_404(
        AnwesenheitsListe.objects.prefetch_related(
            'teilnehmer__termin_anwesenheiten', 'termine'
        ), id=id
    )


@anwesenheit_router.put("/{id}", response=AnwesenheitsListeSchema, auth=keycloak_auth)
def update_liste(request, id: int, payload: ListeUpdateSchema):
    require_permission(request, 'anwesenheit.edit')
    liste = get_object_or_404(AnwesenheitsListe, id=id)
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(liste, k, v)
    liste.save()
    return get_object_or_404(
        AnwesenheitsListe.objects.prefetch_related(
            'teilnehmer__termin_anwesenheiten', 'termine'
        ), id=id
    )


@anwesenheit_router.delete("/{id}", auth=keycloak_auth)
def delete_liste(request, id: int):
    require_permission(request, 'anwesenheit.delete')
    liste = get_object_or_404(AnwesenheitsListe, id=id)
    liste.delete()
    return {"status": "deleted"}


# ─── Termine ──────────────────────────────────────────────────────

@anwesenheit_router.post("/{id}/termine", response=AnwesenheitsListeSchema, auth=keycloak_auth)
def save_termine(request, id: int, payload: TermineSaveSchema):
    require_permission(request, 'anwesenheit.edit')
    liste = get_object_or_404(AnwesenheitsListe, id=id)

    incoming_ids = set()
    for t in payload.termine:
        if t.id:
            # Update bestehenden Termin
            termin = Termin.objects.filter(id=t.id, liste=liste).first()
            if termin:
                termin.titel = t.titel
                termin.datum = t.datum
                termin.beginn = t.beginn
                termin.ende = t.ende
                termin.notizen = t.notizen
                termin.save()
                incoming_ids.add(termin.id)
        else:
            # Neuen Termin erstellen
            termin = Termin.objects.create(
                liste=liste,
                titel=t.titel,
                datum=t.datum,
                beginn=t.beginn,
                ende=t.ende,
                notizen=t.notizen,
            )
            incoming_ids.add(termin.id)

    # Nicht mehr vorhandene Termine loeschen
    liste.termine.exclude(id__in=incoming_ids).delete()

    return get_object_or_404(
        AnwesenheitsListe.objects.prefetch_related(
            'teilnehmer__termin_anwesenheiten', 'termine'
        ), id=id
    )


@anwesenheit_router.delete("/{id}/termine/{termin_id}", auth=keycloak_auth)
def delete_termin(request, id: int, termin_id: int):
    require_permission(request, 'anwesenheit.edit')
    termin = get_object_or_404(Termin, id=termin_id, liste_id=id)
    termin.delete()
    return {"status": "deleted"}


@anwesenheit_router.post("/{id}/teilnehmer", response=AnwesenheitsListeSchema, auth=keycloak_auth)
def add_teilnehmer(request, id: int, payload: TeilnehmerBulkAddSchema):
    require_permission(request, 'anwesenheit.edit')
    liste = get_object_or_404(AnwesenheitsListe, id=id)

    for t in payload.teilnehmer:
        Teilnehmer.objects.get_or_create(
            liste=liste,
            keycloak_id=t.keycloak_id,
            defaults={'name': t.name, 'email': t.email},
        )

    return get_object_or_404(
        AnwesenheitsListe.objects.prefetch_related(
            'teilnehmer__termin_anwesenheiten', 'termine'
        ), id=id
    )


@anwesenheit_router.delete("/{id}/teilnehmer/{teilnehmer_id}", auth=keycloak_auth)
def remove_teilnehmer(request, id: int, teilnehmer_id: int):
    require_permission(request, 'anwesenheit.edit')
    teilnehmer = get_object_or_404(Teilnehmer, id=teilnehmer_id, liste_id=id)
    teilnehmer.delete()
    return {"status": "deleted"}


# ─── Status Updates ──────────────────────────────────────────────

@anwesenheit_router.post("/{id}/status", response=AnwesenheitsListeSchema, auth=keycloak_auth)
def update_status(request, id: int, payload: StatusUpdateSchema):
    require_permission(request, 'anwesenheit.edit')
    liste = get_object_or_404(AnwesenheitsListe, id=id)
    teilnehmer = get_object_or_404(Teilnehmer, id=payload.teilnehmer_id, liste=liste)
    teilnehmer.status = payload.status
    teilnehmer.markiert_von = get_username(request)
    if payload.notizen:
        teilnehmer.notizen = payload.notizen
    teilnehmer.save()

    return get_object_or_404(
        AnwesenheitsListe.objects.prefetch_related(
            'teilnehmer__termin_anwesenheiten', 'termine'
        ), id=id
    )


@anwesenheit_router.post("/{id}/termin-status", response=AnwesenheitsListeSchema, auth=keycloak_auth)
def update_termin_status(request, id: int, payload: TerminStatusUpdateSchema):
    require_permission(request, 'anwesenheit.edit')
    liste = get_object_or_404(AnwesenheitsListe, id=id)
    teilnehmer = get_object_or_404(Teilnehmer, id=payload.teilnehmer_id, liste=liste)
    termin = get_object_or_404(Termin, id=payload.termin_id, liste=liste)

    ta, _ = TerminAnwesenheit.objects.get_or_create(
        teilnehmer=teilnehmer,
        termin=termin,
    )
    ta.status = payload.status
    ta.markiert_von = get_username(request)
    ta.markiert_am = timezone.now()
    if payload.notizen:
        ta.notizen = payload.notizen
    ta.save()

    return get_object_or_404(
        AnwesenheitsListe.objects.prefetch_related(
            'teilnehmer__termin_anwesenheiten', 'termine'
        ), id=id
    )


@anwesenheit_router.post("/{id}/bulk-status", response=AnwesenheitsListeSchema, auth=keycloak_auth)
def bulk_update_status(request, id: int, payload: BulkStatusUpdateSchema):
    require_permission(request, 'anwesenheit.edit')
    liste = get_object_or_404(AnwesenheitsListe, id=id)
    username = get_username(request)

    for upd in payload.updates:
        try:
            teilnehmer = Teilnehmer.objects.get(id=upd.teilnehmer_id, liste=liste)
            teilnehmer.status = upd.status
            teilnehmer.markiert_von = username
            if upd.notizen:
                teilnehmer.notizen = upd.notizen
            teilnehmer.save()
        except Teilnehmer.DoesNotExist:
            continue

    return get_object_or_404(
        AnwesenheitsListe.objects.prefetch_related(
            'teilnehmer__termin_anwesenheiten', 'termine'
        ), id=id
    )


# ─── Abschliessen ────────────────────────────────────────────────

@anwesenheit_router.post("/{id}/abschliessen", response=AnwesenheitsListeSchema, auth=keycloak_auth)
def abschliessen(request, id: int):
    require_permission(request, 'anwesenheit.edit')
    liste = get_object_or_404(AnwesenheitsListe, id=id)
    liste.status = 'abgeschlossen'
    liste.save(update_fields=['status', 'aktualisiert_am'])
    return get_object_or_404(
        AnwesenheitsListe.objects.prefetch_related(
            'teilnehmer__termin_anwesenheiten', 'termine'
        ), id=id
    )


# ─── Klonen ──────────────────────────────────────────────────────

@anwesenheit_router.post("/{id}/klonen", response=AnwesenheitsListeSchema, auth=keycloak_auth)
def klonen(request, id: int, payload: KlonSchema):
    require_permission(request, 'anwesenheit.create')
    original = get_object_or_404(AnwesenheitsListe, id=id)

    neue_liste = AnwesenheitsListe.objects.create(
        titel=payload.titel or f'{original.titel} (Kopie)',
        beschreibung=original.beschreibung,
        ort=original.ort,
        erstellt_von_keycloak_id=get_user_id(request),
        erstellt_von_username=get_username(request),
    )

    # Teilnehmer kopieren (Status auf ausstehend)
    for t in original.teilnehmer.all():
        Teilnehmer.objects.create(
            liste=neue_liste,
            keycloak_id=t.keycloak_id,
            name=t.name,
            email=t.email,
        )

    # Termine kopieren
    if payload.termine_uebernehmen:
        for termin in original.termine.all():
            Termin.objects.create(
                liste=neue_liste,
                titel=termin.titel,
                datum=termin.datum,
                beginn=termin.beginn,
                ende=termin.ende,
                notizen=termin.notizen,
            )

    return get_object_or_404(
        AnwesenheitsListe.objects.prefetch_related(
            'teilnehmer__termin_anwesenheiten', 'termine'
        ), id=neue_liste.id
    )


# ─── Statistik ───────────────────────────────────────────────────

@anwesenheit_router.get("/{id}/statistik", auth=keycloak_auth)
def statistik(request, id: int):
    require_permission(request, 'anwesenheit.view')
    liste = get_object_or_404(AnwesenheitsListe, id=id)
    teilnehmer = liste.teilnehmer.all()
    termine = liste.termine.all()
    total = teilnehmer.count()

    # Gesamt-Statistik
    gesamt = {
        'gesamt': total,
        'anwesend': teilnehmer.filter(status='anwesend').count(),
        'abwesend': teilnehmer.filter(status='abwesend').count(),
        'krank': teilnehmer.filter(status='krank').count(),
        'ausstehend': teilnehmer.filter(status='ausstehend').count(),
    }
    gesamt['quote'] = round(gesamt['anwesend'] / total * 100) if total > 0 else 0

    # Pro Termin
    termin_stats = []
    for termin in termine:
        anw = TerminAnwesenheit.objects.filter(termin=termin)
        t_total = anw.count()
        t_anwesend = anw.filter(status='anwesend').count()
        termin_stats.append({
            'termin_id': termin.id,
            'titel': str(termin),
            'datum': termin.datum.isoformat(),
            'gesamt': t_total,
            'anwesend': t_anwesend,
            'abwesend': anw.filter(status='abwesend').count(),
            'krank': anw.filter(status='krank').count(),
            'ausstehend': max(0, total - t_total) + anw.filter(status='ausstehend').count(),
            'quote': round(t_anwesend / total * 100) if total > 0 else 0,
        })

    return {'gesamt': gesamt, 'termine': termin_stats}


# ─── Export ──────────────────────────────────────────────────────

@anwesenheit_router.get("/{id}/export", auth=keycloak_auth)
def export_liste(request, id: int, format: str = 'csv'):
    require_permission(request, 'anwesenheit.view')
    liste = get_object_or_404(
        AnwesenheitsListe.objects.prefetch_related(
            'teilnehmer__termin_anwesenheiten', 'termine'
        ), id=id
    )
    termine = list(liste.termine.all())
    teilnehmer = list(liste.teilnehmer.all().prefetch_related('termin_anwesenheiten'))

    if format == 'json':
        data = {
            'liste': {
                'id': liste.id,
                'titel': liste.titel,
                'beschreibung': liste.beschreibung,
                'ort': liste.ort,
                'status': liste.status,
                'erstellt_am': liste.erstellt_am.isoformat(),
            },
            'termine': [
                {'id': t.id, 'titel': t.titel, 'datum': t.datum.isoformat(),
                 'beginn': t.beginn.isoformat() if t.beginn else None,
                 'ende': t.ende.isoformat() if t.ende else None}
                for t in termine
            ],
            'teilnehmer': [],
            'exportiert_am': timezone.now().isoformat(),
            'exportiert_von': get_username(request),
        }
        for tn in teilnehmer:
            entry = {
                'name': tn.name, 'email': tn.email,
                'status': tn.status, 'notizen': tn.notizen,
                'termine': {},
            }
            for ta in tn.termin_anwesenheiten.all():
                entry['termine'][ta.termin_id] = ta.status
            data['teilnehmer'].append(entry)

        response = HttpResponse(json.dumps(data, indent=2, ensure_ascii=False), content_type='application/json')
        response['Content-Disposition'] = f'attachment; filename="anwesenheit_{liste.id}.json"'
        return response

    # CSV
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    header = ['Name', 'E-Mail', 'Status', 'Notizen']
    for t in termine:
        header.append(str(t))
    writer.writerow(header)

    for tn in teilnehmer:
        row = [tn.name, tn.email, tn.get_status_display(), tn.notizen]
        ta_map = {ta.termin_id: ta.get_status_display() for ta in tn.termin_anwesenheiten.all()}
        for t in termine:
            row.append(ta_map.get(t.id, 'Ausstehend'))
        writer.writerow(row)

    response = HttpResponse(output.getvalue(), content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="anwesenheit_{liste.id}.csv"'
    return response
