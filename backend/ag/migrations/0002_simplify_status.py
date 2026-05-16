"""
laeuft/fertig zu offen/abgeschlossen mappen und Choices/Meta anpassen.
"""
from django.db import migrations, models


def map_statuses(apps, schema_editor):
    AgAufgabe = apps.get_model('ag', 'AgAufgabe')
    AgAufgabe.objects.filter(status='laeuft').update(status='offen')
    AgAufgabe.objects.filter(status='fertig').update(status='abgeschlossen')


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('ag', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(map_statuses, noop_reverse),
        migrations.AlterField(
            model_name='agaufgabe',
            name='status',
            field=models.CharField(
                choices=[('offen', 'Offen'), ('abgeschlossen', 'Abgeschlossen')],
                default='offen', max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='agaufgabe',
            name='sortierung',
            field=models.IntegerField(
                default=0,
                help_text='Frei wählbare Reihenfolge — kleiner Wert zuerst',
            ),
        ),
        migrations.AlterModelOptions(
            name='agaufgabe',
            options={
                'ordering': ['sortierung', 'id'],
                'verbose_name': 'Aufgabe',
                'verbose_name_plural': 'Aufgaben',
            },
        ),
    ]
