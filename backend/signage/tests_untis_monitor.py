"""No network calls: requests.post is patched."""
import json
import time
from datetime import date
from pathlib import Path
from unittest import mock

import requests
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase

from . import untis_monitor
from .untis_monitor import MonitorUnavailable

FIXTURES = Path(__file__).parent / 'fixtures_untis'


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding='utf-8'))


STUDENT_FORMAT = load('format-vplan-schueler.json')['payload']
TEACHER_FORMAT = load('format-vplan-lehrer.json')['payload']


def payload_with(**changes):
    base = {'date': 20261027, 'nextDate': 20261028, 'rows': [], 'lastUpdate': '19.10.2026 11:41:02',
            'absentElements': [], 'affectedElements': {'1': [], '2': []}, 'messageData': {'messages': []}}
    return {**base, **changes}


def make_row(data, group='5c', css=None):
    return {'data': data, 'cssClasses': css or [], 'cellClasses': {}, 'group': group}


class ParseHeaderTests(SimpleTestCase):
    def test_holiday_payload(self):
        h = untis_monitor.parse_header(load('data-holiday.json')['payload'], show_absences=True)
        self.assertEqual(h['date'], '2026-10-26')
        self.assertEqual(h['next_date'], '2026-10-27')
        self.assertEqual(h['absent'], [{'name': 'YAK', 'kind': 'teacher', 'periods': ''}])
        self.assertEqual(h['affected']['teachers'], ['PUL', 'IMO', 'OXE'])
        self.assertEqual(h['affected']['classes'], [])
        self.assertEqual(h['updated_at'], '2026-10-19T11:41:02+02:00')

    def test_partial_absence_periods(self):
        h = untis_monitor.parse_header(load('data-schueler-20261027.json')['payload'], show_absences=True)
        self.assertEqual(h['absent'], [{'name': 'ZEB', 'kind': 'teacher', 'periods': ''},
                                       {'name': 'ÖLZ', 'kind': 'teacher', 'periods': '1.'}])
        self.assertEqual(h['affected']['classes'][:3], ['5c', '7a', 'Ea'])

    def test_period_range_and_class_kind(self):
        payload = payload_with(absentElements=[
            {'elementType': 2, 'elementName': 'XYZ', 'absences': [
                {'type': 'FROM_TO', 'startUnit': '3', 'endUnit': '4'}]},
            {'elementType': 1, 'elementName': '8b', 'absences': [
                {'type': 'FROM_TO', 'startUnit': '5', 'endUnit': '5'},
                {'type': 'FROM_TO', 'startUnit': '6', 'endUnit': '7'}]},
        ])
        h = untis_monitor.parse_header(payload, show_absences=True)
        self.assertEqual(h['absent'], [{'name': 'XYZ', 'kind': 'teacher', 'periods': '3.–4.'},
                                       {'name': '8b', 'kind': 'class', 'periods': '5.–7.'}])

    def test_absences_hidden(self):
        h = untis_monitor.parse_header(load('data-schueler-20261027.json')['payload'], show_absences=False)
        self.assertEqual(h['absent'], [])
        self.assertEqual(h['affected'], {'classes': [], 'teachers': []})

    def test_messages_html_stripped(self):
        payload = payload_with(messageData={'messages': [
            {'subject': 'Hinweis', 'body': '<b>Text</b> mit&nbsp;<i>Teil</i> &amp; mehr'}]})
        h = untis_monitor.parse_header(payload, show_absences=True)
        self.assertEqual(h['messages'], [{'subject': 'Hinweis', 'body': 'Text mit Teil & mehr'}])

    def test_missing_next_date_and_bad_update(self):
        h = untis_monitor.parse_header(payload_with(nextDate=None, lastUpdate='kaputt'), show_absences=True)
        self.assertIsNone(h['next_date'])
        self.assertIsNone(h['updated_at'])


