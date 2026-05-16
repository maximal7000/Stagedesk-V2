"""
AG-Aufgaben: schlanke globale Aufgabenliste mit User-Zuweisungen.
Wird auf dem Monitor als Vollbild-Anzeige ausgegeben.
"""
from django.db import models
from users.models import UserProfile


class AgAufgabe(models.Model):
    STATUS_CHOICES = [
        ('offen', 'Offen'),
        ('laeuft', 'Läuft'),
        ('fertig', 'Fertig'),
    ]

    titel = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='offen')
    sortierung = models.IntegerField(default=0)
    zugewiesene = models.ManyToManyField(UserProfile, blank=True, related_name='ag_aufgaben')

    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)
    erledigt_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['status', 'sortierung', 'id']
        verbose_name = 'AG-Aufgabe'
        verbose_name_plural = 'AG-Aufgaben'

    def __str__(self):
        return self.titel
