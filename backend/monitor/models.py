"""
Monitor / Public Display Models
"""
import secrets
import uuid
from datetime import date
from django.db import models
from django.utils import timezone


# Upload-Ordner bleiben die bisherigen (Spec-Vorgabe: Upload-Pfade ändern sich nicht),
# auch nachdem die gespeicherten kind-Werte englisch sind.
_UPLOAD_DIRS = {'image': 'bild', 'background': 'hintergrund'}


def monitor_upload_path(instance, filename):
    return f'monitor/{_UPLOAD_DIRS.get(instance.kind, instance.kind)}/{filename}'


class MediaFile(models.Model):
    """Uploadbare Dateien für das Monitor-Display (Logos, Bilder, PDFs)"""

    KIND_CHOICES = [
        ('logo', 'Logo'),
        ('image', 'Slideshow-Bild'),
        ('pdf', 'PDF-Datei'),
        ('background', 'Hintergrundbild'),
    ]

    name = models.CharField(max_length=200)
    file = models.FileField(upload_to=monitor_upload_path)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    sort_order = models.IntegerField(default=0)
    deleted_at = models.DateTimeField(null=True, blank=True, help_text="Papierkorb: gesetzt = gelöscht")
    created_at = models.DateTimeField(auto_now_add=True)

    # ─── Verarbeitung (PDF -> Seitenbilder) ───
    STATUS_CHOICES = [
        ('processing', 'Wird verarbeitet'),
        ('ready', 'Bereit'),
        ('failed', 'Fehlgeschlagen'),
    ]
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='ready')
    page_count = models.IntegerField(default=0)
    error = models.TextField(blank=True, default='')

    class Meta:
        # Feste Reihenfolge der Arten wie vor der Umbenennung (bild, hintergrund, logo, pdf)
        ordering = [
            models.Case(
                models.When(kind='image', then=0), models.When(kind='background', then=1),
                models.When(kind='logo', then=2), models.When(kind='pdf', then=3),
                default=4, output_field=models.IntegerField()),
            'sort_order', '-created_at',
        ]
        verbose_name = 'Monitor-Datei'
        verbose_name_plural = 'Monitor-Dateien'

    def __str__(self):
        return f"{self.get_kind_display()}: {self.name}"


class WebUntisLink(models.Model):
    """Benannter, wiederverwendbarer WebUntis-Link (Bibliothek).
    Wird von Profilen und Klausuren per FK referenziert, damit man Links
    einmal benennt und dann überall auswählt statt neu einzutippen."""
    name = models.CharField(max_length=120)
    url = models.URLField(max_length=800)
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'WebUntis-Link'
        verbose_name_plural = 'WebUntis-Links'

    def __str__(self):
        return self.name


