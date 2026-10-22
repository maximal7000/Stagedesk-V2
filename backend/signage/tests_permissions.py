"""Rechte-Aufteilung (Spec §3.5): users/0016 und die Zuordnung Endpunkt zu Recht."""
from unittest import mock

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import SimpleTestCase

from signage import api, api_setup
from .tests_migrations import MigrationTestCase


class _Denied(Exception):
    pass


class SplitMonitorEditMigrationTest(MigrationTestCase):
    migrate_from = ('users', '0015_rename_monitor_emergency_permission')
    migrate_to = ('users', '0016_split_monitor_edit')

    def setUpBeforeMigration(self, apps):
        Permission = apps.get_model('users', 'Permission')
        edit, _ = Permission.objects.get_or_create(
            code='monitor.edit', defaults={'name': 'Monitor bearbeiten', 'category': 'monitor'})
        view, _ = Permission.objects.get_or_create(
            code='monitor.view', defaults={'name': 'Monitor anzeigen', 'category': 'monitor'})
        group = apps.get_model('users', 'PermissionGroup').objects.create(name='Technik')
        group.permissions.add(edit, view)
        profile = apps.get_model('users', 'UserProfile').objects.create(keycloak_id='kc-direct')
        profile.permissions.add(edit)

    def test_edit_holders_get_four_permissions(self):
        Permission = self.apps.get_model('users', 'Permission')
        self.assertFalse(Permission.objects.filter(code='monitor.edit').exists())
        group = self.apps.get_model('users', 'PermissionGroup').objects.get(name='Technik')
        self.assertEqual(
            set(group.permissions.values_list('code', flat=True)),
            {'monitor.view', 'monitor.setup', 'monitor.exams', 'monitor.media', 'monitor.power'},
        )
        profile = self.apps.get_model('users', 'UserProfile').objects.get(keycloak_id='kc-direct')
        self.assertEqual(
            set(profile.permissions.values_list('code', flat=True)),
            {'monitor.setup', 'monitor.exams', 'monitor.media', 'monitor.power'},
        )

    def test_devices_exists_without_holders(self):
        Permission = self.apps.get_model('users', 'Permission')
        devices = Permission.objects.get(code='monitor.devices')
        self.assertEqual(devices.groups.count(), 0)
        self.assertEqual(devices.users.count(), 0)


class EndpointPermissionMatrixTest(SimpleTestCase):
    """Patcht _require_perm und prüft den Code, den der Endpunkt als Erstes verlangt."""

    def assertRequires(self, code, func_name, *args, **kwargs):
        module = api if hasattr(api, func_name) else api_setup
        with mock.patch.object(module, '_require_perm', side_effect=_Denied) as guard:
            with self.assertRaises(_Denied):
                getattr(module, func_name)(object(), *args, **kwargs)
        guard.assert_called_once()
        self.assertEqual(guard.call_args.args[1], code, func_name)

    def test_endpoint_permission_matrix(self):
        matrix = {
            'signage.setup': [
                ('create_view', None), ('delete_view', 1), ('update_view', None),
                ('restore_view_version', 1), ('regenerate_token', None),
                ('create_webuntis_link', None), ('update_webuntis_link', 1, None),
                ('delete_webuntis_link', 1), ('search_transit_stops',),
                ('create_screen', None), ('update_screen', 1, api.ScreenUpdateSchema(name='Halle')),
                ('delete_screen', 1),
                ('reload_screen', 1), ('regenerate_screen_key', 1), ('create_view_preview', None),
            ],
            'signage.exams': [
                ('create_exam', None), ('update_exam', 1, None), ('delete_exam', 1),
                ('create_exam_template', None), ('update_exam_template', 1, None),
                ('delete_exam_template', 1),
                ('create_announcement', None), ('update_announcement', 1, None),
                ('delete_announcement', 1),
                ('create_event', None), ('update_event', 1, None), ('delete_event', 1),
                ('activate_event', 1), ('deactivate_event', 1),
            ],
            'signage.media': [('upload_file', None), ('delete_file', 1)],
            # update_settings: Aufteilung setup/onair in tests_power.SettingsPermissionSplitTest
            'signage.power': [
                ('list_holidays',), ('create_holiday', None), ('update_holiday', 1, None),
                ('delete_holiday', 1), ('power_off_today', None), ('undo_power_off_today', None),
                # gemischte Payloads: tests_power.ScreenUpdatePermissionSplitTest
                ('update_screen', 1, api.ScreenUpdateSchema(power_mode='auto', off_until=None)),
            ],
            'signage.emergency': [
                ('list_emergency_templates',), ('create_emergency_template', None),
                ('update_emergency_template', 1, None), ('delete_emergency_template', 1),
            ],
        }
        for code, rows in matrix.items():
            for name, *args in rows:
                with self.subTest(endpoint=name):
                    self.assertRequires(code, name, *args)

    def test_trash_permission_depends_on_kind(self):
        for name in ('restore_trash', 'purge_trash'):
            with self.subTest(endpoint=name, kind='media'):
                self.assertRequires('signage.media', name, 'media', 1)
            with self.subTest(endpoint=name, kind='view'):
                self.assertRequires('signage.setup', name, 'view', 1)

    def test_monitor_edit_is_gone(self):
        import inspect
        self.assertNotIn('monitor.edit', inspect.getsource(api))


