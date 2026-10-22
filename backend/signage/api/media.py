from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import File, Form, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from core.auth import keycloak_auth
from .. import media, push
from ..models import DisplayView, MediaFile
from ..permissions import _require_perm
from ..schemas import MediaFileSchema

router = Router(tags=["Monitor"])


@router.get("/files", response=list[MediaFileSchema], auth=keycloak_auth)
def list_files(request, kind: str = None):
    _require_perm(request, 'signage.view')
    qs = MediaFile.objects.filter(deleted_at__isnull=True).prefetch_related('pages')
    if kind:
        qs = qs.filter(kind=kind)
    return qs


@router.post("/files", auth=keycloak_auth)
def upload_file(request, file: UploadedFile = File(...), name: str = Form(""), kind: str = Form("image")):
    _require_perm(request, 'signage.media')
    if file.size > media.MAX_BYTES:
        raise HttpError(422, "Datei zu groß: höchstens 50 MB.")
    obj = MediaFile.objects.create(
        name=name or file.name,
        file=file,
        kind=kind,
        status='processing',
    )
    transaction.on_commit(lambda: media.render_async(obj.id))
    return {
        'id': obj.id, 'name': obj.name, 'kind': obj.kind,
        'file_url': obj.file.url, 'sort_order': obj.sort_order,
        'status': obj.status, 'page_count': obj.page_count, 'error': obj.error,
    }


@router.get("/files/{id}", auth=keycloak_auth)
def get_file(request, id: int):
    _require_perm(request, 'signage.view')
    obj = get_object_or_404(MediaFile, id=id, deleted_at__isnull=True)
    used_in = [
        {'view_id': v.id, 'name': v.name}
        for v in DisplayView.objects.filter(deleted_at__isnull=True)
        if id in (v.media_items or [])
    ]
    return {
        'id': obj.id, 'name': obj.name, 'kind': obj.kind,
        'file_url': obj.file.url if obj.file else '', 'sort_order': obj.sort_order,
        'created_at': obj.created_at,
        'status': obj.status, 'page_count': obj.page_count, 'error': obj.error,
        'pages': [
            {'index': p.index, 'url': p.image.url, 'width': p.width,
             'height': p.height, 'orientation': p.orientation}
            for p in obj.pages.all()
        ],
        'used_in': used_in,
    }


@router.delete("/files/{id}", auth=keycloak_auth)
def delete_file(request, id: int):
    _require_perm(request, 'signage.media')
    d = get_object_or_404(MediaFile, id=id)
    d.deleted_at = timezone.now()
    d.save(update_fields=['deleted_at'])
    push.notify_changed_on_commit()
    return {"success": True}


@router.get("/trash", auth=keycloak_auth)
def get_trash(request):
    _require_perm(request, 'signage.view')
    views = [
        {'id': c.id, 'name': c.name, 'deleted_at': c.deleted_at}
        for c in DisplayView.objects.filter(deleted_at__isnull=False).order_by('-deleted_at')
    ]
    media = [
        {'id': d.id, 'name': d.name, 'kind': d.kind, 'deleted_at': d.deleted_at}
        for d in MediaFile.objects.filter(deleted_at__isnull=False).order_by('-deleted_at')
    ]
    return {'views': views, 'media': media}


@router.post("/trash/restore", auth=keycloak_auth)
def restore_trash(request, kind: str, id: int):
    _require_perm(request, 'signage.media' if kind == 'media' else 'signage.setup')
    if kind == 'view':
        obj = get_object_or_404(DisplayView, id=id)
        obj.deleted_at = None
        obj.save(update_fields=['deleted_at', 'updated_at'])
    elif kind == 'media':
        obj = get_object_or_404(MediaFile, id=id)
        obj.deleted_at = None
        obj.save(update_fields=['deleted_at'])
    else:
        raise HttpError(400, "Unbekannte Art")
    push.notify_changed_on_commit()
    return {"success": True}


@router.delete("/trash/purge", auth=keycloak_auth)
def purge_trash(request, kind: str, id: int):
    _require_perm(request, 'signage.media' if kind == 'media' else 'signage.setup')
    if kind == 'view':
        obj = get_object_or_404(DisplayView, id=id, deleted_at__isnull=False)
        obj.delete()
    elif kind == 'media':
        obj = get_object_or_404(MediaFile, id=id, deleted_at__isnull=False)
        if obj.file:
            obj.file.delete(save=False)
        obj.delete()
    else:
        raise HttpError(400, "Unbekannte Art")
    push.notify_changed_on_commit()
    return {"success": True}
