import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('veranstaltung', '0008_meldung'),
    ]

    operations = [
        migrations.AddField(
            model_name='veranstaltung',
            name='meldung_aktiv',
            field=models.BooleanField(default=True, help_text='Ob sich User für diese Veranstaltung melden können'),
        ),
        migrations.CreateModel(
            name='VeranstaltungAbmeldung',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_keycloak_id', models.CharField(max_length=100)),
                ('user_username', models.CharField(blank=True, max_length=150)),
                ('grund', models.TextField(blank=True)),
                ('erstellt_am', models.DateTimeField(auto_now_add=True)),
                ('veranstaltung', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='abmeldungen', to='veranstaltung.veranstaltung')),
            ],
            options={
                'verbose_name': 'Abmeldung',
                'verbose_name_plural': 'Abmeldungen',
                'ordering': ['-erstellt_am'],
            },
        ),
    ]
