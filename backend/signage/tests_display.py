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

TOP_KEYS = {'generated_at', 'reload_requested_at', 'screen', 'scheme', 'mode', 'view'}
SCREEN_KEYS = {'slug', 'name', 'location', 'scale', 'orientation', 'power', 'scheme'}
VIEW_KEYS = {'id', 'kind', 'layout', 'page_seconds', 'show_weather', 'weather', 'qr', 'data'}
DATA_KEYS = {
    'departures': {'stations', 'disruptions'},
    'substitutions': {'source', 'fallback', 'group_by', 'columns', 'days', 'news', 'updated_at',
                      'fetched_at', 'embed_url', 'mode'},
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

SUBSTITUTION_ROW = {'classes': ['7b'], 'group': '', 'periods': '3.–4.', 'subject': 'Ma', 'teacher': 'MUE',
                    'teacher_old': 'HAX', 'room': 'A12', 'room_old': '', 'kind': 'substitution',
                    'kind_label': 'Vertretung', 'note': ''}


def fake_load_days(server, school, format_name, *, start, count, overrides, show_absences, deadline):
    """Monitor endpoint without network: `count` calendar days from `start`."""
    days = [{'date': (start + timedelta(days=i)).isoformat(), 'next_date': None, 'updated_at': None,
             'absent': [], 'affected': {'classes': [], 'teachers': []},
             'messages': [{'subject': '', 'body': 'Heute 3. Stunde Vollversammlung'}],
             'rows': [dict(SUBSTITUTION_ROW)] if i == 0 else []} for i in range(count)]
    return {'group_by': 'class', 'columns': {'class': True, 'subject': True, 'teacher': True,
                                             'room': True, 'note': True},
            'days': days, 'updated_at': '2026-10-19T07:42:00+02:00'}


def configure_webuntis():
    settings = MonitorSettings.load()
    settings.webuntis_server, settings.webuntis_school = 'untis.example', 'schule'
    settings.save()

STATION = {
    'station_name': 'Lübeck Hbf', 'station_id': '8000237',
    'departures': [{'line': 'RE8', 'direction': 'Hamburg', 'departure': f'10:{i:02d}'} for i in range(12)],
}


def _mock_sources():
    return [
        mock.patch('signage.display.transit.fetch_departures', return_value=[dict(STATION)]),
        mock.patch('signage.display.transit.fetch_disruptions_nahsh', return_value=[]),
        mock.patch('signage.display.transit.fetch_disruptions_swl', return_value=[]),
        mock.patch('signage.substitutions.untis_monitor.load_days', side_effect=fake_load_days),
    ]


class DisplayTestBase(TestCase):
    def setUp(self):
        cache.clear()
        configure_webuntis()
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

        self.assertEqual(self._payload(views['split'])['view']['layout'], 'wide')
        self.assertEqual(self._payload(info)['view']['layout'], 'normal')

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
        self.assertEqual((data['source'], data['days'], data['mode'], data['embed_url']),
                         (None, [], 'embed', 'https://example.org/untis'))
        data = self.client.get('/api/monitor/display', {'screen': 'halle', 'key': 'falsch'}).json()
        self.assertEqual(data['view']['data']['days'], [])
        # Another screen's key does not count
        other = Screen.objects.create(name='Andere', slug='andere')
        data = self.client.get('/api/monitor/display', {'screen': 'halle', 'key': other.access_key}).json()
        self.assertEqual(data['view']['data']['days'], [])
        self.assertIsNotNone(screen.access_key)

    def test_substitutions_with_key(self):
        view = self.view('substitutions', webuntis_url='https://example.org/untis',
                         substitutions_next_day_from='')
        screen = Screen.objects.create(name='Halle', slug='halle', default_view=view)
        data = self.client.get('/api/monitor/display',
                               {'screen': 'halle', 'key': screen.access_key}).json()['view']['data']
        self.assertEqual((data['source'], data['mode'], data['fallback']), ('monitor', 'live', False))
        self.assertEqual([d['label'] for d in data['days']], ['Heute', 'Morgen'])
        self.assertEqual(data['days'][0]['messages'][0]['body'], 'Heute 3. Stunde Vollversammlung')
        self.assertEqual(data['days'][0]['rows'][0]['classes_label'], '7b')
        self.assertEqual(data['updated_at'], '2026-10-19T07:42:00+02:00')
        self.assertIsNotNone(data['fetched_at'])

        view.substitutions_format = 'students_1'
        view.save()
        data = self.client.get('/api/monitor/display',
                               {'bildschirm': 'halle', 'key': screen.access_key}).json()['view']['data']
        self.assertEqual([d['label'] for d in data['days']], ['Heute'])

    def test_substitutions_with_bearer_and_monitor_view(self):
        view = self.view('substitutions')
        Screen.objects.create(name='Halle', slug='halle', default_view=view)
        perm, _ = Permission.objects.get_or_create(code='signage.view', defaults={'name': 'Monitor ansehen'})
        UserProfile.objects.create(keycloak_id='tester').permissions.add(perm)
        with mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'}):
            data = self.client.get('/api/monitor/display', {'screen': 'halle'},
                                   HTTP_AUTHORIZATION='Bearer x').json()
        self.assertEqual(len(data['view']['data']['days']), 2)
        # without permission: no error, only the fallback
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


class PreviewTestBase(DisplayTestBase):

    def setUp(self):
        super().setUp()
        self.saved = self.view('info', name='Gespeichert')
        self.profile = UserProfile.objects.create(keycloak_id='tester')
        auth = mock.patch.object(KeycloakAuth, '__call__', return_value={'sub': 'tester'})
        auth.start()
        self.addCleanup(auth.stop)

    def grant_setup(self):
        perm, _ = Permission.objects.get_or_create(code='signage.setup', defaults={'name': 'Monitor einrichten'})
        self.profile.permissions.add(perm)

    def post_preview(self, body):
        return self.client.post('/api/monitor/views/preview', body, content_type='application/json',
                                HTTP_AUTHORIZATION='Bearer x')


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class PreviewTest(PreviewTestBase):

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

    def test_preview_ignores_power_and_special_modes(self):
        self.grant_setup()
        screen = Screen.objects.create(name='Halle', slug='halle', power_mode='manual_off')
        settings = MonitorSettings.load()
        settings.on_air_active = True
        settings.save()
        token = self.post_preview({'view': {'kind': 'info'}, 'screen_id': screen.id}).json()['token']
        data = self.client.get('/api/monitor/display', {'preview': token}).json()
        self.assertTrue(data['screen']['power'])
        self.assertIsNone(data['mode'])
        settings.emergency_active = True
        settings.save()
        self.assertIsNone(self.client.get('/api/monitor/display', {'preview': token}).json()['mode'])
        # a normal fetch stays unchanged
        live = self.client.get('/api/monitor/display', {'screen': 'halle'}).json()
        self.assertEqual(live['mode']['kind'], 'emergency')

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


@override_settings(CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class PreviewValidationTest(PreviewTestBase):
    def setUp(self):
        super().setUp()
        self.grant_setup()

    def assert_rejected(self, body, fragment):
        r = self.post_preview(body)
        self.assertEqual(r.status_code, 422, r.content)
        detail = r.json()['detail']
        self.assertIsInstance(detail, str)
        self.assertIn(fragment, detail)

    def test_invalid_rotation_items_rejected(self):
        rotation = self.view('rotation', name='Wechsel')
        self.assert_rejected({'view': {'kind': 'rotation', 'rotation_items': [{'view_id': 999999, 'seconds': 10}]}},
                             'existiert nicht')
        self.assert_rejected({'view': {'id': rotation.id, 'rotation_items': [{'view_id': rotation.id, 'seconds': 10}]}},
                             'nicht selbst')
        # saved rotation, the draft empties the list: the saved kind counts
        self.assert_rejected({'view': {'id': rotation.id, 'rotation_items': []}}, 'mindestens eine Ansicht')
        self.assert_rejected({'view': {'kind': 'rotation', 'rotation_items': [{'view_id': self.saved.id, 'seconds': 'x'}]}},
                             'Sekunden')

    def test_invalid_transit_fields_rejected(self):
        self.assert_rejected({'view': {'id': self.saved.id, 'transit_duration': None}}, 'Vorausschau')
        self.assert_rejected({'view': {'id': self.saved.id, 'transit_source_db': None}}, 'Deutsche Bahn')
        self.assert_rejected({'view': {'id': self.saved.id, 'transit_disruption_hidden': [3]}}, 'Ausgeblendete Meldungen')

    def test_invalid_choices_rejected(self):
        self.assert_rejected({'view': {'kind': 'tabelle'}}, 'Typ')
        self.assert_rejected({'view': {'id': self.saved.id, 'layout': 'bunt'}}, 'Aufteilung')
        self.assert_rejected({'view': {'on_air_behavior': 'flash'}}, 'On-Air')
        self.assert_rejected({'view': {'split_left': 'kantine'}}, 'Split')

    def test_invalid_substitution_fields_rejected(self):
        self.assert_rejected({'view': {'substitutions_source': 'ical'}}, 'Datenquelle')
        self.assert_rejected({'view': {'substitutions_format': 'eltern'}}, 'Ausgabe')
        for value in ('16 Uhr', '24:00', '7:30'):
            with self.subTest(value=value):
                self.assert_rejected({'view': {'substitutions_next_day_from': value}},
                                     'Uhrzeit ungültig: bitte im Format HH:MM eintragen oder leer lassen')
        self.assert_rejected({'view': {'substitutions_custom_format': 'x' * 101}}, 'Eigenes Format')

    def test_substitution_fields_accepted(self):
        for value in ('', '07:30', None):
            with self.subTest(value=value):
                r = self.post_preview({'view': {'id': self.saved.id, 'kind': 'substitutions',
                                                'substitutions_next_day_from': value,
                                                'substitutions_show_exams': None,
                                                'substitutions_source': 'account',
                                                'substitutions_format': 'custom',
                                                'substitutions_custom_format': 'vplan-aula'}})
                self.assertEqual(r.status_code, 200, r.content)

    def test_save_substitution_fields(self):
        view = self.view('substitutions', substitutions_show_exams=True)
        r = self.client.put(f'/api/monitor/config?view_id={view.id}', {
            'substitutions_source': 'embed', 'substitutions_format': 'teachers',
            'substitutions_show_exams': None, 'substitutions_show_absences': False,
            'substitutions_next_day_from': ''}, content_type='application/json',
            HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body['substitutions_source'], body['substitutions_format'],
                          body['substitutions_show_exams'], body['substitutions_show_absences'],
                          body['substitutions_next_day_from']), ('embed', 'teachers', None, False, ''))
        view.refresh_from_db()
        self.assertIsNone(view.substitutions_show_exams)

    def test_invalid_countdown_date_rejected(self):
        self.assert_rejected({'view': {'custom_countdown_date': 'morgen früh'}}, 'Countdown')

    def test_naive_countdown_date_is_local_time(self):
        body = {'view': {'id': self.saved.id, 'show_custom_countdown': True, 'custom_countdown_name': 'Abi',
                         'custom_countdown_date': '2099-06-01T10:00'}}
        r = self.post_preview(body)
        self.assertEqual(r.status_code, 200, r.content)
        data = self.client.get('/api/monitor/display', {'preview': r.json()['token']})
        self.assertEqual(data.status_code, 200)
        countdown = data.json()['view']['data']['countdown']
        self.assertEqual(countdown['name'], 'Abi')
        self.assertTrue(countdown['date'].startswith('2099-06-01T10:00:00+02:00'), countdown['date'])

    def test_empty_number_rejected(self):
        self.assert_rejected({'view': {'id': self.saved.id, 'page_seconds': None}}, 'Blättertakt')


class UpcomingEventsTest(TestCase):
    def make(self, titel, von, bis, status='geplant'):
        from veranstaltung.models import Veranstaltung
        return Veranstaltung.objects.create(titel=titel, datum_von=von, datum_bis=bis, status=status)

    def test_planned_and_running_listed_cancelled_skipped(self):
        now = timezone.now()
        self.make('Konzert', now + timedelta(days=2), now + timedelta(days=2, hours=2))
        self.make('Probe', now - timedelta(hours=1), now + timedelta(hours=1))
        self.make('Abgesagt', now + timedelta(days=1), now + timedelta(days=1, hours=1), status='abgesagt')
        self.make('Zu spaet', now + timedelta(days=10), now + timedelta(days=10, hours=1))
        self.make('Vorbei', now - timedelta(days=2), now - timedelta(days=1))
        events = display._upcoming_events(now)
        self.assertEqual([e['name'] for e in events], ['Probe', 'Konzert'])
        self.assertEqual([e['is_running'] for e in events], [True, False])
