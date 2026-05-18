"""
Aufgaben: schlanke globale Aufgabenliste mit User-Zuweisungen.
Wird auf dem Monitor als Vollbild-Anzeige ausgegeben.
"""
from django.db import models
from users.models import UserProfile


class Aufgabe(models.Model):
    STATUS_CHOICES = [
        ('offen', 'Offen'),
        ('abgeschlossen', 'Abgeschlossen'),
    ]

    titel = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='offen')
    sortierung = models.IntegerField(default=0,
        help_text="Frei wählbare Reihenfolge — kleiner Wert zuerst")
    zugewiesene = models.ManyToManyField(UserProfile, blank=True, related_name='aufgaben')

    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)
    erledigt_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['sortierung', 'id']
        verbose_name = 'Aufgabe'
        verbose_name_plural = 'Aufgaben'

    def __str__(self):
        return self.titel


class Subtask(models.Model):
    """Unteraufgabe einer Aufgabe (Checkliste)."""
    aufgabe = models.ForeignKey(Aufgabe, on_delete=models.CASCADE, related_name='subtasks')
    titel = models.CharField(max_length=300)
    erledigt = models.BooleanField(default=False)
    sortierung = models.IntegerField(default=0)
    erstellt_am = models.DateTimeField(auto_now_add=True)
    erledigt_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['sortierung', 'id']
        verbose_name = 'Unteraufgabe'
        verbose_name_plural = 'Unteraufgaben'

    def __str__(self):
        return f"{self.aufgabe_id}: {self.titel}"
