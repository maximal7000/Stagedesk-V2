"""WebUntis-Vertretungsplan (Spec §4.3). Keine Netzaufrufe: WebUntisSession.call wird gepatcht.

2026-10-19 ist ein Montag.
"""
import itertools
from datetime import date, datetime
from io import StringIO
from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from . import api_setup, webuntis
from .models import HolidayPeriod, MonitorSettings
from .webuntis import WebUntisError, WebUntisSession


def local(y, m, d, hh=0, mm=0):
    return timezone.make_aware(datetime(y, m, d, hh, mm), timezone.get_default_timezone())


MONDAY_8 = local(2026, 10, 19, 8)
MONDAY_11 = local(2026, 10, 19, 11)

UNITS = [('1', 800, 845), ('2', 845, 930), ('3', 950, 1035),
         ('4', 1035, 1120), ('5', 1140, 1225), ('6', 1225, 1310)]
TIMEGRID = [{'day': d, 'timeUnits': [{'name': n, 'startTime': s, 'endTime': e} for n, s, e in UNITS]}
            for d in range(2, 7)]
NO_RIGHT = WebUntisError(-8509, 'no right for getSubstitutions()')


def subst(date_int, start, end, kind, kl='7a', su='MA', te=None, ro=None, txt=''):
    return {'type': kind, 'date': date_int, 'startTime': start, 'endTime': end,
            'kl': [{'id': 1, 'name': kl}], 'su': [{'id': 2, 'name': su}],
            'te': te or [], 'ro': ro or [], 'txt': txt}


class FakeUntis:
    """Antworten pro RPC-Methode; Werte sind Listen oder Exceptions."""

    def __init__(self, **answers):
        self.answers = {'authenticate': {'sessionId': 'x'}, 'getTimegridUnits': TIMEGRID,
                        'getHolidays': [], 'logout': None, **answers}
        self.calls = []

    def __call__(self, session, method, params=None):
        self.calls.append(method)
        answer = self.answers[method]
        if isinstance(answer, Exception):
            raise answer
        return answer(params) if callable(answer) else answer


class WebUntisTestBase(TestCase):

    def setUp(self):
        cache.clear()
        logger_patch = mock.patch.object(webuntis, 'logger')
        logger_patch.start()
        self.addCleanup(logger_patch.stop)
        settings = MonitorSettings.load()
        settings.webuntis_server = 'untis.example'
        settings.webuntis_school = 'schule'
        settings.webuntis_username = 'monitor'
        settings.webuntis_password = 'geheim'
        settings.save()

    def run_with(self, fake, now=MONDAY_8, news=None):
        news_mock = news or mock.Mock(return_value={'data': {'messagesOfDay': []}})
        with mock.patch.object(WebUntisSession, 'call', autospec=True, side_effect=fake), \
                mock.patch.object(WebUntisSession, 'get_json', news_mock):
            return webuntis.get_substitutions(now)