class DisplayView(models.Model):
    """Konfiguration für ein Monitor-Profil (Multi-Profil-fähig)"""

    # ─── Profil ──────────────────────────
    name = models.CharField(max_length=100, default='Standard')
    slug = models.SlugField(max_length=50, unique=True)
    is_default = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0, help_text="Reihenfolge in der Profil-Liste")
    schedule = models.JSONField(default=list, blank=True,
        help_text='[{"days": [0-6], "from": "HH:MM", "until": "HH:MM"}]')

    LAYOUT_CHOICES = [
        ('standard', 'Standard-Layout'),
        ('timetable', 'Stundenplan-Vollbild'),
        ('on_air', 'ON AIR Display'),
        ('departures', 'Abfahrtsmonitor (ÖPNV)'),
        ('pdf_fullscreen', 'PDF-Vollbild'),
        ('image_fullscreen', 'Bild-Vollbild'),
        ('split', 'Splitscreen'),
    ]
    layout = models.CharField(max_length=20, choices=LAYOUT_CHOICES, default='standard')
    deleted_at = models.DateTimeField(null=True, blank=True, help_text="Papierkorb: gesetzt = gelöscht")

    # Bei Vollbild-Layouts (PDF/Bild): den Standard-Header (Titel/Logo) oben anzeigen.
    fullscreen_header = models.BooleanField(default=False,
        help_text="Vollbild-Layouts: Standard-Header (Titel/Logo) oben einblenden")

    # ─── Ansichtsart und Stil ───
    KIND_CHOICES = [
        ('departures', 'Abfahrten'),
        ('substitutions', 'Vertretungsplan'),
        ('split', 'Geteilte Ansicht'),
        ('media', 'Medien'),
        ('info', 'Info'),
        ('rotation', 'Rotation'),
    ]
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='info')
    STYLE_CHOICES = [
        ('auto', 'Automatisch'),
        ('ci', 'CI'),
        ('dense', 'Dicht'),
        ('dark', 'Dunkel'),
    ]
    style = models.CharField(max_length=10, choices=STYLE_CHOICES, default='auto')
    ON_AIR_BEHAVIOR_CHOICES = [
        ('fullscreen', 'Vollbild'),
        ('split', 'Geteilt'),
        ('none', 'Keine'),
    ]
    on_air_behavior = models.CharField(max_length=12, choices=ON_AIR_BEHAVIOR_CHOICES, default='fullscreen')
    rotation_items = models.JSONField(default=list, blank=True,
        help_text='[{"view_id": 3, "seconds": 15}]')
    media_items = models.JSONField(default=list, blank=True)
    media_seconds = models.IntegerField(default=10, help_text="Sekunden pro Medium")
    substitutions_next_day = models.BooleanField(default=True)
    page_seconds = models.IntegerField(default=15, help_text="Sekunden pro Seite")

    # ─── Splitscreen (layout='split') ───
    SPLIT_CONTENT_CHOICES = [
        ('exam',     'Klausur'),
        ('on_air',   'On Air'),
        ('webuntis', 'WebUntis'),
        ('clock',    'Uhr'),
        ('empty',    'Leer'),
        ('substitutions', 'Vertretungsplan'),
        ('departures',    'Abfahrten'),
    ]
    split_left = models.CharField(max_length=20, choices=SPLIT_CONTENT_CHOICES, default='webuntis',
        help_text="Inhalt der linken Split-Seite")
    split_right = models.CharField(max_length=20, choices=SPLIT_CONTENT_CHOICES, default='exam',
        help_text="Inhalt der rechten Split-Seite")
    split_left_percent = models.IntegerField(default=50,
        help_text="Breite der linken Seite in Prozent (20–80)")

    # ─── Allgemein ─────────────────────────
    title = models.CharField(max_length=200, default='Stagedesk Monitor')
    subtitle = models.CharField(max_length=300, blank=True)
    background_color = models.CharField(max_length=7, default='#0f172a')
    accent_color = models.CharField(max_length=7, default='#da1f3d')

    # ─── Logo ──────────────────────────────
    show_logo = models.BooleanField(default=True)
    logo_url = models.URLField(blank=True, help_text="Fallback-URL wenn kein Upload")
    active_logo = models.ForeignKey(
        MediaFile, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='as_active_logo'
    )

    # ─── Widget-Toggles ───────────────────
    show_clock = models.BooleanField(default=True)
    show_events = models.BooleanField(default=True)
    show_announcements = models.BooleanField(default=True)
    show_on_air = models.BooleanField(default=True)
    show_countdown = models.BooleanField(default=True)

    # ─── Notfall ───────────────────────────
    emergency_active = models.BooleanField(default=False)
    emergency_text = models.CharField(max_length=300, blank=True)

    # ─── Wetter ────────────────────────────
    show_weather = models.BooleanField(default=False)
    weather_city = models.CharField(max_length=100, blank=True)
    weather_api_key = models.CharField(max_length=64, blank=True)
    weather_cache = models.JSONField(default=dict, blank=True)
    weather_cache_at = models.DateTimeField(null=True, blank=True)

    # ─── Slideshow ─────────────────────────
    show_slideshow = models.BooleanField(default=False)
    slideshow_interval = models.IntegerField(default=10, help_text="Sekunden pro Bild")

    # ─── PDF ───────────────────────────────
    show_pdf = models.BooleanField(default=False)
    active_pdf = models.ForeignKey(
        MediaFile, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='as_active_pdf'
    )
    # PDF-Vollbild-Konfiguration (layout='pdf_fullscreen')
    PDF_MODE_CHOICES = [
        ('cycle', 'Seiten automatisch durchschalten'),
        ('static', 'Feste Seite anzeigen'),
        ('selection', 'Nur bestimmte Seiten'),
    ]
    pdf_mode = models.CharField(max_length=20, choices=PDF_MODE_CHOICES, default='cycle')
    pdf_interval = models.IntegerField(default=10, help_text="Sekunden pro Seite (Durchschalten)")
    pdf_per_screen = models.IntegerField(default=1, help_text="Seiten pro Ansicht (1 oder 2)")
    pdf_pages = models.CharField(max_length=200, blank=True, default='',
        help_text="Seiten-Auswahl, z.B. '1,3,5-7'. Leer = alle.")
    pdf_static_page = models.IntegerField(default=1, help_text="Feste Seite (Modus 'static')")

    # ─── Bild-Vollbild (layout='image_fullscreen') ───
    active_image = models.ForeignKey(
        MediaFile, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='as_active_image'
    )
    IMAGE_FIT_CHOICES = [
        ('contain', 'Einpassen (ganzes Bild sichtbar)'),
        ('cover',   'Füllen (Bildschirm ausfüllen, ggf. beschnitten)'),
        ('fill',    'Strecken (verzerrt auf Bildschirmgröße)'),
    ]
    image_fit = models.CharField(max_length=10, choices=IMAGE_FIT_CHOICES, default='contain',
        help_text="Wie das Bild auf den Bildschirm skaliert wird")
    image_focus_x = models.IntegerField(default=50, help_text="Fokuspunkt X in Prozent (Modus Füllen)")
    image_focus_y = models.IntegerField(default=50, help_text="Fokuspunkt Y in Prozent (Modus Füllen)")

    # ─── Theme ─────────────────────────────
    THEME_CHOICES = [
        ('custom', 'Benutzerdefiniert'),
        ('event', 'Veranstaltung'),
        ('school', 'Schulbetrieb'),
        ('night', 'Nacht'),
    ]
    theme_preset = models.CharField(max_length=20, choices=THEME_CHOICES, default='custom')

    # ─── WebUntis ──────────────────────────
    show_webuntis = models.BooleanField(default=False)
    webuntis_url = models.URLField(blank=True)
    webuntis_url_next_day = models.URLField(blank=True,
        help_text="Kompakter Link (nur 1 Tag) — wird im Splitscreen genutzt")
    # Optionale Referenzen auf die Link-Bibliothek (haben Vorrang vor den URL-Feldern)
    webuntis_link = models.ForeignKey('WebUntisLink', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='as_view_link',
        help_text="Gespeicherter Link (2 Tage) — überschreibt webuntis_url")
    webuntis_link_next_day = models.ForeignKey('WebUntisLink', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='as_view_link_next_day',
        help_text="Gespeicherter Link (1 Tag) — überschreibt webuntis_url_next_day")
    webuntis_zoom = models.IntegerField(default=100, help_text="Zoom in Prozent")
    webuntis_dark_mode = models.BooleanField(default=False)

    # ─── Hintergrundbild ─────────────────────
    show_background_image = models.BooleanField(default=False)
    active_background_image = models.ForeignKey(
        MediaFile, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='as_background_image'
    )

    # ─── QR-Code ─────────────────────────────
    show_qr_code = models.BooleanField(default=False)
    qr_code_url = models.URLField(blank=True, help_text="URL für den QR-Code")
    qr_code_label = models.CharField(max_length=100, blank=True)

    # ─── Freier Text ─────────────────────────
    show_free_text = models.BooleanField(default=False)
    free_text_title = models.CharField(max_length=200, blank=True)
    free_text_content = models.TextField(blank=True)

    # ─── Eigener Countdown ───────────────────
    show_custom_countdown = models.BooleanField(default=False)
    custom_countdown_name = models.CharField(max_length=200, blank=True)
    custom_countdown_date = models.DateTimeField(null=True, blank=True)

    # ─── Seitenrotation ─────────────────────
    show_page_rotation = models.BooleanField(default=False)
    page_rotation_interval = models.IntegerField(default=30, help_text="Sekunden pro Seite")
    page_rotation_pages = models.JSONField(default=list, blank=True)

    # ─── ÖPNV / Abfahrten ──────────────────
    show_transit = models.BooleanField(default=False)
    transit_stops = models.JSONField(default=list, blank=True,
        help_text='[{"id": "...", "name": "...", "filter_lines": [], "filter_direction": "", "show_bus": true, "show_rail": true, "show_long_distance": true, "walk_minutes": 0}]')
    transit_duration = models.IntegerField(default=60, help_text="Minuten vorausschauen")
    transit_max_departures = models.IntegerField(default=20, help_text="Max Abfahrten pro Station")
    transit_show_bus = models.BooleanField(default=True)
    transit_show_rail = models.BooleanField(default=True)
    transit_show_long_distance = models.BooleanField(default=True)
    transit_source_db = models.BooleanField(default=True)
    transit_source_nahsh = models.BooleanField(default=True)
    transit_show_via = models.BooleanField(default=False, help_text="Zwischenhalte anzeigen")
    transit_show_relative = models.BooleanField(default=True, help_text="Relative Zeit (in X min) anzeigen")
    transit_color_coding = models.BooleanField(default=True, help_text="Farbcodierte Zeitanzeige")
    transit_highlight_next = models.BooleanField(default=True, help_text="Nächste Abfahrt hervorheben")
    transit_auto_scroll = models.BooleanField(default=False, help_text="Auto-Scroll bei vielen Abfahrten")
    transit_disruption_banner = models.BooleanField(default=True, help_text="Störungsbanner anzeigen")
    TRANSIT_FONT_SIZE_CHOICES = [
        ('normal', 'Normal'),
        ('large', 'Groß (HD)'),
        ('4k', 'Sehr groß (4K)'),
    ]
    transit_font_size = models.CharField(max_length=10, choices=TRANSIT_FONT_SIZE_CHOICES, default='large', help_text="Schriftgröße für Abfahrtsanzeige")
    transit_columns = models.IntegerField(default=3, help_text="Anzahl Spalten im Layout (1-4)")

    # ─── Streik-Modus ────────────────────
    transit_strike_active = models.BooleanField(default=False, help_text="Streik-Modus aktivieren")
    transit_strike_text = models.CharField(max_length=300, default='', blank=True, help_text="Streik-Banner Text")
    transit_strike_lines = models.JSONField(default=list, blank=True, help_text="Ausgeblendete Linien (z.B. ['Bus 1', 'RE80'])")
    transit_strike_types = models.JSONField(default=list, blank=True, help_text="Ausgeblendete Typen (z.B. ['bus', 're'])")

    transit_cache = models.JSONField(null=True, blank=True)
    transit_cache_at = models.DateTimeField(null=True, blank=True)

    # ─── Störungsmeldungen (Bahn: NAH.SH · Bus: SWL Lübeck · manuell) ───
    transit_disruption_rail = models.BooleanField(default=True, help_text="Zug-Störungen (NAH.SH HAFAS)")
    transit_disruption_bus = models.BooleanField(default=True, help_text="Bus-Störungen (Stadtverkehr Lübeck)")
    transit_disruption_rail_lines = models.JSONField(default=list, blank=True,
        help_text="Zug-Linienfilter, z.B. ['RE8','RB85']. Leer = alle mit erkennbarer Linie.")
    transit_disruption_bus_lines = models.JSONField(default=list, blank=True,
        help_text="Bus-Linienfilter, z.B. ['1','3','16']. Leer = alle.")
    transit_disruption_manual = models.JSONField(default=list, blank=True,
        help_text="Manuelle Meldungen: [{'title':..., 'text':..., 'image':..., 'highlighted':...}]")
    transit_disruption_cache = models.JSONField(default=list, blank=True)
    transit_disruption_cache_at = models.DateTimeField(null=True, blank=True)
    transit_disruption_hidden = models.JSONField(default=list, blank=True,
        help_text="IDs manuell ausgeblendeter Störungen (auto-bereinigt wenn Meldung verschwindet)")
    TRANSIT_DISRUPTION_POSITION_CHOICES = [
        ('bottom', 'Unten (Streifen)'),
        ('column', 'Eigene Spalte'),
    ]
    transit_disruption_position = models.CharField(max_length=10, choices=TRANSIT_DISRUPTION_POSITION_CHOICES,
        default='bottom', help_text="Störungs-Anzeige: 'bottom' (Streifen) oder 'column' (eigene Spalte)")

    # ─── ON AIR ────────────────────────────
    is_on_air = models.BooleanField(default=False)
    on_air_text = models.CharField(max_length=100, default='ON AIR')
    on_air_since = models.DateTimeField(null=True, blank=True)

    # ─── ON AIR Anzeige ──────────────────
    ON_AIR_SIZE_CHOICES = [
        ('small', 'Klein'),
        ('medium', 'Mittel'),
        ('large', 'Groß'),
        ('huge', 'Riesig'),
    ]
    ON_AIR_POSITION_CHOICES = [
        ('banner-top', 'Banner oben (volle Breite)'),
        ('banner-bottom', 'Banner unten (volle Breite)'),
        ('top-right', 'Oben rechts'),
        ('top-left', 'Oben links'),
        ('top-center', 'Oben Mitte'),
        ('bottom-right', 'Unten rechts'),
        ('bottom-left', 'Unten links'),
        ('bottom-center', 'Unten Mitte'),
        ('center', 'Mitte (Overlay)'),
    ]
    on_air_size = models.CharField(max_length=10, choices=ON_AIR_SIZE_CHOICES, default='large')
    on_air_position = models.CharField(max_length=20, choices=ON_AIR_POSITION_CHOICES, default='banner-top')
    on_air_blink = models.BooleanField(default=True)
    on_air_color = models.CharField(max_length=7, blank=True, help_text="Leer = Akzentfarbe")
    on_air_fullscreen = models.BooleanField(default=False, help_text="Bei ON AIR automatisch Vollbild-Anzeige")
    on_air_split = models.BooleanField(default=False,
        help_text="Bei ON AIR Splitscreen (ON AIR + Stundenplan) statt reinem Vollbild")
    SIDE_CHOICES = [('left', 'Links'), ('right', 'Rechts')]
    on_air_split_side = models.CharField(max_length=6, choices=SIDE_CHOICES, default='right',
        help_text="Auf welcher Seite ON AIR im Splitscreen steht")

    # ─── API ───────────────────────────────
    api_token = models.CharField(max_length=64, unique=True, blank=True,
                                 help_text="Token für externe ON AIR Steuerung")
    refresh_interval = models.IntegerField(default=30)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Monitor-Profil'
        verbose_name_plural = 'Monitor-Profile'
        ordering = ['-is_default', 'name']

    def save(self, *args, **kwargs):
        if not self.api_token:
            self.api_token = uuid.uuid4().hex
        if not self.slug:
            self.slug = uuid.uuid4().hex[:8]
        if self.is_default:
            DisplayView.objects.exclude(pk=self.pk).filter(is_default=True).update(is_default=False)
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.is_default:
            return
        super().delete(*args, **kwargs)

    @classmethod
    def get(cls, slug=None):
        """Get active view: by slug, by schedule, or default fallback"""
        if slug:
            try:
                return cls.objects.get(slug=slug, deleted_at__isnull=True)
            except cls.DoesNotExist:
                pass

        now = timezone.localtime()
        weekday = now.weekday()
        time = now.strftime('%H:%M')

        # Alle Profile laden, NICHT-Standard zuerst prüfen (gelöschte ausschließen)
        for view in cls.objects.filter(deleted_at__isnull=True).order_by('is_default', 'sort_order', 'name'):
            schedule = view.schedule
            if not schedule or not isinstance(schedule, list) or len(schedule) == 0:
                continue
            for entry in schedule:
                if not isinstance(entry, dict):
                    continue
                days = entry.get('days', [])
                start = entry.get('from', '00:00')
                end = entry.get('until', '23:59')
                if isinstance(days, list) and weekday in days and start <= time <= end:
                    return view

        default = cls.objects.filter(is_default=True, deleted_at__isnull=True).first()
        if default:
            return default

        obj, _ = cls.objects.get_or_create(
            slug='standard',
            defaults={'name': 'Standard', 'is_default': True}
        )
        if obj.deleted_at is not None:
            obj.deleted_at = None
            obj.save(update_fields=['deleted_at'])
        return obj

    def set_on_air(self, status: bool):
        self.is_on_air = status
        self.on_air_since = timezone.now() if status else None
        self.save(update_fields=['is_on_air', 'on_air_since', 'updated_at'])

    def get_logo_url(self):
        if self.active_logo and self.active_logo.file:
            return self.active_logo.file.url
        return self.logo_url

    def get_pdf_url(self):
        if self.active_pdf and self.active_pdf.file:
            return self.active_pdf.file.url
        return ''

    def get_background_image_url(self):
        if self.active_background_image and self.active_background_image.file:
            return self.active_background_image.file.url
        return ''

    def get_image_url(self):
        if self.active_image and self.active_image.file:
            return self.active_image.file.url
        return ''

    def get_webuntis_url(self):
        """Gespeicherter Link (2 Tage) hat Vorrang, sonst Freitext-URL."""
        if self.webuntis_link and self.webuntis_link.url:
            return self.webuntis_link.url
        return self.webuntis_url

    def get_webuntis_url_next_day(self):
        """Gespeicherter Link (1 Tag) hat Vorrang, sonst Freitext-URL."""
        if self.webuntis_link_next_day and self.webuntis_link_next_day.url:
            return self.webuntis_link_next_day.url
        return self.webuntis_url_next_day

    def effective_style(self):
        """Stil der Anzeige: 'auto' wird aus der Ansichtsart abgeleitet."""
        if self.style != 'auto':
            return self.style
        return 'dense' if self.kind in ('departures', 'substitutions', 'split') else 'ci'

    def __str__(self):
        return f"{self.name} ({self.slug})"


