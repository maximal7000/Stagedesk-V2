"""Monitor Schritt 0 (Spec §7): Permission monitor.notfall heißt monitor.emergency.

Der Datensatz wird umbenannt (gleiche ID), damit Zuweisungen an Gruppen und Nutzer bleiben.
Existiert der neue Code schon (z.B. von setup_system angelegt), wandern die Zuweisungen
des alten Datensatzes dorthin und der alte wird gelöscht.
"""
from django.db import migrations

OLD_CODE = 'monitor.notfall'
NEW_CODE = 'monitor.emergency'


def _rename(apps, old_code, new_code):
    Permission = apps.get_model('users', 'Permission')
    old = Permission.objects.filter(code=old_code).first()
    if old is None:
        return
    existing = Permission.objects.filter(code=new_code).first()
    if existing is None:
        old.code = new_code
        old.save(update_fields=['code'])
        return
    for group in old.groups.all():
        group.permissions.add(existing)
    for user in old.users.all():
        user.permissions.add(existing)
    old.delete()


def forward(apps, schema_editor):
    _rename(apps, OLD_CODE, NEW_CODE)


def backward(apps, schema_editor):
    _rename(apps, NEW_CODE, OLD_CODE)


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0014_userprofile_notify_disabled'),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
