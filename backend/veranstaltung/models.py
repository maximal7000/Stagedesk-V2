"""
Veranstaltungsplaner: Veranstaltungen, Zammad-Anbindung, Zuweisungen,
Checklisten, Notizen, Anhänge, Wiederholungen, Ressourcen-Verknüpfung.
"""
from django.db import models
from django.conf import settings
from django.utils import timezone


class TaetigkeitsRolle(models.Model):
    """Konfigurierbare Tätigkeitsrollen für Veranstaltungs-Zuweisungen."""
    name = models.CharField(max_length=100, unique=True)
    sortierung = models.IntegerField(default=0)

    class Meta:
        ordering = ['sortierung', 'name']
        verbose_name = 'Tätigkeitsrolle'
        verbose_name_plural = 'Tätigkeitsrollen'

    def __str__(self):
        return self.name


class Veranstaltung(models.Model):
    STATUS_CHOICES = [
        ('planung', 'Planung'),
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

    titel = models.CharField(max_length=300)
    beschreibung = models.TextField(blank=True)
    datum_von = models.DateTimeField()
    datum_bis = models.DateTimeField()
    ort = models.CharField(max_length=300, blank=True)
    adresse = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planung')

    # Zammad
    zammad_ticket_id = models.IntegerField(null=True, blank=True, unique=True)
    zammad_ticket_number = models.CharField(max_length=50, blank=True)

    # Wiederholung
    wiederholung = models.CharField(max_length=20, choices=WIEDERHOLUNG_CHOICES, default='keine')
    wiederholung_ende = models.DateField(null=True, blank=True)
    parent_veranstaltung = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True, related_name='wiederholungen'
    )

    # Verknüpfung Inventar/Kalender (optional)
    ausleihliste = models.ForeignKey(
        'inventar.Ausleihliste', on_delete=models.SET_NULL, null=True, blank=True, related_name='veranstaltungen'
    )

    # Verknüpfung Anwesenheit (optional)
    anwesenheitsliste = models.ForeignKey(
        'anwesenheit.AnwesenheitsListe', on_delete=models.SET_NULL, null=True, blank=True, related_name='veranstaltungen'
    )

    # Discord-Integration
    discord_event_id = models.CharField(max_length=100, blank=True, help_text="Discord Scheduled Event ID")
    discord_channel_id = models.CharField(max_length=100, blank=True, help_text="Discord Text-Channel ID")

    erstellt_von = models.CharField(max_length=100, blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-datum_von']
        verbose_name = 'Veranstaltung'
        verbose_name_plural = 'Veranstaltungen'

    def __str__(self):
        return f"{self.titel} ({self.datum_von.strftime('%d.%m.%Y')})"


class VeranstaltungTermin(models.Model):
    """Einzeltermin einer Veranstaltung (z.B. mehrere Probentage)."""
    veranstaltung = models.ForeignKey(Veranstaltung, on_delete=models.CASCADE, related_name='termine')
    titel = models.CharField(max_length=255, blank=True)
    datum = models.DateField()
    beginn = models.TimeField(null=True, blank=True)
    ende = models.TimeField(null=True, blank=True)

    class Meta:
        ordering = ['datum', 'beginn']
        verbose_name = 'Veranstaltungstermin'
        verbose_name_plural = 'Veranstaltungstermine'

    def __str__(self):
        label = self.titel or self.datum.strftime('%d.%m.%Y')
        if self.beginn:
            label += f' {self.beginn.strftime("%H:%M")}'
        return label


class VeranstaltungZuweisung(models.Model):
    veranstaltung = models.ForeignKey(Veranstaltung, on_delete=models.CASCADE, related_name='zuweisungen')
    user_keycloak_id = models.CharField(max_length=100)
    user_username = models.CharField(max_length=150, blank=True)
    user_email = models.CharField(max_length=254, blank=True)
    taetigkeit = models.ForeignKey(TaetigkeitsRolle, on_delete=models.SET_NULL, null=True, blank=True,
                                   help_text="Tätigkeitszuweisung bei Veranstaltung")
    zugewiesen_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['veranstaltung', 'user_keycloak_id']
        verbose_name = 'Zuweisung'
        verbose_name_plural = 'Zuweisungen'

    def __str__(self):
        return f"{self.user_username or self.user_keycloak_id} @ {self.veranstaltung.titel}"


class VeranstaltungChecklisteItem(models.Model):
    veranstaltung = models.ForeignKey(Veranstaltung, on_delete=models.CASCADE, related_name='checkliste')
    titel = models.CharField(max_length=200)
    erledigt = models.BooleanField(default=False)
    sortierung = models.IntegerField(default=0)
    erledigt_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['sortierung', 'id']
        verbose_name = 'Checklisten-Punkt'
        verbose_name_plural = 'Checklisten-Punkte'

    def __str__(self):
        return self.titel


class VeranstaltungNotiz(models.Model):
    veranstaltung = models.ForeignKey(Veranstaltung, on_delete=models.CASCADE, related_name='notizen')
    text = models.TextField()
    created_by_keycloak_id = models.CharField(max_length=100, blank=True)
    created_by_username = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Notiz'
        verbose_name_plural = 'Notizen'

    def __str__(self):
        return self.text[:50] + '...' if len(self.text) > 50 else self.text


class VeranstaltungAnhang(models.Model):
    veranstaltung = models.ForeignKey(Veranstaltung, on_delete=models.CASCADE, related_name='anhaenge')
    name = models.CharField(max_length=200)
    datei = models.FileField(upload_to='veranstaltung_anhaenge/%Y/%m/', blank=True, null=True)
    url = models.URLField(blank=True)
    unique_key = models.CharField(max_length=64, blank=True, unique=True, null=True,
                                  help_text="Eindeutiger Schlüssel um Duplikate zu verhindern")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Anhang'
        verbose_name_plural = 'Anhänge'

    def __str__(self):
        return self.name


class VeranstaltungErinnerung(models.Model):
    EINHEIT_CHOICES = [
        ('minuten', 'Minuten'),
        ('stunden', 'Stunden'),
        ('tage', 'Tage'),
        ('wochen', 'Wochen'),
    ]
    veranstaltung = models.ForeignKey(Veranstaltung, on_delete=models.CASCADE, related_name='erinnerungen')
    zeit_vorher = models.IntegerField(default=1)
    einheit = models.CharField(max_length=10, choices=EINHEIT_CHOICES, default='tage')
    gesendet = models.BooleanField(default=False)
    gesendet_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Erinnerung'
        verbose_name_plural = 'Erinnerungen'

    def __str__(self):
        return f"Erinnerung {self.zeit_vorher} {self.get_einheit_display()} vor {self.veranstaltung.titel}"
