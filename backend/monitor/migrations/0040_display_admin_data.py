"""Monitor B+A: alte Layouts werden Ansichtstypen, On-Air und Notfall werden global (Spec §3.6).

Von Hand geschrieben und in sich geschlossen. Die reinen Funktionen `map_view_kind` und
`translate_snapshot_b` werden von monitor/tests_migrations.py per importlib geprüft.

Vorwärts:
- `layout` -> `kind` (Tabelle §3.6), `style='auto'`, `on_air_behavior` aus den On-Air-Schaltern
- `pdf_fullscreen`/`image_fullscreen`: `media_items` aus `active_pdf`/`active_image` (nur nicht gelöschte Dateien)
- On-Air-Ansichten: Text, Uhr, Blinken -> MonitorSettings, danach Soft Delete
- On-Air- und Notfall-Status der Ansichten -> MonitorSettings
- Freitext -> aktive Ankündigung; Seitenrotation (ab 2 Seiten) -> neue Ansicht "<Name> (Wechsel)"
- `Screen.holiday_mode` -> `power_mode='manual_off'`
- Schnappschüsse (DisplayViewVersion.data) mit derselben Abbildung

Rückwärts: `info` -> `standard`, `substitutions` -> `timetable`, `media` -> `pdf_fullscreen` bzw.
`image_fullscreen`, `rotation`-Ansichten werden gelöscht. Nicht zurück kommen: Freitext (die
Ankündigungen bleiben), Seitenrotation, Ferienmodus und die gelöschten On-Air-Ansichten.
"""
import uuid

from django.db import migrations
from django.utils import timezone


# ─── Konstanten ─────────────────────────────────────────────────────

LAYOUT_TO_KIND = {
    'timetable': 'substitutions',
    'departures': 'departures',
    'pdf_fullscreen': 'media',
    'image_fullscreen': 'media',
}
KIND_TO_LAYOUT = {
    'info': 'standard',
    'substitutions': 'timetable',
    'departures': 'departures',
    'split': 'split',
    'rotation': 'standard',
}
MEDIA_LAYOUT_FIELDS = {'pdf_fullscreen': 'active_pdf', 'image_fullscreen': 'active_image'}

# Spec §3.1 "Entfallen" (Model-Feldnamen); Fremdschlüssel stehen in Schnappschüssen als `<feld>_id`.
REMOVED_FK_FIELDS = ('active_logo', 'active_background_image', 'active_pdf', 'active_image')
REMOVED_VIEW_FIELDS = {
    'layout', 'fullscreen_header',
    'title', 'subtitle', 'background_color', 'accent_color', 'theme_preset',
    'show_logo', 'logo_url',
    'show_slideshow', 'slideshow_interval',
    'show_background_image',
    'show_free_text', 'free_text_title', 'free_text_content',
    'show_page_rotation', 'page_rotation_interval', 'page_rotation_pages',
    'show_on_air', 'is_on_air', 'on_air_text', 'on_air_since', 'on_air_size', 'on_air_position',
    'on_air_blink', 'on_air_color', 'on_air_fullscreen', 'on_air_split',
    'emergency_active', 'emergency_text',
    'show_pdf', 'pdf_interval',
    'image_fit', 'image_focus_x', 'image_focus_y',
    'show_webuntis', 'webuntis_dark_mode', 'refresh_interval',
    *REMOVED_FK_FIELDS, *(f'{name}_id' for name in REMOVED_FK_FIELDS),
}

ROTATION_SUFFIX = ' (Wechsel)'
ROTATION_MIN_SECONDS = 5
ROTATION_MAX_SECONDS = 600
FREE_TEXT_FALLBACK_TITLE = 'Hinweis'


# ─── Reine Funktionen ─────────────────────────────────────────────────

def map_view_kind(old):
    """Neuer Ansichtstyp aus den alten Feldern (layout, show_webuntis, split_left, split_right)."""
    if not isinstance(old, dict):
        return 'info'
    layout = old.get('layout')
    if layout == 'standard':
        return 'substitutions' if old.get('show_webuntis') else 'info'
    if layout == 'split':
        sides = (old.get('split_left'), old.get('split_right'))
        return 'substitutions' if 'webuntis' in sides else 'info'
    return LAYOUT_TO_KIND.get(layout, 'info')


