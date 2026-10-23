from django.db import migrations, models


def _each_version(Version):
    for version in Version.objects.all():
        if isinstance(version.data, dict):
            yield version, dict(version.data)


def forward(apps, schema_editor):
    View = apps.get_model('signage', 'DisplayView')
    Version = apps.get_model('signage', 'DisplayViewVersion')
    for view in View.objects.all():
        view.transit_time_format = 'minutes' if view.transit_show_relative else 'clock'
        view.transit_show_disruptions = view.transit_disruption_banner
        view.transit_columns = 4  # the old value was never evaluated
        view.save(update_fields=['transit_time_format', 'transit_show_disruptions', 'transit_columns'])
    for version, data in _each_version(Version):
        if not {'transit_show_relative', 'transit_disruption_banner', 'transit_disruption_position'} & set(data):
            continue
        relative = data.pop('transit_show_relative', True)
        data['transit_time_format'] = 'minutes' if relative else 'clock'
        data['transit_show_disruptions'] = data.pop('transit_disruption_banner', True)
        data.pop('transit_disruption_position', None)
        data.pop('transit_columns', None)
        version.data = data
        version.save(update_fields=['data'])


def backward(apps, schema_editor):
    View = apps.get_model('signage', 'DisplayView')
    Version = apps.get_model('signage', 'DisplayViewVersion')
    for view in View.objects.all():
        view.transit_show_relative = view.transit_time_format != 'clock'
        view.transit_disruption_banner = view.transit_show_disruptions
        view.transit_disruption_position = 'bottom'
        # The old code reads only the list-shaped cache, the new one is a dict
        view.transit_cache = None
        view.transit_cache_at = None
        view.save(update_fields=['transit_show_relative', 'transit_disruption_banner',
                                 'transit_disruption_position', 'transit_cache', 'transit_cache_at'])
    for version, data in _each_version(Version):
        if not {'transit_time_format', 'transit_show_disruptions', 'transit_strip_city'} & set(data):
            continue
        data['transit_show_relative'] = data.pop('transit_time_format', 'minutes') != 'clock'
        data['transit_disruption_banner'] = data.pop('transit_show_disruptions', True)
        data['transit_disruption_position'] = 'bottom'
        data.pop('transit_strip_city', None)
        version.data = data
        version.save(update_fields=['data'])


class Migration(migrations.Migration):

    dependencies = [
        ("signage", "0046_layout_color_scheme"),
    ]

    operations = [
        migrations.AddField(
            model_name="displayview",
            name="transit_time_format",
            field=models.CharField(
                choices=[("minutes", "Minuten"), ("clock", "Uhrzeit"), ("mixed", "Gemischt")],
                default="minutes", max_length=10),
        ),
        migrations.AddField(
            model_name="displayview",
            name="transit_show_disruptions",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="displayview",
            name="transit_strip_city",
            field=models.BooleanField(default=True, help_text="Ortsnamen vor dem Haltestellennamen weglassen"),
        ),
        migrations.AlterField(
            model_name="displayview",
            name="transit_columns",
            field=models.IntegerField(default=4, help_text="Anzahl Spalten im Layout (1-5)"),
        ),
        migrations.RunPython(forward, backward),
        migrations.RemoveField(model_name="displayview", name="transit_show_relative"),
        migrations.RemoveField(model_name="displayview", name="transit_disruption_banner"),
        migrations.RemoveField(model_name="displayview", name="transit_disruption_position"),
    ]
