"""Medien-Umwandlung (Spec §4.4): PDF und Bild zu WebP-Seiten."""
import io
import shutil
import tempfile
from unittest import mock

import pypdfium2 as pdfium
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from ninja.errors import HttpError
from PIL import Image

from . import api, media
from .models import DisplayView, MediaFile, MediaPage


def make_pdf(sizes):
    pdf = pdfium.PdfDocument.new()
    for w, h in sizes:
        pdf.new_page(w, h)
    buf = io.BytesIO()
    pdf.save(buf)
    return buf.getvalue()


def make_exif_jpeg():
    img = Image.new('RGB', (200, 100), 'red')
    exif = Image.Exif()
    exif[0x0112] = 6
    buf = io.BytesIO()
    img.save(buf, format='JPEG', exif=exif)
    return buf.getvalue()


class MediaTestBase(TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        override = override_settings(MEDIA_ROOT=self.tmp)
        override.enable()
        self.addCleanup(override.disable)
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def make(self, kind, data, ext):
        f = MediaFile(name='t', kind=kind, status='processing')
        f.file.save(f't.{ext}', ContentFile(data), save=False)
        f.save()
        return f


class RenderFileTest(MediaTestBase):
    def test_pdf_pages_with_orientation(self):
        f = self.make('pdf', make_pdf([(595, 842), (842, 595)]), 'pdf')
        media.render_file(f)
        f.refresh_from_db()
        self.assertEqual((f.status, f.page_count, f.error), ('ready', 2, ''))
        p0, p1 = f.pages.all()
        self.assertEqual((p0.orientation, p1.orientation), ('portrait', 'landscape'))
        self.assertEqual(max(p0.width, p0.height), 3840)
        self.assertEqual(max(p1.width, p1.height), 3840)
        self.assertTrue(p0.image.name.startswith('monitor/pages/'))
        self.assertTrue(p0.image.name.endswith('.webp'))

    def test_exif_rotation_applied(self):
        f = self.make('image', make_exif_jpeg(), 'jpg')
        media.render_file(f)
        f.refresh_from_db()
        self.assertEqual(f.status, 'ready')
        page = f.pages.get()
        self.assertEqual((page.width, page.height), (100, 200))
        self.assertEqual(page.orientation, 'portrait')

    def test_too_many_pages_failed(self):
        f = self.make('pdf', make_pdf([(100, 100)] * 51), 'pdf')
        with self.assertLogs('signage.media', 'WARNING'):
            media.render_file(f)
        f.refresh_from_db()
        self.assertEqual(f.status, 'failed')
        self.assertIn('51 Seiten', f.error)
        self.assertEqual(f.pages.count(), 0)

    def test_corrupt_pdf_marks_failed(self):
        f = self.make('pdf', b'%PDF-1.4 kaputt', 'pdf')
        with self.assertLogs('signage.media', 'WARNING'):
            media.render_file(f)
        f.refresh_from_db()
        self.assertEqual(f.status, 'failed')
        self.assertTrue(f.error)

    def test_render_notifies_exactly_once_on_success(self):
        f = self.make('pdf', make_pdf([(100, 100)]), 'pdf')
        with mock.patch('signage.push.notify_changed') as notify, \
                self.captureOnCommitCallbacks(execute=True):
            media.render_file(f)
        self.assertEqual(notify.call_count, 1)

    def test_render_notifies_exactly_once_on_failure(self):
        f = self.make('pdf', b'kein pdf', 'pdf')
        with mock.patch('signage.push.notify_changed') as notify, \
                self.assertLogs('signage.media', 'WARNING'), \
                self.captureOnCommitCallbacks(execute=True):
            media.render_file(f)
        f.refresh_from_db()
        self.assertEqual(f.status, 'failed')
        self.assertEqual(notify.call_count, 1)

    def test_failed_rerender_keeps_old_pages_and_files(self):
        f = self.make('pdf', make_pdf([(100, 100)] * 3), 'pdf')
        media.render_file(f)
        old = list(f.pages.all())
        old_names = [p.image.name for p in old]
        real = media._store_page

        def boom(mf, index, image):
            if index == 1:
                raise RuntimeError('kaputt')
            return real(mf, index, image)

        with mock.patch.object(media, '_store_page', side_effect=boom), \
                self.assertLogs('signage.media', 'WARNING'), \
                self.captureOnCommitCallbacks(execute=True):
            media.render_file(f)
        f.refresh_from_db()
        self.assertEqual(f.status, 'failed')
        self.assertEqual([p.id for p in f.pages.all()], [p.id for p in old])
        for name in old_names:
            self.assertTrue(default_storage.exists(name))
        # Teilweise geschriebene neue Dateien sind weg
        stored = {n for n in default_storage.listdir('monitor/pages')[1]}
        self.assertEqual(stored, {n.split('/')[-1] for n in old_names})

    def test_successful_rerender_deletes_old_files_after_commit(self):
        f = self.make('pdf', make_pdf([(100, 100)]), 'pdf')
        media.render_file(f)
        old_name = f.pages.get().image.name
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            media.render_file(f)
        self.assertTrue(default_storage.exists(old_name))
        for cb in callbacks:
            cb()
        self.assertFalse(default_storage.exists(old_name))
        self.assertTrue(default_storage.exists(f.pages.get().image.name))

    def test_rerender_replaces_pages(self):
        f = self.make('pdf', make_pdf([(100, 100)]), 'pdf')
        media.render_file(f)
        media.render_file(f)
        self.assertEqual(f.pages.count(), 1)


class UploadTest(MediaTestBase):
    def _request(self):
        return mock.Mock(auth={'sub': 'x'})

    def test_upload_too_large_rejected(self):
        upload = SimpleUploadedFile('big.pdf', b'x' * 20)
        with mock.patch.object(api, '_require_perm'), mock.patch.object(media, 'MAX_BYTES', 10):
            with self.assertRaises(HttpError) as ctx:
                api.upload_file(self._request(), upload, 'Gross', 'pdf')
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(str(ctx.exception), 'Datei zu groß: höchstens 50 MB.')
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_upload_sets_processing_and_starts_render(self):
        upload = SimpleUploadedFile('a.pdf', make_pdf([(100, 100)]))
        with mock.patch.object(api, '_require_perm'), \
                mock.patch.object(media, 'render_async') as started:
            with self.captureOnCommitCallbacks(execute=False) as callbacks:
                result = api.upload_file(self._request(), upload, 'A', 'pdf')
            started.assert_not_called()
            self.assertEqual(len(callbacks), 1)
            callbacks[0]()
        self.assertEqual(result['status'], 'processing')
        started.assert_called_once_with(result['id'])


class RenderCommandTest(MediaTestBase):
    def test_render_command_idempotent(self):
        self.make('pdf', make_pdf([(595, 842), (842, 595)]), 'pdf')
        call_command('signage_render_media', stdout=io.StringIO())
        first = list(MediaPage.objects.values_list('id', flat=True))
        self.assertEqual(len(first), 2)
        call_command('signage_render_media', stdout=io.StringIO())
        self.assertEqual(list(MediaPage.objects.values_list('id', flat=True)), first)


class GetFileTest(MediaTestBase):
    def test_detail_has_pages_and_used_in(self):
        f = self.make('pdf', make_pdf([(595, 842)]), 'pdf')
        media.render_file(f)
        DisplayView.objects.create(name='Aktiv', slug='aktiv', media_items=[f.id])
        DisplayView.objects.create(name='Andere', slug='andere', media_items=[f.id + 100])
        DisplayView.objects.create(name='Geloescht', slug='weg', media_items=[f.id],
                                   deleted_at='2026-01-01T00:00:00Z')
        with mock.patch.object(api, '_require_perm'):
            data = api.get_file(mock.Mock(), f.id)
        self.assertEqual((data['status'], data['page_count'], data['error']), ('ready', 1, ''))
        self.assertEqual(data['pages'][0]['orientation'], 'portrait')
        self.assertEqual(data['pages'][0]['index'], 0)
        self.assertEqual([u['name'] for u in data['used_in']], ['Aktiv'])


class ListFilesTest(MediaTestBase):
    """GET /files liefert Status, Seitenzahl, Fehler sowie Ausrichtung und Bild der ersten Seite (Kacheln)."""

    def test_list_has_status_and_first_page(self):
        ready = self.make('pdf', make_pdf([(595, 842), (842, 595)]), 'pdf')
        media.render_file(ready)
        failed = self.make('pdf', b'kaputt', 'pdf')
        with self.assertLogs('signage.media', 'WARNING'):
            media.render_file(failed)
        processing = self.make('image', make_exif_jpeg(), 'jpg')
        with mock.patch.object(api, '_require_perm'):
            rows = {r['id']: r for r in
                    (api.MediaFileSchema.from_orm(o).dict() for o in api.list_files(mock.Mock()))}
        first = rows[ready.id]
        self.assertEqual((first['status'], first['page_count'], first['orientation']), ('ready', 2, 'portrait'))
        self.assertTrue(first['first_page_url'].endswith('.webp'))
        self.assertEqual(rows[failed.id]['status'], 'failed')
        self.assertNotEqual(rows[failed.id]['error'], '')
        self.assertEqual((rows[failed.id]['first_page_url'], rows[failed.id]['orientation']), ('', ''))
        self.assertEqual((rows[processing.id]['status'], rows[processing.id]['page_count']), ('processing', 0))

    def test_list_skips_trash(self):
        f = self.make('image', make_exif_jpeg(), 'jpg')
        MediaFile.objects.filter(id=f.id).update(deleted_at='2026-01-01T00:00:00Z')
        with mock.patch.object(api, '_require_perm'):
            self.assertEqual(list(api.list_files(mock.Mock())), [])

    def test_detail_of_trashed_file_is_404(self):
        f = self.make('image', make_exif_jpeg(), 'jpg')
        MediaFile.objects.filter(id=f.id).update(deleted_at='2026-01-01T00:00:00Z')
        from django.http import Http404
        with mock.patch.object(api, '_require_perm'), self.assertRaises(Http404):
            api.get_file(mock.Mock(), f.id)
