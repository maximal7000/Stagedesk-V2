"""
Kompetenzen-Modul: Kategorien, Gruppen, Kompetenzen pro User mit Ablauf-System.
"""
from django.db import models
from django.utils import timezone
from datetime import timedelta


DEFAULT_ABLAUF_STUFEN = [30, 30, 60, 120, 240]


class KompetenzSettings(models.Model):
    """Singleton für globale Kompetenz-Einstellungen."""
    standard_ablauf_stufen = models.JSONField(
        default=list,
        blank=True,
        help_text="Globaler Default für Ablauf-Stufen. Leer = System-Default.",
    )
    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Kompetenz-Einstellungen'
        verbose_name_plural = 'Kompetenz-Einstellungen'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def get_stufen(self):
        return self.standard_ablauf_stufen if self.standard_ablauf_stufen else DEFAULT_ABLAUF_STUFEN


class KompetenzKategorie(models.Model):
    name = models.CharField(max_length=100, unique=True)
    beschreibung = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True, help_text="Lucide-Icon Name")
    farbe = models.CharField(max_length=20, blank=True, help_text="z.B. blue, yellow, red")
    sortierung = models.IntegerField(default=0)

    class Meta:
        ordering = ['sortierung', 'name']
        verbose_name = 'Kompetenz-Kategorie'
        verbose_name_plural = 'Kompetenz-Kategorien'

    def __str__(self):
        return self.name


class KompetenzGruppe(models.Model):
    kategorie = models.ForeignKey(KompetenzKategorie, on_delete=models.CASCADE, related_name='gruppen')
    name = models.CharField(max_length=100)
    sortierung = models.IntegerField(default=0)

    class Meta:
        ordering = ['kategorie__sortierung', 'sortierung', 'name']
        unique_together = [('kategorie', 'name')]
        verbose_name = 'Kompetenz-Gruppe'
        verbose_name_plural = 'Kompetenz-Gruppen'

    def __str__(self):
        return f"{self.kategorie.name} / {self.name}"


class Kompetenz(models.Model):
    kategorie = models.ForeignKey(KompetenzKategorie, on_delete=models.CASCADE, related_name='kompetenzen')
    gruppe = models.ForeignKey(KompetenzGruppe, on_delete=models.SET_NULL, null=True, blank=True, related_name='kompetenzen')
    name = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    punkte = models.IntegerField(default=1, help_text="Gewichtung fürs Scoreboard")
    ablauf_stufen = models.JSONField(
        default=list,
        blank=True,
        help_text="Liste von Tagen bis zur nächsten Bestätigung. Leer = Standard.",
    )
    aktiv = models.BooleanField(default=True)
    sortierung = models.IntegerField(default=0)
    voraussetzungen = models.ManyToManyField(
        'self', symmetrical=False, blank=True, related_name='ermoeglicht',
        help_text="Kompetenzen die der User vorher haben muss"
    )
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['kategorie__sortierung', 'gruppe__sortierung', 'sortierung', 'name']
        unique_together = [('kategorie', 'name')]
        verbose_name = 'Kompetenz'
        verbose_name_plural = 'Kompetenzen'

    def __str__(self):
        return self.name

    def get_ablauf_stufen(self):
        if self.ablauf_stufen:
            return self.ablauf_stufen
        return KompetenzSettings.get_solo().get_stufen()

    def tage_bis_ablauf(self, stufe: int) -> int:
        stufen = self.get_ablauf_stufen()
        if stufe < 0:
            stufe = 0
        if stufe >= len(stufen):
            stufe = len(stufen) - 1
        return int(stufen[stufe])


