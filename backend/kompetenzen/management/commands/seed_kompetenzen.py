"""
Seed-Command: Erstellt die Standard-Kategorien, Gruppen und Kompetenzen.

Aufruf:
    python manage.py seed_kompetenzen
"""
from django.core.management.base import BaseCommand
from kompetenzen.models import KompetenzKategorie, KompetenzGruppe, Kompetenz


KATALOG = {
    "Allgemeine Kompetenzen": {
        "_icon": "Wrench",
        "_farbe": "gray",
        "_sortierung": 10,
        "_kompetenzen": [
            ("technisches Grundverständnis", 2),
            ("BMA (De)Aktivieren", 2),
            ("ProComVis", 1),
            ("Sicherungsschrank", 2),
            ("Leiter aufbauen", 1),
            ("Gerüst aufbauen", 2),
            ("Klettergurt anlegen", 2),
            ("Companion", 1),
            ("Aufräumen (Ordnung halten)", 1),
            ("Drucker", 1),
            ("Staubsaugen", 1),
            ("Kabel verlegen (ordentlich)", 1),
            ("Bühnenumbau", 2),
            ("Pause machen", 1),
            ("Fehlersuche", 2),
            ("Stromberechnung", 2),
        ],
    },
    "Lichttechnik": {
        "_icon": "Lightbulb",
        "_farbe": "yellow",
        "_sortierung": 20,
        "_kompetenzen": [
            ("Verdunklung", 1),
            ("Verfolger bedienen", 2),
            ("Verfolger ruhig führen", 2),
            ("Grundverständnis DMX-512", 2),
            ("Verteilung der DMX-Universen", 2),
            ("DMX-Adressen an Lampen einstellen", 2),
            ("DMX-Kabel legen (Unterschied XLR)", 1),
            ("Lampentypen (Flooter, Blinder, Fresnel, ...)", 2),
            ("Nebel/Hazer Betrieb", 2),
            ("Farbmischung", 1),
        ],
        "_gruppen": {
            "Gio@5": {
                "_sortierung": 21,
                "_kompetenzen": [
                    ("Eos starten", 1),
                    ("Allgemeiner Softwareaufbau", 2),
                    ("Dimmer ein- und ausschalten", 1),
                    ("Showfile-Archiv", 1),
                    ("Channel und Groups", 2),
                    ("Fader und Submaster", 2),
                    ("Palettes", 2),
                    ("Magic Sheet", 2),
                    ("Patchen", 2),
                    ("Cues", 2),
                    ("Effekttypen", 2),
                    ("Effekt programmieren", 3),
                    ("BPM Synchronisierung", 2),
                    ("Lichtprogrammierung Musical", 4),
                ],
            },
        },
    },
    "Tontechnik": {
        "_icon": "Volume2",
        "_farbe": "blue",
        "_sortierung": 30,
        "_kompetenzen": [
            ("Tontechnik für Musicals", 4),
            ("Gute Tonassistenz", 2),
            ("Unterschied Dynamisch/Kondensator", 1),
            ("Mikrofontypen (Einsatzgebiet)", 2),
            ("Richtcharakteristiken", 2),
            ("Band verkabeln", 2),
            ("Drumset mikrofonieren", 3),
            ("Monitore aufbauen", 2),
            ("Grundverständnis Monitoring", 2),
            ("Monitoring (ohne In-Ear)", 2),
            ("Talkback", 2),
            ("Grundverständnis DI-Box", 1),
            ("Unterschied Aktive/Passive DI-Box", 1),
            ("Unterschied Mono/Stereo", 1),
            ("Kabeltypen (Klinke, XLR, Chinch, ...)", 1),
            ("Kirchenanlage aufbauen/bedienen", 2),
            ("Fender Studio Pro (DAW) Grundverständnis", 2),
            ("Musicals (Ton) aufnehmen", 3),
            ("Audiomixing", 3),
        ],
        "_gruppen": {
            "Handfunken": {
                "_sortierung": 31,
                "_kompetenzen": [
                    ("Handfunken Ein/Ausschalten", 1),
                    ("Handfunken Aufladen", 1),
                    ("Handfunken entsperren", 1),
                    ("Handfunken Menüführung", 2),
                    ("Handfunken richtig halten", 1),
                ],
            },
            "Bodypacks": {
                "_sortierung": 32,
                "_kompetenzen": [
                    ("Bodypacks Ein/Ausschalten", 1),
                    ("Bodypacks Aufladen", 1),
                    ("Bodypacks entsperren", 1),
                    ("Bodypacks Menüführung", 2),
                    ("Bodypacks sinnvoll anbringen", 2),
                    ("Klinke via Bodypack (Gitarre/Bass)", 2),
                ],
            },
            "Headsets & Empfänger": {
                "_sortierung": 33,
                "_kompetenzen": [
                    ("Headsets korrekt anbringen", 2),
                    ("Empfänger mit Handfunken/Bodypacks synchronisieren", 2),
                    ("Neue Frequenzen scannen und zuweisen", 3),
                    ("Frequenzen zuweisen", 3),
                    ("IP Adressen der Empfänger einstellen", 2),
                ],
            },
            "Dante": {
                "_sortierung": 34,
                "_kompetenzen": [
                    ("Dante Grundverständnis", 2),
                    ("Dante Abos", 2),
                    ("Dante Fehlersuche", 3),
                    ("Dante Netzwerk Patchen (LAN)", 2),
                ],
            },
            "Avantis": {
                "_sortierung": 35,
                "_kompetenzen": [
                    ("Avantis Ein/Ausschalten", 1),
                    ("Avantis Software Grundverständnis", 2),
                    ("Handfunke auf die PA bringen", 2),
                    ("Routing innerhalb des Pultes", 3),
                    ("Verständnis Mixerconfig (Aux, Gruppen, Matrix, PAFL, Main)", 3),
                    ("Channel Mono/Stereo", 2),
                    ("Avantis Patchen", 2),
                    ("Unterschied I/O Port, DSnake, Local", 2),
                    ("Gain", 2),
                    ("Phantomspannung", 1),
                    ("Gate", 2),
                    ("HPF/LPF", 2),
                    ("PEQ", 3),
                    ("Stimmen equalizen", 3),
                    ("Compressor", 3),
                    ("Grundverständnis FOH-Mix", 3),
                    ("Stageboxtypen (Dante/DSnake)", 2),
                    ("Stageboxen aufbauen", 2),
                    ("Einpfeifen", 3),
                    ("tiefes Verständnis Software", 4),
                    ("Memory-Funktion", 2),
                ],
            },
        },
    },
    "Videotechnik": {
        "_icon": "Video",
        "_farbe": "purple",
        "_sortierung": 40,
        "_kompetenzen": [
            ("Beamer einschalten", 1),
            ("Beamer Quelle ändern", 1),
            ("Leinwand", 1),
            ("live Schnitt", 3),
            ("live Schnitt Musicals", 4),
            ("Kameras Grundverständnis", 2),
            ("Sony Kamera Aufbau (Kamera, Stativ, Griff, SDI/HDMI)", 2),
            ("Kameraführung", 3),
            ("SDI Converter", 2),
            ("H2R-Graphics", 2),
            ("DaVinci Resolve Grundverständnis", 3),
            ("Musicals schneiden", 4),
            ("OBS Grundlagen", 2),
        ],
        "_gruppen": {
            "Atem": {
                "_sortierung": 41,
                "_kompetenzen": [
                    ("Atem Grundbedienung", 2),
                    ("Atem Output einstellen", 2),
                    ("Atem Software Control", 2),
                    ("Atem Upstream-Keys", 3),
                    ("Atem Setup Software", 3),
                    ("Atem tiefes Verständnis", 4),
                ],
            },
        },
    },
}


