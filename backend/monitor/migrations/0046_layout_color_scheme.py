from django.db import migrations, models

# Stil → Aufteilung; „Dunkel“ wird Breit, das Dunkle wandert als Ausnahme an den Bildschirm.
STYLE_TO_LAYOUT = {'auto': 'auto', 'ci': 'normal', 'dense': 'wide', 'dark': 'wide'}
LAYOUT_TO_STYLE = {'auto': 'auto', 'normal': 'ci', 'wide': 'dense'}


def _translate_versions(Version, old_key, new_key, mapping):
    for version in Version.objects.all():
        data = version.data
        if not isinstance(data, dict) or old_key not in data:
            continue
        data = dict(data)
        value = data.pop(old_key)
        data[new_key] = mapping.get(value, 'auto')
        version.data = data
        version.save(update_fields=['data'])


def forward(apps, schema_editor):
    View = apps.get_model('monitor', 'DisplayView')
    Screen = apps.get_model('monitor', 'Screen')
    for style, layout in STYLE_TO_LAYOUT.items():
        View.objects.filter(style=style).update(layout=layout)
    Screen.objects.filter(default_view__style='dark').update(color_scheme='dark')
    _translate_versions(apps.get_model('monitor', 'DisplayViewVersion'), 'style', 'layout', STYLE_TO_LAYOUT)


def backward(apps, schema_editor):
    View = apps.get_model('monitor', 'DisplayView')
    Screen = apps.get_model('monitor', 'Screen')
    for layout, style in LAYOUT_TO_STYLE.items():
        View.objects.filter(layout=layout).update(style=style)
    dark_ids = Screen.objects.filter(color_scheme='dark', default_view__isnull=False).values_list(
        'default_view_id', flat=True)
    View.objects.filter(id__in=list(dark_ids)).update(style='dark')
    _translate_versions(apps.get_model('monitor', 'DisplayViewVersion'), 'layout', 'style', LAYOUT_TO_STYLE)


class Migration(migrations.Migration):

    dependencies = [
        ("monitor", "0045_unified_screen_schedule"),
    ]

    operations = [
        migrations.AddField(
            model_name="displayview",
            name="layout",
            field=models.CharField(
                choices=[("auto", "Automatisch"), ("normal", "Normal"), ("wide", "Breit")],
                default="auto", max_length=10),
        ),
        migrations.AddField(
            model_name="screen",
            name="color_scheme",
            field=models.CharField(
                choices=[("inherit", "Wie eingestellt"), ("light", "Immer hell"), ("dark", "Immer dunkel")],
                default="inherit", max_length=10),
        ),
        migrations.AddField(
            model_name="monitorsettings",
            name="color_scheme",
            field=models.CharField(
                choices=[("light", "Hell"), ("dark", "Dunkel"), ("daylight", "Tageslicht"),
                         ("schedule", "Zeitplan")],
                default="light", max_length=10),
        ),
        migrations.AddField(
            model_name="monitorsettings",
            name="light_from",
            field=models.CharField(default="07:00", help_text="Zeitplan: hell ab HH:MM", max_length=5),
        ),
        migrations.AddField(
            model_name="monitorsettings",
            name="light_until",
            field=models.CharField(default="18:00", help_text="Zeitplan: hell bis HH:MM", max_length=5),
        ),
        migrations.RunPython(forward, backward),
        migrations.RemoveField(
            model_name="displayview",
            name="style",
        ),
    ]
