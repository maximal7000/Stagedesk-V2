import json
from pathlib import Path

from django.test import SimpleTestCase

from . import untis_monitor
from .substitution_rows import class_sort_key, format_classes, split_class, student_rows, teacher_rows

FIXTURES = Path(__file__).parent / 'fixtures_untis'


def row(**changes):
    base = {'classes': [], 'group': '', 'periods': '1.', 'subject': 'De', 'teacher': 'ABC', 'teacher_old': '',
            'room': '101', 'room_old': '', 'kind': 'substitution', 'kind_label': 'Vertretung', 'note': ''}
    return {**base, **changes}


class SubstitutionRowsTests(SimpleTestCase):
    def test_split_class(self):
        self.assertEqual(split_class('Q2a'), ('Q2', 'a'))
        self.assertEqual(split_class('10B'), ('10', 'b'))
        self.assertEqual(split_class('E'), ('E', ''))
        self.assertIsNone(split_class('DaZ'))
        self.assertIsNone(split_class(''))

    def test_order_10_after_9(self):
        self.assertEqual(sorted(['10a', 'Q1b', '5c', 'E', '9a', 'Q2a'], key=class_sort_key),
                         ['5c', '9a', '10a', 'E', 'Q1b', 'Q2a'])

    def test_format_examples(self):
        self.assertEqual(format_classes(['Q2a', 'Q2c', 'Q2d']), 'Q2a, c, d')
        self.assertEqual(format_classes(['Q2d', 'Q2a', 'Q2b', 'Q2c']), 'Q2a–d')
        self.assertEqual(format_classes(['5a', '5b', '5c']), '5a–c')
        self.assertEqual(format_classes(['Q2a', 'Q2b', 'Q2c', 'Q2e']), 'Q2a–c, e')
        self.assertEqual(format_classes(['Q1c', 'Q1d']), 'Q1c, d')
        self.assertEqual(format_classes(['Q1c', 'Q1d', 'Q2a', 'Q2b', 'Q2d']), 'Q1c, d, Q2a, b, d')

    def test_greek_once_per_grade(self):
        out = student_rows([row(classes=['Q1c', 'Q1d', 'Q2a', 'Q2b', 'Q2d'], subject='Grie')])
        self.assertEqual([(r['grade'], r['classes_label']) for r in out],
                         [('Q1', 'Q1c, d'), ('Q2', 'Q2a, b, d')])

    def test_support_lesson_in_each_grade(self):
        out = student_rows([row(classes=['5a', '5b', '6a', '7c', '8a', '8b', '9d'])])
        self.assertEqual([(r['grade'], r['classes_label']) for r in out],
                         [('5', '5a, b'), ('6', '6a'), ('7', '7c'), ('8', '8a, b'), ('9', '9d')])

    def test_unknown_names_kept_and_last(self):
        out = student_rows([row(classes=['DaZ', '5a', 'Q2 Ku', ''])])
        self.assertEqual([r['classes_label'] for r in out], ['5a', 'DaZ', 'Q2 Ku'])

    def test_duplicates_once_per_grade(self):
        out = student_rows([row(classes=['5a', '5a', '5b'])])
        self.assertEqual([r['classes_label'] for r in out], ['5a, b'])

    def test_sorted_by_grade_class_period(self):
        out = student_rows([row(classes=['6a'], periods='1.'), row(classes=['5b'], periods='3.–4.'),
                            row(classes=['5b'], periods='2.'), row(classes=['5a'], periods='')])
        self.assertEqual([(r['classes_label'], r['periods']) for r in out],
                         [('5a', ''), ('5b', '2.'), ('5b', '3.–4.'), ('6a', '1.')])

    def test_input_not_mutated(self):
        source = row(classes=['5a'])
        student_rows([source])
        teacher_rows([source])
        self.assertNotIn('classes_label', source)

    def test_untis_repeats_collapsed(self):
        payload = json.loads((FIXTURES / 'data-schueler-20261027.json').read_text(encoding='utf-8'))['payload']
        fmt = json.loads((FIXTURES / 'format-vplan-schueler.json').read_text(encoding='utf-8'))['payload']
        out = student_rows(untis_monitor.parse_rows(payload, fmt))
        greek = [(r['grade'], r['classes_label']) for r in out if r['subject'] == 'Gr']
        info = [(r['grade'], r['classes_label']) for r in out if r['subject'] == 'If']
        self.assertEqual(greek, [('Q1', 'Q1c, d'), ('Q2', 'Q2a, b, d')])
        self.assertEqual(info, [('Q2', 'Q2b–d')])

    def test_teacher_rows_single_line(self):
        rows = [row(classes=['5a', '6a', '7a'], group='ZZZ'), row(classes=['5a', '6a', '7a'], group='BEC'),
                row(classes=['5a', '6a', '7a'], group='ABC'), row(classes=['5a', '6a', '7a'], group='ABC')]
        out = teacher_rows(rows)
        self.assertEqual([r['group'] for r in out], ['ABC', 'BEC', 'ZZZ'])
        self.assertEqual(out[0]['classes_label'], '5a, 6a, 7a')
