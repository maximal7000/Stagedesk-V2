import json
import time
from datetime import datetime
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from signage import untis_monitor
from signage.models import MonitorSettings

DEADLINE_SECONDS = 20


class Command(BaseCommand):
    help = ('Zeichnet rohe Antworten der WebUntis-Monitor-Schnittstelle auf (Format und ein Tag), '
            'um Testdaten zu gewinnen. Die Dateien enthalten echte Kürzel und gehören nicht ins Repo.')

    def add_arguments(self, parser):
        parser.add_argument('--format', required=True, dest='format_name', help='z. B. vplan-schueler')
        parser.add_argument('--date', required=True, help='Tag als YYYYMMDD')
        parser.add_argument('--out', required=True, help='Zielordner')

    def handle(self, *args, **options):
        settings = MonitorSettings.load()
        if not settings.webuntis_server or not settings.webuntis_school:
            raise CommandError('WebUntis-Server und Schule sind nicht eingestellt.')
        try:
            day = datetime.strptime(options['date'], '%Y%m%d').date()
        except ValueError:
            raise CommandError('--date erwartet YYYYMMDD.')
        out = Path(options['out'])
        out.mkdir(parents=True, exist_ok=True)
        server, school, name = settings.webuntis_server, settings.webuntis_school, options['format_name']
        deadline = time.monotonic() + DEADLINE_SECONDS
        try:
            fmt = untis_monitor.request_format(server, school, name, deadline)
            data = untis_monitor.request_day(server, school, name, fmt['payload'], day, deadline)
        except untis_monitor.MonitorUnavailable as exc:
            raise CommandError(f'Abruf fehlgeschlagen: {exc}')
        for filename, content in ((f'format-{name}.json', fmt), (f'data-{options["date"]}.json', data)):
            (out / filename).write_text(json.dumps(content, ensure_ascii=False, indent=1), encoding='utf-8')
            self.stdout.write(f'geschrieben: {out / filename}')