def map_on_air_behavior(old):
    """on_air_split hat Vorrang (so hat die alte Anzeige beide Schalter ausgewertet)."""
    if old.get('on_air_split'):
        return 'split'
    if old.get('on_air_fullscreen'):
        return 'fullscreen'
    return 'none'


def _clamp_seconds(value, default):
    try:
        value = int(value)
    except (TypeError, ValueError):
        value = default
    return max(ROTATION_MIN_SECONDS, min(ROTATION_MAX_SECONDS, value))


def _first_int(items):
    if isinstance(items, list) and items and isinstance(items[0], int) and not isinstance(items[0], bool):
        return items[0]
    return None


def translate_snapshot_b(data, reverse=False, media_kinds=None):
    """Schnappschuss (DisplayViewVersion.data) übersetzen.

    Vorwärts: `layout` -> `kind`, Medien und On-Air-Verhalten ableiten, entfallene Felder entfernen.
    Rückwärts: `kind` -> `layout`; `media_kinds` ({MediaFile-ID: kind}) entscheidet zwischen PDF und Bild.
    Unbekannte Schlüssel bleiben unverändert, Nicht-Dicts werden unverändert zurückgegeben."""
    if not isinstance(data, dict):
        return data
    if reverse:
        return _snapshot_backward(data, media_kinds or {})
    out = {k: v for k, v in data.items() if k not in REMOVED_VIEW_FIELDS}
    if 'layout' in data:
        layout = data.get('layout')
        out['kind'] = map_view_kind(data)
        out['style'] = 'auto'
        if layout in MEDIA_LAYOUT_FIELDS:
            file_id = data.get(f'{MEDIA_LAYOUT_FIELDS[layout]}_id')
            out['media_items'] = [file_id] if isinstance(file_id, int) else []
            if layout == 'pdf_fullscreen' and 'pdf_interval' in data:
                out['media_seconds'] = data['pdf_interval']
    if 'on_air_fullscreen' in data or 'on_air_split' in data:
        out['on_air_behavior'] = map_on_air_behavior(data)
    return out


def _snapshot_backward(data, media_kinds):
    out = dict(data)
    if 'kind' not in data:
        return out
    kind = data.get('kind')
    if kind == 'media':
        file_id = _first_int(data.get('media_items'))
        is_image = media_kinds.get(file_id) == 'image'
        out['layout'] = 'image_fullscreen' if is_image else 'pdf_fullscreen'
        out['active_image_id' if is_image else 'active_pdf_id'] = file_id
        if not is_image and 'media_seconds' in data:
            out['pdf_interval'] = data['media_seconds']
    else:
        out['layout'] = KIND_TO_LAYOUT.get(kind, 'standard')
    if 'on_air_behavior' in data:
        out['on_air_fullscreen'] = data['on_air_behavior'] == 'fullscreen'
        out['on_air_split'] = data['on_air_behavior'] == 'split'
    return out


# ─── Datenmigration vorwärts ─────────────────────────────────────────

def _load_settings(apps):
    Settings = apps.get_model('monitor', 'MonitorSettings')
    settings = Settings.objects.order_by('pk').first()
    return settings or Settings.objects.create(pk=1)


def _unique_slug(View, base):
    slug, counter = base[:50], 1
    while View.objects.filter(slug=slug).exists():
        suffix = f'-{counter}'
        slug = f'{base[:50 - len(suffix)]}{suffix}'
        counter += 1
    return slug


