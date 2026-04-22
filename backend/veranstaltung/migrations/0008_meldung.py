import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('veranstaltung', '0007_verfuegbarkeit'),
    ]

    operations = [
        # Altes Verfuegbarkeit-Model entfernen
        migrations.DeleteModel(
            name='VeranstaltungVerfuegbarkeit',
        ),
        # Neues vereinfachtes Meldung-Model
        migrations.CreateModel(
            name='VeranstaltungMeldung',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_keycloak_id', models.CharField(max_length=100)),
                ('user_username', models.CharField(blank=True, max_length=150)),
                ('kommentar', models.TextField(blank=True)),
                ('erstellt_am', models.DateTimeField(auto_now_add=True)),
                ('veranstaltung', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='meldungen', to='veranstaltung.veranstaltung')),
            ],
            options={
                'verbose_name': 'Meldung',
                'verbose_name_plural': 'Meldungen',
                'ordering': ['erstellt_am'],
                'unique_together': {('veranstaltung', 'user_keycloak_id')},
            },
        ),
        # ausgeblendete_user Feld auf Veranstaltung
        migrations.AddField(
            model_name='veranstaltung',
            name='ausgeblendete_user',
            field=models.JSONField(blank=True, default=list, help_text='Liste von keycloak_ids für die dieses Event ausgeblendet ist'),
        ),
    ]
