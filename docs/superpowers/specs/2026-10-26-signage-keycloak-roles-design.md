# Signage-Rechte aus Keycloak

Stand: 26.10.2026 · Status: freigegeben

Ziel: Die Rechte des Signage-Moduls kommen nur noch aus Keycloak, nicht mehr aus der Rechteverwaltung von Stagedesk. Das bereitet die spätere Abkapselung als eigenes Programm vor: Es braucht dann keine eigene Rechteverwaltung, nur den Keycloak-Client. Das System läuft noch nicht live.

## 1. Keycloak (wird von Hand eingerichtet, nicht im Code)

- Neuer Client `signage` im Realm `technik-ag`. Er ist vorerst nur Träger der Rollen; das spätere eigenständige Programm nutzt ihn als Login-Client.
- Client-Rollen: `view`, `setup`, `exams`, `media`, `power`, `onair`, `emergency`, `devices` (gleiche Bedeutung wie die heutigen Rechte `signage.<rolle>`), dazu die zusammengesetzte Rolle `admin` mit allen acht.
- Vergabe über Gruppen (z. B. „Technik-AG“ → `signage/admin`); kommen die Gruppen aus dem LDAP, ist das der Weg über GOsa.
- Die Rollen müssen im Access-Token von Stagedesk unter `resource_access.signage.roles` stehen. Das ist mit dem Standard-Client-Scope `roles` der Fall; zu prüfen beim Einrichten.
- Schritt-für-Schritt-Anleitung in `KEYCLOAK_SETUP.md` (neuer Abschnitt „Signage-Rechte“).

## 2. Backend

- Neue Funktion `signage_roles(request) -> set[str]`: liest `resource_access.signage.roles` aus dem Token. `admin` ergibt alle acht Rollen.
- `signage/permissions.py::_require_perm(request, 'signage.<rolle>')`: Keycloak-Admin (`is_admin`) darf weiter alles; sonst nur, wenn `<rolle>` in `signage_roles(request)` ist. Die Datenbank-Rechte werden für `signage.*` nicht mehr gelesen. Agent-Token, Kiosk-Schlüssel und On-Air-Token bleiben unverändert (laufen nicht über Benutzer).
- Profil (`/users/me`): Die Rechteliste enthält zusätzlich `signage.<rolle>` für jede Signage-Rolle aus dem Token. Dadurch funktioniert `hasPermission('signage.…')` im Frontend ohne Änderung (Menü, Seiten, Knöpfe).
- **Benachrichtigungen ohne Token** (Gerätewarnungen von `signage_device_watch` an alle mit `signage.devices`): Das Profil merkt sich bei jeder Anmeldung die Signage-Rollen (`UserProfile.signage_roles_cached`, JSON-Liste, wie `is_admin_cached`). `notification_recipients()` nutzt Admin-Flag oder `devices` in dieser Liste.
- Rechteverwaltung von Stagedesk: Die Codes `signage.*` verschwinden aus `KNOWN_PERMISSION_CODES` und der Standardliste der Rechte; damit erscheinen sie dort nicht mehr. Kein Hinweis in der Benutzerverwaltung. Migration `users` 0018 löscht die vorhandenen `signage.*`-Rechte (samt Zuordnung zu Gruppen und Personen) und legt `signage_roles_cached` an. Rückweg `migrate users 0017` legt die acht Rechte wieder an (ohne Zuordnungen).

## 3. Frontend

- Keine Logikänderung nötig, weil das Profil die Rechte liefert. Falls die Rechteverwaltung Kategorien fest kennt (`monitor`), wird die leere Kategorie entfernt.

## 4. Reihenfolge beim Ausrollen

1. In Keycloak Client, Rollen und Gruppenzuordnung anlegen (Anleitung §1).
2. Deployen.
3. Einmal ab- und anmelden, damit das Token die neuen Rollen enthält; Signage-Admin prüfen.
Bis Schritt 3 sieht nur der Keycloak-Admin das Signage-Admin.

## 5. Nicht Teil dieser Spec

- Andere Module bleiben bei der Stagedesk-Rechteverwaltung.
- Login über einen eigenen Keycloak-Client `signage` (kommt mit der Abkapselung).
- Hinweis in der Benutzerverwaltung (bewusst weggelassen).

## 6. Tests

- Backend: `_require_perm` mit Token-Rollen (einzelne Rolle, `admin`, keine Rolle → 403, Keycloak-Admin), Datenbank-Recht `signage.*` allein reicht nicht mehr; `/users/me` enthält die Signage-Rechte aus dem Token; `signage_roles_cached` wird beim Profilabruf aktualisiert und von `notification_recipients()` genutzt; Migration 0018 vorwärts/rückwärts; `KNOWN_PERMISSION_CODES` ohne `signage.*`.
- Frontend: vorhandene Tests bleiben grün; Rechteverwaltung zeigt keine Signage-Rechte.