def validate_rotation_items(items, own_id=None):
    """Prüft die Einträge einer Rotations-Ansicht. Wirft ValueError mit deutscher Meldung."""
    if not isinstance(items, list) or not items:
        raise ValueError('Die Rotation braucht mindestens eine Ansicht.')
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('Ungültiger Rotationseintrag. Bitte Ansicht und Dauer neu wählen.')
        view_id = item.get('view_id')
        seconds = item.get('seconds')
        if isinstance(seconds, bool) or not isinstance(seconds, int) or not 5 <= seconds <= 3600:
            raise ValueError('Die Dauer pro Ansicht muss zwischen 5 und 3600 Sekunden liegen.')
        if isinstance(view_id, bool) or not isinstance(view_id, int):
            raise ValueError('Ungültiger Rotationseintrag. Bitte eine Ansicht wählen.')
        if own_id is not None and view_id == own_id:
            raise ValueError('Eine Rotation kann sich nicht selbst enthalten.')
        target = DisplayView.objects.filter(id=view_id, deleted_at__isnull=True).first()
        if target is None:
            raise ValueError(f'Die Ansicht {view_id} existiert nicht. Bitte eine andere wählen.')
        if target.kind == 'rotation':
            raise ValueError('Eine Rotation kann keine andere Rotation enthalten.')
    return items


