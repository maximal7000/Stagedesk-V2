"""
ÖPNV: API-Toggle (DB / NAH.SH einzeln abschaltbar)
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('monitor', '0007_oepnv_onair_layout'),
    ]

    operations = [
        migrations.AddField(
            model_name='monitorconfig',
            name='oepnv_api_db',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='monitorconfig',
            name='oepnv_api_nahsh',
            field=models.BooleanField(default=True),
        ),
    ]