class SubstitutionsTest(WebUntisTestBase):

    def test_substitutions_source(self):
        fake = FakeUntis(getSubstitutions=[
            subst(20261019, 950, 1035, 'cancel', te=[{'id': 5, 'name': 'MUE'}]),
            subst(20261019, 1035, 1120, 'rmchg', ro=[{'id': 9, 'name': 'R12', 'orgname': 'R07'}]),
            subst(20261020, 800, 845, 'subst', kl='9b', su='DE',
                  te=[{'id': 6, 'name': 'HAX', 'orgname': 'MEY'}], ro=[{'id': 3, 'name': 'R01'}],
                  txt='Aufgaben im Moodle'),
        ])
        result = self.run_with(fake)
        self.assertEqual(result['source'], 'substitutions')
        self.assertEqual([d['date'] for d in result['days']], ['2026-10-19', '2026-10-20'])
        self.assertEqual([d['label'] for d in result['days']], ['Heute', 'Morgen'])
        today = result['days'][0]['rows']
        self.assertEqual([r['kind'] for r in today], ['cancelled', 'room_change'])
        self.assertEqual(today[1]['room'], 'R12')
        self.assertEqual(today[1]['room_old'], 'R07')
        self.assertEqual(today[0]['periods'], '3')
        self.assertEqual(result['days'][1]['rows'], [{
            'classes': ['9b'], 'group': '', 'periods': '1', 'subject': 'DE', 'teacher': 'HAX', 'teacher_old': 'MEY',
            'room': 'R01', 'room_old': '', 'kind': 'substitution', 'kind_label': 'Vertretung',
            'note': 'Aufgaben im Moodle',
        }])
        self.assertEqual(MonitorSettings.load().webuntis_source, 'substitutions')
        self.assertEqual(result['fetched_at'], MONDAY_8.isoformat())

    def test_timetable_fallback_on_8509(self):
        def timetable(params):
            klasse = params['options']['element']['id']
            if klasse != 11:
                return []
            return [
                {'id': 100, 'date': 20261019, 'startTime': 1140, 'endTime': 1225, 'code': 'cancelled',
                 'kl': [{'id': 11}], 'su': [{'id': 2, 'name': 'EN'}], 'te': [{'id': 5, 'name': 'MUE'}],
                 'ro': [{'id': 3, 'name': 'R01'}]},
                {'id': 101, 'date': 20261019, 'startTime': 1225, 'endTime': 1310, 'code': 'irregular',
                 'kl': [{'id': 11}], 'su': [{'id': 2, 'name': 'EN'}],
                 'te': [{'id': 6, 'name': 'HAX', 'orgid': 5, 'orgname': 'MUE'}],
                 'ro': [{'id': 3, 'name': 'R01'}], 'substText': 'Vertretung'},
                {'id': 102, 'date': 20261019, 'startTime': 800, 'endTime': 845,
                 'kl': [{'id': 11}], 'su': [{'id': 2, 'name': 'EN'}], 'te': [], 'ro': []},
            ]
        fake = FakeUntis(getSubstitutions=NO_RIGHT,
                         getKlassen=[{'id': 11, 'name': '8c'}, {'id': 12, 'name': '8d'}],
                         getTimetable=timetable)
        result = self.run_with(fake)
        self.assertEqual(result['source'], 'timetable')
        rows = result['days'][0]['rows']
        self.assertEqual([(r['classes'], r['periods'], r['kind']) for r in rows],
                         [(['8c'], '5', 'cancelled'), (['8c'], '6', 'substitution')])
        self.assertEqual(rows[1]['teacher_old'], 'MUE')
        self.assertEqual(rows[1]['note'], 'Vertretung')
        self.assertEqual(MonitorSettings.load().webuntis_source, 'timetable')

    def test_row_keeps_class_list(self):
        item = subst(20261019, 800, 845, 'cancel')
        item['kl'] = [{'id': 1, 'name': '5a'}, {'id': 2, 'name': '5b'}]
        row = self.run_with(FakeUntis(getSubstitutions=[item]))['days'][0]['rows'][0]
        self.assertEqual(row['classes'], ['5a', '5b'])
        self.assertEqual(row['group'], '')
        self.assertEqual(row['kind_label'], 'Entfall')
        self.assertEqual(list(row), webuntis.ROW_KEYS)

    def test_kind_labels(self):
        self.assertEqual(webuntis.KIND_LABELS, {'substitution': 'Vertretung', 'cancelled': 'Entfall',
                                                'room_change': 'Raumänderung', 'other': 'Änderung'})

    def test_untis_holidays_skipped(self):
        fake = FakeUntis(getSubstitutions=[], getHolidays=[
            {'id': 1, 'name': 'Herbst', 'startDate': 20261012, 'endDate': 20261024}])
        result = self.run_with(fake, now=local(2026, 10, 21, 8))
        self.assertEqual([d['date'] for d in result['days']], ['2026-10-26', '2026-10-27'])
        self.assertEqual(webuntis.cache.get(webuntis.HOLIDAYS_KEY), [(date(2026, 10, 12), date(2026, 10, 24))])

    def test_holidays_failure_is_silent(self):
        fake = FakeUntis(getSubstitutions=[], getHolidays=WebUntisError(-8509, 'no right'))
        result = self.run_with(fake, now=local(2026, 10, 21, 8))
        self.assertEqual(result['days'][0]['date'], '2026-10-21')

    def test_start_and_count(self):
        fake = FakeUntis(getSubstitutions=[])
        news = mock.Mock(return_value={'data': {'messagesOfDay': []}})
        with mock.patch.object(WebUntisSession, 'call', autospec=True, side_effect=fake), \
                mock.patch.object(WebUntisSession, 'get_json', news):
            result = webuntis.get_substitutions(MONDAY_8, start=date(2026, 10, 27), count=1)
        self.assertEqual([d['date'] for d in result['days']], ['2026-10-27'])
        self.assertIsNone(result['updated_at'])

    def test_single_day_from_today(self):
        """start=None, count=1 (eintägige Ansicht ohne Wechsel auf den nächsten Schultag)."""
        fake = FakeUntis(getSubstitutions=[subst(20261019, 800, 845, 'cancel')])
        news = mock.Mock(return_value={'data': {'messagesOfDay': []}})
        with mock.patch.object(WebUntisSession, 'call', autospec=True, side_effect=fake), \
                mock.patch.object(WebUntisSession, 'get_json', news):
            result = webuntis.get_substitutions(MONDAY_8, start=None, count=1)
        self.assertEqual(result['source'], 'substitutions')
        self.assertEqual([d['date'] for d in result['days']], ['2026-10-19'])

    def test_variants_have_own_cache_keys(self):
        fake = FakeUntis(getSubstitutions=[])
        news = mock.Mock(return_value={'data': {'messagesOfDay': []}})
        with mock.patch.object(WebUntisSession, 'call', autospec=True, side_effect=fake), \
                mock.patch.object(WebUntisSession, 'get_json', news):
            default = webuntis.get_substitutions(MONDAY_8)
            single = webuntis.get_substitutions(MONDAY_8, count=1)
            later = webuntis.get_substitutions(MONDAY_8, start=date(2026, 10, 27), count=1)
        self.assertEqual(fake.calls.count('getSubstitutions'), 3)
        self.assertEqual([len(r['days']) for r in (default, single, later)], [2, 1, 1])
        self.assertEqual(later['days'][0]['date'], '2026-10-27')
        self.assertEqual(cache.get('monitor:webuntis:subs'), default)
        self.assertEqual(cache.get('monitor:webuntis:subs:today:1'), single)
        self.assertEqual(cache.get('monitor:webuntis:subs:2026-10-27:1'), later)

    def test_unavailable_without_credentials(self):
        settings = MonitorSettings.load()
        settings.webuntis_server = ''
        settings.save()
        with mock.patch.object(WebUntisSession, 'call') as rpc:
            result = webuntis.get_substitutions(MONDAY_8)
        rpc.assert_not_called()
        self.assertEqual(result, {'source': 'unavailable', 'news': None, 'days': [], 'fetched_at': None,
                                  'updated_at': None})

    def test_unavailable_on_network_error(self):
        result = self.run_with(FakeUntis(authenticate=OSError('timeout')))
        self.assertEqual(result['source'], 'unavailable')

    def test_periods_merged_and_from_current_period(self):
        fake = FakeUntis(getSubstitutions=[
            subst(20261019, 800, 845, 'cancel'),
            subst(20261019, 950, 1035, 'cancel', kl='5a'),
            subst(20261019, 1035, 1120, 'cancel', kl='6a'),
            subst(20261019, 1140, 1225, 'cancel'),
            subst(20261019, 1225, 1310, 'cancel'),
        ])
        rows = self.run_with(fake, now=MONDAY_11)['days'][0]['rows']
        self.assertEqual([(r['classes'], r['periods']) for r in rows], [(['6a'], '4'), (['7a'], '5-6')])

    def test_double_lesson_in_one_entry(self):
        fake = FakeUntis(getSubstitutions=[subst(20261019, 1140, 1310, 'subst')])
        rows = self.run_with(fake)['days'][0]['rows']
        self.assertEqual(rows[0]['periods'], '5-6')

    def test_cached_for_300s(self):
        fake = FakeUntis(getSubstitutions=[])
        self.run_with(fake)
        first = len(fake.calls)
        self.run_with(fake)
        self.assertEqual(len(fake.calls), first)

    def test_unavailable_cached_shorter(self):
        with mock.patch.object(webuntis.cache, 'set') as cache_set:
            self.run_with(FakeUntis(authenticate=WebUntisError(-8504, 'bad credentials')))
        self.assertEqual(cache_set.call_args.args[0], 'monitor:webuntis:subs')
        self.assertEqual(cache_set.call_args.args[2], 60)

    def test_news_failure_is_silent(self):
        result = self.run_with(FakeUntis(getSubstitutions=[]), news=mock.Mock(side_effect=OSError))
        self.assertIsNone(result['news'])
        self.assertEqual(result['source'], 'substitutions')

    def test_news_text_without_html(self):
        news = mock.Mock(return_value={'data': {'messagesOfDay': [
            {'subject': 'Wandertag', 'text': '<p>Kl. 5 bis 7 <b>frei</b></p>'}]}})
        result = self.run_with(FakeUntis(getSubstitutions=[]), news=news)
        self.assertEqual(result['news'], 'Wandertag: Kl. 5 bis 7 frei')