def generate_access_key():
    return secrets.token_urlsafe(24)[:32]


class Screen(models.Model):
    """Ein physischer Monitor-Bildschirm mit eigenem Zeitplan"""

    SCALE_CHOICES = [(v, v if v == 'auto' else f'{v} %')
                     for v in ('auto', '75', '90', '100', '110', '125', '150', '175', '200')]
    ORIENTATION_CHOICES = [('landscape', 'Querformat'), ('portrait', 'Hochformat')]
    location = models.CharField(max_length=100, blank=True, default='')
    scale = models.CharField(max_length=4, choices=SCALE_CHOICES, default='auto')
    orientation = models.CharField(max_length=10, choices=ORIENTATION_CHOICES, default='landscape')
    access_key = models.CharField(max_length=32, unique=True, default=generate_access_key)
    off_during_holidays = models.BooleanField(default=True)
    off_until = models.DateTimeField(null=True, blank=True)

    name = models.CharField(max_length=100, help_text="z.B. Eingang, Lehrerzimmer")
    slug = models.SlugField(max_length=50, unique=True)
    default_view = models.ForeignKey(
        DisplayView, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='as_default_screen',
        help_text="Fallback-Profil wenn kein Zeitplan greift"
    )
    schedule = models.JSONField(default=list, blank=True,
        help_text='[{"view_id": 3, "days": [0-6], "from": "HH:MM", "until": "HH:MM"}]')
    # Manueller Sofort-Override (Cockpit): zeigt bis zum Zurücksetzen/Ablauf diese Ansicht.
    override_view = models.ForeignKey(
        DisplayView, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='as_override_screen',
        help_text="Sofort-Override: erzwingt diese Ansicht (vor Event/Zeitplan)")
    override_until = models.DateTimeField(null=True, blank=True,
        help_text="Optionales Ablaufdatum des Overrides; leer = bis manuell zurückgesetzt")
    power_schedule = models.JSONField(default=list, blank=True,
        help_text='[{"days": [0-6], "from": "HH:MM", "until": "HH:MM"}]. Leer = immer an.')
    holiday_mode = models.BooleanField(default=False,
        help_text="Wenn aktiv: Bildschirm grundsätzlich aus, nur Ausnahmen greifen.")
    power_exceptions = models.JSONField(default=list, blank=True,
        help_text='[{"from_date": "YYYY-MM-DD", "until_date": "YYYY-MM-DD", "from": "HH:MM", "until": "HH:MM", "note": ""}]')
    reload_requested_at = models.DateTimeField(null=True, blank=True,
        help_text="Wird beim Reload-Knopf gesetzt; das Display lädt sich neu wenn dieser Wert steigt.")

    # Manueller Override: deaktiviert den Zeitplan und erzwingt einen Zustand.
    POWER_MODE_CHOICES = [
        ('auto', 'Automatisch (Zeitplan)'),
        ('manual_on', 'Manuell — Immer An'),
        ('manual_off', 'Manuell — Immer Aus'),
    ]
    power_mode = models.CharField(max_length=20, choices=POWER_MODE_CHOICES, default='auto')

    # CEC-Status vom Pi gemeldet
    cec_status = models.CharField(max_length=20, blank=True, default='',
        help_text="Letzter CEC-Status vom Pi (on/standby/unknown)")
    cec_status_at = models.DateTimeField(null=True, blank=True,
        help_text="Zeitpunkt der letzten CEC-Status-Meldung")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Bildschirm'
        verbose_name_plural = 'Bildschirme'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.slug})"

    @staticmethod
    def _time_in_window(time: str, start: str, end: str) -> bool:
        """Prüft ob Uhrzeit HH:MM im Fenster [start, end] liegt (auch über Mitternacht)."""
        if not start and not end:
            return True
        start = start or '00:00'
        end = end or '23:59'
        if start <= end:
            return start <= time <= end
        # über Mitternacht
        return time >= start or time <= end

    def _active_exception(self, today: date):
        """Gibt die erste Ausnahme zurück, deren Datumsbereich heute enthält."""
        for e in self.power_exceptions or []:
            if not isinstance(e, dict):
                continue
            try:
                start_date = date.fromisoformat(e.get('from_date', ''))
                end_date = date.fromisoformat(e.get('until_date') or e.get('from_date', ''))
            except (ValueError, TypeError):
                continue
            if start_date <= today <= end_date:
                return e
        return None

    def get_power_state(self):
        """Soll der Bildschirm gerade an sein? Gibt True/False zurück.
        Reihenfolge: Manueller Modus > Ausnahme (Datum) > Ferienmodus > Wochentag-Zeitplan > immer an.
        Zeit wird in Europe/Berlin (settings.TIME_ZONE) gerechnet."""
        # Manueller Override hat höchste Priorität
        if self.power_mode == 'manual_on':
            return True
        if self.power_mode == 'manual_off':
            return False

        now = timezone.localtime()
        time = now.strftime('%H:%M')
        weekday = now.weekday()

        exception = self._active_exception(now.date())
        if exception is not None:
            return self._time_in_window(time, exception.get('from', ''), exception.get('until', ''))

        if self.holiday_mode:
            return False

        schedule = self.power_schedule or []
        if not schedule:
            return True  # Kein Zeitplan = immer an
        for e in schedule:
            if not isinstance(e, dict):
                continue
            days = e.get('days', [])
            if not isinstance(days, list) or weekday not in days:
                continue
            if self._time_in_window(time, e.get('from', ''), e.get('until', '')):
                return True
        return False

    def get_active_event_view(self):
        """Profil eines aktiven Events für diesen Bildschirm (hat Vorrang vor Zeitplan).
        Manuell aktivierte Events (is_active=True) gehen vor Zeitfenster-Events."""
        now = timezone.now()
        assignments = (self.event_assignments
                       .select_related('event', 'view')
                       .order_by('-event__is_active', '-event__created_at'))
        for a in assignments:
            ev = a.event
            active = ev.is_active or (ev.active_from and ev.active_until and ev.active_from <= now <= ev.active_until)
            if active and a.view_id:
                return a.view
        return None

    def get_active_view(self):
        """Aktives Profil bestimmen: Sofort-Override > aktives Event > Zeitplan > Default."""
        # Manueller Sofort-Override (Cockpit) hat höchste Priorität
        if (self.override_view_id and self.override_view and self.override_view.deleted_at is None
                and (self.override_until is None or self.override_until > timezone.now())):
            return self.override_view

        event_view = self.get_active_event_view()
        if event_view and event_view.deleted_at is None:
            return event_view

        now = timezone.localtime()
        weekday = now.weekday()
        time = now.strftime('%H:%M')

        if self.schedule and isinstance(self.schedule, list):
            for entry in self.schedule:
                if not isinstance(entry, dict):
                    continue
                days = entry.get('days', [])
                start = entry.get('from', '00:00')
                end = entry.get('until', '23:59')
                view_id = entry.get('view_id')
                if (isinstance(days, list) and weekday in days
                        and start <= time <= end and view_id):
                    try:
                        return DisplayView.objects.get(id=view_id, deleted_at__isnull=True)
                    except DisplayView.DoesNotExist:
                        continue

        if self.default_view and self.default_view.deleted_at is None:
            return self.default_view
        return DisplayView.get()

    def get_active_exam(self):
        """Aktive Klausur für diesen Bildschirm (wenn jetzt eine läuft)."""
        now = timezone.now()
        return (self.exams
                .filter(active_from__lte=now, active_until__gte=now)
                .order_by('active_from')
                .first())


