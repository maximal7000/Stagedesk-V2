from django.core.management.base import BaseCommand
from django.utils import timezone

from signage import devices


class Command(BaseCommand):
    help = 'Berechnet Ampel und Warnungen der Geräte und verschickt Benachrichtigungen (jede Minute).'

    def handle(self, *args, **options):
        devices.watch(timezone.now())
