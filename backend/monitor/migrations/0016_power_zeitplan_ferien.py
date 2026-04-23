"""Ersetzt power_on/power_off durch power_zeitplan, fügt Ferienmodus und Ausnahmen hinzu."""
from django.db import migrations, models


def migrate_power_forward(apps, schema_editor):
    Bildschirm = apps.get_model('monitor', 'Bildschirm')
    for bs in Bildschirm.objects.all():
        von = (bs.power_on or '').strip()
        bis = (bs.power_off or '').strip()
        if von or bis:
            bs.power_zeitplan = [{
                'tage': [0, 1, 2, 3, 4, 5, 6],
                'von': von or '00:00',
                'bis': bis or '23:59',
            }]
            bs.save(update_fields=['power_zeitplan'])


def migrate_power_backward(apps, schema_editor):
    Bildschirm = apps.get_model('monitor', 'Bildschirm')
    for bs in Bildschirm.objects.all():
        if bs.power_zeitplan and isinstance(bs.power_zeitplan, list) and bs.power_zeitplan:
            first = bs.power_zeitplan[0]
            if isinstance(first, dict):
                bs.power_on = first.get('von', '')
                bs.power_off = first.get('bis', '')
                bs.save(update_fields=['power_on', 'power_off'])


class Migration(migrations.Migration):

    dependencies = [
        ('monitor', '0015_cec_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='bildschirm',
            name='power_zeitplan',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='[{"tage": [0-6], "von": "HH:MM", "bis": "HH:MM"}]. Leer = immer an.',
            ),
        ),
        migrations.AddField(
            model_name='bildschirm',
            name='ferien_modus',
            field=models.BooleanField(
                default=False,
                help_text='Wenn aktiv: Bildschirm grundsätzlich aus, nur Ausnahmen greifen.',
            ),
        ),
        migrations.AddField(
            model_name='bildschirm',
            name='power_ausnahmen',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='[{"von_datum": "YYYY-MM-DD", "bis_datum": "YYYY-MM-DD", "von": "HH:MM", "bis": "HH:MM", "notiz": ""}]',
            ),
        ),
        migrations.RunPython(migrate_power_forward, migrate_power_backward),
        migrations.RemoveField(
            model_name='bildschirm',
            name='power_on',
        ),
        migrations.RemoveField(
            model_name='bildschirm',
            name='power_off',
        ),
    ]