class HolidayPeriod(models.Model):
    """Ferienzeitraum: Bildschirme mit off_during_holidays bleiben darin aus."""
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['start_date']
        verbose_name = 'Ferienzeitraum'
        verbose_name_plural = 'Ferienzeiträume'

    def __str__(self):
        return self.name


class EmergencyTemplate(models.Model):
    """Vorlage für eine Notfallmeldung."""
    title = models.CharField(max_length=100)
    text = models.CharField(max_length=300)
    note = models.CharField(max_length=300, blank=True, default='')
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = 'Notfall-Vorlage'
        verbose_name_plural = 'Notfall-Vorlagen'

    def __str__(self):
        return self.title


class MediaPage(models.Model):
    """Eine gerenderte Seite einer PDF-Datei."""
    file = models.ForeignKey(MediaFile, on_delete=models.CASCADE, related_name='pages')
    index = models.IntegerField()
    image = models.ImageField(upload_to='monitor/pdf_pages/')
    width = models.IntegerField(default=0)
    height = models.IntegerField(default=0)
    orientation = models.CharField(max_length=10, default='landscape')

    class Meta:
        ordering = ['file', 'index']
        constraints = [
            models.UniqueConstraint(fields=['file', 'index'], name='unique_media_page_index'),
        ]

    def __str__(self):
        return f"{self.file_id} Seite {self.index}"


