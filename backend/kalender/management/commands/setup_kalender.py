"""
Management Command: Setup Kalender mit Standard-Kategorien
"""
from django.core.management.base import BaseCommand
from kalender.models import EventKategorie, Ressource


class Command(BaseCommand):
    help = 'Erstellt Standard-Kategorien und Beispiel-Ressourcen für den Kalender'

    def handle(self, *args, **options):
        self.stdout.write('Kalender Setup starten...')
        
        # Standard Event-Kategorien
        kategorien = [
            {'name': 'Show', 'farbe': '#EF4444', 'icon': 'star', 'beschreibung': 'Live Shows und Auftritte', 'sortierung': 1},
            {'name': 'Probe', 'farbe': '#3B82F6', 'icon': 'music', 'beschreibung': 'Proben und Rehearsals', 'sortierung': 2},
            {'name': 'Meeting', 'farbe': '#10B981', 'icon': 'users', 'beschreibung': 'Besprechungen und Meetings', 'sortierung': 3},
            {'name': 'Aufbau', 'farbe': '#F59E0B', 'icon': 'truck', 'beschreibung': 'Auf- und Abbau', 'sortierung': 4},
            {'name': 'Wartung', 'farbe': '#6B7280', 'icon': 'briefcase', 'beschreibung': 'Wartung und Reparaturen', 'sortierung': 5},
            {'name': 'Workshop', 'farbe': '#8B5CF6', 'icon': 'award', 'beschreibung': 'Workshops und Schulungen', 'sortierung': 6},
            {'name': 'Feiertag', 'farbe': '#EC4899', 'icon': 'calendar', 'beschreibung': 'Feiertage und freie Tage', 'sortierung': 7},
            {'name': 'Sonstiges', 'farbe': '#14B8A6', 'icon': 'flag', 'beschreibung': 'Sonstige Termine', 'sortierung': 8},
        ]
        
        created_kat = 0
        for kat_data in kategorien:
            kat, created = EventKategorie.objects.get_or_create(
                name=kat_data['name'],
                defaults=kat_data
            )
            if created:
                created_kat += 1
                self.stdout.write(f'  Kategorie erstellt: {kat.name}')
        
        # Beispiel-Ressourcen
        ressourcen = [
            {'name': 'Proberaum 1', 'typ': 'raum', 'farbe': '#3B82F6', 'beschreibung': 'Hauptproberaum', 'kosten_pro_stunde': 25},
            {'name': 'Proberaum 2', 'typ': 'raum', 'farbe': '#10B981', 'beschreibung': 'Kleiner Proberaum', 'kosten_pro_stunde': 15},
            {'name': 'Lichtsteuerpult', 'typ': 'equipment', 'farbe': '#EF4444', 'beschreibung': 'MA grandMA3', 'kosten_pro_tag': 150},
            {'name': 'Mischpult FOH', 'typ': 'equipment', 'farbe': '#F59E0B', 'beschreibung': 'DiGiCo SD12', 'kosten_pro_tag': 200},
            {'name': 'Monitor-System', 'typ': 'equipment', 'farbe': '#8B5CF6', 'beschreibung': 'In-Ear Monitor Set', 'kosten_pro_tag': 100, 'max_gleichzeitig': 8},
            {'name': 'Sprinter', 'typ': 'fahrzeug', 'farbe': '#6B7280', 'beschreibung': 'Mercedes Sprinter', 'kosten_pro_tag': 80},
            {'name': 'LKW 7.5t', 'typ': 'fahrzeug', 'farbe': '#14B8A6', 'beschreibung': 'Koffer-LKW', 'kosten_pro_tag': 150},
        ]
        
        created_res = 0
        for res_data in ressourcen:
            res, created = Ressource.objects.get_or_create(
                name=res_data['name'],
                defaults=res_data
            )
            if created:
                created_res += 1
                self.stdout.write(f'  Ressource erstellt: {res.name}')
        
        self.stdout.write(self.style.SUCCESS(
            f'Fertig! {created_kat} Kategorien und {created_res} Ressourcen erstellt.'
        ))
