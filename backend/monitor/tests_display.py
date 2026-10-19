"""Display-Vertrag (Spec §4.1) und Vorschau (Spec §4.5)."""
from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from core.auth import KeycloakAuth
from users.models import Permission, UserProfile

from . import display
from .models import (
    DisplayView, Exam, MediaFile, MediaPage, MonitorSettings, Screen,
)

TOP_KEYS = {'generated_at', 'reload_requested_at', 'screen', 'mode', 'view'}
SCREEN_KEYS = {'slug', 'name', 'location', 'scale', 'orientation', 'power'}
VIEW_KEYS = {'id', 'kind', 'style', 'page_seconds', 'show_weather', 'weather', 'qr', 'data'}
DATA_KEYS = {
    'departures': {'stations', 'disruptions'},
    'substitutions': {'source', 'news', 'days', 'fallback_url'},
    'split': {'left', 'right', 'left_percent'},
    'media': {'seconds', 'per_screen', 'pages'},
    'info': {'announcements', 'events', 'countdown'},
    'rotation': {'items'},
}
MODE_KEYS = {
    'emergency': {'kind', 'text', 'note', 'since'},
    'exam': {'kind', 'display', 'side', 'title', 'text', 'active_from', 'active_until', 'location'},
    'on_air': {'kind', 'display', 'side', 'text', 'animation', 'show_clock', 'since'},
}

SUBSTITUTIONS = {
    'source': 'substitutions', 'news': 'Heute 3. Stunde Vollversammlung',
    'days': [
        {'date': '2026-10-19', 'label': 'Heute', 'rows': [
            {'class': '7b', 'periods': '3-4', 'subject': 'Ma', 'teacher': 'MUE', 'teacher_old': 'SCH',
             'room': 'A12', 'room_old': '', 'kind': 'substitution', 'note': ''}]},
        {'date': '2026-10-20', 'label': 'Morgen', 'rows': []},
    ],
}

STATION = {
    'station_name': 'Lübeck Hbf', 'station_id': '8000237',
    'departures': [{'line': 'RE8', 'direction': 'Hamburg', 'departure': f'10:{i:02d}'} for i in range(12)],
}


def _mock_sources():
    return [
        mock.patch('monitor.display.oepnv.fetch_departures', return_value=[dict(STATION)]),
        mock.patch('monitor.display.oepnv.fetch_disruptions_nahsh', return_value=[]),
        mock.patch('monitor.display.oepnv.fetch_disruptions_swl', return_value=[]),
        mock.patch('monitor.display.webuntis.get_substitutions', return_value=SUBSTITUTIONS),
    ]


class DisplayTestBase(TestCase):
    def setUp(self):
        cache.clear()
        self.now = timezone.now()
        for p in _mock_sources():
            p.start()
            self.addCleanup(p.stop)

    def view(self, kind, **kwargs):
        kwargs.setdefault('slug', f'v-{kind}')
        kwargs.setdefault('name', kind)
        return DisplayView.objects.create(kind=kind, is_default=False, **kwargs)