class ParseRowsTests(SimpleTestCase):
    def test_students_fixture(self):
        rows = untis_monitor.parse_rows(load('data-schueler-20261027.json')['payload'], STUDENT_FORMAT)
        self.assertEqual(len(rows), 12)
        first = rows[0]
        self.assertEqual((first['periods'], first['classes'], first['subject'], first['room'],
                          first['teacher'], first['teacher_old'], first['kind'], first['kind_label']),
                         ('1.', ['5c'], 'De', '179', 'ROT', 'ÖLZ', 'substitution', 'Vertretung'))
        self.assertEqual(sorted(first), sorted(untis_monitor.ROW_KEYS))

    def test_room_change(self):
        row = untis_monitor.parse_rows(load('data-schueler-20261027.json')['payload'], STUDENT_FORMAT)[1]
        self.assertEqual((row['classes'], row['room'], row['room_old'], row['teacher'], row['teacher_old']),
                         (['7a'], '204', '209', 'FEN', ''))
        self.assertEqual((row['kind'], row['kind_label'], row['periods']),
                         ('room_change', 'Raumänderung', '1.–2.'))

    def test_class_list_split(self):
        rows = untis_monitor.parse_rows(load('data-schueler-20261027.json')['payload'], STUDENT_FORMAT)
        greek = rows[4]
        self.assertEqual(greek['classes'], ['Q1c', 'Q1d', 'Q2a', 'Q2b', 'Q2d'])
        self.assertEqual((greek['note'], greek['kind'], greek['kind_label']), ('Klausur', 'other', 'Text'))
        self.assertEqual(greek['group'], 'Q1c')

    def test_teachers_fixture(self):
        rows = untis_monitor.parse_rows(load('data-lehrer-20261027.json')['payload'], TEACHER_FORMAT)
        self.assertEqual(len(rows), 8)
        self.assertEqual([r['group'] for r in rows[2:4]], ['ROT', 'ÖLZ'])
        self.assertEqual(rows[2]['teacher'], rows[3]['teacher'])
        self.assertEqual(rows[0]['kind_label'], 'Prüfung')
        self.assertEqual(rows[0]['classes'], ['9a'])

    def test_entities_and_tags(self):
        fmt = {**STUDENT_FORMAT}
        payload = payload_with(rows=[make_row(
            ['3', '8a', 'D&amp;E', '<b>1&auml;</b>', 'XYZ', 'Raum&auml;nderung', 'a <i>b</i>&nbsp;c'], group='8a')])
        row = untis_monitor.parse_rows(payload, fmt)[0]
        self.assertEqual((row['subject'], row['room'], row['kind_label'], row['note']),
                         ('D&E', '1ä', 'Raumänderung', 'a b c'))

    def test_cancelled_by_text_or_css_class(self):
        payload = payload_with(rows=[
            make_row(['1', '5c', 'De', '1', 'XYZ', 'Entfall', '']),
            make_row(['2', '5c', 'De', '1', 'XYZ', '', ''], css=['cancelStyle']),
            make_row(['3', '5c', 'De', '1', 'XYZ', 'Ausfall', '']),
        ])
        kinds = [r['kind'] for r in untis_monitor.parse_rows(payload, STUDENT_FORMAT)]
        self.assertEqual(kinds, ['cancelled'] * 3)

    def test_columns_follow_format_options(self):
        fmt = {**STUDENT_FORMAT, 'showTime': True, 'showRoom': False, 'showInfo': False}
        payload = payload_with(rows=[make_row(['2', '08:45', '5c', 'De', 'XYZ', 'Text'])])
        row = untis_monitor.parse_rows(payload, fmt)[0]
        self.assertEqual((row['periods'], row['classes'], row['subject'], row['room'], row['teacher'],
                          row['kind_label'], row['note']), ('2.', ['5c'], 'De', '', 'XYZ', 'Text', ''))

    def test_changed_value_without_span(self):
        payload = payload_with(rows=[make_row(['1', '5c', 'De', '204 (209)', 'ABC (XYZ)', '', ''])])
        row = untis_monitor.parse_rows(payload, STUDENT_FORMAT)[0]
        self.assertEqual((row['room'], row['room_old'], row['teacher'], row['teacher_old']),
                         ('204', '209', 'ABC', 'XYZ'))


