from django.db import migrations, models


def forward(apps, schema_editor):
    """Bisher „Morgen zeigen“ aus: ein Tag, sonst zwei; alle auf die Monitor-Schnittstelle."""
    View = apps.get_model('signage', 'DisplayView')
    View.objects.filter(substitutions_next_day=False).update(substitutions_format='students_1')
    View.objects.filter(substitutions_next_day=True).update(substitutions_format='students_2')
    View.objects.update(substitutions_source='monitor', substitutions_show_absences=True,
                        substitutions_next_day_from='16:00')


def backward(apps, schema_editor):
    View = apps.get_model('signage', 'DisplayView')
    View.objects.filter(substitutions_format='students_1').update(substitutions_next_day=False)
    View.objects.exclude(substitutions_format='students_1').update(substitutions_next_day=True)


class Migration(migrations.Migration):

    dependencies = [
        ("signage", "0043_device_agent"),
    ]

    operations = [
        migrations.AddField(
            model_name="displayview",
            name="substitutions_source",
            field=models.CharField(
                choices=[("monitor", "WebUntis-Vertretungsplan"), ("account", "WebUntis-Konto"),
                         ("embed", "WebUntis-Seite einbetten")],
                default="monitor", max_length=10),
        ),
        migrations.AddField(
            model_name="displayview",
            name="substitutions_format",
            field=models.CharField(
                choices=[("students_2", "Schüler, 2 Tage"), ("students_1", "Schüler, 1 Tag"),
                         ("teachers", "Lehrkräfte"), ("custom", "Eigenes Format")],
                default="students_2", max_length=12),
        ),
        migrations.AddField(
            model_name="displayview",
            name="substitutions_custom_format",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="displayview",
            name="substitutions_show_absences",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="displayview",
            name="substitutions_show_exams",
            field=models.BooleanField(blank=True, default=None, null=True),
        ),
        migrations.AddField(
            model_name="displayview",
            name="substitutions_next_day_from",
            field=models.CharField(blank=True, default="16:00", max_length=5),
        ),
        migrations.RunPython(forward, backward),
    ]