class ContractTest(DisplayTestBase):

    def _payload(self, view, screen=None, key_ok=True):
        return display.build_payload(screen, view, key_ok=key_ok, now=self.now)

    def test_contract_per_kind(self):
        info = self.view('info')
        pdf = MediaFile.objects.create(name='Plan', file='monitor/pdf/plan.pdf', kind='pdf', status='ready',
                                       page_count=2)
        for i in range(2):
            MediaPage.objects.create(file=pdf, index=i, image=f'monitor/pages/p{i}.webp',
                                     width=2715, height=3840, orientation='portrait')
        views = {
            'departures': self.view('departures', transit_stops=[{'id': '8000237', 'name': 'Hbf'}]),
            'substitutions': self.view('substitutions', webuntis_url='https://example.org/untis'),
            'split': self.view('split', split_left='substitutions', split_right='departures',
                               transit_stops=[{'id': '8000237', 'name': 'Hbf'}]),
            'media': self.view('media', media_items=[pdf.id]),
            'info': info,
            'rotation': self.view('rotation', rotation_items=[{'view_id': info.id, 'seconds': 20}]),
        }
        screen = Screen.objects.create(name='Halle', slug='halle', location='Eingangshalle')
        for kind, view in views.items():
            with self.subTest(kind=kind):
                payload = self._payload(view, screen)
                self.assertEqual(set(payload), TOP_KEYS)
                self.assertEqual(set(payload['screen']), SCREEN_KEYS)
                self.assertEqual(set(payload['view']), VIEW_KEYS)
                self.assertEqual(payload['view']['kind'], kind)
                self.assertEqual(set(payload['view']['data']), DATA_KEYS[kind])

        split = self._payload(views['split'])['view']['data']
        self.assertEqual(set(split['left']), {'kind', 'data'})
        self.assertEqual(set(split['left']['data']), DATA_KEYS['substitutions'])
        self.assertEqual(set(split['right']['data']), DATA_KEYS['departures'])

        [station] = self._payload(views['departures'])['view']['data']['stations']
        self.assertEqual(station['max_departures'], 10)
        self.assertEqual(len(station['departures']), 10)

        pages = self._payload(views['media'])['view']['data']['pages']
        self.assertEqual(len(pages), 2)
        self.assertEqual(set(pages[0]), {'url', 'width', 'height', 'orientation'})

        self.assertEqual(self._payload(views['split'])['view']['style'], 'dense')
        self.assertEqual(self._payload(info)['view']['style'], 'ci')

    def test_unknown_screen_returns_nulls(self):
        r = self.client.get('/api/monitor/display', {'screen': 'gibt-es-nicht'})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(set(data), TOP_KEYS)
        self.assertEqual((data['screen'], data['view'], data['mode']), (None, None, None))

    def test_mode_priority(self):
        view = self.view('info')
        screen = Screen.objects.create(name='Halle', slug='halle', default_view=view)
        exam = Exam.objects.create(title='Abitur Mathe', active_from=self.now - timedelta(hours=1),
                                   active_until=self.now + timedelta(hours=1), display_mode='split',
                                   split_side='left')
        exam.screens.add(screen)
        settings = MonitorSettings.load()
        settings.on_air_active = True
        settings.on_air_since = self.now
        settings.emergency_active = True
        settings.emergency_text = 'Bitte das Gebäude verlassen'
        settings.save()

        mode = display.build_payload(screen, view, key_ok=False, now=self.now)['mode']
        self.assertEqual(mode['kind'], 'emergency')
        self.assertEqual(set(mode), MODE_KEYS['emergency'])

        settings.emergency_active = False
        settings.save()
        mode = display.build_payload(screen, view, key_ok=False, now=self.now)['mode']
        self.assertEqual(set(mode), MODE_KEYS['exam'])
        self.assertEqual((mode['kind'], mode['display'], mode['side'], mode['location']),
                         ('exam', 'split', 'left', None))

        exam.delete()
        view.on_air_behavior = 'split'
        view.on_air_split_side = 'left'
        mode = display.build_payload(screen, view, key_ok=False, now=self.now)['mode']
        self.assertEqual(set(mode), MODE_KEYS['on_air'])
        self.assertEqual((mode['kind'], mode['display'], mode['side']), ('on_air', 'split', 'left'))

    def test_on_air_none_behavior(self):
        view = self.view('info', on_air_behavior='none')
        settings = MonitorSettings.load()
        settings.on_air_active = True
        settings.save()
        self.assertIsNone(display.build_payload(None, view, key_ok=False, now=self.now)['mode'])

    def test_substitutions_without_key_returns_fallback_only(self):
        view = self.view('substitutions', webuntis_url='https://example.org/untis')
        screen = Screen.objects.create(name='Halle', slug='halle', default_view=view)
        data = self.client.get('/api/monitor/display', {'screen': 'halle'}).json()['view']['data']
        self.assertEqual(data, {'source': None, 'news': None, 'days': [],
                                'fallback_url': 'https://example.org/untis'})
        data = self.client.get('/api/monitor/display', {'screen': 'halle', 'key': 'falsch'}).json()
        self.assertEqual(data['view']['data']['days'], [])
        # Schlüssel eines anderen Bildschirms gilt nicht
        other = Screen.objects.create(name='Andere', slug='andere')
        data = self.client.get('/api/monitor/display', {'screen': 'halle', 'key': other.access_key}).json()
        self.assertEqual(data['view']['data']['days'], [])
        self.assertIsNotNone(screen.access_key)

    def test_substitutions_with_key(self):
        view = self.view('substitutions', webuntis_url='https://example.org/untis')
        screen = Screen.objects.create(name='Halle', slug='halle', default_view=view)
        data = self.client.get('/api/monitor/display',
                               {'screen': 'halle', 'key': screen.access_key}).json()['view']['data']
        self.assertEqual(data['source'], 'substitutions')
        self.assertEqual([d['label'] for d in data['days']], ['Heute', 'Morgen'])
        self.assertEqual(data['news'], SUBSTITUTIONS['news'])

        view.substitutions_next_day = False
        view.save()
        data = self.client.get('/api/monitor/display',
                               {'bildschirm': 'halle', 'key': screen.access_key}).json()['view']['data']
        self.assertEqual([d['label'] for d in data['days']], ['Heute'])

    def test_substitutions_with_bearer_and_monitor_view(self):
        view = self.view('substitutions')
        Screen.objects.create(name='Halle', slug='halle', default_view=view)
        perm, _ = Permission.objects.get_or_create(code='monitor.view', defaults={'name': 'Monitor ansehen'})
        UserProfile.objects.create(keycloak_id='tester').permissions.add(perm)
        with mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'}):
            data = self.client.get('/api/monitor/display', {'screen': 'halle'},
                                   HTTP_AUTHORIZATION='Bearer x').json()
        self.assertEqual(len(data['view']['data']['days']), 2)
        # ohne Recht: kein Fehler, nur Rückfall
        with mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'fremd'}):
            r = self.client.get('/api/monitor/display', {'screen': 'halle'}, HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['view']['data']['days'], [])

    def test_rotation_resolved(self):
        info = self.view('info')
        departures = self.view('departures')
        deleted = self.view('media', deleted_at=self.now)
        rotation = self.view('rotation', rotation_items=[
            {'view_id': info.id, 'seconds': 20}, {'view_id': departures.id, 'seconds': 30},
            {'view_id': deleted.id, 'seconds': 10},
        ])
        items = display.build_payload(None, rotation, key_ok=False, now=self.now)['view']['data']['items']
        self.assertEqual([(i['seconds'], i['view']['kind']) for i in items],
                         [(20, 'info'), (30, 'departures')])
        self.assertEqual(set(items[0]), {'seconds', 'view'})
        self.assertEqual(set(items[0]['view']), VIEW_KEYS)

    def test_media_pages_selection_and_status(self):
        def make(name, status, count, kind='pdf', deleted_at=None):
            f = MediaFile.objects.create(name=name, file=f'monitor/pdf/{name}.pdf', kind=kind,
                                         status=status, deleted_at=deleted_at)
            for i in range(count):
                MediaPage.objects.create(file=f, index=i, image=f'monitor/pages/{name}-{i}.webp',
                                         width=3840, height=2160)
            return f
        pdf = make('a', 'ready', 5)
        failed_with_pages = make('b', 'failed', 1)
        failed_empty = make('c', 'failed', 0)
        processing = make('d', 'processing', 1)
        trashed = make('e', 'ready', 1, deleted_at=self.now)
        image = make('f', 'ready', 1, kind='image')
        view = self.view('media', pdf_mode='selection', pdf_pages='4, 2-3, 9',
                         media_items=[pdf.id, failed_with_pages.id, failed_empty.id, processing.id,
                                      trashed.id, image.id], media_seconds=12, pdf_per_screen=2)
        data = display.build_payload(None, view, key_ok=False, now=self.now)['view']['data']
        self.assertEqual((data['seconds'], data['per_screen']), (12, 2))
        self.assertEqual([p['url'].rsplit('/', 1)[1] for p in data['pages']],
                         ['a-3.webp', 'a-1.webp', 'a-2.webp', 'b-0.webp', 'f-0.webp'])

        view.pdf_mode = 'static'
        view.pdf_static_page = 2
        data = display.build_payload(None, view, key_ok=False, now=self.now)['view']['data']
        self.assertEqual([p['url'].rsplit('/', 1)[1] for p in data['pages']][:2], ['a-1.webp', 'a-2.webp'])

    def test_legacy_params_still_work(self):
        view = self.view('info', slug='v')
        Screen.objects.create(name='Glocke', slug='glocke', default_view=view)
        for params in ({'bildschirm': 'glocke'}, {'profil': 'v'}, {'screen': 'glocke'}, {'view': 'v'}):
            with self.subTest(params=params):
                r = self.client.get('/api/monitor/display', params)
                self.assertEqual(r.status_code, 200)
                data = r.json()
                self.assertEqual(data['view']['id'], view.id)
                self.assertEqual(set(data), TOP_KEYS)
        self.assertEqual(self.client.get('/api/monitor/display', {'bildschirm': 'glocke'}).json()
                         ['screen']['slug'], 'glocke')


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class PreviewTest(DisplayTestBase):

    def setUp(self):
        super().setUp()
        self.saved = self.view('info', name='Gespeichert')
        self.profile = UserProfile.objects.create(keycloak_id='tester')
        auth = mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'})
        auth.start()
        self.addCleanup(auth.stop)

    def grant_setup(self):
        perm, _ = Permission.objects.get_or_create(code='monitor.setup', defaults={'name': 'Monitor einrichten'})
        self.profile.permissions.add(perm)

    def post_preview(self, body):
        return self.client.post('/api/monitor/views/preview', body, content_type='application/json',
                                HTTP_AUTHORIZATION='Bearer x')

    def test_preview_requires_setup_and_token(self):
        body = {'view': {'id': self.saved.id, 'name': 'Entwurf', 'kind': 'departures'}}
        self.assertEqual(self.post_preview(body).status_code, 403)

        self.grant_setup()
        r = self.post_preview(body)
        self.assertEqual(r.status_code, 200, r.content)
        token = r.json()['token']
        self.assertEqual(len(token), 32)

        data = self.client.get('/api/monitor/display', {'preview': token}).json()
        self.assertEqual(set(data), TOP_KEYS)
        self.assertEqual((data['view']['id'], data['view']['kind']), (self.saved.id, 'departures'))
        self.assertEqual(set(data['view']['data']), DATA_KEYS['departures'])
        self.saved.refresh_from_db()
        self.assertEqual((self.saved.name, self.saved.kind), ('Gespeichert', 'info'))

    def test_preview_new_view_with_screen_has_key_ok(self):
        self.grant_setup()
        screen = Screen.objects.create(name='Halle', slug='halle')
        r = self.post_preview({'view': {'kind': 'substitutions'}, 'screen_id': screen.id})
        token = r.json()['token']
        count = DisplayView.objects.count()
        data = self.client.get('/api/monitor/display', {'preview': token}).json()
        self.assertEqual(data['screen']['slug'], 'halle')
        self.assertEqual(len(data['view']['data']['days']), 2)
        self.assertEqual(DisplayView.objects.count(), count)

    def test_preview_unknown_screen_is_404(self):
        self.grant_setup()
        self.assertEqual(self.post_preview({'view': {'kind': 'info'}, 'screen_id': 999}).status_code, 404)

    def test_preview_token_expires(self):
        self.grant_setup()
        token = self.post_preview({'view': {'kind': 'info'}}).json()['token']
        self.assertEqual(self.client.get('/api/monitor/display', {'preview': token}).status_code, 200)
        cache.clear()
        self.assertEqual(self.client.get('/api/monitor/display', {'preview': token}).status_code, 404)
        self.assertEqual(self.client.get('/api/monitor/display', {'preview': 'kurz'}).status_code, 404)
