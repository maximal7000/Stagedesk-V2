"""
Management Command: Setup Inventar (ohne Dummy-Daten)
Kategorien, Standorte und Hersteller werden nur über die App angelegt (Autocomplete / Neu anlegen).
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Inventar-Setup (keine Dummy-Daten; Kategorien/Standorte/Hersteller in der App anlegen)'

    def handle(self, *args, **options):
        self.stdout.write('Inventar-Setup: Keine Standard-Daten. Nutze die App, um Kategorien, Standorte und Hersteller anzulegen.')
        self.stdout.write(self.style.SUCCESS('Fertig!'))
