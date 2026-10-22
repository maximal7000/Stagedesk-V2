import time

from django.core.management.base import BaseCommand

from signage import untis_monitor, webuntis
from signage.models import MonitorSettings

WAYS = [
    ('login', 'Anmeldung'),
    ('substitutions', 'Vertretungen'),
    ('timetable', 'Stundenplan'),
    ('news', 'Nachricht zum Tag'),
]
MONITOR_FORMAT = untis_monitor.FORMAT_PRESETS['students_2']


class Command(BaseCommand):
    help = ('Prüft die WebUntis-Verbindung (Konto und öffentliche Monitor-Schnittstelle). '
            'Gibt nur "geht" oder "geht nicht" pro Weg aus, mit Ursache, keine Daten.')

    def handle(self, *args, **options):
        result = webuntis.check()
        for key, label in WAYS:
            self.stdout.write(f"{label}: {'geht' if result[key] else 'geht nicht'}")
        self.stdout.write(f"Quelle: {result['source']}")
        self.stdout.write(f'Monitor-Schnittstelle ({MONITOR_FORMAT}): {self._monitor_status()}')

    def _monitor_status(self):
        settings = MonitorSettings.load()
        if not settings.webuntis_server or not settings.webuntis_school:
            return 'nicht eingerichtet (Server und Schule im Monitor-Admin unter Einstellungen eintragen)'
        cause = untis_monitor.check(settings.webuntis_server, settings.webuntis_school, MONITOR_FORMAT,
                                    time.monotonic() + webuntis.DEADLINE_SECONDS)
        return 'geht' if cause is None else f'geht nicht (Ursache: {cause})'
