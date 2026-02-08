"""
Veranstaltungsplaner: Veranstaltungen, Zammad-Anbindung, Zuweisungen,
Checklisten, Notizen, Anhänge, Wiederholungen, Ressourcen-Verknüpfung.
"""
from django.db import models
from django.conf import settings
from django.utils import timezone


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

    erstellt_von = models.CharField(max_length=100, blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-datum_von']
        verbose_name = 'Veranstaltung'
        verbose_name_plural = 'Veranstaltungen'

    def __str__(self):
        return f"{self.titel} ({self.datum_von.strftime('%d.%m.%Y')})"


class VeranstaltungZuweisung(models.Model):
    ROLLEN = [
        ('verantwortlich', 'Verantwortlich'),
        ('team', 'Team'),
        ('technik', 'Technik'),
        ('sonstiges', 'Sonstiges'),
    ]
    veranstaltung = models.ForeignKey(Veranstaltung, on_delete=models.CASCADE, related_name='zuweisungen')
    user_keycloak_id = models.CharField(max_length=100)
    user_username = models.CharField(max_length=150, blank=True)
    user_email = models.CharField(max_length=254, blank=True)
    rolle = models.CharField(max_length=20, choices=ROLLEN, default='team')
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
