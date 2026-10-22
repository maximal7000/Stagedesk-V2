from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from signage import media
from signage.models import MediaFile


class Command(BaseCommand):
    help = 'Rendert Medien ohne Seitenbilder oder mit Status ungleich "ready".'

    def handle(self, *args, **options):
        qs = (MediaFile.objects.filter(deleted_at__isnull=True)
              .annotate(n_pages=Count('pages'))
              .filter(Q(n_pages=0) | ~Q(status='ready')))
        done = 0
        for media_file in qs:
            media.render_file(media_file)
            done += 1
        self.stdout.write(f'{done} Datei(en) verarbeitet.')
