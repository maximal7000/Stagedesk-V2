from django.core.management.base import BaseCommand

from monitor import webuntis

WAYS = [
    ('login', 'Anmeldung'),
    ('substitutions', 'Vertretungen'),
    ('timetable', 'Stundenplan'),
    ('news', 'Nachricht zum Tag'),
]


class Command(BaseCommand):
    help = 'Prüft die WebUntis-Verbindung. Gibt nur "geht" oder "geht nicht" pro Weg aus, keine Daten.'

    def handle(self, *args, **options):
        result = webuntis.check()
        for key, label in WAYS:
            self.stdout.write(f"{label}: {'geht' if result[key] else 'geht nicht'}")
        self.stdout.write(f"Quelle: {result['source']}")