class Exam(models.Model):
    """Hinweis auf laufende Klausur — blockiert ausgewählte Bildschirme in Zeitfenster."""

    title = models.CharField(max_length=200, default='Klausur')
    text = models.TextField(blank=True, help_text="Optionaler Zusatztext")
    active_from = models.DateTimeField()
    active_until = models.DateTimeField()
    color = models.CharField(max_length=7, default='#1e40af', help_text="Hintergrundfarbe (Hex)")
    screens = models.ManyToManyField(
        Screen, related_name='exams', blank=True,
        help_text="Auf welchen Bildschirmen angezeigt"
    )

    # ─── Anzeige während der Klausur ───
    DISPLAY_MODE_CHOICES = [
        ('fullscreen', 'Vollbild (Klausur-Hinweis)'),
        ('split', 'Splitscreen (Klausur + Stundenplan)'),
        ('standard', 'Kein Zwang (Profil-Layout)'),
    ]
    display_mode = models.CharField(max_length=10, choices=DISPLAY_MODE_CHOICES, default='fullscreen',
        help_text="Wie der Bildschirm während der Klausur aussieht")
    webuntis_link = models.ForeignKey('WebUntisLink', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='as_exam_link',
        help_text="Stundenplan-Link für den Split während der Klausur")
    split_side = models.CharField(max_length=6, choices=DisplayView.SIDE_CHOICES,
        default='right', help_text="Auf welcher Seite die Klausur steht (Split)")
    split_percent = models.IntegerField(default=50, help_text="Breite der Klausur-Seite in Prozent")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-active_from']
        verbose_name = 'Klausur'
        verbose_name_plural = 'Klausuren'

    @property
    def is_active_now(self):
        now = timezone.now()
        return self.active_from <= now <= self.active_until

    def __str__(self):
        return f"{self.title} ({self.active_from:%d.%m. %H:%M}–{self.active_until:%H:%M})"