def _move_global_state(apps, views, now):
    """On-Air-Text/-Optik aus der On-Air-Ansicht, Status aus der ersten Ansicht, die ihn trägt."""
    settings = _load_settings(apps)
    fields = []
    on_air_views = [v for v in views if v.layout == 'on_air']
    source = next((v for v in on_air_views if v.deleted_at is None), on_air_views[0] if on_air_views else None)
    if source is not None:
        settings.on_air_text = source.on_air_text or 'ON AIR'
        settings.on_air_animation = 'blink' if source.on_air_blink else 'pulse'
        settings.on_air_show_clock = source.show_clock
        fields += ['on_air_text', 'on_air_animation', 'on_air_show_clock']
    on_air = next((v for v in views if v.is_on_air), None)
    if on_air is not None:
        settings.on_air_active = True
        settings.on_air_since = on_air.on_air_since or now
        fields += ['on_air_active', 'on_air_since']
    emergency = next((v for v in views if v.emergency_active), None)
    if emergency is not None:
        settings.emergency_active = True
        settings.emergency_text = emergency.emergency_text
        settings.emergency_since = now
        fields += ['emergency_active', 'emergency_text', 'emergency_since']
    if fields:
        settings.save(update_fields=fields)


def _media_items(view, live_file_ids):
    field = MEDIA_LAYOUT_FIELDS.get(view.layout)
    file_id = getattr(view, f'{field}_id') if field else None
    return [file_id] if file_id in live_file_ids else []


def _create_rotation_view(View, view):
    return View.objects.create(
        name=f'{view.name}{ROTATION_SUFFIX}'[:100],
        slug=_unique_slug(View, f'{view.slug}-wechsel'),
        api_token=uuid.uuid4().hex,
        is_default=False,
        sort_order=view.sort_order,
        kind='rotation',
        style='auto',
        on_air_behavior=view.on_air_behavior,
        rotation_items=[{'view_id': view.pk,
                         'seconds': _clamp_seconds(view.page_rotation_interval, 30)}],
    )


def _soft_delete_on_air_views(View, Screen, views, now):
    """On-Air-Ansichten in den Papierkorb. Standard-Rolle und Standard-Ansicht der Bildschirme
    gehen an eine lebende Ansicht, damit kein Bildschirm auf eine gelöschte zeigt."""
    on_air_ids = [v.pk for v in views if v.layout == 'on_air' and v.deleted_at is None]
    if not on_air_ids:
        return
    View.objects.filter(pk__in=on_air_ids).update(deleted_at=now)
    live = View.objects.filter(deleted_at__isnull=True)
    default = live.filter(is_default=True).first()
    if default is None:
        default = live.order_by('sort_order', 'name', 'pk').first()
        if default is not None:
            View.objects.filter(pk__in=on_air_ids).update(is_default=False)
            View.objects.filter(pk=default.pk).update(is_default=True)
    if default is not None:
        Screen.objects.filter(default_view_id__in=on_air_ids).update(default_view_id=default.pk)


def forward(apps, schema_editor):
    View = apps.get_model('monitor', 'DisplayView')
    Screen = apps.get_model('monitor', 'Screen')
    Announcement = apps.get_model('monitor', 'Announcement')
    Version = apps.get_model('monitor', 'DisplayViewVersion')
    MediaFile = apps.get_model('monitor', 'MediaFile')
    now = timezone.now()
    live_file_ids = set(MediaFile.objects.filter(deleted_at__isnull=True).values_list('pk', flat=True))

    views = list(View.objects.order_by('pk'))
    _move_global_state(apps, views, now)

    seen_texts = set()
    for view in views:
        old = {'layout': view.layout, 'show_webuntis': view.show_webuntis,
               'split_left': view.split_left, 'split_right': view.split_right,
               'on_air_fullscreen': view.on_air_fullscreen, 'on_air_split': view.on_air_split}
        view.kind = map_view_kind(old)
        view.style = 'auto'
        view.on_air_behavior = map_on_air_behavior(old)
        view.media_items = _media_items(view, live_file_ids)
        fields = ['kind', 'style', 'on_air_behavior', 'media_items']
        if view.layout == 'pdf_fullscreen':
            view.media_seconds = view.pdf_interval
            fields.append('media_seconds')
        view.save(update_fields=fields)

        if view.deleted_at is not None:
            continue  # Papierkorb: keine neuen Ankündigungen oder Wechsel-Ansichten
        title = (view.free_text_title or '').strip()
        text = (view.free_text_content or '').strip()
        if view.show_free_text and (title or text) and (title, text) not in seen_texts:
            seen_texts.add((title, text))
            Announcement.objects.create(title=title or FREE_TEXT_FALLBACK_TITLE, text=text,
                                        priority='normal', is_active=True)

        pages = view.page_rotation_pages
        if (view.show_page_rotation and view.layout != 'on_air' and isinstance(pages, list)
                and len(pages) >= 2):
            rotation = _create_rotation_view(View, view)
            Screen.objects.filter(default_view_id=view.pk).update(default_view_id=rotation.pk)

    _soft_delete_on_air_views(View, Screen, views, now)

    Screen.objects.filter(holiday_mode=True, power_mode='auto').update(power_mode='manual_off')

    for version in Version.objects.all():
        data = translate_snapshot_b(version.data)
        if data != version.data:
            version.data = data
            version.save(update_fields=['data'])


