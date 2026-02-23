"""
Anwesenheits-Tracking: Listen, Termine, Teilnehmer, Status
"""
from django.db import models
from django.utils import timezone


STATUS_CHOICES = [
    ('anwesend', 'Anwesend'),
    ('teilweise', 'Teilweise'),
    ('abwesend', 'Abwesend'),
    ('krank', 'Krank'),
    ('ausstehend', 'Ausstehend'),
]


class AnwesenheitsListe(models.Model):
    """Container fuer Anwesenheitstracking (z.B. ein Event oder eine Veranstaltungsreihe)"""

    LISTE_STATUS_CHOICES = [
        ('aktiv', 'Aktiv'),
        ('abgeschlossen', 'Abgeschlossen'),
    ]

    titel = models.CharField(max_length=255)
    beschreibung = models.TextField(blank=True)
    ort = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=LISTE_STATUS_CHOICES, default='aktiv')
    erstellt_von_keycloak_id = models.CharField(max_length=100)
    erstellt_von_username = models.CharField(max_length=150)
    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-erstellt_am']
        verbose_name = 'Anwesenheitsliste'
        verbose_name_plural = 'Anwesenheitslisten'

    def __str__(self):
        return self.titel

    def get_naechster_termin(self):
        heute = timezone.now().date()
        return self.termine.filter(datum__gte=heute).order_by('datum', 'beginn').first()


class Termin(models.Model):
    """Einzeltermin innerhalb einer Anwesenheitsliste"""

    liste = models.ForeignKey(AnwesenheitsListe, on_delete=models.CASCADE, related_name='termine')
    titel = models.CharField(max_length=255, blank=True)
    datum = models.DateField()
    beginn = models.TimeField(null=True, blank=True)
    ende = models.TimeField(null=True, blank=True)
    notizen = models.TextField(blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['datum', 'beginn']
        unique_together = [('liste', 'datum', 'beginn')]
        verbose_name = 'Termin'
        verbose_name_plural = 'Termine'

    def __str__(self):
        label = self.titel or self.datum.strftime('%d.%m.%Y')
        if self.beginn:
            label += f' {self.beginn.strftime("%H:%M")}'
        return label

    @property
    def ist_vergangen(self):
        heute = timezone.now().date()
        if self.datum < heute:
            return True
        if self.datum == heute and self.ende:
            return timezone.now().time() > self.ende
        return False


class Teilnehmer(models.Model):
    """User-Teilnahme an einer Anwesenheitsliste"""

    liste = models.ForeignKey(AnwesenheitsListe, on_delete=models.CASCADE, related_name='teilnehmer')
    keycloak_id = models.CharField(max_length=100)
    name = models.CharField(max_length=200)
    email = models.CharField(max_length=254, blank=True)
    aufgabe = models.CharField(max_length=200, blank=True, help_text="Zugewiesene Aufgabe/Rolle")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ausstehend')
    markiert_am = models.DateTimeField(null=True, blank=True)
    markiert_von = models.CharField(max_length=150, blank=True)
    notizen = models.TextField(blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = [('liste', 'keycloak_id')]
        verbose_name = 'Teilnehmer'
        verbose_name_plural = 'Teilnehmer'

    def __str__(self):
        return f'{self.name} ({self.get_status_display()})'

    def save(self, *args, **kwargs):
        if self.pk:
            try:
                old = Teilnehmer.objects.get(pk=self.pk)
                if old.status != self.status and self.status != 'ausstehend':
                    self.markiert_am = timezone.now()
            except Teilnehmer.DoesNotExist:
                pass
        super().save(*args, **kwargs)


class TerminAnwesenheit(models.Model):
    """Status eines Teilnehmers fuer einen bestimmten Termin"""

    teilnehmer = models.ForeignKey(Teilnehmer, on_delete=models.CASCADE, related_name='termin_anwesenheiten')
    termin = models.ForeignKey(Termin, on_delete=models.CASCADE, related_name='anwesenheiten')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ausstehend')
    markiert_am = models.DateTimeField(null=True, blank=True)
    markiert_von = models.CharField(max_length=150, blank=True)
    notizen = models.TextField(blank=True)

    class Meta:
        unique_together = [('teilnehmer', 'termin')]
        verbose_name = 'Termin-Anwesenheit'
        verbose_name_plural = 'Termin-Anwesenheiten'

    def __str__(self):
        return f'{self.teilnehmer.name} @ {self.termin} → {self.get_status_display()}'
