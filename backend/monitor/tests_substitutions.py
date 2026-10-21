"""Vertretungsplan: Quellenkette, Ausweichen und Tageslogik (Spec §1.1, §1.3).

Keine Netzaufrufe: untis_monitor.load_days und webuntis.get_substitutions werden gepatcht.
2026-10-19 ist ein Montag.
"""
from datetime import date, datetime
from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from . import display, substitutions, webuntis
from .models import DisplayView, Exam, MonitorSettings, Screen
from .untis_monitor import MonitorUnavailable


def local(y, m, d, hh=0, mm=0):
    return timezone.make_aware(datetime(y, m, d, hh, mm), timezone.get_default_timezone())


MONDAY_8 = local(2026, 10, 19, 8)
MONDAY_1559 = local(2026, 10, 19, 15, 59)
MONDAY_16 = local(2026, 10, 19, 16, 0)
TODAY = date(2026, 10, 19)


def row(classes, group='', periods='3.', **extra):
    base = {'classes': classes, 'group': group, 'periods': periods, 'subject': 'MA', 'teacher': 'KAA',
            'teacher_old': 'MÜB', 'room': '204', 'room_old': '', 'kind': 'substitution',
            'kind_label': 'Vertretung', 'note': ''}
    return {**base, **extra}


def monitor_day(day, rows=None):
    return {'date': day, 'next_date': None, 'updated_at': '2026-10-19T07:42:00+02:00',
            'absent': [{'name': 'BEC', 'kind': 'teacher', 'periods': '3.–4.'}],
            'affected': {'classes': ['7a'], 'teachers': ['KAA']}, 'messages': [{'subject': 'A', 'body': 'B'}],
            'rows': rows if rows is not None else [row(['7a'])]}


def monitor_result(group_by='class', days=None):
    return {'group_by': group_by,
            'columns': {'class': True, 'subject': True, 'teacher': True, 'room': True, 'note': True},
            'days': days or [monitor_day('2026-10-19'), monitor_day('2026-10-20')],
            'updated_at': '2026-10-19T07:42:00+02:00'}


ACCOUNT = {'source': 'substitutions', 'news': 'Vollversammlung',
           'days': [{'date': '2026-10-19', 'label': 'Heute', 'rows': [row(['5a', '6b'])]}],
           'fetched_at': '2026-10-19T06:00:00+00:00', 'updated_at': None}
UNAVAILABLE = {'source': 'unavailable', 'news': None, 'days': [], 'fetched_at': None, 'updated_at': None}


class SubstitutionsTestBase(TestCase):

    def setUp(self):
        cache.clear()
        settings = MonitorSettings.load()
        settings.webuntis_server = 'untis.example'
        settings.webuntis_school = 'schule'
        settings.webuntis_username = 'monitor'
        settings.webuntis_password = 'geheim'
        settings.save()
        self.load_days = self.patch('monitor.substitutions.untis_monitor.load_days',
                                    return_value=monitor_result())
        self.account = self.patch('monitor.substitutions.webuntis.get_substitutions', return_value=ACCOUNT)

    def patch(self, target, **kwargs):
        patcher = mock.patch(target, **kwargs)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def view(self, **kwargs):
        kwargs.setdefault('slug', 'vplan')
        return DisplayView.objects.create(kind='substitutions', is_default=False, name='Vplan', **kwargs)

    def load(self, view, now=MONDAY_8, single_day=False):
        return substitutions.load(view, now, single_day=single_day)


