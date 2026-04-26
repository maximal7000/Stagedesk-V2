"""
User-Modelle für Permissions, Settings und Sessions
Rollen kommen aus Keycloak, lokale Permissions für feinere Steuerung
"""
from django.db import models


class Bereich(models.Model):
    """Konfigurierbare Bereiche für Techniker-Profile (z.B. Licht, Ton, Video)."""
    name = models.CharField(max_length=100, unique=True)
    sortierung = models.IntegerField(default=0)

    class Meta:
        ordering = ['sortierung', 'name']
        verbose_name = 'Bereich'
        verbose_name_plural = 'Bereiche'

    def __str__(self):
        return self.name


class Permission(models.Model):
    """
    Lokale Permissions für feinere Steuerung (zusätzlich zu Keycloak-Rollen)
    z.B. theme.light_mode, haushalte.view etc.
    """
    code = models.CharField(max_length=100, unique=True, help_text="Eindeutiger Permission-Code")
    name = models.CharField(max_length=200, help_text="Anzeigename")
    description = models.TextField(blank=True, help_text="Beschreibung der Permission")
    category = models.CharField(max_length=50, default='general', help_text="Kategorie für Gruppierung")
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['category', 'name']
        verbose_name = 'Berechtigung'
        verbose_name_plural = 'Berechtigungen'
    
    def __str__(self):
        return f"{self.name} ({self.code})"


class PermissionGroup(models.Model):
    """Gruppen für Berechtigungen (z.B. 'Techniker', 'Leitung', 'Gast')."""
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    permissions = models.ManyToManyField(Permission, blank=True, related_name='groups')
    is_default = models.BooleanField(default=False, help_text="Neue User bekommen diese Gruppe automatisch")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Berechtigungsgruppe'
        verbose_name_plural = 'Berechtigungsgruppen'

    def __str__(self):
        return self.name


class UserProfile(models.Model):
    """
    Benutzerprofil - verknüpft mit Keycloak User-ID
    Admin-Status kommt aus Keycloak-Rollen (realm_access.roles oder resource_access.stagedesk.roles)
    """
    THEME_CHOICES = [
        ('dark', 'Dark Mode'),
        ('light', 'Light Mode'),
        ('system', 'System'),
    ]

    keycloak_id = models.CharField(max_length=100, unique=True, help_text="Keycloak User Sub ID")
    username = models.CharField(max_length=150, blank=True)
    email = models.CharField(max_length=254, blank=True)
    first_name = models.CharField(max_length=150, blank=True, help_text="Vorname aus Keycloak (given_name)")
    last_name = models.CharField(max_length=150, blank=True, help_text="Nachname aus Keycloak (family_name)")

    # Discord-Verknüpfung
    discord_id = models.CharField(max_length=100, blank=True, help_text="Discord User-ID für Event-Verknüpfung")

    # Bereiche (ManyToMany, z.B. Licht, Ton, Video)
    bereiche = models.ManyToManyField(Bereich, blank=True, related_name='users',
                                      help_text="Bereiche des Technikers")

    # Lokale Permissions (direkt am User, für feinere Steuerung)
    permissions = models.ManyToManyField(Permission, blank=True, related_name='users',
                                         help_text="Lokale Permissions zusätzlich zu Keycloak-Rollen")

    # Berechtigungsgruppen
    permission_groups = models.ManyToManyField(PermissionGroup, blank=True, related_name='users',
                                                help_text="Gruppen für gebündelte Berechtigungen")

    # Settings
    theme = models.CharField(max_length=20, choices=THEME_CHOICES, default='dark')
    theme_locked = models.BooleanField(default=False, help_text="Theme vom Admin festgelegt")
    forced_theme = models.CharField(max_length=20, choices=THEME_CHOICES, blank=True, null=True,
                                    help_text="Vom Admin erzwungenes Theme")

    # 2FA Status (wird von Keycloak verwaltet, hier nur gecacht)
    two_factor_enabled = models.BooleanField(default=False)

    # Admin-Status wird beim Login aus Keycloak-Rollen persistiert,
    # damit wir ihn auch für andere User abrufen können (in Listen etc.)
    is_admin_cached = models.BooleanField(default=False,
                                          help_text="Zuletzt erkannter Admin-Status aus Keycloak")

    # Dashboard-Widgets: geordnete Liste von Widget-Codes (siehe DASHBOARD_WIDGETS in api)
    # None = noch nie gespeichert → Default greift; [] = User hat alles abgewählt.
    dashboard_widgets = models.JSONField(null=True, blank=True, default=None,
                                         help_text="User-gewählte Dashboard-Widgets (Liste von Codes)")

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_login = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        verbose_name = 'Benutzerprofil'
        verbose_name_plural = 'Benutzerprofile'
    
    def __str__(self):
        return self.username or self.keycloak_id
    
    def get_effective_theme(self):
        """Gibt das effektive Theme zurück (erzwungen oder selbst gewählt)"""
        if self.forced_theme:
            return self.forced_theme
        return self.theme
    
    def has_permission(self, permission_code, is_admin=None):
        """
        Prüft ob User eine bestimmte Permission hat
        is_admin wird von der API übergeben (aus Keycloak-Rollen)
        """
        # Keycloak-Admin hat alle Permissions
        if is_admin is None:
            is_admin = getattr(self, '_is_admin', False)
        if is_admin:
            return True
        # Prüfe direkte Permissions
        if self.permissions.filter(code=permission_code).exists():
            return True
        # Prüfe Gruppen-Permissions
        return Permission.objects.filter(
            code=permission_code, groups__users=self
        ).exists()
    
    def get_all_permissions(self):
        """Gibt alle Permission-Codes des Users zurück (direkt + aus Gruppen)"""
        direct = set(self.permissions.values_list('code', flat=True))
        from_groups = set(
            Permission.objects.filter(groups__users=self).values_list('code', flat=True)
        )
        return list(direct | from_groups)


