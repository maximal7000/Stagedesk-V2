"""
Multi-Profil-Support + ON AIR Anpassungen
"""
import uuid
from django.db import migrations, models


def set_profile_defaults(apps, schema_editor):
    MonitorConfig = apps.get_model('monitor', 'MonitorConfig')
    for i, config in enumerate(MonitorConfig.objects.all()):
        if i == 0:
            config.name = 'Standard'
            config.slug = 'standard'
            config.ist_standard = True
        else:
            config.name = f'Profil {i + 1}'
            config.slug = uuid.uuid4().hex[:8]
            config.ist_standard = False
        config.save()


class Migration(migrations.Migration):

    dependencies = [
        ('monitor', '0004_raumplan_countdown_screensaver_rotation'),
    ]

    operations = [
        # ─── Profil-Felder ───────────────────
        migrations.AddField(
            model_name='monitorconfig',
            name='name',
            field=models.CharField(default='Standard', max_length=100),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='slug',
            field=models.SlugField(default='', blank=True, db_index=False),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='ist_standard',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='zeitplan',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='layout_modus',
            field=models.CharField(
                choices=[('standard', 'Standard-Layout'), ('stundenplan', 'Stundenplan-Vollbild')],
                default='standard', max_length=20,
            ),
        ),

        # ─── ON AIR Anpassungen ──────────────
        migrations.AddField(
            model_name='monitorconfig',
            name='on_air_groesse',
            field=models.CharField(default='mittel', max_length=10),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='on_air_position',
            field=models.CharField(default='oben-rechts', max_length=20),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='on_air_blinken',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='on_air_farbe',
            field=models.CharField(blank=True, max_length=7),
        ),

        # ─── Daten setzen ───────────────────
        migrations.RunPython(set_profile_defaults, migrations.RunPython.noop),

        # ─── Slug unique machen ──────────────
        migrations.AlterField(
            model_name='monitorconfig',
            name='slug',
            field=models.SlugField(max_length=50, unique=True),
        ),

        # ─── Meta anpassen ──────────────────
        migrations.AlterModelOptions(
            name='monitorconfig',
            options={
                'ordering': ['-ist_standard', 'name'],
                'verbose_name': 'Monitor-Profil',
                'verbose_name_plural': 'Monitor-Profile',
            },
        ),
    ]
