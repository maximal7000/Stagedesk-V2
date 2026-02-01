"""
Django Models für Haushalts-Management
"""
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator


class Haushalt(models.Model):
    """
    Haushalt-Modell
    Ein Benutzer kann mehrere Haushalte haben (z.B. Privat, WG, Firma)
    Mit getrennten Budgets für Konsumitiv und Investitiv
    """
    name = models.CharField(max_length=200, verbose_name="Name")
    beschreibung = models.TextField(blank=True, verbose_name="Beschreibung")
    
    # Getrennte Budgets
    budget_konsumitiv = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        default=0,
        verbose_name="Budget Konsumitiv (€)"
    )
    
    budget_investiv = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        default=0,
        verbose_name="Budget Investitiv (€)"
    )
    
    # Benutzer-Zuordnung (über Keycloak Username oder E-Mail)
    benutzer_id = models.CharField(
        max_length=255,
        db_index=True,
        verbose_name="Keycloak Benutzer-ID"
    )
    
    # Zeitstempel
    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Haushalt"
        verbose_name_plural = "Haushalte"
        ordering = ['-erstellt_am']
        
    def __str__(self):
        return self.name
    
    @property
    def gesamt_konsumitiv(self):
        """Summe aller konsumitiven Artikel"""
        return self.artikel.filter(kategorie='konsumitiv').aggregate(
            total=models.Sum(models.F('preis') * models.F('anzahl'))
        )['total'] or 0
    
    @property
    def gesamt_investiv(self):
        """Summe aller investitiven Artikel"""
        return self.artikel.filter(kategorie='investiv').aggregate(
            total=models.Sum(models.F('preis') * models.F('anzahl'))
        )['total'] or 0
    
    @property
    def gesamt_budget(self):
        """Gesamtbudget (konsumitiv + investiv)"""
        return self.budget_konsumitiv + self.budget_investiv
    
    @property
    def gesamt_ausgaben(self):
        """Gesamtausgaben (konsumitiv + investiv)"""
        return self.gesamt_konsumitiv + self.gesamt_investiv
    
    @property
    def verbleibendes_budget_konsumitiv(self):
        """Verbleibendes Budget für Konsumitiv"""
        return self.budget_konsumitiv - self.gesamt_konsumitiv
    
    @property
    def verbleibendes_budget_investiv(self):
        """Verbleibendes Budget für Investitiv"""
        return self.budget_investiv - self.gesamt_investiv
    
    @property
    def verbleibendes_budget(self):
        """Gesamtes verbleibendes Budget"""
        return self.verbleibendes_budget_konsumitiv + self.verbleibendes_budget_investiv


class Kategorie(models.Model):
    """
    Kategorie für Artikel (z.B. Lebensmittel, Elektronik, Möbel)
    """
    name = models.CharField(max_length=100, unique=True, verbose_name="Name")
    beschreibung = models.TextField(blank=True, verbose_name="Beschreibung")
    icon = models.CharField(max_length=50, blank=True, verbose_name="Icon (Emoji)")
    farbe = models.CharField(max_length=7, default="#3B82F6", verbose_name="Farbe (Hex)")
    
    class Meta:
        verbose_name = "Kategorie"
        verbose_name_plural = "Kategorien"
        ordering = ['name']
    
    def __str__(self):
        return self.name


class Artikel(models.Model):
    """
    Artikel-Modell
    Einzelne Ausgabe/Einkauf in einem Haushalt
    """
    KATEGORIE_CHOICES = [
        ('konsumitiv', 'Konsumitiv'),
        ('investiv', 'Investitiv'),
    ]
    
    haushalt = models.ForeignKey(
        Haushalt,
        on_delete=models.CASCADE,
        related_name='artikel',
        verbose_name="Haushalt"
    )
    
    name = models.CharField(max_length=300, verbose_name="Produktname")
    beschreibung = models.TextField(blank=True, verbose_name="Beschreibung")
    
    preis = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name="Preis (€)"
    )
    
    anzahl = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        verbose_name="Anzahl"
    )
    
    kategorie = models.CharField(
        max_length=20,
        choices=KATEGORIE_CHOICES,
        default='konsumitiv',
        verbose_name="Konsumitiv/Investitiv"
    )
    
    tag_kategorie = models.ForeignKey(
        Kategorie,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Tag-Kategorie"
    )
    
    link = models.URLField(
        blank=True,
        max_length=500,
        verbose_name="Produkt-Link"
    )
    
    bild_url = models.URLField(
        blank=True,
        max_length=500,
        verbose_name="Bild-URL"
    )
    
    # Zeitstempel
    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)
    
    # Gekauft am (optional)
    gekauft_am = models.DateField(null=True, blank=True, verbose_name="Gekauft am")
    
    class Meta:
        verbose_name = "Artikel"
        verbose_name_plural = "Artikel"
        ordering = ['-erstellt_am']
    
    def __str__(self):
        return f"{self.name} (€{self.gesamtpreis})"
    
    @property
    def gesamtpreis(self):
        """Gesamtpreis (Preis * Anzahl)"""
        return self.preis * self.anzahl
    
    # Keine automatische Kategorisierung mehr - Benutzer wählt manuell