class Command(BaseCommand):
    help = "Seedet Kategorien, Gruppen und Kompetenzen"

    def handle(self, *args, **opts):
        created = {"kategorien": 0, "gruppen": 0, "kompetenzen": 0}

        for kat_name, kat_data in KATALOG.items():
            kat, was_created = KompetenzKategorie.objects.get_or_create(
                name=kat_name,
                defaults={
                    "icon": kat_data.get("_icon", ""),
                    "farbe": kat_data.get("_farbe", ""),
                    "sortierung": kat_data.get("_sortierung", 0),
                },
            )
            if was_created:
                created["kategorien"] += 1

            # Direkte Kompetenzen
            for idx, (k_name, punkte) in enumerate(kat_data.get("_kompetenzen", [])):
                _, c = Kompetenz.objects.get_or_create(
                    kategorie=kat, name=k_name,
                    defaults={"punkte": punkte, "sortierung": idx},
                )
                if c:
                    created["kompetenzen"] += 1

            # Gruppen
            for g_name, g_data in kat_data.get("_gruppen", {}).items():
                gruppe, gc = KompetenzGruppe.objects.get_or_create(
                    kategorie=kat, name=g_name,
                    defaults={"sortierung": g_data.get("_sortierung", 0)},
                )
                if gc:
                    created["gruppen"] += 1
                for idx, (k_name, punkte) in enumerate(g_data.get("_kompetenzen", [])):
                    _, c = Kompetenz.objects.get_or_create(
                        kategorie=kat, name=k_name,
                        defaults={
                            "gruppe": gruppe,
                            "punkte": punkte,
                            "sortierung": idx,
                        },
                    )
                    if c:
                        created["kompetenzen"] += 1

        self.stdout.write(self.style.SUCCESS(
            f"Fertig: {created['kategorien']} Kategorien, "
            f"{created['gruppen']} Gruppen, {created['kompetenzen']} Kompetenzen erstellt."
        ))