class FakeResponse:
    def __init__(self, body, status=200):
        self.body = body
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f'{self.status_code}')

    def json(self):
        return self.body


def route(url_part_responses):
    """requests.post stand-in: returns the next response by URL suffix (format/data)."""
    calls = []

    def fake_post(url, json=None, timeout=None, **kwargs):
        calls.append({'url': url, 'json': json, 'timeout': timeout})
        kind = 'format' if '/format' in url else 'data'
        queue = url_part_responses[kind]
        item = queue.pop(0) if isinstance(queue, list) else queue
        if isinstance(item, Exception):
            raise item
        return item if isinstance(item, FakeResponse) else FakeResponse(item)

    fake_post.calls = calls
    return fake_post


FAR = lambda: time.monotonic() + 100  # noqa: E731


class FetchTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_format_cached_one_hour(self):
        fake = route({'format': {'payload': STUDENT_FORMAT}})
        with mock.patch('signage.untis_monitor.requests.post', fake):
            first = untis_monitor.fetch_format('example.test', 'katharineum', 'vplan-schueler', FAR())
            second = untis_monitor.fetch_format('example.test', 'katharineum', 'vplan-schueler', FAR())
            self.assertEqual(first, STUDENT_FORMAT)
            self.assertEqual(second, STUDENT_FORMAT)
            self.assertEqual(len(fake.calls), 1)
            with mock.patch('time.time', return_value=time.time() + 3601):
                untis_monitor.fetch_format('example.test', 'katharineum', 'vplan-schueler', FAR())
            self.assertEqual(len(fake.calls), 2)
        self.assertEqual(fake.calls[0]['url'], 'https://example.test/WebUntis/monitor/substitution/format'
                         '?school=katharineum&formatName=vplan-schueler')
        self.assertEqual(fake.calls[0]['json'], {'formatName': 'vplan-schueler', 'schoolName': 'katharineum'})

    def test_format_cache_key(self):
        fake = route({'format': {'payload': STUDENT_FORMAT}})
        with mock.patch('signage.untis_monitor.requests.post', fake):
            untis_monitor.fetch_format('example.test', 'katharineum', 'vplan-schueler', FAR())
        self.assertEqual(cache.get('signage:untis-monitor:format:vplan-schueler'), STUDENT_FORMAT)

    def test_data_post_body(self):
        data = load('data-schueler-20261027.json')
        fake = route({'format': {'payload': STUDENT_FORMAT}, 'data': data})
        with mock.patch('signage.untis_monitor.requests.post', fake):
            payload = untis_monitor.fetch_day('example.test', 'katharineum', 'vplan-schueler',
                                              STUDENT_FORMAT, date(2026, 10, 21), FAR())
        self.assertEqual(payload, data['payload'])
        call = fake.calls[0]
        self.assertEqual(call['url'], 'https://example.test/WebUntis/monitor/substitution/data'
                         '?school=katharineum')
        body = call['json']
        self.assertEqual((body['formatName'], body['schoolName'], body['date'], body['dateOffset']),
                         ('vplan-schueler', 'katharineum', 20261021, 0))
        self.assertIsInstance(body['date'], int)
        for key, value in STUDENT_FORMAT.items():
            if key != 'dateOffset':
                self.assertEqual(body[key], value)
        self.assertLessEqual(call['timeout'], untis_monitor.TIMEOUT)

    def test_overrides_replace_options(self):
        fake = route({'format': {'payload': STUDENT_FORMAT},
                      'data': {'payload': payload_with(date=20261021, nextDate=None)}})
        with mock.patch('signage.untis_monitor.requests.post', fake):
            untis_monitor.load_days('example.test', 'katharineum', 'vplan-schueler', start=date(2026, 10, 21),
                                    count=1, overrides={'showOnlyFutureSub': False, 'numberOfDays': 1},
                                    show_absences=True, deadline=FAR())
        body = fake.calls[-1]['json']
        self.assertIs(body['showOnlyFutureSub'], False)
        self.assertEqual(body['numberOfDays'], 1)

    def test_second_day_uses_next_date(self):
        day1 = {'payload': payload_with(date=20261023, nextDate=20261026)}
        day2 = {'payload': payload_with(date=20261026, nextDate=20261027,
                                        rows=[make_row(['1', '5c', 'De', '1', 'XYZ', '', ''])])}
        fake = route({'format': {'payload': STUDENT_FORMAT}, 'data': [day1, day2]})
        with mock.patch('signage.untis_monitor.requests.post', fake):
            result = untis_monitor.load_days('example.test', 'katharineum', 'vplan-schueler',
                                             start=date(2026, 10, 23), count=2, overrides={},
                                             show_absences=True, deadline=FAR())
        data_calls = [c for c in fake.calls if '/data' in c['url']]
        self.assertEqual([c['json']['date'] for c in data_calls], [20261023, 20261026])
        self.assertEqual([d['date'] for d in result['days']], ['2026-10-23', '2026-10-26'])
        self.assertEqual(result['days'][0]['rows'], [])
        self.assertEqual(len(result['days'][1]['rows']), 1)
        self.assertEqual(result['group_by'], 'class')
        self.assertEqual(result['columns'], {'class': True, 'subject': True, 'teacher': True,
                                             'room': True, 'note': True})
        self.assertEqual(result['updated_at'], '2026-10-19T11:41:02+02:00')

    def test_group_by_teacher_and_columns(self):
        fmt = {**TEACHER_FORMAT, 'showRoom': False, 'showInfo': False, 'showSubstText': False}
        fake = route({'format': {'payload': fmt}, 'data': {'payload': payload_with(nextDate=None)}})
        with mock.patch('signage.untis_monitor.requests.post', fake):
            result = untis_monitor.load_days('example.test', 'katharineum', 'vplan-lehrer',
                                             start=date(2026, 10, 27), count=2, overrides={},
                                             show_absences=False, deadline=FAR())
        self.assertEqual(result['group_by'], 'teacher')
        self.assertEqual(result['columns']['room'], False)
        self.assertEqual(result['columns']['note'], False)
        self.assertEqual(len(result['days']), 1)

    def test_deadline_raises_monitor_unavailable(self):
        fake = route({'format': {'payload': STUDENT_FORMAT}})
        with mock.patch('signage.untis_monitor.requests.post', fake):
            with self.assertRaises(MonitorUnavailable):
                untis_monitor.fetch_format('example.test', 'katharineum', 'vplan-schueler',
                                           time.monotonic() - 1)
        self.assertEqual(fake.calls, [])

    def test_http_error_raises_monitor_unavailable(self):
        for item in (FakeResponse({}, status=500), requests.ConnectionError('boom'),
                     FakeResponse({'kein': 'payload'})):
            fake = route({'data': [item]})
            with mock.patch('signage.untis_monitor.requests.post', fake):
                with self.assertRaises(MonitorUnavailable):
                    untis_monitor.fetch_day('example.test', 'katharineum', 'vplan-schueler',
                                            STUDENT_FORMAT, date(2026, 10, 21), FAR())

    def test_invalid_json_raises_monitor_unavailable(self):
        class BadJson(FakeResponse):
            def json(self):
                raise ValueError('kein JSON')
        fake = route({'data': [BadJson({})]})
        with mock.patch('signage.untis_monitor.requests.post', fake):
            with self.assertRaises(MonitorUnavailable):
                untis_monitor.fetch_day('example.test', 'katharineum', 'vplan-schueler',
                                        STUDENT_FORMAT, date(2026, 10, 21), FAR())