class Announcement(models.Model):
    """Freitext-Ankündigungen für das Display"""

    PRIORITY_CHOICES = [
        ('normal', 'Normal'),
        ('important', 'Wichtig'),
        ('urgent', 'Dringend'),
    ]

    title = models.CharField(max_length=200)
    text = models.TextField(blank=True)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    is_active = models.BooleanField(default=True)
    active_from = models.DateTimeField(null=True, blank=True, help_text="Ab wann anzeigen (leer = sofort)")
    active_until = models.DateTimeField(null=True, blank=True, help_text="Bis wann anzeigen (leer = unbegrenzt)")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Dringlichkeit: urgent vor important vor normal
        ordering = [
            models.Case(
                models.When(priority='urgent', then=0), models.When(priority='important', then=1),
                default=2, output_field=models.IntegerField()),
            '-created_at',
        ]
        verbose_name = 'Ankündigung'
        verbose_name_plural = 'Ankündigungen'

    @property
    def is_visible(self):
        if not self.is_active:
            return False
        now = timezone.now()
        if self.active_from and now < self.active_from:
            return False
        if self.active_until and now > self.active_until:
            return False
        return True

    def __str__(self):
        return self.title


class DisplayEvent(models.Model):
    """Benannter, aktivierbarer Modus. Während er aktiv ist, zeigen die
    zugewiesenen Bildschirme eine andere Ansicht (Profil); danach kehren sie
    automatisch zur normalen Auflösung (Zeitplan/Default) zurück."""
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=300, blank=True)
    color = models.CharField(max_length=7, default='#7c3aed', help_text="Akzentfarbe (Hex)")
    is_active = models.BooleanField(default=False, help_text="Manuell aktiviert")
    active_from = models.DateTimeField(null=True, blank=True,
        help_text="Optional: automatisch aktiv ab (leer = nur manuell)")
    active_until = models.DateTimeField(null=True, blank=True,
        help_text="Optional: automatisch aktiv bis")
    created_at = models.DateTimeField(auto_now_add=True)

    screens = models.ManyToManyField(Screen, through='DisplayEventScreen',
        related_name='events', blank=True)

    class Meta:
        ordering = ['-is_active', 'name']
        verbose_name = 'Event'
        verbose_name_plural = 'Events'

    @property
    def is_active_now(self):
        if self.is_active:
            return True
        now = timezone.now()
        if self.active_from and self.active_until:
            return self.active_from <= now <= self.active_until
        return False

    def __str__(self):
        return self.name