class MonitorSourceTest(SubstitutionsTestBase):

    def test_monitor_source_default(self):
        view = self.view()
        self.assertEqual((view.substitutions_source, view.substitutions_format), ('monitor', 'students_2'))
        result = self.load(view)
        args, kwargs = self.load_days.call_args
        self.assertEqual(args, ('untis.example', 'schule', 'vplan-schueler'))
        self.assertEqual((kwargs['start'], kwargs['count'], kwargs['show_absences']), (TODAY, 2, True))
        self.assertEqual((result['source'], result['fallback'], result['group_by']), ('monitor', False, 'class'))
        self.assertEqual(set(result), {'source', 'fallback', 'group_by', 'columns', 'days', 'news',
                                       'updated_at', 'fetched_at'})
        self.assertEqual([d['label'] for d in result['days']], ['Heute', 'Morgen'])
        self.assertEqual(set(result['days'][0]), {'date', 'label', 'absent', 'affected', 'messages', 'rows'})
        self.assertEqual(result['days'][0]['rows'][0]['classes_label'], '7a')
        self.assertEqual(result['days'][0]['rows'][0]['grade'], '7')
        self.assertEqual(result['days'][0]['absent'][0]['periods'], '3.–4.')
        self.account.assert_not_called()

    def test_students_1_single_day(self):
        self.load(self.view(substitutions_format='students_1'))
        args, kwargs = self.load_days.call_args
        self.assertEqual((args[2], kwargs['count']), ('vplan-schueler-1', 1))

    def test_custom_format_name(self):
        self.load(self.view(substitutions_format='custom', substitutions_custom_format=' vplan-aula '))
        self.assertEqual(self.load_days.call_args.args[2], 'vplan-aula')

    def test_custom_format_without_name_falls_back(self):
        result = self.load(self.view(substitutions_format='custom'))
        self.load_days.assert_not_called()
        self.assertEqual((result['source'], result['fallback']), ('substitutions', True))

    def test_teachers_group_by_teacher(self):
        self.load_days.return_value = monitor_result('teacher', [monitor_day('2026-10-19', [
            row(['Q2a', 'Q2b'], group='KAA'), row(['Q2a', 'Q2b'], group='KAA'), row(['5a'], group='BEC')])])
        result = self.load(self.view(substitutions_format='teachers'))
        self.assertEqual(self.load_days.call_args.args[2], 'vplan-lehrer')
        rows = result['days'][0]['rows']
        self.assertEqual(result['group_by'], 'teacher')
        self.assertEqual([(r['group'], r['classes_label']) for r in rows], [('BEC', '5a'), ('KAA', 'Q2a, b')])
        self.assertNotIn('grade', rows[0])

    def test_student_rows_split_by_grade(self):
        self.load_days.return_value = monitor_result(days=[monitor_day('2026-10-19', [row(['Q1c', 'Q2a'])])])
        rows = self.load(self.view())['days'][0]['rows']
        self.assertEqual([(r['grade'], r['classes_label']) for r in rows], [('Q1', 'Q1c'), ('Q2', 'Q2a')])

    def test_next_day_from_cutoff(self):
        view = self.view()
        self.assertEqual(view.substitutions_next_day_from, '16:00')
        self.load(view, MONDAY_1559)
        self.assertEqual(self.load_days.call_args.kwargs['start'], TODAY)
        cache.clear()
        self.load(view, MONDAY_16)
        self.assertEqual(self.load_days.call_args.kwargs['start'], date(2026, 10, 20))
        cache.clear()
        view.substitutions_next_day_from = ''
        self.load(view, local(2026, 10, 19, 23, 30))
        self.assertEqual(self.load_days.call_args.kwargs['start'], TODAY)

    def test_next_day_from_friday_monitor_starts_saturday(self):
        # WebUntis überspringt Wochenende und Ferien selbst; wir geben nur den Folgetag.
        self.load(self.view(), local(2026, 10, 23, 17))
        self.assertEqual(self.load_days.call_args.kwargs['start'], date(2026, 10, 24))

    def test_single_day_in_split_and_modes(self):
        self.load(self.view(), single_day=True)
        self.assertEqual(self.load_days.call_args.kwargs['count'], 1)

    def test_show_exams_override(self):
        view = self.view(substitutions_show_exams=True)
        self.load(view)
        self.assertEqual(self.load_days.call_args.kwargs['overrides'], {'showExamSupervision': True})
        cache.clear()
        view.substitutions_show_exams = False
        self.load(view)
        self.assertEqual(self.load_days.call_args.kwargs['overrides'], {'showExamSupervision': False})
        cache.clear()
        view.substitutions_show_exams = None
        self.load(view)
        self.assertEqual(self.load_days.call_args.kwargs['overrides'], {})

    def test_show_absences_off(self):
        # Geladen wird immer mit Abwesenheiten (gemeinsamer Cache); die Ansicht blendet sie aus.
        day = self.load(self.view(substitutions_show_absences=False))['days'][0]
        self.assertEqual((day['absent'], day['affected']), ([], {'classes': [], 'teachers': []}))
        self.assertEqual(day['messages'], [{'subject': 'A', 'body': 'B'}])

    def test_updated_at_from_untis(self):
        result = self.load(self.view())
        self.assertEqual(result['updated_at'], '2026-10-19T07:42:00+02:00')
        self.assertEqual(result['fetched_at'], MONDAY_8.isoformat())
        self.assertIsNone(result['news'])
        result = self.load(self.view(slug='konto', substitutions_source='account'))
        self.assertIsNone(result['updated_at'])
        self.assertEqual(result['fetched_at'], ACCOUNT['fetched_at'])

    def test_cache_per_format(self):
        view = self.view()
        self.load(view)
        self.load(view)
        self.assertEqual(self.load_days.call_count, 1)
        self.assertIsNotNone(cache.get('monitor:subs:monitor:vplan-schueler:2026-10-19:2'))
        view.substitutions_format = 'students_1'
        self.load(view)
        self.assertEqual(self.load_days.call_count, 2)
        self.assertIsNotNone(cache.get('monitor:subs:monitor:vplan-schueler-1:2026-10-19:1'))

    def test_absences_filtered_from_shared_cache(self):
        self.load(self.view())
        result = self.load(self.view(slug='ohne', substitutions_show_absences=False))
        self.assertEqual(self.load_days.call_count, 1)
        self.assertEqual(result['days'][0]['absent'], [])
        self.assertEqual(result['days'][0]['affected'], {'classes': [], 'teachers': []})

    def test_lock_held_uses_last_good_or_next_source(self):
        view = self.view()
        cache.add('monitor:subs:monitor:vplan-schueler:2026-10-19:2:lock', 1, 30)
        result = self.load(view)
        self.load_days.assert_not_called()
        self.assertEqual((result['source'], result['fallback']), ('substitutions', True))


