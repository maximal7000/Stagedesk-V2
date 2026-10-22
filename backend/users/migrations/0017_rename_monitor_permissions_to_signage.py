"""Umbenennung monitor -> signage: die Rechte monitor.* heißen signage.*.

Die Datensätze werden umbenannt (gleiche ID), damit Zuweisungen an Gruppen und Nutzer bleiben.
Existiert der neue Code schon (z.B. von setup_system angelegt), wandern die Zuweisungen
des alten Datensatzes dorthin und der alte wird gelöscht. Anzeigenamen bleiben unverändert.
"""
from django.db import migrations

SUFFIXES = ['view', 'setup', 'exams', 'media', 'power', 'onair', 'emergency', 'devices']


def _rename(apps, old_prefix, new_prefix):
    Permission = apps.get_model('users', 'Permission')
    for suffix in SUFFIXES:
        old = Permission.objects.filter(code=f'{old_prefix}.{suffix}').first()
        if old is None:
            continue
        existing = Permission.objects.filter(code=f'{new_prefix}.{suffix}').first()
        if existing is None:
            old.code = f'{new_prefix}.{suffix}'
            old.save(update_fields=['code'])
            continue
        for group in old.groups.all():
            group.permissions.add(existing)
        for user in old.users.all():
            user.permissions.add(existing)
        old.delete()


def forward(apps, schema_editor):
    _rename(apps, 'monitor', 'signage')


def backward(apps, schema_editor):
    _rename(apps, 'signage', 'monitor')


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0016_split_monitor_edit'),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
