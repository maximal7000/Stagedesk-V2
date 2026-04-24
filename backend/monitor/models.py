"""
Monitor / Public Display Models
"""
import uuid
from datetime import date
from django.db import models
from django.utils import timezone


def monitor_upload_path(instance, filename):
    return f'monitor/{instance.typ}/{filename}'


class MonitorDatei(models.Model):
    """Uploadbare Dateien für das Monitor-Display (Logos, Bilder, PDFs)"""

    TYP_CHOICES = [
        ('logo', 'Logo'),
        ('bild', 'Slideshow-Bild'),
        ('pdf', 'PDF-Datei'),
        ('hintergrund', 'Hintergrundbild'),
    ]

    name = models.CharField(max_length=200)
    datei = models.FileField(upload_to=monitor_upload_path)
    typ = models.CharField(max_length=20, choices=TYP_CHOICES)
    reihenfolge = models.IntegerField(default=0)
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['typ', 'reihenfolge', '-erstellt_am']
        verbose_name = 'Monitor-Datei'
        verbose_name_plural = 'Monitor-Dateien'

    def __str__(self):
        return f"{self.get_typ_display()}: {self.name}"


class MonitorConfig(models.Model):
    """Konfiguration für ein Monitor-Profil (Multi-Profil-fähig)"""

    # ─── Profil ──────────────────────────
    name = models.CharField(max_length=100, default='Standard')
    slug = models.SlugField(max_length=50, unique=True)
    ist_standard = models.BooleanField(default=True)
    zeitplan = models.JSONField(default=list, blank=True,
        help_text='[{"tage": [0-6], "von": "HH:MM", "bis": "HH:MM"}]')

    LAYOUT_CHOICES = [
        ('standard', 'Standard-Layout'),
        ('stundenplan', 'Stundenplan-Vollbild'),
        ('onair', 'ON AIR Display'),
        ('abfahrten', 'Abfahrtsmonitor (ÖPNV)'),
        ('baukasten', 'Widget-Baukasten (frei)'),
    ]
    layout_modus = models.CharField(max_length=20, choices=LAYOUT_CHOICES, default='standard')

    # ─── Baukasten-Layout ────────────────
    layout_widgets = models.JSONField(default=list, blank=True,
        help_text='[{"i": "uid", "type": "uhr|...", "x": 0, "y": 0, "w": 4, "h": 4, "config": {}}]')
    baukasten_spalten = models.IntegerField(default=24, help_text="Grid-Spalten (12-48)")
    baukasten_zeilenhoehe = models.IntegerField(default=40, help_text="Pixel pro Grid-Einheit")

    # ─── Allgemein ─────────────────────────
    titel = models.CharField(max_length=200, default='Stagedesk Monitor')
    untertitel = models.CharField(max_length=300, blank=True)
    hintergrund_farbe = models.CharField(max_length=7, default='#0f172a')
    akzent_farbe = models.CharField(max_length=7, default='#da1f3d')

    # ─── Logo ──────────────────────────────
    zeige_logo = models.BooleanField(default=True)
    logo_url = models.URLField(blank=True, help_text="Fallback-URL wenn kein Upload")
    aktives_logo = models.ForeignKey(
        MonitorDatei, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='als_aktives_logo'
    )

    # ─── Widget-Toggles ───────────────────
    zeige_uhr = models.BooleanField(default=True)
    zeige_veranstaltungen = models.BooleanField(default=True)
    zeige_ankuendigungen = models.BooleanField(default=True)
    zeige_onair = models.BooleanField(default=True)
    zeige_countdown = models.BooleanField(default=True)

    # ─── Ticker ────────────────────────────
    zeige_ticker = models.BooleanField(default=False)
    ticker_text = models.CharField(max_length=500, blank=True)
    ticker_geschwindigkeit = models.IntegerField(default=50, help_text="Pixel pro Sekunde")

    # ─── Notfall ───────────────────────────
    notfall_aktiv = models.BooleanField(default=False)
    notfall_text = models.CharField(max_length=300, blank=True)

    # ─── Wetter ────────────────────────────
    zeige_wetter = models.BooleanField(default=False)
    wetter_stadt = models.CharField(max_length=100, blank=True)
    wetter_api_key = models.CharField(max_length=64, blank=True)
    wetter_cache = models.JSONField(default=dict, blank=True)
    wetter_cache_zeit = models.DateTimeField(null=True, blank=True)

    # ─── Slideshow ─────────────────────────
    zeige_slideshow = models.BooleanField(default=False)
    slideshow_intervall = models.IntegerField(default=10, help_text="Sekunden pro Bild")

    # ─── PDF ───────────────────────────────
    zeige_pdf = models.BooleanField(default=False)
    aktive_pdf = models.ForeignKey(
        MonitorDatei, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='als_aktive_pdf'
    )

    # ─── Theme ─────────────────────────────
    THEME_CHOICES = [
        ('custom', 'Benutzerdefiniert'),
        ('veranstaltung', 'Veranstaltung'),
        ('schulbetrieb', 'Schulbetrieb'),
        ('nacht', 'Nacht'),
    ]
    theme_preset = models.CharField(max_length=20, choices=THEME_CHOICES, default='custom')

    # ─── WebUntis ──────────────────────────
    zeige_webuntis = models.BooleanField(default=False)
    webuntis_url = models.URLField(blank=True)
    webuntis_zoom = models.IntegerField(default=100, help_text="Zoom in Prozent")
    webuntis_dark_mode = models.BooleanField(default=False)

    # ─── Hintergrundbild ─────────────────────
    zeige_hintergrundbild = models.BooleanField(default=False)
    aktives_hintergrundbild = models.ForeignKey(
        MonitorDatei, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='als_hintergrundbild'
    )

    # ─── QR-Code ─────────────────────────────
    zeige_qr_code = models.BooleanField(default=False)
    qr_code_url = models.URLField(blank=True, help_text="URL für den QR-Code")
    qr_code_label = models.CharField(max_length=100, blank=True)

    # ─── Freier Text ─────────────────────────
    zeige_freitext = models.BooleanField(default=False)
    freitext_titel = models.CharField(max_length=200, blank=True)
    freitext_inhalt = models.TextField(blank=True)

    # ─── Raumplan (WebUntis) ─────────────────
    zeige_raumplan = models.BooleanField(default=False)
    raumplan_server = models.CharField(max_length=200, blank=True, help_text="z.B. katharineum.webuntis.com")
    raumplan_schule = models.CharField(max_length=100, blank=True, help_text="Schulname in WebUntis")
    raumplan_raum = models.CharField(max_length=50, blank=True, help_text="Raum-Kürzel z.B. Aul")
    raumplan_benutzername = models.CharField(max_length=100, blank=True)
    raumplan_passwort = models.CharField(max_length=100, blank=True)
    raumplan_cache = models.JSONField(default=list, blank=True)
    raumplan_cache_zeit = models.DateTimeField(null=True, blank=True)

    # ─── Eigener Countdown ───────────────────
    zeige_eigener_countdown = models.BooleanField(default=False)
    eigener_countdown_name = models.CharField(max_length=200, blank=True)
    eigener_countdown_datum = models.DateTimeField(null=True, blank=True)

    # ─── Bildschirmschoner ───────────────────
    zeige_bildschirmschoner = models.BooleanField(default=False)
    bildschirmschoner_timeout = models.IntegerField(default=5, help_text="Minuten bis Bildschirmschoner")

    # ─── Seitenrotation ─────────────────────
    zeige_seitenrotation = models.BooleanField(default=False)
    seitenrotation_intervall = models.IntegerField(default=30, help_text="Sekunden pro Seite")
    seitenrotation_seiten = models.JSONField(default=list, blank=True)

    # ─── ÖPNV / Abfahrten ──────────────────
    zeige_oepnv = models.BooleanField(default=False)
    oepnv_stationen = models.JSONField(default=list, blank=True,
        help_text='[{"id": "...", "name": "...", "filter_linien": [], "filter_richtung": "", "zeige_bus": true, "zeige_bahn": true, "zeige_fernverkehr": true, "wegzeit_minuten": 0}]')
    oepnv_dauer = models.IntegerField(default=60, help_text="Minuten vorausschauen")
    oepnv_max_abfahrten = models.IntegerField(default=20, help_text="Max Abfahrten pro Station")
    oepnv_zeige_bus = models.BooleanField(default=True)
    oepnv_zeige_bahn = models.BooleanField(default=True)
    oepnv_zeige_fernverkehr = models.BooleanField(default=True)
    oepnv_api_db = models.BooleanField(default=True)
    oepnv_api_nahsh = models.BooleanField(default=True)
    oepnv_zeige_via = models.BooleanField(default=False, help_text="Zwischenhalte anzeigen")
    oepnv_zeige_relativ = models.BooleanField(default=True, help_text="Relative Zeit (in X min) anzeigen")
    oepnv_farbcodierung = models.BooleanField(default=True, help_text="Farbcodierte Zeitanzeige")
    oepnv_highlight_naechste = models.BooleanField(default=True, help_text="Nächste Abfahrt hervorheben")
    oepnv_auto_scroll = models.BooleanField(default=False, help_text="Auto-Scroll bei vielen Abfahrten")
    oepnv_stoerungsbanner = models.BooleanField(default=True, help_text="Störungsbanner anzeigen")
    OEPNV_SCHRIFT_CHOICES = [
        ('normal', 'Normal'),
        ('gross', 'Groß (HD)'),
        ('4k', 'Sehr groß (4K)'),
    ]
    oepnv_schriftgroesse = models.CharField(max_length=10, choices=OEPNV_SCHRIFT_CHOICES, default='gross', help_text="Schriftgröße für Abfahrtsanzeige")
    oepnv_layout_spalten = models.IntegerField(default=3, help_text="Anzahl Spalten im Layout (1-4)")

    # ─── Streik-Modus ────────────────────
    oepnv_streik_aktiv = models.BooleanField(default=False, help_text="Streik-Modus aktivieren")
    oepnv_streik_text = models.CharField(max_length=300, default='', blank=True, help_text="Streik-Banner Text")
    oepnv_streik_linien = models.JSONField(default=list, blank=True, help_text="Ausgeblendete Linien (z.B. ['Bus 1', 'RE80'])")
    oepnv_streik_typen = models.JSONField(default=list, blank=True, help_text="Ausgeblendete Typen (z.B. ['bus', 're'])")

    oepnv_cache = models.JSONField(null=True, blank=True)
    oepnv_cache_zeit = models.DateTimeField(null=True, blank=True)

    # ─── ON AIR ────────────────────────────
    ist_on_air = models.BooleanField(default=False)
    on_air_text = models.CharField(max_length=100, default='ON AIR')
    on_air_seit = models.DateTimeField(null=True, blank=True)

    # ─── ON AIR Anzeige ──────────────────
    ON_AIR_GROESSE_CHOICES = [
        ('klein', 'Klein'),
        ('mittel', 'Mittel'),
        ('gross', 'Groß'),
        ('riesig', 'Riesig'),
    ]
    ON_AIR_POSITION_CHOICES = [
        ('banner-oben', 'Banner oben (volle Breite)'),
        ('banner-unten', 'Banner unten (volle Breite)'),
        ('oben-rechts', 'Oben rechts'),
        ('oben-links', 'Oben links'),
        ('oben-mitte', 'Oben Mitte'),
        ('unten-rechts', 'Unten rechts'),
        ('unten-links', 'Unten links'),
        ('unten-mitte', 'Unten Mitte'),
        ('mitte', 'Mitte (Overlay)'),
    ]
    on_air_groesse = models.CharField(max_length=10, choices=ON_AIR_GROESSE_CHOICES, default='gross')
    on_air_position = models.CharField(max_length=20, choices=ON_AIR_POSITION_CHOICES, default='banner-oben')
    on_air_blinken = models.BooleanField(default=True)
    on_air_farbe = models.CharField(max_length=7, blank=True, help_text="Leer = Akzentfarbe")
    on_air_vollbild = models.BooleanField(default=False, help_text="Bei ON AIR automatisch Vollbild-Anzeige")

    # ─── Kamera ────────────────────────────
    zeige_kamera = models.BooleanField(default=False)
    kamera_url = models.URLField(blank=True, help_text="HLS/MJPEG-Stream oder iframe-URL")
    kamera_titel = models.CharField(max_length=100, blank=True)
    KAMERA_TYP_CHOICES = [
        ('img', 'MJPEG / Bild-Stream'),
        ('video', 'HLS / MP4'),
        ('iframe', 'iframe / Embed'),
    ]
    kamera_typ = models.CharField(max_length=10, choices=KAMERA_TYP_CHOICES, default='img')

    # ─── API ───────────────────────────────
    api_token = models.CharField(max_length=64, unique=True, blank=True,
                                 help_text="Token für externe ON AIR Steuerung")
    refresh_intervall = models.IntegerField(default=30)
    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Monitor-Profil'
        verbose_name_plural = 'Monitor-Profile'
        ordering = ['-ist_standard', 'name']

    def save(self, *args, **kwargs):
        if not self.api_token:
            self.api_token = uuid.uuid4().hex
        if not self.slug:
            self.slug = uuid.uuid4().hex[:8]
        if self.ist_standard:
            MonitorConfig.objects.exclude(pk=self.pk).filter(ist_standard=True).update(ist_standard=False)
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.ist_standard:
            return
        super().delete(*args, **kwargs)

    @classmethod
    def get(cls, slug=None):
        """Get active profile: by slug, by schedule, or standard fallback"""
        if slug:
            try:
                return cls.objects.get(slug=slug)
            except cls.DoesNotExist:
                pass

        now = timezone.localtime()
        wochentag = now.weekday()
        zeit = now.strftime('%H:%M')

        # Alle Profile laden, NICHT-Standard zuerst prüfen
        for config in cls.objects.order_by('ist_standard', 'name'):
            zeitplan = config.zeitplan
            if not zeitplan or not isinstance(zeitplan, list) or len(zeitplan) == 0:
                continue
            for entry in zeitplan:
                if not isinstance(entry, dict):
                    continue
                tage = entry.get('tage', [])
                von = entry.get('von', '00:00')
                bis = entry.get('bis', '23:59')
                if isinstance(tage, list) and wochentag in tage and von <= zeit <= bis:
                    return config

        standard = cls.objects.filter(ist_standard=True).first()
        if standard:
            return standard

        obj, _ = cls.objects.get_or_create(
            slug='standard',
            defaults={'name': 'Standard', 'ist_standard': True}
        )
        return obj

    def set_on_air(self, status: bool):
        self.ist_on_air = status
        self.on_air_seit = timezone.now() if status else None
        self.save(update_fields=['ist_on_air', 'on_air_seit', 'aktualisiert_am'])

    def get_logo_url(self):
        if self.aktives_logo and self.aktives_logo.datei:
            return self.aktives_logo.datei.url
        return self.logo_url

    def get_pdf_url(self):
        if self.aktive_pdf and self.aktive_pdf.datei:
            return self.aktive_pdf.datei.url
        return ''

    def get_hintergrundbild_url(self):
        if self.aktives_hintergrundbild and self.aktives_hintergrundbild.datei:
            return self.aktives_hintergrundbild.datei.url
        return ''

    def __str__(self):
        return f"{self.name} ({self.slug})"


