"""
Monitor / Public Display Models
"""
import uuid
from django.db import models
from django.utils import timezone


class MonitorConfig(models.Model):
    """Singleton: Konfiguration für das öffentliche Display"""

    # Allgemein
    titel = models.CharField(max_length=200, default='Stagedesk Monitor')
    untertitel = models.CharField(max_length=300, blank=True)
    logo_url = models.URLField(blank=True, help_text="URL zu einem Logo-Bild")
    hintergrund_farbe = models.CharField(max_length=7, default='#0f172a', help_text="Hex-Farbe")

    # Widgets: welche Bereiche angezeigt werden
    zeige_uhr = models.BooleanField(default=True)
    zeige_veranstaltungen = models.BooleanField(default=True, help_text="Nächste und laufende Veranstaltungen")
    zeige_ankuendigungen = models.BooleanField(default=True)
    zeige_onair = models.BooleanField(default=True, help_text="ON AIR Indikator")
    zeige_webuntis = models.BooleanField(default=False)
    zeige_logo = models.BooleanField(default=True)

    # WebUntis
    webuntis_url = models.URLField(blank=True, help_text="URL zum WebUntis Stundenplan (iFrame)")

    # ON AIR
    ist_on_air = models.BooleanField(default=False)
    on_air_text = models.CharField(max_length=100, default='ON AIR')
    on_air_seit = models.DateTimeField(null=True, blank=True)

    # API-Token für externe Steuerung (ATEM etc.)
    api_token = models.CharField(max_length=64, unique=True, blank=True,
                                 help_text="Token für externe ON AIR Steuerung")

    # Refresh
    refresh_intervall = models.IntegerField(default=30, help_text="Sekunden zwischen Auto-Refresh")

    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Monitor-Konfiguration'
        verbose_name_plural = 'Monitor-Konfiguration'

    def save(self, *args, **kwargs):
        self.pk = 1
        if not self.api_token:
            self.api_token = uuid.uuid4().hex
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def set_on_air(self, status: bool):
        self.ist_on_air = status
        self.on_air_seit = timezone.now() if status else None
        self.save(update_fields=['ist_on_air', 'on_air_seit', 'aktualisiert_am'])

    def __str__(self):
        return self.titel


class Ankuendigung(models.Model):
    """Freitext-Ankündigungen für das Display"""

    PRIORITY_CHOICES = [
        ('normal', 'Normal'),
        ('wichtig', 'Wichtig'),
        ('dringend', 'Dringend'),
    ]

    titel = models.CharField(max_length=200)
    text = models.TextField(blank=True)
    prioritaet = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    ist_aktiv = models.BooleanField(default=True)
    aktiv_von = models.DateTimeField(null=True, blank=True, help_text="Ab wann anzeigen (leer = sofort)")
    aktiv_bis = models.DateTimeField(null=True, blank=True, help_text="Bis wann anzeigen (leer = unbegrenzt)")
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-prioritaet', '-erstellt_am']
        verbose_name = 'Ankündigung'
        verbose_name_plural = 'Ankündigungen'

    @property
    def ist_sichtbar(self):
        if not self.ist_aktiv:
            return False
        now = timezone.now()
        if self.aktiv_von and now < self.aktiv_von:
            return False
        if self.aktiv_bis and now > self.aktiv_bis:
            return False
        return True

    def __str__(self):
        return self.titel
