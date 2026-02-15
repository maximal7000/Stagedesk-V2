"""
Erweiterte ON AIR Optionen: mehr Positionen, mehr Größen, neue Defaults
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('monitor', '0005_multi_profile_onair_customization'),
    ]

    operations = [
        migrations.AlterField(
            model_name='monitorconfig',
            name='on_air_groesse',
            field=models.CharField(
                max_length=10,
                choices=[
                    ('klein', 'Klein'),
                    ('mittel', 'Mittel'),
                    ('gross', 'Groß'),
                    ('riesig', 'Riesig'),
                ],
                default='gross',
            ),
        ),
        migrations.AlterField(
            model_name='monitorconfig',
            name='on_air_position',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('banner-oben', 'Banner oben (volle Breite)'),
                    ('banner-unten', 'Banner unten (volle Breite)'),
                    ('oben-rechts', 'Oben rechts'),
                    ('oben-links', 'Oben links'),
                    ('oben-mitte', 'Oben Mitte'),
                    ('unten-rechts', 'Unten rechts'),
                    ('unten-links', 'Unten links'),
                    ('unten-mitte', 'Unten Mitte'),
                    ('mitte', 'Mitte (Overlay)'),
                ],
                default='banner-oben',
            ),
        ),
    ]
