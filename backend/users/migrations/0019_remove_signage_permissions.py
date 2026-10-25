"""Die Signage-Rechte kommen aus den Rollen des Keycloak-Clients signage und nicht mehr aus der Datenbank.

Vorwärts werden die Datensätze signage.* samt Zuweisungen gelöscht. Rückwärts entstehen die acht
Datensätze neu, ohne Zuweisungen.
"""
from django.db import migrations

PERMISSIONS = [
    ('view', 'Monitor anzeigen', 'Erlaubt den Zugriff auf die Monitor-Konfiguration'),
    ('setup', 'Monitor einrichten', 'Erlaubt das Einrichten von Ansichten, Bildschirmen und Einstellungen'),
    ('exams', 'Klausuren und Termine verwalten',
     'Erlaubt das Verwalten von Klausuren, Vorlagen, Terminen und Ankündigungen'),
    ('media', 'Medien verwalten', 'Erlaubt das Hochladen und Löschen von Medien'),
    ('power', 'Bildschirme ein- und ausschalten', 'Erlaubt das Ein- und Ausschalten von Bildschirmen'),
    ('devices', 'Geräte verwalten', 'Erlaubt das Verwalten der Geräte hinter den Bildschirmen'),
    ('onair', 'ON AIR steuern', 'Erlaubt das Aktivieren/Deaktivieren von ON AIR'),
    ('emergency', 'Notfall-Meldung verwalten', 'Erlaubt das Aktivieren/Deaktivieren der Notfall-Meldung'),
]


def forward(apps, schema_editor):
    apps.get_model('users', 'Permission').objects.filter(code__startswith='signage.').delete()


def backward(apps, schema_editor):
    Permission = apps.get_model('users', 'Permission')
    for suffix, name, description in PERMISSIONS:
        Permission.objects.get_or_create(
            code=f'signage.{suffix}',
            defaults={'name': name, 'description': description, 'category': 'monitor'})


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0018_userprofile_signage_roles_cached'),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
