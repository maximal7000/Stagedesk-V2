"""
Medien-Umwandlung: PDFs und Bilder werden zu WebP-Seitenbildern (4K) vorbereitet.
"""
import io
import logging
import threading

from django.core.files.base import ContentFile
from django.db import close_old_connections, connection

from .models import MediaFile, MediaPage

logger = logging.getLogger(__name__)

MAX_PAGES = 50
MAX_BYTES = 50 * 1024 * 1024
LONG_EDGE = 3840
WEBP_QUALITY = 90


def _orientation(width, height):
    return 'portrait' if height > width else 'landscape'


def _save_page(media_file, index, image):
    """Schreibt ein PIL-Bild als WebP und legt die MediaPage an."""
    buf = io.BytesIO()
    image.convert('RGB').save(buf, format='WEBP', quality=WEBP_QUALITY)
    page = MediaPage(
        file=media_file, index=index,
        width=image.width, height=image.height,
        orientation=_orientation(image.width, image.height),
    )
    page.image.save(f'{media_file.id}-{index}.webp', ContentFile(buf.getvalue()), save=False)
    page.save()


def _render_pdf(media_file):
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(media_file.file.path)
    try:
        count = len(pdf)
        if count > MAX_PAGES:
            raise ValueError(f'PDF hat {count} Seiten, erlaubt sind höchstens {MAX_PAGES}.')
        if count == 0:
            raise ValueError('PDF enthält keine Seiten.')
        pages = []
        for i in range(count):
            page = pdf[i]
            try:
                w, h = page.get_size()
                scale = LONG_EDGE / max(w, h)
                pages.append(page.render(scale=scale).to_pil())
            finally:
                page.close()
        return pages
    finally:
        pdf.close()


def _render_image(media_file):
    from PIL import Image, ImageOps

    with Image.open(media_file.file.path) as src:
        img = ImageOps.exif_transpose(src)
        img.load()
    if max(img.size) > LONG_EDGE:
        img.thumbnail((LONG_EDGE, LONG_EDGE), Image.LANCZOS)
    return [img]


def render_file(media_file):
    """Erzeugt die Seitenbilder einer Datei und setzt status, page_count und error."""
    media_file = MediaFile.objects.get(pk=media_file.pk)
    old_pages = list(media_file.pages.all())
    try:
        if media_file.kind == 'pdf':
            images = _render_pdf(media_file)
        else:
            images = _render_image(media_file)
        for old in old_pages:
            old.image.delete(save=False)
        media_file.pages.all().delete()
        for i, image in enumerate(images):
            _save_page(media_file, i, image)
    except Exception as exc:  # beschädigte Dateien dürfen nicht in 'processing' hängen
        logger.warning('Umwandlung von MediaFile %s fehlgeschlagen: %s', media_file.pk, exc)
        if isinstance(exc, ValueError):
            message = str(exc)
        else:
            message = 'Datei konnte nicht gelesen werden. Bitte eine gültige Datei hochladen.'
        MediaFile.objects.filter(pk=media_file.pk).update(
            status='failed', page_count=0, error=message)
        return
    MediaFile.objects.filter(pk=media_file.pk).update(
        status='ready', page_count=len(images), error='')


def _render_in_thread(media_file_id):
    try:
        media_file = MediaFile.objects.filter(pk=media_file_id).first()
        if media_file:
            render_file(media_file)
    finally:
        connection.close()


def render_async(media_file_id):
    """Startet die Umwandlung im Hintergrund (eigene DB-Verbindung im Thread)."""
    close_old_connections()
    threading.Thread(target=_render_in_thread, args=(media_file_id,), daemon=True).start()
