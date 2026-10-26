import importlib
import pkgutil
from unittest import mock

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.loader import MigrationLoader
from django.test import SimpleTestCase, TestCase

from ninja.errors import HttpError

from core.auth import KeycloakAuth
from signage import api as api_package, devices, permissions
from signage.roles import SIGNAGE_ROLES, signage_permission_codes, signage_roles
from users import api as users_api
from users.models import Permission, PermissionGroup, UserProfile
from signage.schemas import ScreenUpdateSchema
from .tests_migrations import MigrationTestCase


API_MODULES = [importlib.import_module(f'{api_package.__name__}.{info.name}')
               for info in pkgutil.iter_modules(api_package.__path__)]


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
    """Patches _require_perm and checks the code the endpoint asks for first."""

    def assertRequires(self, code, func_name, *args, **kwargs):
        module = next(m for m in API_MODULES if hasattr(m, func_name))
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
                ('create_screen', None), ('update_screen', 1, ScreenUpdateSchema(name='Halle')),
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
            # update_settings: setup/onair split in tests_power.SettingsPermissionSplitTest
            'signage.power': [
                ('list_holidays',), ('create_holiday', None), ('update_holiday', 1, None),
                ('delete_holiday', 1), ('power_off_today', None), ('undo_power_off_today', None),
                # mixed payloads: tests_power.ScreenUpdatePermissionSplitTest
                ('update_screen', 1, ScreenUpdateSchema(power_mode='auto', off_until=None)),
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
        for module in API_MODULES:
            self.assertNotIn('monitor.edit', inspect.getsource(module), module.__name__)


class RenameToSignagePermissionsMigrationTest(MigrationTestCase):
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


def _migration_name(prefix):
    return MigrationLoader(None, ignore_no_migrations=True).get_migration_by_prefix('users', prefix).name


class RemoveSignagePermissionsMigrationTest(MigrationTestCase):
    migrate_from = ('users', _migration_name('0018'))
    migrate_to = ('users', _migration_name('0019'))

    def setUpBeforeMigration(self, apps):
        Permission = apps.get_model('users', 'Permission')
        signage, _ = Permission.objects.get_or_create(code='signage.view', defaults={'name': 'Monitor anzeigen'})
        other, _ = Permission.objects.get_or_create(code='kalender.view', defaults={'name': 'Kalender anzeigen'})
        group = apps.get_model('users', 'PermissionGroup').objects.create(name='Technik')
        group.permissions.add(signage, other)

    def test_forward_deletes_only_signage_codes(self):
        Permission = self.apps.get_model('users', 'Permission')
        self.assertFalse(Permission.objects.filter(code__startswith='signage.').exists())
        group = self.apps.get_model('users', 'PermissionGroup').objects.get(name='Technik')
        self.assertEqual(list(group.permissions.values_list('code', flat=True)), ['kalender.view'])

    def test_backward_recreates_codes_without_assignments(self):
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        apps = executor.loader.project_state([self.migrate_from]).apps
        Permission = apps.get_model('users', 'Permission')
        codes = set(Permission.objects.filter(code__startswith='signage.').values_list('code', flat=True))
        self.assertEqual(codes, {f'signage.{role}' for role in SIGNAGE_ROLES})
        self.assertFalse(Permission.objects.get(code='signage.view').groups.exists())
        self.assertTrue(Permission.objects.filter(code='kalender.view').exists())


class SignageRolesTest(SimpleTestCase):
    @staticmethod
    def token(*roles):
        return {'resource_access': {'signage': {'roles': list(roles)}}}

    def test_roles_from_token(self):
        self.assertEqual(signage_roles(self.token('view', 'power')), {'view', 'power'})

    def test_admin_role_expands(self):
        self.assertEqual(signage_roles(self.token('admin')), set(SIGNAGE_ROLES))

    def test_roles_from_malformed_token(self):
        for token in (None, {}, {'resource_access': []}, {'resource_access': {'signage': []}},
                      {'resource_access': {'signage': {'roles': 'view'}}},
                      self.token('superuser', 'signage.view')):
            self.assertEqual(signage_roles(token), set(), token)

    def test_permission_codes_sorted(self):
        self.assertEqual(signage_permission_codes({'power', 'view'}), ['signage.power', 'signage.view'])


class RequirePermTest(SimpleTestCase):
    def check(self, token, code):
        request = mock.Mock(auth=token)
        permissions._require_perm(request, code)

    def test_require_perm_uses_token_roles(self):
        token = {'sub': 'kc-1', 'resource_access': {'signage': {'roles': ['media']}}}
        self.check(token, 'signage.media')
        with self.assertRaises(HttpError) as ctx:
            self.check(token, 'signage.setup')
        self.assertEqual(ctx.exception.status_code, 403)

    def test_composite_admin_role_passes_all(self):
        token = {'resource_access': {'signage': {'roles': ['admin']}}}
        for role in SIGNAGE_ROLES:
            self.check(token, f'signage.{role}')

    def test_keycloak_admin_passes_without_signage_roles(self):
        token = {'sub': 'kc-1', 'realm_access': {'roles': ['admin']}}
        for role in SIGNAGE_ROLES:
            self.check(token, f'signage.{role}')


class SignageProfileTest(TestCase):
    def get(self, token, path='/api/users/me'):
        with mock.patch.object(KeycloakAuth, '__call__', return_value=token):
            return self.client.get(path, HTTP_AUTHORIZATION='Bearer x')

    def test_admin_passes_without_signage_roles(self):
        token = {'sub': 'kc-admin', 'realm_access': {'roles': ['admin']}}
        r = self.get(token)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn('kc-admin', devices.notification_recipients())
        permissions._require_perm(mock.Mock(auth=token), 'signage.devices')

    def test_db_permission_alone_is_not_enough(self):
        profile = UserProfile.objects.create(keycloak_id='kc-db')
        perm, _ = Permission.objects.get_or_create(code='signage.view', defaults={'name': 'Ansehen'})
        profile.permissions.add(perm)
        with self.assertRaises(HttpError) as ctx:
            permissions._require_perm(mock.Mock(auth={'sub': 'kc-db'}), 'signage.view')
        self.assertEqual(ctx.exception.status_code, 403)

    def test_me_lists_signage_permissions_from_token(self):
        token = {'sub': 'kc-exams', 'resource_access': {'signage': {'roles': ['exams']}}}
        r = self.get(token)
        self.assertEqual(r.status_code, 200, r.content)
        codes = [c for c in r.json()['permissions'] if c.startswith('signage.')]
        self.assertEqual(codes, ['signage.exams'])

    def test_cache_replaced_on_next_login(self):
        self.get({'sub': 'kc-dev', 'resource_access': {'signage': {'roles': ['devices']}}})
        self.assertEqual(UserProfile.objects.get(keycloak_id='kc-dev').signage_roles_cached, ['devices'])
        self.assertEqual(devices.notification_recipients(), ['kc-dev'])
        self.get({'sub': 'kc-dev'})
        self.assertEqual(UserProfile.objects.get(keycloak_id='kc-dev').signage_roles_cached, [])
        self.assertEqual(devices.notification_recipients(), [])


class SignageCatalogTest(TestCase):
    def test_catalog_has_no_signage_codes(self):
        self.assertFalse(any(c.startswith('signage.') for c in users_api.KNOWN_PERMISSION_CODES))

    def test_setup_system_creates_no_signage_permissions(self):
        token = {'sub': 'kc-admin', 'realm_access': {'roles': ['admin']}}
        with mock.patch.object(KeycloakAuth, '__call__', return_value=token):
            r = self.client.post('/api/users/setup/init', HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(Permission.objects.filter(code='kalender.view').exists())
        self.assertEqual(Permission.objects.filter(code__startswith='signage.').count(), 0)


class SignagePermissionListsTest(TestCase):
    def test_my_permissions_include_token_roles(self):
        profile = UserProfile.objects.create(keycloak_id='kc-list')
        group = PermissionGroup.objects.create(name='Kalender')
        group.permissions.add(Permission.objects.create(code='kalender.view', name='Kalender'))
        group.users.add(profile)
        token = {'sub': 'kc-list', 'resource_access': {'signage': {'roles': ['power', 'view']}}}
        with mock.patch.object(KeycloakAuth, '__call__', return_value=token):
            r = self.client.get('/api/users/me/permissions', HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json(), ['kalender.view', 'signage.power', 'signage.view'])

    def test_effective_permissions_include_cached_roles(self):
        profile = UserProfile.objects.create(keycloak_id='kc-target', signage_roles_cached=['media'])
        token = {'sub': 'kc-admin', 'realm_access': {'roles': ['admin']}}
        with mock.patch.object(KeycloakAuth, '__call__', return_value=token):
            r = self.client.get(f'/api/users/users/{profile.id}/effective-permissions',
                                HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['permissions'], ['signage.media'])

    def test_stored_signage_rows_never_listed(self):
        profile = UserProfile.objects.create(keycloak_id='kc-stale', signage_roles_cached=[])
        perm = Permission.objects.create(code='signage.view', name='Ansehen')
        profile.permissions.add(perm)
        token = {'sub': 'kc-stale'}
        with mock.patch.object(KeycloakAuth, '__call__', return_value=token):
            mine = self.client.get('/api/users/me/permissions', HTTP_AUTHORIZATION='Bearer x')
            me = self.client.get('/api/users/me', HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(mine.json(), [])
        self.assertEqual(me.json()['permissions'], [])
        admin = {'sub': 'kc-admin', 'realm_access': {'roles': ['admin']}}
        with mock.patch.object(KeycloakAuth, '__call__', return_value=admin):
            r = self.client.get(f'/api/users/users/{profile.id}/effective-permissions',
                                HTTP_AUTHORIZATION='Bearer x')
        self.assertEqual(r.json()['permissions'], [])