class FallbackTest(SubstitutionsTestBase):

    def test_fallback_to_account(self):
        self.load_days.side_effect = MonitorUnavailable('Timeout')
        result = self.load(self.view())
        self.assertEqual((result['source'], result['fallback'], result['group_by']),
                         ('substitutions', True, 'class'))
        self.assertIsNone(self.account.call_args.kwargs['start'])
        self.assertEqual(self.account.call_args.kwargs['count'], 2)
        self.assertEqual(result['news'], 'Vollversammlung')
        day = result['days'][0]
        self.assertEqual(set(day), {'date', 'label', 'absent', 'affected', 'messages', 'rows'})
        self.assertEqual(day['absent'], [])
        self.assertEqual([r['classes_label'] for r in day['rows']], ['5a', '6b'])

    def test_failure_cached_briefly(self):
        self.load_days.side_effect = MonitorUnavailable('Timeout')
        view = self.view()
        self.load(view)
        self.load(view)
        self.assertEqual(self.load_days.call_count, 1)

    def test_account_next_day_start(self):
        self.load(self.view(substitutions_source='account'), MONDAY_16)
        self.assertEqual(self.account.call_args.kwargs['start'], date(2026, 10, 20))
        self.load(self.view(slug='fr', substitutions_source='account'), local(2026, 10, 23, 17))
        self.assertEqual(self.account.call_args.kwargs['start'], date(2026, 10, 26))

    def test_account_unavailable_goes_to_embed(self):
        self.load_days.side_effect = MonitorUnavailable('Timeout')
        self.account.return_value = UNAVAILABLE
        result = self.load(self.view())
        self.assertEqual((result['source'], result['fallback'], result['days']), ('unavailable', True, []))

    def test_fallback_skips_account_without_credentials(self):
        settings = MonitorSettings.load()
        settings.webuntis_username = ''
        settings.webuntis_password = ''
        settings.save()
        self.load_days.side_effect = MonitorUnavailable('Timeout')
        view = self.view(webuntis_url='https://example.org/untis')
        result = self.load(view)
        self.account.assert_not_called()
        self.assertEqual((result['source'], result['fallback']), ('unavailable', True))
        data = display._substitutions_data(view, True, MONDAY_8)
        self.assertEqual((data['mode'], data['fallback'], data['embed_url']),
                         ('embed', True, 'https://example.org/untis'))

    def test_not_configured_goes_to_embed(self):
        settings = MonitorSettings.load()
        settings.webuntis_server = ''
        settings.save()
        result = self.load(self.view())
        self.load_days.assert_not_called()
        self.account.assert_not_called()
        self.assertEqual((result['source'], result['fallback']), ('unavailable', True))

    def test_chosen_account_is_not_followed_by_monitor(self):
        self.account.return_value = UNAVAILABLE
        result = self.load(self.view(substitutions_source='account'))
        self.load_days.assert_not_called()
        self.assertEqual((result['source'], result['fallback']), ('unavailable', True))

    def test_last_good_before_fallback(self):
        view = self.view()
        self.load(view)
        cache.delete('monitor:subs:monitor:vplan-schueler:2026-10-19:2')
        self.load_days.side_effect = MonitorUnavailable('Timeout')
        result = self.load(view, local(2026, 10, 19, 9))
        self.assertEqual((result['source'], result['fallback']), ('monitor', False))
        self.assertEqual(len(result['days']), 2)
        self.account.assert_not_called()

    def test_last_good_drops_past_days(self):
        view = self.view(substitutions_next_day_from='')
        self.load(view)
        cache.delete('monitor:subs:monitor:vplan-schueler:2026-10-19:2')
        self.load_days.side_effect = MonitorUnavailable('Timeout')
        # Folgetag: der Schlüssel enthält den Start, der alte Stand gilt dort nicht.
        result = self.load(view, local(2026, 10, 20, 8))
        self.assertEqual(result['source'], 'substitutions')

    def test_chain_respects_deadline(self):
        clock = iter([1000.0, 1018.0, 1018.0, 1018.0])

        def slow_monitor(*args, **kwargs):
            self.assertEqual(kwargs['deadline'], 1020.0)
            raise MonitorUnavailable('Timeout')

        self.load_days.side_effect = slow_monitor
        with mock.patch('monitor.substitutions.time.monotonic', side_effect=lambda: next(clock)):
            result = self.load(self.view())
        self.assertEqual(self.account.call_args.kwargs['deadline'], 1020.0)
        self.assertEqual(result['source'], 'substitutions')

    def test_chain_deadline_spent_skips_account(self):
        clock = iter([1000.0, 1020.5, 1020.5])
        self.load_days.side_effect = MonitorUnavailable('Timeout')
        with mock.patch('monitor.substitutions.time.monotonic', side_effect=lambda: next(clock)):
            result = self.load(self.view())
        self.account.assert_not_called()
        self.assertEqual((result['source'], result['fallback']), ('unavailable', True))

    def test_embed_source(self):
        view = self.view(substitutions_source='embed', webuntis_url='https://example.org/untis')
        result = self.load(view)
        self.load_days.assert_not_called()
        self.account.assert_not_called()
        self.assertEqual((result['source'], result['fallback']), ('unavailable', False))
        data = display._substitutions_data(view, True, MONDAY_8)
        self.assertEqual((data['mode'], data['fallback']), ('embed', False))


