"""
Inventar & Ausleih-System v2
- Vereinfachte Items (ohne Kaufinfos, Wartung, Menge)
- Hersteller als eigenes Model
- Item-Sets
- Ausleihlisten (Global/Individuell)
- Ausleiher-Datenbank
- Reservierungen
- Mehrere QR-Codes pro Item
"""
from django.db import models
from django.core.mail import send_mail
from django.conf import settings
import uuid


class InventarKategorie(models.Model):
    """Kategorien für Inventar"""
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
        return f"{self.parent.name} > {self.name}" if self.parent else self.name


class Standort(models.Model):
    """Standorte/Lagerorte für Items"""
    name = models.CharField(max_length=100)
    beschreibung = models.TextField(blank=True)
    adresse = models.TextField(blank=True)
    ist_aktiv = models.BooleanField(default=True)
    sortierung = models.IntegerField(default=0)

    class Meta:
        ordering = ['sortierung', 'name']
        verbose_name = 'Standort'
        verbose_name_plural = 'Standorte'

    def __str__(self):
        return self.name


class Hersteller(models.Model):
    """Hersteller von Equipment"""
    name = models.CharField(max_length=100, unique=True)
    website = models.URLField(blank=True)
    notizen = models.TextField(blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Hersteller'
        verbose_name_plural = 'Hersteller'

    def __str__(self):
        return self.name


class Ausleiher(models.Model):
    """Datenbank für häufige Ausleiher"""
    name = models.CharField(max_length=200)
    organisation = models.CharField(max_length=200, blank=True)
    email = models.EmailField(blank=True)
    telefon = models.CharField(max_length=50, blank=True)
    adresse = models.TextField(blank=True)
    notizen = models.TextField(blank=True)
    ist_aktiv = models.BooleanField(default=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Ausleiher'
        verbose_name_plural = 'Ausleiher'

    def __str__(self):
        return f"{self.name}" + (f" ({self.organisation})" if self.organisation else "")


class InventarItem(models.Model):
    """Einzelnes Inventar-Item (vereinfacht)"""
    STATUS_CHOICES = [
        ('verfuegbar', 'Verfügbar'),
        ('ausgeliehen', 'Ausgeliehen'),
        ('reserviert', 'Reserviert'),
        ('defekt', 'Defekt'),
    ]
    
    # Basis-Infos
    name = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    
    # Verknüpfungen
    kategorie = models.ForeignKey(InventarKategorie, on_delete=models.SET_NULL, null=True, blank=True, related_name='items')
    standort = models.ForeignKey(Standort, on_delete=models.SET_NULL, null=True, blank=True, related_name='items')
    hersteller = models.ForeignKey(Hersteller, on_delete=models.SET_NULL, null=True, blank=True, related_name='items')
    
    # Identifikation
    seriennummer = models.CharField(max_length=100, blank=True)
    
    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='verfuegbar')
    
    # Bilder (JSON Array von URLs/Base64)
    bilder = models.JSONField(default=list, blank=True)
    
    # Notizen
    notizen = models.TextField(blank=True)
    
    # Meta
    ist_aktiv = models.BooleanField(default=True)
    erstellt_von = models.CharField(max_length=100, blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Item'
        verbose_name_plural = 'Items'

    def __str__(self):
        return self.name

    @property
    def ist_verfuegbar(self):
        return self.status == 'verfuegbar' and self.ist_aktiv

    @property
    def haupt_qr_code(self):
        """Gibt den primären QR-Code zurück"""
        qr = self.qr_codes.filter(ist_primaer=True).first()
        if not qr:
            qr = self.qr_codes.first()
        return qr.code if qr else None


class ItemQRCode(models.Model):
    """Mehrere QR-Codes pro Item möglich"""
    item = models.ForeignKey(InventarItem, on_delete=models.CASCADE, related_name='qr_codes')
    code = models.CharField(max_length=100, unique=True)
    bezeichnung = models.CharField(max_length=100, blank=True, help_text="z.B. 'Hauptaufkleber', 'Ersatz'")
    ist_primaer = models.BooleanField(default=False)
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'QR-Code'
        verbose_name_plural = 'QR-Codes'

    def __str__(self):
        return f"{self.code} ({self.item.name})"

    def save(self, *args, **kwargs):
        # Wenn primär, alle anderen auf nicht-primär setzen
        if self.ist_primaer:
            ItemQRCode.objects.filter(item=self.item, ist_primaer=True).update(ist_primaer=False)
        # Wenn erster QR-Code, automatisch primär machen
        if not self.pk and not self.item.qr_codes.exists():
            self.ist_primaer = True
        super().save(*args, **kwargs)


class ItemSet(models.Model):
    """Vordefinierte Item-Sets"""
    name = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    farbe = models.CharField(max_length=7, default='#8B5CF6')
    ist_aktiv = models.BooleanField(default=True)
    erstellt_von = models.CharField(max_length=100, blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Item-Set'
        verbose_name_plural = 'Item-Sets'

    def __str__(self):
        return self.name

    @property
    def anzahl_items(self):
        return self.positionen.count()


class ItemSetPosition(models.Model):
    """Items in einem Set"""
    item_set = models.ForeignKey(ItemSet, on_delete=models.CASCADE, related_name='positionen')
    item = models.ForeignKey(InventarItem, on_delete=models.CASCADE, related_name='set_positionen')
    anzahl = models.IntegerField(default=1)
    notizen = models.TextField(blank=True)

    class Meta:
        unique_together = ['item_set', 'item']
        verbose_name = 'Set-Position'
        verbose_name_plural = 'Set-Positionen'

    def __str__(self):
        return f"{self.anzahl}x {self.item.name}"


class Ausleihliste(models.Model):
    """Ausleihliste - kann Global oder Individuell sein"""
    MODUS_CHOICES = [
        ('global', 'Global (eine Unterschrift)'),
        ('individuell', 'Individuell (Unterschrift pro Item)'),
    ]
    
    STATUS_CHOICES = [
        ('offen', 'Offen'),
        ('aktiv', 'Aktiv'),
        ('teilrueckgabe', 'Teilrückgabe'),
        ('abgeschlossen', 'Abgeschlossen'),
        ('abgebrochen', 'Abgebrochen'),
    ]
    
    # Ausleiher
    ausleiher = models.ForeignKey(Ausleiher, on_delete=models.SET_NULL, null=True, blank=True, related_name='ausleihen')
    ausleiher_name = models.CharField(max_length=200, help_text="Falls nicht aus Datenbank")
    ausleiher_organisation = models.CharField(max_length=200, blank=True)
    
    # Details
    zweck = models.CharField(max_length=300, blank=True)
    frist = models.DateField(null=True, blank=True, help_text="Rückgabe-Frist")
    
    # Modus & Status
    modus = models.CharField(max_length=20, choices=MODUS_CHOICES, default='global')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='offen')
    
    # Globale Unterschrift (wenn Modus = global)
    unterschrift_ausleihe = models.TextField(blank=True, help_text="Base64 Signatur")
    unterschrift_rueckgabe = models.TextField(blank=True)
    
    # Notizen
    notizen = models.TextField(blank=True)
    notizen_rueckgabe = models.TextField(blank=True)
    
    # Rückgabe
    rueckgabe_am = models.DateTimeField(null=True, blank=True)
    rueckgabe_zustand = models.CharField(max_length=50, blank=True, help_text="OK, Beschädigt, etc.")
    
    # Meta
    erstellt_von = models.CharField(max_length=100, blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-erstellt_am']
        verbose_name = 'Ausleihliste'
        verbose_name_plural = 'Ausleihlisten'

    def __str__(self):
        return f"Ausleihe #{self.id} - {self.ausleiher_name}"

    @property
    def anzahl_items(self):
        return self.positionen.count()

    @property
    def ist_ueberfaellig(self):
        from django.utils import timezone
        if self.status == 'aktiv' and self.frist:
            return timezone.now().date() > self.frist
        return False

    def send_mahnung(self):
        """Sendet Mahnungs-E-Mail an Ausleiher"""
        email = None
        if self.ausleiher and self.ausleiher.email:
            email = self.ausleiher.email
        
        if not email:
            return False, "Keine E-Mail-Adresse vorhanden"
        
        items_text = "\n".join([f"- {p.item.name}" for p in self.positionen.all()])
        
        try:
            send_mail(
                subject=f"Mahnung: Rückgabe überfällig - Ausleihe #{self.id}",
                message=f"""Hallo {self.ausleiher_name},

die folgende Ausleihe ist überfällig:

Ausleihe #{self.id}
Frist: {self.frist.strftime('%d.%m.%Y') if self.frist else 'Nicht angegeben'}

Ausgeliehene Items:
{items_text}

Bitte geben Sie die Items schnellstmöglich zurück.

Mit freundlichen Grüßen,
Stagedesk
""",
                from_email=settings.DEFAULT_FROM_EMAIL if hasattr(settings, 'DEFAULT_FROM_EMAIL') else 'noreply@stagedesk.de',
                recipient_list=[email],
                fail_silently=False,
            )
            return True, "E-Mail gesendet"
        except Exception as e:
            return False, str(e)


class AusleihePosition(models.Model):
    """Position in einer Ausleihliste"""
    ZUSTAND_CHOICES = [
        ('ok', 'OK'),
        ('verschleiss', 'Verschleiß'),
        ('beschaedigt', 'Beschädigt'),
        ('defekt', 'Defekt'),
    ]
    
    ausleihliste = models.ForeignKey(Ausleihliste, on_delete=models.CASCADE, related_name='positionen')
    item = models.ForeignKey(InventarItem, on_delete=models.PROTECT, related_name='ausleihe_positionen')
    
    # Individuelle Unterschrift (wenn Modus = individuell)
    unterschrift = models.TextField(blank=True)
    
    # Zustand
    zustand_ausleihe = models.CharField(max_length=20, choices=ZUSTAND_CHOICES, default='ok')
    zustand_rueckgabe = models.CharField(max_length=20, choices=ZUSTAND_CHOICES, blank=True)
    
    # Fotos (Base64 oder URLs)
    foto_ausleihe = models.TextField(blank=True)
    foto_rueckgabe = models.TextField(blank=True)
    
    # Rückgabe
    ist_zurueckgegeben = models.BooleanField(default=False)
    rueckgabe_am = models.DateTimeField(null=True, blank=True)
    rueckgabe_notizen = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Ausleihe-Position'
        verbose_name_plural = 'Ausleihe-Positionen'

    def __str__(self):
        return f"{self.item.name}"


class Reservierung(models.Model):
    """Reservierung eines Items für ein bestimmtes Datum"""
    STATUS_CHOICES = [
        ('aktiv', 'Aktiv'),
        ('bestaetigt', 'Bestätigt'),
        ('storniert', 'Storniert'),
        ('ausgeliehen', 'In Ausleihe umgewandelt'),
    ]
    
    item = models.ForeignKey(InventarItem, on_delete=models.CASCADE, related_name='reservierungen')
    ausleiher = models.ForeignKey(Ausleiher, on_delete=models.SET_NULL, null=True, blank=True)
    ausleiher_name = models.CharField(max_length=200)
    
    datum_von = models.DateField()
    datum_bis = models.DateField()
    zweck = models.CharField(max_length=300, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='aktiv')
    notizen = models.TextField(blank=True)
    
    erstellt_von = models.CharField(max_length=100, blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['datum_von']
        verbose_name = 'Reservierung'
        verbose_name_plural = 'Reservierungen'

    def __str__(self):
        return f"{self.item.name} - {self.ausleiher_name} ({self.datum_von} bis {self.datum_bis})"


class GespeicherterFilter(models.Model):
    """Gespeicherte Such-Filter"""
    name = models.CharField(max_length=100)
    filter_json = models.JSONField(default=dict, help_text="Filter als JSON")
    benutzer_id = models.CharField(max_length=100, help_text="Keycloak User ID")
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Gespeicherter Filter'
        verbose_name_plural = 'Gespeicherte Filter'

    def __str__(self):
        return self.name