class RecordCommandTests(TestCase):
    def test_writes_raw_files(self):
        import tempfile
        from django.core.management import call_command
        from io import StringIO
        from .models import MonitorSettings
        MonitorSettings.load()
        MonitorSettings.objects.filter(pk=1).update(webuntis_server='example.test', webuntis_school='katharineum')
        data = load('data-schueler-20261027.json')
        fake = route({'format': {'payload': STUDENT_FORMAT}, 'data': data})
        with tempfile.TemporaryDirectory() as tmp, mock.patch('signage.untis_monitor.requests.post', fake):
            call_command('signage_webuntis_record', '--format', 'vplan-schueler', '--date', '20261027', '--out', tmp,
                         stdout=StringIO())
            self.assertEqual(json.loads((Path(tmp) / 'format-vplan-schueler.json').read_text('utf-8')),
                             {'payload': STUDENT_FORMAT})
            self.assertEqual(json.loads((Path(tmp) / 'data-20261027.json').read_text('utf-8')), data)


class CheckCommandTest(TestCase):
    """signage_webuntis_check also checks the public monitor endpoint: only status and cause."""

    WEBUNTIS_OK = {'login': True, 'substitutions': True, 'timetable': True, 'news': True,
                   'source': 'substitutions'}

    def setUp(self):
        from .models import MonitorSettings
        cache.clear()
        settings = MonitorSettings.load()
        settings.webuntis_server, settings.webuntis_school = 'example.test', 'katharineum'
        settings.save()

    def run_command(self, fake):
        from io import StringIO

        from django.core.management import call_command
        out = StringIO()
        with mock.patch('signage.untis_monitor.requests.post', fake), \
                mock.patch('signage.webuntis.check', return_value=self.WEBUNTIS_OK):
            call_command('signage_webuntis_check', stdout=out)
        return out.getvalue()

    def test_monitor_source_works(self):
        secret_row = {'data': ['GEHEIMKLASSE'], 'cssClasses': []}
        fake = route({'format': {'payload': STUDENT_FORMAT},
                      'data': {'payload': payload_with(rows=[secret_row])}})
        text = self.run_command(fake)
        self.assertIn('Monitor-Schnittstelle (vplan-schueler): geht\n', text)
        self.assertEqual([c['url'].split('?')[0].rsplit('/', 1)[1] for c in fake.calls], ['format', 'data'])
        self.assertNotIn('GEHEIMKLASSE', text)

    def test_monitor_source_ignores_cached_format(self):
        cache.set('signage:untis-monitor:format:vplan-schueler', STUDENT_FORMAT, 3600)
        fake = route({'format': [FakeResponse({}, status=503)], 'data': {'payload': payload_with()}})
        text = self.run_command(fake)
        self.assertIn('Monitor-Schnittstelle (vplan-schueler): geht nicht (Ursache: HTTPError)\n', text)

    def test_monitor_source_day_fails(self):
        fake = route({'format': {'payload': STUDENT_FORMAT}, 'data': [requests.ConnectionError('boom')]})
        text = self.run_command(fake)
        self.assertIn('Monitor-Schnittstelle (vplan-schueler): geht nicht (Ursache: ConnectionError)\n', text)

    def test_monitor_source_not_configured(self):
        from .models import MonitorSettings
        settings = MonitorSettings.load()
        settings.webuntis_server = ''
        settings.save()
        fake = route({'format': [], 'data': []})
        text = self.run_command(fake)
        self.assertIn('Monitor-Schnittstelle (vplan-schueler): nicht eingerichtet '
                      '(Server und Schule im Monitor-Admin unter Einstellungen eintragen)\n', text)
        self.assertEqual(fake.calls, [])
