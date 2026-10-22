"""Ansichten: Liste, Konfiguration, Versionen, Störungsliste, ÖPNV-Stationssuche."""
import json
import uuid

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from ninja import Router
from ninja.errors import HttpError

from core.auth import keycloak_auth
from .. import push, transit
from ..display import _fetch_disruptions
from ..models import DisplayView
from ..permissions import _require_perm
from ..schemas import (
    DisplayViewCreateSchema, DisplayViewListSchema, DisplayViewSchema, DisplayViewUpdateSchema,
    DisplayViewVersionSchema,
)
from ..validation import validate_view_data as _validate_view_data

router = Router(tags=["Monitor"])


# ═══ Admin: Profile ══════════════════════════════════════════════

@router.get("/views", response=list[DisplayViewListSchema], auth=keycloak_auth)
def list_views(request):
    _require_perm(request, 'signage.view')
    return DisplayView.objects.filter(deleted_at__isnull=True).order_by('sort_order', 'name')


@router.post("/views", auth=keycloak_auth)
def create_view(request, payload: DisplayViewCreateSchema):
    _require_perm(request, 'signage.setup')
    slug = slugify(payload.slug or payload.name) or uuid.uuid4().hex[:8]

    # Slug-Kollision vermeiden
    base_slug = slug
    counter = 1
    while DisplayView.objects.filter(slug=slug).exists():
        slug = f"{base_slug}-{counter}"
        counter += 1

    if payload.clone_from_id:
        # Von bestehendem Profil klonen
        source = get_object_or_404(DisplayView, id=payload.clone_from_id)
        source.pk = None
        source.name = payload.name
        source.slug = slug
        source.is_default = False
        source.kind = payload.kind
        source.api_token = uuid.uuid4().hex
        source.save()
        push.notify_changed_on_commit()
        return {'id': source.id, 'name': source.name, 'slug': source.slug}
    else:
        view = DisplayView(
            name=payload.name,
            slug=slug,
            is_default=False,
            kind=payload.kind,
        )
        view.save()
        push.notify_changed_on_commit()
        return {'id': view.id, 'name': view.name, 'slug': view.slug}


@router.delete("/views/{int:id}", auth=keycloak_auth)
def delete_view(request, id: int):
    _require_perm(request, 'signage.setup')
    view = get_object_or_404(DisplayView, id=id)
    if view.is_default:
        return {"success": False, "message": "Standard-Profil kann nicht gelöscht werden"}
    view.deleted_at = timezone.now()
    view.save(update_fields=['deleted_at', 'updated_at'])
    push.notify_changed_on_commit()
    return {"success": True}


# ═══ Admin: Config ════════════════════════════════════════════════

@router.get("/config", response=DisplayViewSchema, auth=keycloak_auth)
def get_view(request, view_id: int = None):
    _require_perm(request, 'signage.view')
    if view_id:
        # Ansichten im Papierkorb gelten als nicht vorhanden (Wiederherstellen über /trash/restore)
        view = get_object_or_404(DisplayView, id=view_id, deleted_at__isnull=True)
    else:
        view = DisplayView.get()
    # api_token schaltet On-Air und Notfall (ATEM): nur mit signage.setup ausliefern, gespeichert wird nichts
    try:
        _require_perm(request, 'signage.setup')
    except HttpError:
        view.api_token = ''
    return view


@router.get("/disruptions", auth=keycloak_auth)
def list_disruptions(request, view_id: int = None):
    """Admin: alle aktuellen Störungen (aller Quellen) mit hidden-Flag zum Ausblenden."""
    _require_perm(request, 'signage.view')
    view = get_object_or_404(DisplayView, id=view_id) if view_id else DisplayView.get()
    hidden = set(view.transit_disruption_hidden or [])
    out = []
    for s in _fetch_disruptions(view):
        out.append({
            'id': s.get('id'), 'source': s.get('source'), 'kind': s.get('kind'),
            'title': s.get('title'), 'text': (s.get('text') or '')[:160],
            'lines': s.get('lines', []), 'from': s.get('from', ''), 'until': s.get('until', ''),
            'has_image': bool(s.get('image')), 'hidden': s.get('id') in hidden,
        })
    return out


