"""
Kalender-Modelle für Events, Kategorien und Ressourcen
"""
from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal


class EventKategorie(models.Model):
    """
    Kategorien für Events (Show, Probe, Meeting, etc.)
    """
    name = models.CharField(max_length=100)
    farbe = models.CharField(max_length=7, default='#3B82F6', help_text="Hex-Farbcode")
    icon = models.CharField(max_length=50, blank=True, help_text="Lucide Icon Name")
    beschreibung = models.TextField(blank=True)
    ist_aktiv = models.BooleanField(default=True)
    sortierung = models.IntegerField(default=0)
    erstellt_am = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['sortierung', 'name']
        verbose_name = 'Event-Kategorie'
        verbose_name_plural = 'Event-Kategorien'
    
    def __str__(self):
        return self.name


class Ressource(models.Model):
    """
    Ressourcen die gebucht werden können (Equipment, Räume, Personal)
    """
    RESSOURCE_TYPEN = [
        ('equipment', 'Equipment'),
        ('raum', 'Raum/Location'),
        ('personal', 'Personal/Crew'),
        ('fahrzeug', 'Fahrzeug'),
        ('sonstiges', 'Sonstiges'),
    ]
    
    name = models.CharField(max_length=200)
    typ = models.CharField(max_length=20, choices=RESSOURCE_TYPEN, default='equipment')
    beschreibung = models.TextField(blank=True)
    farbe = models.CharField(max_length=7, default='#6B7280', help_text="Hex-Farbcode")
    
    # Verfügbarkeit
    ist_verfuegbar = models.BooleanField(default=True)
    max_gleichzeitig = models.IntegerField(default=1, help_text="Wie oft kann diese Ressource gleichzeitig gebucht werden")
    
    # Kosten
    kosten_pro_tag = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(Decimal('0'))])
    kosten_pro_stunde = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(Decimal('0'))])
    
    # Meta
    notizen = models.TextField(blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['typ', 'name']
        verbose_name = 'Ressource'
        verbose_name_plural = 'Ressourcen'
    
    def __str__(self):
        return f"{self.name} ({self.get_typ_display()})"


class Event(models.Model):
    """
    Haupt-Event-Modell
    """
    STATUS_CHOICES = [
        ('geplant', 'Geplant'),
        ('bestaetigt', 'Bestätigt'),
        ('laufend', 'Laufend'),
        ('abgeschlossen', 'Abgeschlossen'),
        ('abgesagt', 'Abgesagt'),
    ]
    
    WIEDERHOLUNG_CHOICES = [
        ('keine', 'Keine'),
        ('taeglich', 'Täglich'),
        ('woechentlich', 'Wöchentlich'),
        ('monatlich', 'Monatlich'),
        ('jaehrlich', 'Jährlich'),
    ]
    
    # Basis-Infos
    titel = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    kategorie = models.ForeignKey(EventKategorie, on_delete=models.SET_NULL, null=True, blank=True, related_name='events')
    
    # Zeitraum
    start = models.DateTimeField()
    ende = models.DateTimeField()
    ganztaegig = models.BooleanField(default=False)
    
    # Ort
    ort = models.CharField(max_length=300, blank=True)
    adresse = models.TextField(blank=True)
    
    # Status & Wiederholung
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='geplant')
    wiederholung = models.CharField(max_length=20, choices=WIEDERHOLUNG_CHOICES, default='keine')
    wiederholung_ende = models.DateField(null=True, blank=True, help_text="Ende der Wiederholung")
    parent_event = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='wiederholungen')
    
    # Ressourcen
    ressourcen = models.ManyToManyField(Ressource, blank=True, through='EventRessource', related_name='events')
    
    # Budget-Verknüpfung (optional)
    haushalt = models.ForeignKey('haushalte.Haushalt', on_delete=models.SET_NULL, null=True, blank=True, related_name='events')
    geschaetztes_budget = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(Decimal('0'))])
    
    # Teilnehmer/Verantwortliche
    verantwortlicher = models.CharField(max_length=200, blank=True)
    teilnehmer_anzahl = models.IntegerField(default=0)
    notizen = models.TextField(blank=True)
    
    # Meta
    erstellt_von = models.CharField(max_length=100, blank=True, help_text="Keycloak User ID")
    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['start']
        verbose_name = 'Event'
        verbose_name_plural = 'Events'
    
    def __str__(self):
        return f"{self.titel} ({self.start.strftime('%d.%m.%Y')})"
    
    @property
    def dauer_stunden(self):
        """Berechnet die Dauer in Stunden"""
        delta = self.ende - self.start
        return delta.total_seconds() / 3600
    
    @property
    def ressourcen_kosten(self):
        """Berechnet die Gesamtkosten aller Ressourcen"""
        total = Decimal('0')
        for er in self.event_ressourcen.all():
            total += er.kosten
        return total


class EventRessource(models.Model):
    """
    Verknüpfung zwischen Event und Ressource mit Buchungsdetails
    """
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='event_ressourcen')
    ressource = models.ForeignKey(Ressource, on_delete=models.CASCADE, related_name='buchungen')
    
    # Buchungsdetails
    anzahl = models.IntegerField(default=1)
    von = models.DateTimeField(help_text="Buchung von (kann vom Event-Zeitraum abweichen)")
    bis = models.DateTimeField(help_text="Buchung bis")
    
    # Kosten (können überschrieben werden)
    kosten = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    kosten_berechnet = models.BooleanField(default=True, help_text="Kosten automatisch berechnen")
    
    notizen = models.TextField(blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Event-Ressource'
        verbose_name_plural = 'Event-Ressourcen'
    
    def __str__(self):
        return f"{self.ressource.name} für {self.event.titel}"
    
    def save(self, *args, **kwargs):
        # Kosten automatisch berechnen wenn gewünscht
        if self.kosten_berechnet and self.ressource:
            delta = self.bis - self.von
            stunden = delta.total_seconds() / 3600
            tage = delta.days or 1
            
            if self.ressource.kosten_pro_stunde > 0:
                self.kosten = self.ressource.kosten_pro_stunde * Decimal(str(stunden)) * self.anzahl
            elif self.ressource.kosten_pro_tag > 0:
                self.kosten = self.ressource.kosten_pro_tag * Decimal(str(tage)) * self.anzahl
        
        super().save(*args, **kwargs)


class EventErinnerung(models.Model):
    """
    Erinnerungen für Events
    """
    EINHEIT_CHOICES = [
        ('minuten', 'Minuten'),
        ('stunden', 'Stunden'),
        ('tage', 'Tage'),
        ('wochen', 'Wochen'),
    ]
    
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='erinnerungen')
    zeit_vorher = models.IntegerField(default=30)
    einheit = models.CharField(max_length=10, choices=EINHEIT_CHOICES, default='minuten')
    gesendet = models.BooleanField(default=False)
    gesendet_am = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        verbose_name = 'Erinnerung'
        verbose_name_plural = 'Erinnerungen'
    
    def __str__(self):
        return f"Erinnerung {self.zeit_vorher} {self.get_einheit_display()} vor {self.event.titel}"
