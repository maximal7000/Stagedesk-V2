from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.db.models.sql.compiler import SQLCompiler, SQLInsertCompiler
from django.test import TransactionTestCase
from django.utils import timezone

from .models import DisplayView, Exam, MediaFile, Screen, monitor_upload_path


def _tables(prefix):
    with connection.cursor() as cursor:
        names = connection.introspection.table_names(cursor)
    return sorted(n for n in names if n.startswith(prefix))


def _scalar(sql, params=()):
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchone()[0]


def _migration_count(app):
    return _scalar('SELECT COUNT(*) FROM django_migrations WHERE app = %s', [app])


def _content_type_count(app_label):
    return _scalar('SELECT COUNT(*) FROM django_content_type WHERE app_label = %s', [app_label])


def _run(*args):
    out = StringIO()
    call_command('signage_rename_from_monitor', *args, stdout=out)
    return out.getvalue()


class RenameCommandTests(TransactionTestCase):
    def setUp(self):
        self.signage_tables = _tables('signage_')
        self.migrations = _migration_count('signage')
        self.content_types = _content_type_count('signage')

    def tearDown(self):
        # Never leave the test database in the old schema: later tests need signage_*.
        if _tables('monitor_') and not _tables('signage_'):
            _run()
        with connection.cursor() as cursor:
            if 'monitor_x' in connection.introspection.table_names(cursor):
                cursor.execute('DROP TABLE monitor_x')

    def _create_rows(self):
        view = DisplayView.objects.create(name='Info', slug='info', kind='info')
        screen = Screen.objects.create(name='Halle', slug='halle', default_view=view)
        now = timezone.now()
        exam = Exam.objects.create(active_from=now, active_until=now + timedelta(hours=2))
        exam.screens.add(screen)
        return view, screen, exam

    def test_reverse_then_forward_round_trip(self):
        view, screen, exam = self._create_rows()
        self.assertGreater(self.migrations, 0)
        self.assertGreater(self.content_types, 0)

        _run('--reverse')

        old_tables = _tables('monitor_')
        self.assertEqual(_tables('signage_'), [])
        self.assertEqual(old_tables, [n.replace('signage_', 'monitor_', 1) for n in self.signage_tables])
        self.assertEqual(_migration_count('signage'), 0)
        self.assertEqual(_migration_count('monitor'), self.migrations)
        self.assertEqual(_content_type_count('signage'), 0)
        self.assertEqual(_content_type_count('monitor'), self.content_types)
        self.assertEqual(_scalar('SELECT name FROM monitor_screen WHERE id = %s', [screen.id]), 'Halle')
        self.assertEqual(_scalar('SELECT COUNT(*) FROM monitor_exam_screens WHERE exam_id = %s', [exam.id]), 1)

        _run()

        self.assertEqual(_tables('monitor_'), [])
        self.assertEqual(_tables('signage_'), self.signage_tables)
        self.assertEqual(_migration_count('monitor'), 0)
        self.assertEqual(_migration_count('signage'), self.migrations)
        self.assertEqual(_content_type_count('monitor'), 0)
        self.assertEqual(_content_type_count('signage'), self.content_types)
        screen = Screen.objects.get(pk=screen.pk)
        self.assertEqual((screen.name, screen.default_view_id), ('Halle', view.id))
        self.assertEqual(list(Exam.objects.get(pk=exam.pk).screens.all()), [screen])

    def test_forward_twice_is_noop(self):
        self.assertIn('Nichts umzubenennen.', _run())
        self.assertIn('Nichts umzubenennen.', _run())
        self.assertEqual(_tables('signage_'), self.signage_tables)
        self.assertEqual(_migration_count('signage'), self.migrations)

    def test_both_prefixes_aborts(self):
        with connection.cursor() as cursor:
            cursor.execute('CREATE TABLE monitor_x (id integer PRIMARY KEY)')
        with self.assertRaisesMessage(CommandError,
                                      'Tabellen für monitor und signage vorhanden, Umbenennung abgebrochen.'):
            _run()
        with self.assertRaises(CommandError):
            _run('--reverse')
        self.assertEqual(_tables('monitor_'), ['monitor_x'])
        self.assertEqual(_tables('signage_'), self.signage_tables)
        self.assertEqual(_migration_count('signage'), self.migrations)
        self.assertEqual(_content_type_count('signage'), self.content_types)

    def test_forward_on_old_schema_without_app_tables(self):
        _run('--reverse')
        self.assertEqual(_tables('signage_'), [])
        orm_used = AssertionError('the command must not query through models')
        with mock.patch.object(SQLCompiler, 'execute_sql', side_effect=orm_used), \
                mock.patch.object(SQLInsertCompiler, 'execute_sql', side_effect=orm_used):
            output = _run()
        self.assertNotIn('Nichts umzubenennen.', output)
        self.assertEqual(_tables('signage_'), self.signage_tables)
        self.assertEqual(_migration_count('signage'), self.migrations)

    def test_upload_path_unchanged(self):
        path = monitor_upload_path(MediaFile(kind='image'), 'a.png')
        self.assertTrue(path.startswith('monitor/'), path)
