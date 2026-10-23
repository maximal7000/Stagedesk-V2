from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('signage', '0047_departures_layout'),
    ]

    operations = [
        migrations.AddField(
            model_name='displayview',
            name='transit_disruption_column',
            field=models.IntegerField(blank=True, help_text='Störungen in Abfahrten-Spalte 1-5, leer: eigene Spalte rechts', null=True),
        ),
    ]