class ResilienceTest(WebUntisTestBase):
    """Budget, Single-Flight, letztes gutes Ergebnis, Fehlerzähler, Abmelden (Review-Runde 1)."""

    GOOD = [subst(20261019, 1140, 1225, 'cancel'), subst(20261020, 800, 845, 'cancel', kl='9b')]

    def prime_last_good(self):
        good = self.run_with(FakeUntis(getSubstitutions=self.GOOD))
        cache.delete(webuntis.CACHE_KEY)
        return good

    def test_deadline_exceeded_falls_back_to_last_good(self):
        good = self.prime_last_good()
        fake = FakeUntis(getSubstitutions=self.GOOD)
        clock = itertools.chain([0, 0], itertools.repeat(100))
        with mock.patch.object(webuntis.time, 'monotonic', side_effect=lambda: next(clock)):
            result = self.run_with(fake)
        self.assertEqual(fake.calls, ['authenticate', 'logout'])
        self.assertEqual(result, good)
        self.assertEqual(cache.get(webuntis.CACHE_KEY), good)

    def test_lock_held_returns_last_good_without_rpc(self):
        good = self.prime_last_good()
        cache.add(webuntis.LOCK_KEY, 1, 30)
        fake = FakeUntis(getSubstitutions=self.GOOD)
        self.assertEqual(self.run_with(fake), good)
        cache.delete(webuntis.LAST_GOOD_KEY)
        self.assertEqual(self.run_with(fake), {'source': 'unavailable', 'news': None, 'days': [], 'fetched_at': None,
                                  'updated_at': None})
        self.assertEqual(fake.calls, [])

    def test_lock_released_after_refresh(self):
        self.run_with(FakeUntis(authenticate=OSError('timeout')))
        self.assertIsNone(cache.get(webuntis.LOCK_KEY))

    def test_last_good_only_with_relevant_days(self):
        self.prime_last_good()
        tuesday = local(2026, 10, 20, 8)
        result = self.run_with(FakeUntis(authenticate=OSError('timeout')), now=tuesday)
        self.assertEqual([(d['date'], d['label']) for d in result['days']], [('2026-10-20', 'Heute')])
        # Der Stand bleibt der des ursprünglichen Abrufs
        self.assertEqual(result['fetched_at'], MONDAY_8.isoformat())
        cache.delete(webuntis.CACHE_KEY)
        result = self.run_with(FakeUntis(authenticate=OSError('timeout')), now=local(2026, 10, 21, 8))
        self.assertEqual(result['source'], 'unavailable')

    def test_single_failure_keeps_source_second_failure_saves_unavailable(self):
        self.prime_last_good()
        checked_at = MonitorSettings.load().webuntis_checked_at
        failing = FakeUntis(authenticate=OSError('timeout'))
        self.run_with(failing, now=local(2026, 10, 19, 9))
        settings = MonitorSettings.load()
        self.assertEqual(settings.webuntis_source, 'substitutions')
        self.assertEqual(settings.webuntis_checked_at, checked_at)
        cache.delete(webuntis.CACHE_KEY)
        self.run_with(failing, now=local(2026, 10, 19, 10))
        settings = MonitorSettings.load()
        self.assertEqual(settings.webuntis_source, 'unavailable')
        self.assertEqual(settings.webuntis_checked_at, local(2026, 10, 19, 10))

    def test_success_resets_failure_count(self):
        failing = FakeUntis(authenticate=OSError('timeout'))
        self.run_with(failing)
        cache.delete(webuntis.CACHE_KEY)
        self.prime_last_good()
        self.run_with(failing)
        self.assertEqual(MonitorSettings.load().webuntis_source, 'substitutions')

    def test_checked_at_updated_without_source_change(self):
        self.prime_last_good()
        self.run_with(FakeUntis(getSubstitutions=[]), now=local(2026, 10, 19, 9))
        settings = MonitorSettings.load()
        self.assertEqual(settings.webuntis_source, 'substitutions')
        self.assertEqual(settings.webuntis_checked_at, local(2026, 10, 19, 9))

    def test_missing_credentials_saves_unavailable(self):
        settings = MonitorSettings.load()
        settings.webuntis_school = ''
        settings.webuntis_source = 'substitutions'
        settings.save()
        webuntis.get_substitutions(MONDAY_8)
        self.assertEqual(MonitorSettings.load().webuntis_source, 'unavailable')

    def test_logout_after_errors(self):
        cases = [
            (FakeUntis(getSubstitutions=WebUntisError(-1, 'kaputt')), None),
            (FakeUntis(getSubstitutions=NO_RIGHT, getKlassen=OSError('timeout')), None),
            (FakeUntis(getSubstitutions=[]), mock.Mock(side_effect=OSError)),
        ]
        for fake, news in cases:
            cache.clear()
            self.run_with(fake, news=news)
            self.assertEqual(fake.calls[-1], 'logout', fake.calls)


