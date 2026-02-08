# Generated manually for Veranstaltungsplaner

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('inventar', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Veranstaltung',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('titel', models.CharField(max_length=300)),
                ('beschreibung', models.TextField(blank=True)),
                ('datum_von', models.DateTimeField()),
                ('datum_bis', models.DateTimeField()),
                ('ort', models.CharField(blank=True, max_length=300)),
                ('adresse', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('planung', 'Planung'), ('bestaetigt', 'Bestätigt'), ('laufend', 'Laufend'), ('abgeschlossen', 'Abgeschlossen'), ('abgesagt', 'Abgesagt')], default='planung', max_length=20)),
                ('zammad_ticket_id', models.IntegerField(blank=True, null=True, unique=True)),
                ('zammad_ticket_number', models.CharField(blank=True, max_length=50)),
                ('wiederholung', models.CharField(choices=[('keine', 'Keine'), ('taeglich', 'Täglich'), ('woechentlich', 'Wöchentlich'), ('monatlich', 'Monatlich'), ('jaehrlich', 'Jährlich')], default='keine', max_length=20)),
                ('wiederholung_ende', models.DateField(blank=True, null=True)),
                ('erstellt_von', models.CharField(blank=True, max_length=100)),
                ('erstellt_am', models.DateTimeField(auto_now_add=True)),
                ('aktualisiert_am', models.DateTimeField(auto_now=True)),
                ('ausleihliste', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='veranstaltungen', to='inventar.ausleihliste')),
                ('parent_veranstaltung', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='wiederholungen', to='veranstaltung.veranstaltung')),
            ],
            options={
                'verbose_name': 'Veranstaltung',
                'verbose_name_plural': 'Veranstaltungen',
                'ordering': ['-datum_von'],
            },
        ),
        migrations.CreateModel(
            name='VeranstaltungZuweisung',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_keycloak_id', models.CharField(max_length=100)),
                ('user_username', models.CharField(blank=True, max_length=150)),
                ('user_email', models.CharField(blank=True, max_length=254)),
                ('rolle', models.CharField(choices=[('verantwortlich', 'Verantwortlich'), ('team', 'Team'), ('technik', 'Technik'), ('sonstiges', 'Sonstiges')], default='team', max_length=20)),
                ('zugewiesen_am', models.DateTimeField(auto_now_add=True)),
                ('veranstaltung', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='zuweisungen', to='veranstaltung.veranstaltung')),
            ],
            options={
                'verbose_name': 'Zuweisung',
                'verbose_name_plural': 'Zuweisungen',
                'unique_together': {('veranstaltung', 'user_keycloak_id')},
            },
        ),
        migrations.CreateModel(
            name='VeranstaltungChecklisteItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('titel', models.CharField(max_length=200)),
                ('erledigt', models.BooleanField(default=False)),
                ('sortierung', models.IntegerField(default=0)),
                ('erledigt_am', models.DateTimeField(blank=True, null=True)),
                ('veranstaltung', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='checkliste', to='veranstaltung.veranstaltung')),
            ],
            options={
                'verbose_name': 'Checklisten-Punkt',
                'verbose_name_plural': 'Checklisten-Punkte',
                'ordering': ['sortierung', 'id'],
            },
        ),
        migrations.CreateModel(
            name='VeranstaltungNotiz',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.TextField()),
                ('created_by_keycloak_id', models.CharField(blank=True, max_length=100)),
                ('created_by_username', models.CharField(blank=True, max_length=150)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('veranstaltung', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notizen', to='veranstaltung.veranstaltung')),
            ],
            options={
                'verbose_name': 'Notiz',
                'verbose_name_plural': 'Notizen',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='VeranstaltungErinnerung',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('zeit_vorher', models.IntegerField(default=1)),
                ('einheit', models.CharField(choices=[('minuten', 'Minuten'), ('stunden', 'Stunden'), ('tage', 'Tage'), ('wochen', 'Wochen')], default='tage', max_length=10)),
                ('gesendet', models.BooleanField(default=False)),
                ('gesendet_am', models.DateTimeField(blank=True, null=True)),
                ('veranstaltung', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='erinnerungen', to='veranstaltung.veranstaltung')),
            ],
            options={
                'verbose_name': 'Erinnerung',
                'verbose_name_plural': 'Erinnerungen',
            },
        ),
        migrations.CreateModel(
            name='VeranstaltungAnhang',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('datei', models.FileField(blank=True, null=True, upload_to='veranstaltung_anhaenge/%Y/%m/')),
                ('url', models.URLField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('veranstaltung', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='anhaenge', to='veranstaltung.veranstaltung')),
            ],
            options={
                'verbose_name': 'Anhang',
                'verbose_name_plural': 'Anhänge',
                'ordering': ['name'],
            },
        ),
    ]
