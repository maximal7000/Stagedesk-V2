"""
Management Command: Überfällige Ausleihen mahnen.
Verwendung: python manage.py send_mahnungen
Für automatische Ausführung als Cron-Job einrichten:
  0 8 * * * cd /path/to/backend && ./venv/bin/python manage.py send_mahnungen
"""
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from inventar.models import Ausleihliste


class Command(BaseCommand):
    help = 'Sendet Mahnungen für alle überfälligen Ausleihen'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Nur anzeigen, keine E-Mails senden',
        )
        parser.add_argument(
            '--min-tage',
            type=int,
            default=1,
            help='Mindestanzahl Tage überfällig (Standard: 1)',
        )
        parser.add_argument(
            '--mahnung-intervall',
            type=int,
            default=3,
            help='Tage zwischen wiederholten Mahnungen (Standard: 3)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        min_tage = options['min_tage']
        intervall = options['mahnung_intervall']
        heute = timezone.now().date()
        grenze = heute - timedelta(days=min_tage)

        # Überfällige aktive Ausleihen
        ueberfaellige = Ausleihliste.objects.filter(
            status='aktiv',
            frist__lt=grenze,
        )

        gesendet = 0
        uebersprungen = 0
        fehler = 0

        for liste in ueberfaellige:
            # Bereits kürzlich gemahnt?
            if liste.letzte_mahnung_am:
                tage_seit_mahnung = (timezone.now() - liste.letzte_mahnung_am).days
                if tage_seit_mahnung < intervall:
                    uebersprungen += 1
                    if options['verbosity'] >= 2:
                        self.stdout.write(f"  Übersprungen: #{liste.id} (letzte Mahnung vor {tage_seit_mahnung} Tagen)")
                    continue

            tage_ueberfaellig = (heute - liste.frist).days if liste.frist else 0

            if dry_run:
                self.stdout.write(
                    f"  [DRY-RUN] Mahnung an {liste.ausleiher_name} "
                    f"(Ausleihe #{liste.id}, {tage_ueberfaellig} Tage überfällig)"
                )
                gesendet += 1
            else:
                success, message = liste.send_mahnung()
                if success:
                    gesendet += 1
                    self.stdout.write(self.style.SUCCESS(
                        f"  Gesendet: #{liste.id} → {liste.ausleiher_name} ({tage_ueberfaellig} Tage)"
                    ))
                else:
                    fehler += 1
                    self.stderr.write(self.style.ERROR(
                        f"  Fehler: #{liste.id} → {message}"
                    ))

        self.stdout.write('')
        self.stdout.write(f"Überfällige Ausleihen: {ueberfaellige.count()}")
        self.stdout.write(f"Mahnungen gesendet: {gesendet}")
        self.stdout.write(f"Übersprungen (kürzlich gemahnt): {uebersprungen}")
        if fehler:
            self.stdout.write(self.style.ERROR(f"Fehler: {fehler}"))
