"""
ÖPNV Abfahrtsmonitor + ON AIR Layout-Modus
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('monitor', '0006_onair_more_options'),
    ]

    operations = [
        # Layout-Modi erweitern
        migrations.AlterField(
            model_name='monitorconfig',
            name='layout_modus',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('standard', 'Standard-Layout'),
                    ('stundenplan', 'Stundenplan-Vollbild'),
                    ('onair', 'ON AIR Display'),
                    ('abfahrten', 'Abfahrtsmonitor (ÖPNV)'),
                ],
                default='standard',
            ),
        ),
        # ÖPNV Felder
        migrations.AddField(
            model_name='monitorconfig',
            name='zeige_oepnv',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='oepnv_stationen',
            field=models.JSONField(default=list, blank=True),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='oepnv_dauer',
            field=models.IntegerField(default=60),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='oepnv_max_abfahrten',
            field=models.IntegerField(default=20),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='oepnv_zeige_bus',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='oepnv_zeige_bahn',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='oepnv_zeige_fernverkehr',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='oepnv_cache',
            field=models.JSONField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='oepnv_cache_zeit',
            field=models.DateTimeField(null=True, blank=True),
        ),
    ]