class UserKompetenz(models.Model):
    user_keycloak_id = models.CharField(max_length=100, db_index=True)
    user_username = models.CharField(max_length=150, blank=True)
    kompetenz = models.ForeignKey(Kompetenz, on_delete=models.CASCADE, related_name='user_eintraege')
    hat_kompetenz = models.BooleanField(default=False)
    stufe = models.IntegerField(default=0, help_text="Index in ablauf_stufen, steigt bei jeder Bestätigung")
    erworben_am = models.DateTimeField(null=True, blank=True)
    letzte_bestaetigung_am = models.DateTimeField(null=True, blank=True)
    ablauf_am = models.DateTimeField(null=True, blank=True, db_index=True)
    bestaetigt_von_username = models.CharField(max_length=150, blank=True)
    notiz = models.TextField(blank=True)
    custom_ablauf_stufen = models.JSONField(
        default=list,
        blank=True,
        help_text="User-spezifische Ablauf-Stufen. Leer = nimm Kompetenz- bzw. Global-Default.",
    )
    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('user_keycloak_id', 'kompetenz')]
        ordering = ['kompetenz__kategorie__sortierung', 'kompetenz__sortierung']
        verbose_name = 'User-Kompetenz'
        verbose_name_plural = 'User-Kompetenzen'

    def __str__(self):
        status = "✓" if self.hat_kompetenz and not self.ist_abgelaufen else "✗"
        return f"{self.user_username or self.user_keycloak_id}: {self.kompetenz.name} [{status}]"

    @property
    def ist_abgelaufen(self) -> bool:
        if not self.ablauf_am:
            return False
        return timezone.now() > self.ablauf_am

    @property
    def tage_bis_ablauf(self):
        if not self.ablauf_am:
            return None
        delta = self.ablauf_am - timezone.now()
        return delta.days

    @property
    def ist_aktiv(self) -> bool:
        return self.hat_kompetenz and not self.ist_abgelaufen

    def get_effektive_stufen(self):
        """User-Override > Kompetenz-Stufen > Global-Default."""
        if self.custom_ablauf_stufen:
            return self.custom_ablauf_stufen
        return self.kompetenz.get_ablauf_stufen()

    def _tage_bis_ablauf_fuer_stufe(self, stufe: int) -> int:
        stufen = self.get_effektive_stufen()
        if stufe < 0:
            stufe = 0
        if stufe >= len(stufen):
            stufe = len(stufen) - 1
        return int(stufen[stufe])

    def bestaetigen(self, bestaetigt_von: str = "", erhoehe_stufe: bool = True):
        now = timezone.now()
        if not self.erworben_am:
            self.erworben_am = now
            self.stufe = 0
        elif erhoehe_stufe:
            max_stufe = len(self.get_effektive_stufen()) - 1
            if self.stufe < max_stufe:
                self.stufe += 1
        self.letzte_bestaetigung_am = now
        tage = self._tage_bis_ablauf_fuer_stufe(self.stufe)
        self.ablauf_am = None if tage <= 0 else now + timedelta(days=tage)
        self.hat_kompetenz = True
        if bestaetigt_von:
            self.bestaetigt_von_username = bestaetigt_von
        self.save()

    def entziehen(self):
        self.hat_kompetenz = False
        self.ablauf_am = None
        self.save()


class UserKompetenzHistorie(models.Model):
    AKTION_CHOICES = [
        ('erworben', 'Erworben'),
        ('bestaetigt', 'Bestätigt'),
        ('entzogen', 'Entzogen'),
        ('abgelaufen', 'Abgelaufen'),
    ]
    user_kompetenz = models.ForeignKey(UserKompetenz, on_delete=models.CASCADE, related_name='historie')
    user_keycloak_id = models.CharField(max_length=100, db_index=True)
    aktion = models.CharField(max_length=20, choices=AKTION_CHOICES)
    stufe_vorher = models.IntegerField(default=0)
    stufe_nachher = models.IntegerField(default=0)
    notiz = models.TextField(blank=True)
    geaendert_von_username = models.CharField(max_length=150, blank=True)
    erstellt_am = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-erstellt_am']
        verbose_name = 'Kompetenz-Historie'
        verbose_name_plural = 'Kompetenz-Historien'

    def __str__(self):
        return f"{self.user_keycloak_id} {self.aktion} @ {self.erstellt_am:%Y-%m-%d}"


class KompetenzBadge(models.Model):
    """Definiert Badges/Achievements, die User erreichen können."""
    TYP_CHOICES = [
        ('kategorie_komplett', 'Kategorie komplett'),
        ('gruppe_komplett', 'Gruppe komplett'),
        ('anzahl', 'Anzahl Kompetenzen'),
        ('punkte', 'Punkte-Schwelle'),
    ]
    name = models.CharField(max_length=100, unique=True)
    beschreibung = models.TextField(blank=True)
    typ = models.CharField(max_length=30, choices=TYP_CHOICES)
    kategorie = models.ForeignKey(KompetenzKategorie, on_delete=models.CASCADE, null=True, blank=True)
    gruppe = models.ForeignKey(KompetenzGruppe, on_delete=models.CASCADE, null=True, blank=True)
    schwelle = models.IntegerField(default=0, help_text="Für Typ anzahl/punkte")
    icon = models.CharField(max_length=50, blank=True)
    farbe = models.CharField(max_length=20, blank=True)

    class Meta:
        verbose_name = 'Badge'
        verbose_name_plural = 'Badges'

    def __str__(self):
        return self.name
