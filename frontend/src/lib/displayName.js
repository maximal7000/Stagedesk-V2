/**
 * Anzeige-Namen für Personen.
 *
 *  displayName(p)  : "Vorname Nachname" wenn vorhanden, sonst Username/keycloak_id.
 *                    Default überall (Listen, Avatare, Editoren, ...).
 *  shortName(p)    : Nur Vorname → Nachname → Username. Für dichte Anzeigen
 *                    (AG-Monitor-Vollbild) wo Platz knapp ist.
 *
 * Audit-Log nutzt KEINE dieser Funktionen — dort steht bewusst der Username,
 * weil die Login-Identität für Tracability wichtig ist.
 *
 * Akzeptiert sowohl direkte Felder (first_name, last_name, username)
 * als auch die Endpoint-Variante mit user_-Präfix (z.B. Zuweisungs-Schema).
 */
function _first(p) { return p && (p.first_name || p.user_first_name || p.given_name) || ''; }
function _last(p)  { return p && (p.last_name  || p.user_last_name  || p.family_name) || ''; }
function _user(p)  { return p && (p.username   || p.user_username   || p.preferred_username) || ''; }

export function displayName(p, fallback = '?') {
  if (!p) return fallback;
  const full = [_first(p), _last(p)].filter(Boolean).join(' ');
  return full || _user(p) || fallback;
}

export function shortName(p, fallback = '?') {
  if (!p) return fallback;
  return _first(p) || _last(p) || _user(p) || fallback;
}

export function displayInitial(p) {
  const n = displayName(p, '');
  return n ? n[0].toUpperCase() : '?';
}
