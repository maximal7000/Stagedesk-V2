"""
Sendet In-App-Notifications für Kompetenzen, die in den nächsten N Tagen
ablaufen oder bereits abgelaufen sind.

Aufruf:
    python manage.py erinnerungen_kompetenzen          # Default 14, 7, 1 Tag
    python manage.py erinnerungen_kompetenzen --tage 30
    python manage.py erinnerungen_kompetenzen --dry-run
"""
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Erinnerungen an User mit ablaufenden Kompetenzen versenden."

    def add_arguments(self, parser):
        parser.add_argument('--tage', type=int, default=None,
                            help='Schwellwert in Tagen (Default: 14, 7, 1)')
        parser.add_argument('--dry-run', action='store_true',
                            help='Nichts senden, nur ausgeben')

    def handle(self, *args, **opts):
        from kompetenzen.models import UserKompetenz
        from core.notify import notify

        thresholds = [opts['tage']] if opts.get('tage') else [14, 7, 1]
        dry_run = opts.get('dry_run', False)
        now = timezone.now()
        sent = 0
        skipped = 0

        # Aktive Kompetenzen mit Ablauf-Datum, sortiert
        qs = UserKompetenz.objects.filter(
            hat_kompetenz=True,
            kompetenz__aktiv=True,
            ablauf_am__isnull=False,
        ).select_related('kompetenz', 'kompetenz__kategorie')

        for uk in qs:
            if not uk.ablauf_am:
                continue
            tage_bis = (uk.ablauf_am - now).days
            # Bereits abgelaufen
            if tage_bis < 0:
                # nur einmal pro Woche bzw. wenn frisch abgelaufen (<=7 Tage)
                if tage_bis < -7:
                    skipped += 1
                    continue
                title = f'Kompetenz abgelaufen: {uk.kompetenz.name}'
                body = (f'Diese Kompetenz ist seit {abs(tage_bis)} Tag(en) abgelaufen. '
                        'Bitte vom Admin neu bestätigen lassen.')
            else:
                # Nur an Schwellwert-Tagen senden
                if tage_bis not in thresholds:
                    skipped += 1
                    continue
                title = f'Kompetenz läuft in {tage_bis} Tag(en) ab'
                body = (f'„{uk.kompetenz.name}" läuft am '
                        f'{uk.ablauf_am.strftime("%d.%m.%Y")} ab.')

            if dry_run:
                self.stdout.write(f'  [DRY] {uk.user_keycloak_id[:8]}…  {title}')
                continue

            nid = notify(
                uk.user_keycloak_id, 'kompetenz', title, body,
                link='/kompetenzen',
            )
            if nid:
                sent += 1

        self.stdout.write(self.style.SUCCESS(
            f'✓ {sent} Erinnerungen verschickt, {skipped} übersprungen'
        ))
