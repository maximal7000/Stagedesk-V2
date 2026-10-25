# Signage Permissions from Keycloak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signage permissions come only from the Keycloak client `signage` roles in the access token; Stagedesk's own permission store no longer holds `signage.*`.

**Architecture:** A small pure module `backend/signage/roles.py` reads `resource_access.signage.roles` from the token. `_require_perm` uses it for `signage.*`; the user profile exposes the roles as `signage.<role>` permissions (so the frontend needs no change) and caches them for token-less notifications. The `signage.*` codes leave the permission catalog and a migration removes the stored rows.

**Tech Stack:** Django 5 + Ninja, python-jose tokens (already decoded into `request.auth`), Django `TestCase`.

**Spec:** `docs/superpowers/specs/2026-10-26-signage-keycloak-roles-design.md`

## Global Constraints

- Keycloak client id `signage`; roles `view`, `setup`, `exams`, `media`, `power`, `onair`, `emergency`, `devices`; composite `admin` = all eight. Token path `resource_access.signage.roles`.
- Keycloak admin (`users.api.is_admin`) keeps full access. Agent token, kiosk key and on-air token paths stay unchanged.
- No hint in the user administration (spec §2, §5).
- Code, file names and comments in English; comments only where needed, no generic or restating comments. Commit messages and PR in English with trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. `python3 -I scripts/check-signage-identifiers.py` exits 0.
- System not live: no compatibility path for DB-assigned `signage.*` permissions.

## Review Focus

1. Token without `resource_access` or with `resource_access.signage` missing or malformed (`roles` not a list): no crash, no signage permission (Task 1 `test_roles_from_malformed_token`).
2. Unknown role names in the token (e.g. `superuser`, `signage.view`): ignored, never mapped to a permission (Task 1 same test).
3. A user whose roles were removed in Keycloak: cached roles are replaced on the next profile load, so notifications stop (Task 1 `test_cache_replaced_on_next_login`).
4. Keycloak admin without any signage role: still passes every `signage.*` check and gets device notifications (Task 1 `test_admin_passes_without_signage_roles`).
5. A DB permission group that still lists `signage.view` before the migration ran: the check ignores it (Task 1 `test_db_permission_alone_is_not_enough`).

---

### Task 1: Roles from the token, permission check, profile, notifications