class NextSchoolDayTest(TestCase):

    def test_next_school_day_skips_weekend_and_holiday(self):
        self.assertEqual(webuntis.next_school_day(date(2026, 10, 19)), date(2026, 10, 20))
        self.assertEqual(webuntis.next_school_day(date(2026, 10, 23)), date(2026, 10, 26))
        HolidayPeriod.objects.create(name='Herbst', start_date=date(2026, 10, 26),
                                     end_date=date(2026, 10, 30))
        self.assertEqual(webuntis.next_school_day(date(2026, 10, 23)), date(2026, 11, 2))

    def test_weekend_starts_with_next_school_day(self):
        HolidayPeriod.objects.create(name='Brücke', start_date=date(2026, 10, 26),
                                     end_date=date(2026, 10, 26))
        days = webuntis.school_days(date(2026, 10, 24))
        self.assertEqual(days, [date(2026, 10, 27), date(2026, 10, 28)])


class MergePeriodsTest(TestCase):

    def row(self, periods, **kwargs):
        base = {'classes': ['7a'], 'group': '', 'periods': periods, 'subject': 'MA', 'teacher': '', 'teacher_old': '',
                'room': '', 'room_old': '', 'kind': 'cancelled', 'kind_label': 'Entfall', 'note': ''}
        return {**base, **kwargs}

    def test_merges_only_adjacent_equal_rows(self):
        rows = [self.row('1'), self.row('2'), self.row('4'), self.row('5', kind='substitution'),
                self.row('6', kind='substitution', subject='DE')]
        merged = webuntis.merge_periods(rows)
        self.assertEqual([(r['periods'], r['kind'], r['subject']) for r in merged],
                         [('1-2', 'cancelled', 'MA'), ('4', 'cancelled', 'MA'),
                          ('5', 'substitution', 'MA'), ('6', 'substitution', 'DE')])


