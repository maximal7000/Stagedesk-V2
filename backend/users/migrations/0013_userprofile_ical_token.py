from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0012_avatar_landing'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='ical_token',
            field=models.CharField(blank=True, default='', max_length=64,
                                   help_text='Token für persönlichen iCal-Feed'),
        ),
    ]