**Files:**
- Create: `backend/signage/roles.py`
- Modify: `backend/signage/permissions.py` (`_require_perm`)
- Modify: `backend/users/models.py` (`UserProfile.signage_roles_cached = models.JSONField(default=list, blank=True)`)
- Create: `backend/users/migrations/0018_userprofile_signage_roles_cached.py`
- Modify: `backend/users/api.py` (`get_or_create_profile` stores and attaches the roles)
- Modify: `backend/users/schemas.py` (`UserProfileSchema.resolve_permissions` adds the token's signage codes)
- Modify: `backend/signage/devices.py` (`notification_recipients`)
- Test: `backend/signage/tests_permissions.py` (extend), `backend/signage/tests_device_watch.py` (extend)

**Interfaces:**
- Produces (`signage/roles.py`, no model imports):
  - `SIGNAGE_CLIENT = 'signage'`
  - `SIGNAGE_ROLES = ('view', 'setup', 'exams', 'media', 'power', 'onair', 'emergency', 'devices')`
  - `signage_roles(token: dict | None) -> set[str]` — known roles from `resource_access.signage.roles`; `admin` expands to all of `SIGNAGE_ROLES`; anything else ignored.
  - `signage_permission_codes(roles) -> list[str]` — sorted `signage.<role>`.
- Produces: `UserProfile.signage_roles_cached: list[str]`; profile attribute `_signage_roles: set[str]` set by `get_or_create_profile`.
- `_require_perm(request, 'signage.<role>')`: admin → pass; `<role>` in `signage_roles(request.auth)` → pass; else `HttpError(403, "Keine Berechtigung")`. No DB permission lookup for `signage.*`.
- `notification_recipients()`: profiles with `is_admin_cached` or `'devices'` in `signage_roles_cached`.

- [ ] **Step 1: Write the failing tests**

```python
def test_roles_from_token(self):            # {'resource_access': {'signage': {'roles': ['view', 'power']}}} -> {'view', 'power'}
def test_admin_role_expands(self):          # ['admin'] -> set(SIGNAGE_ROLES)
def test_roles_from_malformed_token(self):  # None, {}, {'resource_access': []}, {'resource_access': {'signage': {'roles': 'view'}}}, roles ['superuser', 'signage.view'] -> set()
def test_require_perm_uses_token_roles(self):   # role 'media' passes signage.media, 403 for signage.setup
def test_admin_passes_without_signage_roles(self):   # realm role admin, no signage roles -> passes every signage.* code; notification_recipients includes the admin
def test_db_permission_alone_is_not_enough(self):    # profile with DB Permission 'signage.view', token without roles -> 403
def test_me_lists_signage_permissions_from_token(self):   # GET /api/users/me with roles ['exams'] -> 'signage.exams' in permissions, no other signage.*
def test_cache_replaced_on_next_login(self):  # first token ['devices'] -> cached ['devices']; next token [] -> cached []; notification_recipients excludes the user
```
- [ ] **Step 2: Run** `cd backend && source venv/bin/activate && python manage.py test signage.tests_permissions signage.tests_device_watch` → new tests FAIL.
- [ ] **Step 3: Implement.** `get_or_create_profile` writes `signage_roles_cached` (sorted list) only when it changed, like the existing `is_admin_cached` update. `resolve_permissions` returns the existing list plus `signage_permission_codes(obj._signage_roles)` (deduplicated); for the admin branch keep current behavior. Migration 0018 adds the field.
- [ ] **Step 4: Run** `python manage.py test signage users` → PASS; `python manage.py makemigrations --check` → "No changes detected"; identifier check exit 0.
- [ ] **Step 5: Commit** `feat(signage): read signage permissions from Keycloak client roles`

---

### Task 2: Remove `signage.*` from Stagedesk's permission store, docs

**Files:**
- Modify: `backend/users/api.py` (drop the eight `signage.*` entries from the default permission list in `setup_system` and from `KNOWN_PERMISSION_CODES`)
- Create: `backend/users/migrations/0019_remove_signage_permissions.py` (RunPython: delete `Permission` rows with `code__startswith='signage.'`; reverse: recreate the eight codes with their current names/descriptions/category `monitor`, without assignments)
- Modify: `frontend/src/pages/admin/AdminPage.jsx` only if it lists a fixed `monitor` category label (remove it); otherwise unchanged
- Modify: `KEYCLOAK_SETUP.md` (new section "Signage-Rechte": create client `signage`, the nine roles, composite `admin`, group mapping, token check via Client scopes → Evaluate, `roles` scope as default on client `stagedesk`)
- Modify: `CLAUDE.md` (Signage bullet on permissions: roles from Keycloak client `signage`, migration `users` 0018/0019), `DEPLOY.md` (rollout order from spec §4, rollback `migrate users 0017`)
- Test: `backend/signage/tests_permissions.py` or `backend/signage/tests_migrations.py` (migration test)

**Interfaces:**
- Consumes: Task 1's `signage/roles.py` (unchanged).

- [ ] **Step 1: Write the failing tests**

```python
def test_catalog_has_no_signage_codes(self):   # not any(c.startswith('signage.') for c in KNOWN_PERMISSION_CODES)
def test_setup_system_creates_no_signage_permissions(self):   # after setup, Permission.objects.filter(code__startswith='signage.').count() == 0
def test_migration_0019_forward_backward(self):   # forward: signage rows (with a group assignment) gone, other permissions untouched; backward to 0018: eight signage codes exist, no assignments
```
- [ ] **Step 2: Run** the new tests → FAIL.
- [ ] **Step 3: Implement** list edits, migration and docs. Docs in German like the surrounding text; KEYCLOAK_SETUP steps match spec §1.
- [ ] **Step 4: Run** `python manage.py test signage users`, `makemigrations --check`, identifier check; if AdminPage changed: `cd frontend && npx vitest run && npm run build && npm run check:tokens`.
- [ ] **Step 5: Commit** `feat(users): drop signage permissions from the Stagedesk permission store`
