"""Einschaltzeiten und Ansichten-Zeitplan werden ein gemeinsamer Zeitplan (Spec §2.2).

Vorwärts: screen_schedule.merge_legacy (Ansichten-Zeilen auf die Einschaltzeiten zugeschnitten oben,
darunter jede Einschaltzeile mit Standard-Ansicht). Rückwärts: screen_schedule.split_legacy.
"""
from django.db import migrations, models

from monitor.screen_schedule import merge_legacy, split_legacy


def forward(apps, schema_editor):
    Screen = apps.get_model('monitor', 'Screen')
    for screen in Screen.objects.all():
        screen.schedule = merge_legacy(screen.schedule, screen.power_schedule)
        screen.save(update_fields=['schedule'])


def backward(apps, schema_editor):
    Screen = apps.get_model('monitor', 'Screen')
    for screen in Screen.objects.all():
        screen.schedule, screen.power_schedule = split_legacy(screen.schedule)
        screen.save(update_fields=['schedule', 'power_schedule'])


class Migration(migrations.Migration):

    dependencies = [
        ("monitor", "0044_substitution_sources"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
        migrations.RemoveField(model_name="screen", name="power_schedule"),
        migrations.AlterField(
            model_name="screen",
            name="schedule",
            field=models.JSONField(
                blank=True, default=list,
                help_text='Zeitplan: [{"days": [0-6], "from": "HH:MM", "until": "HH:MM", "view_id": 3 | null}]. '
                          'null = Standard-Ansicht, until < from = über Mitternacht. Leer = immer an.'),
        ),
    ]
