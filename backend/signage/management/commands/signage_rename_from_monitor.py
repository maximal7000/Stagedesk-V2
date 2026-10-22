"""Move the database of the former app `monitor` to the app label `signage`.

Runs before `migrate` (see scripts/deploy.sh). Uses only introspection and raw SQL because
the models point at signage_* tables, which do not exist yet on an old database.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

OLD, NEW = 'monitor', 'signage'


class Command(BaseCommand):
    help = 'Benennt Tabellen, Migrationsverlauf und Content-Types von monitor in signage um.'

    def add_arguments(self, parser):
        parser.add_argument('--reverse', action='store_true',
                            help='Rückweg: signage wieder in monitor umbenennen.')

    def handle(self, *args, **options):
        source, target = (NEW, OLD) if options['reverse'] else (OLD, NEW)
        with transaction.atomic(), connection.cursor() as cursor:
            existing = connection.introspection.table_names(cursor)
            tables = sorted(t for t in existing if t.startswith(f'{source}_'))
            if tables and any(t.startswith(f'{target}_') for t in existing):
                raise CommandError(f'Tabellen für {OLD} und {NEW} vorhanden, Umbenennung abgebrochen.')

            bookkeeping = [(table, column) for table, column in
                           (('django_migrations', 'app'), ('django_content_type', 'app_label'))
                           if table in existing]
            pending_rows = sum(self._count(cursor, table, column, source) for table, column in bookkeeping)
            if not tables and not pending_rows:
                self.stdout.write('Nichts umzubenennen.')
                return

            quote = connection.ops.quote_name
            for table in tables:
                cursor.execute(f'ALTER TABLE {quote(table)} RENAME TO {quote(self._swap(table, source, target))}')
            sequences = self._sequences(cursor, source)
            for sequence in sequences:
                cursor.execute(
                    f'ALTER SEQUENCE {quote(sequence)} RENAME TO {quote(self._swap(sequence, source, target))}')
            for table, column in bookkeeping:
                cursor.execute(f'UPDATE {table} SET {column} = %s WHERE {column} = %s', [target, source])

        self.stdout.write(f'{len(tables)} Tabellen, {len(sequences)} Sequenzen und {pending_rows} '
                          f'Verwaltungseinträge von {source} in {target} umbenannt.')

    @staticmethod
    def _swap(name, source, target):
        return target + name[len(source):]

    @staticmethod
    def _count(cursor, table, column, value):
        cursor.execute(f'SELECT COUNT(*) FROM {table} WHERE {column} = %s', [value])
        return cursor.fetchone()[0]

    @staticmethod
    def _sequences(cursor, source):
        # SQLite keeps AUTOINCREMENT counters in sqlite_sequence, which follows ALTER TABLE.
        if connection.vendor != 'postgresql':
            return []
        cursor.execute(
            "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE c.relkind = 'S' AND n.nspname = current_schema() AND c.relname LIKE %s "
            "ORDER BY c.relname",
            [f'{source}\\_%\\_seq'])
        return [row[0] for row in cursor.fetchall()]