class UserSession(models.Model):
    """
    Tracking von User-Sessions (von Keycloak)
    """
    user_profile = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='sessions')
    keycloak_session_id = models.CharField(max_length=200, unique=True)
    
    # Session Info
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    device_info = models.CharField(max_length=200, blank=True)
    
    # Status
    is_current = models.BooleanField(default=False)
    started_at = models.DateTimeField(auto_now_add=True)
    last_activity = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-last_activity']
        verbose_name = 'Sitzung'
        verbose_name_plural = 'Sitzungen'
    
    def __str__(self):
        return f"Session {self.keycloak_session_id[:8]}... ({self.user_profile})"


class GlobalSettings(models.Model):
    """
    Globale Admin-Einstellungen
    """
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField()
    description = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(UserProfile, on_delete=models.SET_NULL, null=True, blank=True)
    
    class Meta:
        verbose_name = 'Globale Einstellung'
        verbose_name_plural = 'Globale Einstellungen'
    
    def __str__(self):
        return self.key
    
    @classmethod
    def get_value(cls, key, default=None):
        try:
            return cls.objects.get(key=key).value
        except cls.DoesNotExist:
            return default
    
    @classmethod
    def set_value(cls, key, value, description='', updated_by=None):
        obj, created = cls.objects.update_or_create(
            key=key,
            defaults={'value': value, 'description': description, 'updated_by': updated_by}
        )
        return obj


class Notification(models.Model):
    """In-App-Benachrichtigung für einen User. Wird an mehreren Stellen
    geschrieben (Zuweisung, Mahnung, Kompetenz-Ablauf, …) und über die
    Glocke in der Topbar ausgespielt."""
    KIND_CHOICES = [
        ('zuweisung',    'Zuweisung'),
        ('mahnung',      'Mahnung'),
        ('erinnerung',   'Erinnerung'),
        ('kompetenz',    'Kompetenz'),
        ('deadline',     'Deadline'),
        ('konflikt',     'Konflikt'),
        ('info',         'Info'),
        ('system',       'System'),
    ]
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='notifications')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='info')
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=500, blank=True,
        help_text="Frontend-Pfad, z.B. /veranstaltung/42")
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['user', 'read_at']),
        ]
        verbose_name = 'Benachrichtigung'
        verbose_name_plural = 'Benachrichtigungen'

    def __str__(self):
        return f"{self.kind}: {self.title} ({self.user_id})"
