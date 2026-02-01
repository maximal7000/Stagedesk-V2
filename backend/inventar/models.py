"""
Inventar & Ausleih-System
- Inventar-Items mit Kategorien, Zustand, QR-Code
- Ausleih-Vorgänge mit Unterschrift (Global/Individuell)
- Wartungsprotokoll
"""
from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal
import uuid
import hashlib


class InventarKategorie(models.Model):
    """Kategorien für Inventar (Licht, Ton, Video, etc.)"""
    name = models.CharField(max_length=100)
    farbe = models.CharField(max_length=7, default='#3B82F6')
    icon = models.CharField(max_length=50, default='package')
    beschreibung = models.TextField(blank=True)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='unterkategorien')
    sortierung = models.IntegerField(default=0)
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sortierung', 'name']
        verbose_name = 'Kategorie'
        verbose_name_plural = 'Kategorien'

    def __str__(self):
        if self.parent:
            return f"{self.parent.name} > {self.name}"
        return self.name


class Lagerort(models.Model):
    """Lagerorte für Inventar"""
    name = models.CharField(max_length=100)
    beschreibung = models.TextField(blank=True)
    adresse = models.TextField(blank=True)
    ist_aktiv = models.BooleanField(default=True)
    sortierung = models.IntegerField(default=0)

    class Meta:
        ordering = ['sortierung', 'name']
        verbose_name = 'Lagerort'
        verbose_name_plural = 'Lagerorte'

    def __str__(self):
        return self.name