class DisplayEventScreen(models.Model):
    """Zuweisung: welches Profil ein Bildschirm während eines Events zeigt."""
    event = models.ForeignKey(DisplayEvent, on_delete=models.CASCADE, related_name='assignments')
    screen = models.ForeignKey(Screen, on_delete=models.CASCADE, related_name='event_assignments')
    view = models.ForeignKey(DisplayView, on_delete=models.CASCADE, related_name='event_assignments')

    class Meta:
        unique_together = ('event', 'screen')
        verbose_name = 'Event-Bildschirm-Zuweisung'
        verbose_name_plural = 'Event-Bildschirm-Zuweisungen'

    def __str__(self):
        return f"{self.event.name}: {self.screen.name} → {self.view.name}"


class ExamTemplate(models.Model):
    """Selbst erstellbare Vorlage für Klausuren (füllt das Formular vor)."""
    name = models.CharField(max_length=120)
    duration_minutes = models.IntegerField(default=90, help_text="Dauer ab jetzt")
    title = models.CharField(max_length=200, default='Klausur')
    text = models.TextField(blank=True)
    color = models.CharField(max_length=7, default='#1e40af')
    display_mode = models.CharField(max_length=10, choices=Exam.DISPLAY_MODE_CHOICES, default='fullscreen')
    webuntis_link = models.ForeignKey('WebUntisLink', on_delete=models.SET_NULL, null=True, blank=True, related_name='as_template_link')
    split_side = models.CharField(max_length=6, default='right')
    split_percent = models.IntegerField(default=50)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Klausur-Vorlage'
        verbose_name_plural = 'Klausur-Vorlagen'

    def __str__(self):
        return self.name


class MonitorSettings(models.Model):
    """Einmalige, globale Zugänge (statt pro Profil): Wetter-Key, WebUntis-Login."""
    weather_api_key = models.CharField(max_length=64, blank=True, default='')
    webuntis_server = models.CharField(max_length=200, blank=True, default='')
    webuntis_school = models.CharField(max_length=200, blank=True, default='')
    webuntis_username = models.CharField(max_length=200, blank=True, default='')
    webuntis_password = models.CharField(max_length=200, blank=True, default='')

    # ─── ON AIR (global) ───
    ON_AIR_ANIMATION_CHOICES = [('still', 'Still'), ('pulse', 'Pulsieren'), ('blink', 'Blinken')]
    on_air_active = models.BooleanField(default=False)
    on_air_since = models.DateTimeField(null=True, blank=True)
    on_air_text = models.CharField(max_length=100, default='ON AIR')
    on_air_animation = models.CharField(max_length=10, choices=ON_AIR_ANIMATION_CHOICES, default='pulse')
    on_air_show_clock = models.BooleanField(default=True)

    # ─── Notfall (global) ───
    emergency_active = models.BooleanField(default=False)
    emergency_text = models.CharField(max_length=300, blank=True, default='')
    emergency_note = models.CharField(max_length=300, blank=True, default='')
    emergency_since = models.DateTimeField(null=True, blank=True)

    # ─── WebUntis-Status ───
    WEBUNTIS_SOURCE_CHOICES = [
        ('substitutions', 'Vertretungen'),
        ('timetable', 'Stundenplan'),
        ('unavailable', 'Nicht erreichbar'),
        ('', 'Unbekannt'),
    ]
    webuntis_source = models.CharField(max_length=20, choices=WEBUNTIS_SOURCE_CHOICES, blank=True, default='')
    webuntis_checked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Globale Monitor-Einstellung'
        verbose_name_plural = 'Globale Monitor-Einstellungen'

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return 'Globale Monitor-Einstellungen'


class DisplayViewVersion(models.Model):
    """Snapshot einer Ansicht-Konfiguration für Rollback."""
    view = models.ForeignKey(DisplayView, on_delete=models.CASCADE, related_name='versions')
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Version {self.view_id} @ {self.created_at:%d.%m %H:%M}"