# weather_api_key: steht nicht in den Schnappschüssen (write-only) und wird beim Zurücksetzen nicht geleert
_VERSION_DENY = {'id', 'api_token', 'slug', 'created_at', 'updated_at', 'weather_api_key', 'weather_api_key_set'}


def _snapshot_view(view):
    """Aktuellen Zustand als Version sichern; nur die letzten 15 behalten."""
    from ..models import DisplayViewVersion
    try:
        data = json.loads(json.dumps(DisplayViewSchema.from_orm(view).dict(), default=str))
        data.pop('api_token', None)
        data.pop('weather_api_key', None)
        data.pop('weather_api_key_set', None)
        DisplayViewVersion.objects.create(view=view, data=data)
        old_ids = list(DisplayViewVersion.objects.filter(view=view).values_list('id', flat=True)[15:])
        if old_ids:
            DisplayViewVersion.objects.filter(id__in=old_ids).delete()
    except Exception:
        pass  # Versionierung darf das Speichern nie blockieren


@router.put("/config", response=DisplayViewSchema, auth=keycloak_auth)
def update_view(request, payload: DisplayViewUpdateSchema, view_id: int = None):
    _require_perm(request, 'signage.setup')
    if view_id:
        view = get_object_or_404(DisplayView, id=view_id)
    else:
        view = DisplayView.get()

    _snapshot_view(view)  # Zustand vor der Änderung sichern

    data = payload.dict(exclude_unset=True)
    if not data.get('weather_api_key'):
        data.pop('weather_api_key', None)   # write-only: leer heißt unverändert
    data = _validate_view_data(data, own_id=view.id, current_kind=view.kind)

    # FK-Felder separat behandeln
    for fk_key in ('webuntis_link_id', 'webuntis_link_next_day_id'):
        if fk_key in data:
            val = data.pop(fk_key)
            setattr(view, fk_key, val if val else None)

    for key, value in data.items():
        setattr(view, key, value)
    # ÖPNV-/Störungs-Cache verwerfen, damit Änderungen sofort greifen
    view.transit_cache_at = None
    view.transit_disruption_cache_at = None
    view.save()
    push.notify_changed_on_commit()
    return view


@router.get("/config/versions", response=list[DisplayViewVersionSchema], auth=keycloak_auth)
def list_view_versions(request, view_id: int):
    _require_perm(request, 'signage.view')
    from ..models import DisplayViewVersion
    return list(DisplayViewVersion.objects.filter(view_id=view_id)[:15])


@router.post("/config/restore", response=DisplayViewSchema, auth=keycloak_auth)
def restore_view_version(request, version_id: int):
    _require_perm(request, 'signage.setup')
    from ..models import DisplayViewVersion
    version = get_object_or_404(DisplayViewVersion, id=version_id)
    view = version.view
    _snapshot_view(view)  # aktuellen Stand vor dem Zurücksetzen ebenfalls sichern
    for key, value in (version.data or {}).items():
        if key in _VERSION_DENY or not hasattr(view, key):
            continue
        try:
            setattr(view, key, value)
        except Exception:
            continue
    view.save()
    push.notify_changed_on_commit()
    return view


@router.post("/config/regenerate-token", auth=keycloak_auth)
def regenerate_token(request, view_id: int = None):
    _require_perm(request, 'signage.setup')
    if view_id:
        view = get_object_or_404(DisplayView, id=view_id)
    else:
        view = DisplayView.get()
    view.api_token = uuid.uuid4().hex
    view.save(update_fields=['api_token', 'updated_at'])
    return {"api_token": view.api_token}


# ═══ Admin: ÖPNV Stationssuche ═══════════════════════════════════

@router.get("/transit/search", auth=keycloak_auth)
def search_transit_stops(request, q: str = "", results: int = 10,
                         use_db: bool = True, use_nahsh: bool = True):
    """Stationen für ÖPNV-Abfahrtsmonitor suchen"""
    _require_perm(request, 'signage.setup')
    if len(q) < 2:
        return []
    return transit.search_stations(q, results=min(results, 20),
                                 use_db=use_db, use_nahsh=use_nahsh)