class Bildschirm(models.Model):
    """Ein physischer Monitor-Bildschirm mit eigenem Zeitplan"""

    name = models.CharField(max_length=100, help_text="z.B. Eingang, Lehrerzimmer")
    slug = models.SlugField(max_length=50, unique=True)
    default_profil = models.ForeignKey(
        MonitorConfig, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='als_default_bildschirm',
        help_text="Fallback-Profil wenn kein Zeitplan greift"
    )
    zeitplan = models.JSONField(default=list, blank=True,
        help_text='[{"profil_id": 3, "tage": [0-6], "von": "HH:MM", "bis": "HH:MM"}]')
    power_zeitplan = models.JSONField(default=list, blank=True,
        help_text='[{"tage": [0-6], "von": "HH:MM", "bis": "HH:MM"}]. Leer = immer an.')
    ferien_modus = models.BooleanField(default=False,
        help_text="Wenn aktiv: Bildschirm grundsätzlich aus, nur Ausnahmen greifen.")
    power_ausnahmen = models.JSONField(default=list, blank=True,
        help_text='[{"von_datum": "YYYY-MM-DD", "bis_datum": "YYYY-MM-DD", "von": "HH:MM", "bis": "HH:MM", "notiz": ""}]')

    # CEC-Status vom Pi gemeldet
    cec_status = models.CharField(max_length=20, blank=True, default='',
        help_text="Letzter CEC-Status vom Pi (on/standby/unknown)")
    cec_status_zeit = models.DateTimeField(null=True, blank=True,
        help_text="Zeitpunkt der letzten CEC-Status-Meldung")

    erstellt_am = models.DateTimeField(auto_now_add=True)
    aktualisiert_am = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Bildschirm'
        verbose_name_plural = 'Bildschirme'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.slug})"

    @staticmethod
    def _zeit_im_fenster(zeit: str, von: str, bis: str) -> bool:
        """Prüft ob Uhrzeit HH:MM im Fenster [von, bis] liegt (auch über Mitternacht)."""
        if not von and not bis:
            return True
        von = von or '00:00'
        bis = bis or '23:59'
        if von <= bis:
            return von <= zeit <= bis
        # über Mitternacht
        return zeit >= von or zeit <= bis

    def _aktive_ausnahme(self, heute: date):
        """Gibt die erste Ausnahme zurück, deren Datumsbereich heute enthält."""
        for e in self.power_ausnahmen or []:
            if not isinstance(e, dict):
                continue
            try:
                von_d = date.fromisoformat(e.get('von_datum', ''))
                bis_d = date.fromisoformat(e.get('bis_datum') or e.get('von_datum', ''))
            except (ValueError, TypeError):
                continue
            if von_d <= heute <= bis_d:
                return e
        return None

    def get_power_state(self):
        """Soll der Bildschirm gerade an sein? Gibt True/False zurück.
        Reihenfolge: Ausnahme (Datum) > Ferienmodus > Wochentag-Zeitplan > immer an.
        Zeit wird in Europe/Berlin (settings.TIME_ZONE) gerechnet."""
        now = timezone.localtime()
        zeit = now.strftime('%H:%M')
        wochentag = now.weekday()

        ausnahme = self._aktive_ausnahme(now.date())
        if ausnahme is not None:
            return self._zeit_im_fenster(zeit, ausnahme.get('von', ''), ausnahme.get('bis', ''))

        if self.ferien_modus:
            return False

        zeitplan = self.power_zeitplan or []
        if not zeitplan:
            return True  # Kein Zeitplan = immer an
        for e in zeitplan:
            if not isinstance(e, dict):
                continue
            tage = e.get('tage', [])
            if not isinstance(tage, list) or wochentag not in tage:
                continue
            if self._zeit_im_fenster(zeit, e.get('von', ''), e.get('bis', '')):
                return True
        return False

    def get_active_profil(self):
        """Aktives Profil anhand des Zeitplans bestimmen."""
        now = timezone.localtime()
        wochentag = now.weekday()
        zeit = now.strftime('%H:%M')

        if self.zeitplan and isinstance(self.zeitplan, list):
            for entry in self.zeitplan:
                if not isinstance(entry, dict):
                    continue
                tage = entry.get('tage', [])
                von = entry.get('von', '00:00')
                bis = entry.get('bis', '23:59')
                profil_id = entry.get('profil_id')
                if (isinstance(tage, list) and wochentag in tage
                        and von <= zeit <= bis and profil_id):
                    try:
                        return MonitorConfig.objects.get(id=profil_id)
                    except MonitorConfig.DoesNotExist:
                        continue

        if self.default_profil:
            return self.default_profil
        return MonitorConfig.get()

    def get_active_klausur(self):
        """Aktive Klausur für diesen Bildschirm (wenn jetzt eine läuft)."""
        now = timezone.now()
        return (self.klausuren
                .filter(aktiv_von__lte=now, aktiv_bis__gte=now)
                .order_by('aktiv_von')
                .first())


class Klausur(models.Model):
    """Hinweis auf laufende Klausur — blockiert ausgewählte Bildschirme in Zeitfenster."""

    titel = models.CharField(max_length=200, default='Klausur')
    text = models.TextField(blank=True, help_text="Optionaler Zusatztext")
    aktiv_von = models.DateTimeField()
    aktiv_bis = models.DateTimeField()
    farbe = models.CharField(max_length=7, default='#1e40af', help_text="Hintergrundfarbe (Hex)")
    bildschirme = models.ManyToManyField(
        Bildschirm, related_name='klausuren', blank=True,
        help_text="Auf welchen Bildschirmen angezeigt"
    )
    erstellt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-aktiv_von']
        verbose_name = 'Klausur'
        verbose_name_plural = 'Klausuren'

    @property
    def ist_aktiv_jetzt(self):
        now = timezone.now()
        return self.aktiv_von <= now <= self.aktiv_bis

    def __str__(self):
        return f"{self.titel} ({self.aktiv_von:%d.%m. %H:%M}–{self.aktiv_bis:%H:%M})"


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