class AccountDeadlineTest(TestCase):

    def test_get_substitutions_threads_deadline_into_login(self):
        cache.clear()
        settings = MonitorSettings.load()
        settings.webuntis_server, settings.webuntis_school = 'untis.example', 'schule'
        settings.save()
        with mock.patch.object(webuntis, '_login', side_effect=webuntis.DeadlineExceeded()) as login, \
                mock.patch.object(webuntis, 'logger'):
            webuntis.get_substitutions(MONDAY_8, deadline=1234.0)
            self.assertEqual(login.call_args.kwargs['deadline'], 1234.0)
            cache.clear()
            with mock.patch.object(webuntis.time, 'monotonic', return_value=50.0):
                webuntis.get_substitutions(MONDAY_8)
            self.assertEqual(login.call_args.kwargs['deadline'], 50.0 + webuntis.DEADLINE_SECONDS)


class DisplaySubstitutionsTest(SubstitutionsTestBase):

    def test_payload_live(self):
        view = self.view(webuntis_url='https://example.org/untis')
        data = display.build_payload(None, view, key_ok=True, now=MONDAY_8)['view']['data']
        self.assertEqual(set(data), {'source', 'fallback', 'group_by', 'columns', 'days', 'news',
                                     'updated_at', 'fetched_at', 'embed_url', 'mode'})
        self.assertEqual((data['mode'], data['embed_url'], len(data['days'])),
                         ('live', 'https://example.org/untis', 2))

    def test_payload_without_key(self):
        view = self.view(webuntis_url='https://example.org/untis')
        data = display.build_payload(None, view, key_ok=False, now=MONDAY_8)['view']['data']
        self.load_days.assert_not_called()
        self.assertEqual((data['mode'], data['days'], data['source']), ('embed', [], None))

    def test_split_view_single_day(self):
        view = DisplayView.objects.create(kind='split', slug='split', name='S', is_default=False,
                                          split_left='substitutions', split_right='clock')
        display.build_payload(None, view, key_ok=True, now=MONDAY_8)
        self.assertEqual(self.load_days.call_args.kwargs['count'], 1)

    def test_split_mode_single_day(self):
        view = self.view()
        screen = Screen.objects.create(name='Halle', slug='halle', default_view=view)
        exam = Exam.objects.create(title='Mathe', display_mode='split',
                                   active_from=MONDAY_8 - timezone.timedelta(hours=1),
                                   active_until=MONDAY_8 + timezone.timedelta(hours=1))
        with mock.patch.object(Screen, 'get_active_exam', return_value=exam):
            display.build_payload(screen, view, key_ok=True, now=MONDAY_8)
        self.assertEqual(self.load_days.call_args.kwargs['count'], 1)

    def test_on_air_fullscreen_keeps_two_days(self):
        settings = MonitorSettings.load()
        settings.on_air_active = True
        settings.save()
        display.build_payload(None, self.view(on_air_behavior='fullscreen'), key_ok=True, now=MONDAY_8)
        self.assertEqual(self.load_days.call_args.kwargs['count'], 2)