class RenameToSignagePermissionsMigrationTest(MigrationTestCase):
    """users/0017: monitor.* heißt signage.*, Zuweisungen an Gruppen und Nutzer bleiben."""
    migrate_from = ('users', '0016_split_monitor_edit')
    migrate_to = ('users', '0017_rename_monitor_permissions_to_signage')
    CODES = ['view', 'setup', 'exams', 'media', 'power', 'onair', 'emergency', 'devices']

    def setUpBeforeMigration(self, apps):
        Permission = apps.get_model('users', 'Permission')
        perms = {
            code: Permission.objects.get_or_create(
                code=f'monitor.{code}', defaults={'name': code, 'category': 'monitor'})[0]
            for code in self.CODES
        }
        group = apps.get_model('users', 'PermissionGroup').objects.create(name='Technik')
        group.permissions.add(perms['power'])
        profile = apps.get_model('users', 'UserProfile').objects.create(keycloak_id='kc-rename')
        profile.permissions.add(perms['setup'])
        self.pks = {code: p.pk for code, p in perms.items()}

    def test_permission_assignments_survive_rename(self):
        Permission = self.apps.get_model('users', 'Permission')
        self.assertFalse(Permission.objects.filter(code__startswith='monitor.').exists())
        for code in self.CODES:
            self.assertEqual(Permission.objects.get(code=f'signage.{code}').pk, self.pks[code])
        group = self.apps.get_model('users', 'PermissionGroup').objects.get(name='Technik')
        self.assertEqual(list(group.permissions.values_list('code', flat=True)), ['signage.power'])
        profile = self.apps.get_model('users', 'UserProfile').objects.get(keycloak_id='kc-rename')
        self.assertEqual(list(profile.permissions.values_list('code', flat=True)), ['signage.setup'])

    def test_backward_restores_monitor_codes(self):
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        apps = executor.loader.project_state([self.migrate_from]).apps
        Permission = apps.get_model('users', 'Permission')
        self.assertFalse(Permission.objects.filter(code__startswith='signage.').exists())
        group = apps.get_model('users', 'PermissionGroup').objects.get(name='Technik')
        self.assertEqual(list(group.permissions.values_list('code', flat=True)), ['monitor.power'])
        profile = apps.get_model('users', 'UserProfile').objects.get(keycloak_id='kc-rename')
        self.assertEqual(list(profile.permissions.values_list('code', flat=True)), ['monitor.setup'])


class SignageCodeEndpointTest(SimpleTestCase):
    def test_setup_endpoint_accepts_signage_setup_and_denies_without(self):
        from ninja.errors import HttpError
        from signage import permissions
        profile = mock.Mock()
        profile.has_permission.side_effect = lambda code, default=False: code == 'signage.setup'
        request = mock.Mock(auth={'sub': 'kc-1'})
        with mock.patch.object(permissions, 'is_admin', return_value=False), \
                mock.patch.object(permissions.UserProfile.objects, 'get', return_value=profile):
            permissions._require_perm(request, 'signage.setup')
            with self.assertRaises(HttpError) as ctx:
                permissions._require_perm(request, 'signage.power')
        self.assertEqual(ctx.exception.status_code, 403)