# ─── Datenmigration rückwärts ─────────────────────────────────────────

def _repoint_rotation_references(apps, rotation_views):
    """Verweise auf Rotations-Ansichten zeigen wieder auf deren erste Ansicht."""
    Screen = apps.get_model('monitor', 'Screen')
    Assignment = apps.get_model('monitor', 'DisplayEventScreen')
    rotation_ids = {r.pk for r in rotation_views}
    View = apps.get_model('monitor', 'DisplayView')
    existing = set(View.objects.exclude(pk__in=rotation_ids).values_list('pk', flat=True))
    target = {}
    for rotation in rotation_views:
        items = rotation.rotation_items if isinstance(rotation.rotation_items, list) else []
        ids = [i.get('view_id') for i in items if isinstance(i, dict)]
        target[rotation.pk] = next((i for i in ids if i in existing), None)
    for old_id, new_id in target.items():
        Screen.objects.filter(default_view_id=old_id).update(default_view_id=new_id)
        Screen.objects.filter(override_view_id=old_id).update(override_view_id=new_id)
        if new_id is not None:
            Assignment.objects.filter(view_id=old_id).update(view_id=new_id)
    for screen in Screen.objects.all():
        schedule = screen.schedule
        if not isinstance(schedule, list):
            continue
        changed = [dict(e, view_id=target[e['view_id']])
                   if isinstance(e, dict) and e.get('view_id') in target else e for e in schedule]
        if changed != schedule:
            screen.schedule = changed
            screen.save(update_fields=['schedule'])


def backward(apps, schema_editor):
    View = apps.get_model('monitor', 'DisplayView')
    Version = apps.get_model('monitor', 'DisplayViewVersion')
    MediaFile = apps.get_model('monitor', 'MediaFile')
    media_kinds = dict(MediaFile.objects.values_list('pk', 'kind'))
    settings = _load_settings(apps)

    rotation_views = list(View.objects.filter(kind='rotation'))
    _repoint_rotation_references(apps, rotation_views)
    View.objects.filter(pk__in=[v.pk for v in rotation_views]).delete()

    for view in View.objects.all():
        data = translate_snapshot_b(
            {'kind': view.kind, 'media_items': view.media_items, 'media_seconds': view.media_seconds,
             'on_air_behavior': view.on_air_behavior},
            reverse=True, media_kinds=media_kinds)
        view.layout = data['layout']
        view.on_air_fullscreen = data['on_air_fullscreen']
        view.on_air_split = data['on_air_split']
        for fk in ('active_pdf_id', 'active_image_id'):
            if data.get(fk) in media_kinds:
                setattr(view, fk, data[fk])
        if 'pdf_interval' in data:
            view.pdf_interval = data['pdf_interval']
        view.is_on_air = settings.on_air_active
        view.on_air_since = settings.on_air_since
        view.on_air_text = settings.on_air_text
        view.on_air_blink = settings.on_air_animation == 'blink'
        view.emergency_active = settings.emergency_active
        view.emergency_text = settings.emergency_text
        view.save()

    for version in Version.objects.all():
        data = translate_snapshot_b(version.data, reverse=True, media_kinds=media_kinds)
        if data != version.data:
            version.data = data
            version.save(update_fields=['data'])


class Migration(migrations.Migration):

    dependencies = [
        ('monitor', '0039_display_admin_fields'),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
