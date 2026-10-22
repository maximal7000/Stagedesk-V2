import io
import logging
import threading
import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import close_old_connections, connection, transaction

from . import push
from .models import MediaFile, MediaPage

logger = logging.getLogger(__name__)

MAX_PAGES = 50
MAX_BYTES = 50 * 1024 * 1024
LONG_EDGE = 3840
WEBP_QUALITY = 90


def _orientation(width, height):
    return 'portrait' if height > width else 'landscape'


def _store_page(media_file, index, image):
    buf = io.BytesIO()
    image.convert('RGB').save(buf, format='WEBP', quality=WEBP_QUALITY)
    name = default_storage.save(
        f'monitor/pages/{media_file.id}-{index}-{uuid.uuid4().hex[:8]}.webp',
        ContentFile(buf.getvalue()))
    return {
        'image': name, 'width': image.width, 'height': image.height,
        'orientation': _orientation(image.width, image.height),
    }


def _iter_pdf(media_file):
    """Yields the PDF pages one by one as PIL images; checks run before the first render."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(media_file.file.path)
    try:
        count = len(pdf)
        if count > MAX_PAGES:
            raise ValueError(f'PDF hat {count} Seiten, erlaubt sind höchstens {MAX_PAGES}.')
        if count == 0:
            raise ValueError('PDF enthält keine Seiten.')
        for i in range(count):
            page = pdf[i]
            bitmap = None
            try:
                w, h = page.get_size()
                bitmap = page.render(scale=LONG_EDGE / max(w, h))
                yield bitmap.to_pil()
            finally:
                if bitmap is not None:
                    bitmap.close()
                page.close()
    finally:
        pdf.close()


def _iter_image(media_file):
    from PIL import Image, ImageOps

    with Image.open(media_file.file.path) as src:
        img = ImageOps.exif_transpose(src)
        img.load()
    if max(img.size) > LONG_EDGE:
        img.thumbnail((LONG_EDGE, LONG_EDGE), Image.LANCZOS)
    yield img


def _delete_stored(names):
    for name in names:
        try:
            default_storage.delete(name)
        except Exception:  # cleanup must never break the flow
            logger.warning('Seitenbild %s konnte nicht gelöscht werden', name)


def render_file(media_file):
    """Page by page: render, store, release. The old pages are deleted from storage only after
    a successful swap (transaction) and after the commit; on an error they stay unchanged."""
    media_file = MediaFile.objects.get(pk=media_file.pk)
    staged = []
    try:
        source = _iter_pdf(media_file) if media_file.kind == 'pdf' else _iter_image(media_file)
        for index, image in enumerate(source):
            try:
                staged.append(_store_page(media_file, index, image))
            finally:
                image.close()
        with transaction.atomic():
            old_names = [p.image.name for p in media_file.pages.all()]
            media_file.pages.all().delete()
            MediaPage.objects.bulk_create([
                MediaPage(file=media_file, index=i, **data) for i, data in enumerate(staged)])
            MediaFile.objects.filter(pk=media_file.pk).update(
                status='ready', page_count=len(staged), error='')
            transaction.on_commit(lambda: _delete_stored(old_names))
            push.notify_changed_on_commit()
    except Exception as exc:  # broken files must not get stuck in 'processing'
        logger.warning('Umwandlung von MediaFile %s fehlgeschlagen: %s', media_file.pk, exc)
        _delete_stored([d['image'] for d in staged])
        if isinstance(exc, ValueError):
            message = str(exc)
        else:
            message = 'Datei konnte nicht gelesen werden. Bitte eine gültige Datei hochladen.'
        # Old pages stay; page_count belongs to them and is left alone.
        MediaFile.objects.filter(pk=media_file.pk).update(status='failed', error=message)
        push.notify_changed_on_commit()


def _render_in_thread(media_file_id):
    try:
        media_file = MediaFile.objects.filter(pk=media_file_id).first()
        if media_file:
            render_file(media_file)
    finally:
        connection.close()


def render_async(media_file_id):
    """Background thread with its own DB connection."""
    close_old_connections()
    threading.Thread(target=_render_in_thread, args=(media_file_id,), daemon=True).start()