class InventarItem(models.Model):
    """Einzelnes Inventar-Item"""
    ZUSTAND_CHOICES = [
        ('neu', 'Neu'),
        ('sehr_gut', 'Sehr gut'),
        ('gut', 'Gut'),
        ('verschleiss', 'Verschleiß'),
        ('beschaedigt', 'Beschädigt'),
        ('defekt', 'Defekt'),
        ('ausgemustert', 'Ausgemustert'),
    ]
    
    STATUS_CHOICES = [
        ('verfuegbar', 'Verfügbar'),
        ('ausgeliehen', 'Ausgeliehen'),
        ('reserviert', 'Reserviert'),
        ('wartung', 'In Wartung'),
        ('defekt', 'Defekt'),
    ]
    
    # Basis-Infos
    name = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    kategorie = models.ForeignKey(InventarKategorie, on_delete=models.SET_NULL, null=True, blank=True, related_name='items')
    
    # Identifikation
    inventar_nr = models.CharField(max_length=50, unique=True, blank=True, help_text="Interne Inventarnummer")
    seriennummer = models.CharField(max_length=100, blank=True)
    qr_code = models.CharField(max_length=100, unique=True, blank=True, help_text="Eindeutiger QR-Code")
    barcode = models.CharField(max_length=100, blank=True)
    
    # Status & Zustand
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='verfuegbar')
    zustand = models.CharField(max_length=20, choices=ZUSTAND_CHOICES, default='gut')
    zustand_notizen = models.TextField(blank=True, help_text="Notizen zum Zustand")
    
    # Standort
    lagerort = models.ForeignKey(Lagerort, on_delete=models.SET_NULL, null=True, blank=True, related_name='items')
    lagerplatz = models.CharField(max_length=100, blank=True, help_text="z.B. Regal A3, Case 5")
    
    # Mengen (für Verbrauchsmaterial)
    menge = models.IntegerField(default=1)
    einheit = models.CharField(max_length=20, default='Stück')
    mindestbestand = models.IntegerField(default=0, help_text="Warnung wenn Bestand unterschritten")
    
    # Kaufinfos
    kaufdatum = models.DateField(null=True, blank=True)
    kaufpreis = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(Decimal('0'))])
    lieferant = models.CharField(max_length=200, blank=True)
    garantie_bis = models.DateField(null=True, blank=True)
    
    # Wert & Abschreibung
    aktueller_wert = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    abschreibung_jahre = models.IntegerField(default=5)
    
    # Bilder (JSON Array von URLs)
    bilder = models.JSONField(default=list, blank=True)
    
    # Technische Details (flexibles JSON)
    technische_daten = models.JSONField(default=dict, blank=True, help_text="z.B. Gewicht, Leistung, Anschlüsse")
    
    # Wartung
    letzte_wartung = models.DateField(null=True, blank=True)
    naechste_wartung = models.DateField(null=True, blank=True)
    wartungsintervall_tage = models.IntegerField(default=365)
    
    # Meta
    notizen = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    ist_aktiv = models.BooleanField(default=True)
    erstellt_von = models.CharField(max_length=100, blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['kategorie', 'name']
        verbose_name = 'Inventar-Item'
        verbose_name_plural = 'Inventar-Items'

    def __str__(self):
        return f"{self.name} ({self.inventar_nr})" if self.inventar_nr else self.name

    def save(self, *args, **kwargs):
        # QR-Code generieren wenn nicht vorhanden
        if not self.qr_code:
            self.qr_code = f"INV-{uuid.uuid4().hex[:12].upper()}"
        
        # Inventarnummer generieren wenn nicht vorhanden
        if not self.inventar_nr:
            prefix = "INV"
            if self.kategorie:
                prefix = self.kategorie.name[:3].upper()
            # Nächste freie Nummer finden
            last = InventarItem.objects.filter(inventar_nr__startswith=prefix).order_by('-inventar_nr').first()
            if last and last.inventar_nr:
                try:
                    num = int(last.inventar_nr.split('-')[-1]) + 1
                except:
                    num = 1
            else:
                num = 1
            self.inventar_nr = f"{prefix}-{num:05d}"
        
        super().save(*args, **kwargs)

    @property
    def ist_ausleihbar(self):
        return self.status == 'verfuegbar' and self.ist_aktiv

    @property
    def braucht_wartung(self):
        from datetime import date
        if self.naechste_wartung:
            return self.naechste_wartung <= date.today()
        return False


class Ausleihe(models.Model):
    """Ausleih-Vorgang (kann mehrere Items enthalten)"""
    UNTERSCHRIFT_MODUS = [
        ('keine', 'Keine Unterschrift'),
        ('global', 'Eine Unterschrift für alle'),
        ('individuell', 'Unterschrift pro Item'),
    ]
    
    STATUS_CHOICES = [
        ('offen', 'Offen'),
        ('aktiv', 'Aktiv/Ausgeliehen'),
        ('teilrueckgabe', 'Teilrückgabe'),
        ('zurueckgegeben', 'Zurückgegeben'),
        ('abgebrochen', 'Abgebrochen'),
    ]
    
    # Ausleiher
    ausleiher_name = models.CharField(max_length=200)
    ausleiher_email = models.EmailField(blank=True)
    ausleiher_telefon = models.CharField(max_length=50, blank=True)
    ausleiher_organisation = models.CharField(max_length=200, blank=True)
    
    # Zweck (optional Event-Verknüpfung)
    zweck = models.CharField(max_length=300, blank=True)
    event = models.ForeignKey('kalender.Event', on_delete=models.SET_NULL, null=True, blank=True, related_name='ausleihen')
    
    # Zeitraum
    ausleihe_von = models.DateTimeField()
    ausleihe_bis = models.DateTimeField()
    tatsaechliche_rueckgabe = models.DateTimeField(null=True, blank=True)
    
    # Unterschrift
    unterschrift_modus = models.CharField(max_length=20, choices=UNTERSCHRIFT_MODUS, default='global')
    unterschrift_ausleihe = models.TextField(blank=True, help_text="Base64-encoded Signatur bei Ausleihe")
    unterschrift_rueckgabe = models.TextField(blank=True, help_text="Base64-encoded Signatur bei Rückgabe")
    
    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='offen')
    
    # Notizen
    notizen_ausleihe = models.TextField(blank=True)
    notizen_rueckgabe = models.TextField(blank=True)
    
    # Meta
    erstellt_von = models.CharField(max_length=100, blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-erstellt_am']
        verbose_name = 'Ausleihe'
        verbose_name_plural = 'Ausleihen'

    def __str__(self):
        return f"Ausleihe #{self.id} - {self.ausleiher_name}"

    @property
    def anzahl_items(self):
        return self.positionen.count()

    @property
    def ist_ueberfaellig(self):
        from django.utils import timezone
        if self.status == 'aktiv' and self.ausleihe_bis:
            return timezone.now() > self.ausleihe_bis
        return False


class AusleihePosition(models.Model):
    """Einzelne Position einer Ausleihe"""
    ZUSTAND_CHOICES = InventarItem.ZUSTAND_CHOICES
    
    ausleihe = models.ForeignKey(Ausleihe, on_delete=models.CASCADE, related_name='positionen')
    item = models.ForeignKey(InventarItem, on_delete=models.PROTECT, related_name='ausleihe_positionen')
    
    # Menge (bei Verbrauchsmaterial)
    menge = models.IntegerField(default=1)
    
    # Zustand bei Ausleihe/Rückgabe
    zustand_ausleihe = models.CharField(max_length=20, choices=ZUSTAND_CHOICES, blank=True)
    zustand_rueckgabe = models.CharField(max_length=20, choices=ZUSTAND_CHOICES, blank=True)
    
    # Individuelle Unterschrift (wenn Modus = individuell)
    unterschrift = models.TextField(blank=True)
    
    # Notizen
    notizen = models.TextField(blank=True)
    
    # Rückgabe-Status
    ist_zurueckgegeben = models.BooleanField(default=False)
    rueckgabe_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Ausleihe-Position'
        verbose_name_plural = 'Ausleihe-Positionen'

    def __str__(self):
        return f"{self.item.name} ({self.menge}x)"


class Wartung(models.Model):
    """Wartungsprotokoll für Items"""
    TYP_CHOICES = [
        ('inspektion', 'Inspektion'),
        ('reinigung', 'Reinigung'),
        ('reparatur', 'Reparatur'),
        ('pruefung', 'Prüfung (z.B. BGV)'),
        ('update', 'Software/Firmware Update'),
        ('sonstiges', 'Sonstiges'),
    ]
    
    item = models.ForeignKey(InventarItem, on_delete=models.CASCADE, related_name='wartungen')
    typ = models.CharField(max_length=20, choices=TYP_CHOICES, default='inspektion')
    datum = models.DateField()
    beschreibung = models.TextField()
    
    # Kosten
    kosten = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    dienstleister = models.CharField(max_length=200, blank=True)
    
    # Ergebnis
    zustand_vorher = models.CharField(max_length=20, choices=InventarItem.ZUSTAND_CHOICES, blank=True)
    zustand_nachher = models.CharField(max_length=20, choices=InventarItem.ZUSTAND_CHOICES, blank=True)
    
    # Meta
    erstellt_von = models.CharField(max_length=100, blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-datum']
        verbose_name = 'Wartung'
        verbose_name_plural = 'Wartungen'

    def __str__(self):
        return f"Wartung {self.item.name} - {self.datum}"
