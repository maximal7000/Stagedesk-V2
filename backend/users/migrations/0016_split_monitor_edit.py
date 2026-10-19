"""Monitor Display-Admin (Spec §3.5): monitor.edit wird in feinere Rechte aufgeteilt.

Gruppen und Nutzer mit monitor.edit bekommen setup, exams, media und power.
monitor.devices wird nur angelegt (noch ohne Funktion). Danach entfällt monitor.edit.
"""
from django.db import migrations

OLD_CODE = 'monitor.edit'
NEW_PERMISSIONS = [
    ('monitor.setup', 'Monitor einrichten',
     'Erlaubt das Einrichten von Ansichten, Bildschirmen und Einstellungen'),
    ('monitor.exams', 'Klausuren und Termine verwalten',
     'Erlaubt das Verwalten von Klausuren, Vorlagen, Terminen und Ankündigungen'),
    ('monitor.media', 'Medien verwalten',
     'Erlaubt das Hochladen und Löschen von Medien'),
    ('monitor.power', 'Bildschirme ein- und ausschalten',
     'Erlaubt das Ein- und Ausschalten von Bildschirmen'),
    ('monitor.devices', 'Geräte verwalten',
     'Erlaubt das Verwalten der Geräte hinter den Bildschirmen'),
]
GRANTED_TO_EDIT_HOLDERS = ['monitor.setup', 'monitor.exams', 'monitor.media', 'monitor.power']


def forward(apps, schema_editor):
    Permission = apps.get_model('users', 'Permission')
    created = {}
    for code, name, description in NEW_PERMISSIONS:
        created[code], _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': name, 'description': description, 'category': 'monitor'},
        )
    old = Permission.objects.filter(code=OLD_CODE).first()
    if old is None:
        return
    for group in old.groups.all():
        group.permissions.add(*[created[c] for c in GRANTED_TO_EDIT_HOLDERS])
    for user in old.users.all():
        user.permissions.add(*[created[c] for c in GRANTED_TO_EDIT_HOLDERS])
    old.delete()


def backward(apps, schema_editor):
    Permission = apps.get_model('users', 'Permission')
    old, _ = Permission.objects.get_or_create(
        code=OLD_CODE,
        defaults={'name': 'Monitor bearbeiten',
                  'description': 'Erlaubt das Bearbeiten der Monitor-Konfiguration',
                  'category': 'monitor'},
    )
    setup = Permission.objects.filter(code='monitor.setup').first()
    if setup is not None:
        for group in setup.groups.all():
            group.permissions.add(old)
        for user in setup.users.all():
            user.permissions.add(old)
    Permission.objects.filter(code__in=[c for c, _, _ in NEW_PERMISSIONS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0015_rename_monitor_emergency_permission'),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
