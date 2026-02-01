"""
Management Command: Setup Inventar mit Standard-Kategorien und Lagerorten
"""
from django.core.management.base import BaseCommand
from inventar.models import InventarKategorie, Lagerort


class Command(BaseCommand):
    help = 'Erstellt Standard-Kategorien und Lagerorte für das Inventar'

    def handle(self, *args, **options):
        self.stdout.write('Inventar Setup starten...')
        
        # Standard Kategorien
        kategorien = [
            {'name': 'Licht', 'farbe': '#EF4444', 'icon': 'lightbulb', 'beschreibung': 'Scheinwerfer, LEDs, Effekte', 'sortierung': 1},
            {'name': 'Ton', 'farbe': '#3B82F6', 'icon': 'volume-2', 'beschreibung': 'Lautsprecher, Mikrofone, Mischpulte', 'sortierung': 2},
            {'name': 'Video', 'farbe': '#8B5CF6', 'icon': 'video', 'beschreibung': 'Kameras, Projektoren, Screens', 'sortierung': 3},
            {'name': 'Rigging', 'farbe': '#F59E0B', 'icon': 'link', 'beschreibung': 'Traversen, Motoren, Anschlagmittel', 'sortierung': 4},
            {'name': 'Strom', 'farbe': '#10B981', 'icon': 'zap', 'beschreibung': 'Verteiler, Kabel, Generatoren', 'sortierung': 5},
            {'name': 'Bühne', 'farbe': '#EC4899', 'icon': 'layout', 'beschreibung': 'Podeste, Vorhänge, Deko', 'sortierung': 6},
            {'name': 'Kabel', 'farbe': '#6B7280', 'icon': 'cable', 'beschreibung': 'Audio-, Video-, Stromkabel', 'sortierung': 7},
            {'name': 'Cases', 'farbe': '#14B8A6', 'icon': 'box', 'beschreibung': 'Flightcases, Transportboxen', 'sortierung': 8},
            {'name': 'Werkzeug', 'farbe': '#F97316', 'icon': 'wrench', 'beschreibung': 'Werkzeug, Verbrauchsmaterial', 'sortierung': 9},
            {'name': 'Sonstiges', 'farbe': '#A855F7', 'icon': 'package', 'beschreibung': 'Sonstiges Equipment', 'sortierung': 10},
        ]
        
        # Unterkategorien
        unterkategorien = {
            'Licht': [
                {'name': 'Moving Heads', 'farbe': '#EF4444', 'icon': 'move'},
                {'name': 'LED Par', 'farbe': '#EF4444', 'icon': 'circle'},
                {'name': 'Effekte', 'farbe': '#EF4444', 'icon': 'sparkles'},
                {'name': 'Steuerung', 'farbe': '#EF4444', 'icon': 'sliders'},
            ],
            'Ton': [
                {'name': 'Lautsprecher', 'farbe': '#3B82F6', 'icon': 'speaker'},
                {'name': 'Mikrofone', 'farbe': '#3B82F6', 'icon': 'mic'},
                {'name': 'Mischpulte', 'farbe': '#3B82F6', 'icon': 'sliders-horizontal'},
                {'name': 'In-Ear', 'farbe': '#3B82F6', 'icon': 'headphones'},
            ],
        }
        
        created_kat = 0
        for kat_data in kategorien:
            kat, created = InventarKategorie.objects.get_or_create(
                name=kat_data['name'],
                defaults=kat_data
            )
            if created:
                created_kat += 1
                self.stdout.write(f'  Kategorie erstellt: {kat.name}')
            
            # Unterkategorien
            if kat.name in unterkategorien:
                for sub_data in unterkategorien[kat.name]:
                    sub_data['parent'] = kat
                    sub, sub_created = InventarKategorie.objects.get_or_create(
                        name=sub_data['name'],
                        parent=kat,
                        defaults=sub_data
                    )
                    if sub_created:
                        created_kat += 1
                        self.stdout.write(f'    Unterkategorie: {sub.name}')
        
        # Standard Lagerorte
        lagerorte = [
            {'name': 'Hauptlager', 'beschreibung': 'Zentrales Lager'},
            {'name': 'Außenlager', 'beschreibung': 'Externes Lager'},
            {'name': 'Werkstatt', 'beschreibung': 'Reparatur & Wartung'},
            {'name': 'Tour', 'beschreibung': 'Unterwegs / On Tour'},
        ]
        
        created_lag = 0
        for lag_data in lagerorte:
            lag, created = Lagerort.objects.get_or_create(
                name=lag_data['name'],
                defaults=lag_data
            )
            if created:
                created_lag += 1
                self.stdout.write(f'  Lagerort erstellt: {lag.name}')
        
        self.stdout.write(self.style.SUCCESS(
            f'Fertig! {created_kat} Kategorien und {created_lag} Lagerorte erstellt.'
        ))