class DetectSourceTest(WebUntisTestBase):

    def detect(self, fake):
        with mock.patch.object(WebUntisSession, 'call', autospec=True, side_effect=fake):
            return webuntis.detect_source(WebUntisSession('untis.example', 'schule'))

    def test_detect(self):
        self.assertEqual(self.detect(FakeUntis(getSubstitutions=[])), 'substitutions')
        self.assertEqual(self.detect(FakeUntis(getSubstitutions=NO_RIGHT, getKlassen=[{'id': 1, 'name': '5a'}],
                                               getTimetable=[])), 'timetable')
        self.assertEqual(self.detect(FakeUntis(getSubstitutions=WebUntisError(-1, 'kaputt'))), 'unavailable')


class CheckTest(WebUntisTestBase):

    def check(self, fake, news=None):
        news_mock = news or mock.Mock(return_value={'data': {'messagesOfDay': []}})
        with mock.patch.object(WebUntisSession, 'call', autospec=True, side_effect=fake), \
                mock.patch.object(WebUntisSession, 'get_json', news_mock), \
                mock.patch('monitor.webuntis.timezone.now', return_value=MONDAY_8):
            return webuntis.check()

    def test_check_reports_ways_and_saves_source(self):
        cache.set('monitor:webuntis:subs', {'source': 'substitutions'}, 300)
        fake = FakeUntis(getSubstitutions=NO_RIGHT, getKlassen=[{'id': 1, 'name': '5a'}],
                         getTimetable=[{'id': 1, 'date': 20261019, 'startTime': 800, 'endTime': 845}])
        result = self.check(fake)
        self.assertEqual(result, {'login': True, 'substitutions': False, 'timetable': True,
                                  'news': True, 'source': 'timetable'})
        settings = MonitorSettings.load()
        self.assertEqual(settings.webuntis_source, 'timetable')
        self.assertEqual(settings.webuntis_checked_at, MONDAY_8)
        self.assertIsNone(cache.get('monitor:webuntis:subs'))

    def test_check_login_fails(self):
        result = self.check(FakeUntis(authenticate=WebUntisError(-8504, 'bad credentials')))
        self.assertEqual(result, {'login': False, 'substitutions': False, 'timetable': False,
                                  'news': False, 'source': 'unavailable'})

    def test_command_prints_only_status(self):
        fake = FakeUntis(getSubstitutions=[{'kl': [{'name': 'GEHEIMKLASSE'}]}],
                         getKlassen=[{'id': 1, 'name': 'GEHEIMKLASSE'}], getTimetable=[])
        out = StringIO()
        with mock.patch.object(WebUntisSession, 'call', autospec=True, side_effect=fake), \
                mock.patch.object(WebUntisSession, 'get_json', side_effect=OSError), \
                mock.patch('monitor.untis_monitor.check', return_value=None):
            call_command('monitor_webuntis_check', stdout=out)
        text = out.getvalue()
        self.assertIn('Anmeldung: geht\n', text)
        self.assertIn('Nachricht zum Tag: geht nicht\n', text)
        self.assertIn('Quelle: substitutions', text)
        self.assertNotIn('GEHEIMKLASSE', text)
        self.assertNotIn('geheim', text)

    def test_endpoint_requires_setup(self):
        with mock.patch.object(api_setup, '_require_perm') as guard, \
                mock.patch.object(webuntis, 'check', return_value={'source': 'timetable'}):
            self.assertEqual(api_setup.check_webuntis(object()), {'source': 'timetable'})
        self.assertEqual(guard.call_args.args[1], 'monitor.setup')
