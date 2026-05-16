/**
 * Einheitliche Anzeige-Logik für Personen:
 *   Vorname  → Nachname  → Username  → fallback
 *
 * Akzeptiert sowohl direkte Felder (first_name, last_name, username)
 * als auch die Endpoint-Variante mit user_-Präfix (z.B. Zuweisungs-Schema).
 *
 * EXCEPTION: Audit-Log zeigt bewusst weiter den Username, weil dort die
 * exakte Login-Identität wichtig ist (Tracability).
 */
export function displayName(p, fallback = '?') {
  if (!p) return fallback;
  const fn = p.first_name || p.user_first_name || p.given_name;
  if (fn) return fn;
  const ln = p.last_name || p.user_last_name || p.family_name;
  if (ln) return ln;
  return p.username || p.user_username || p.preferred_username || fallback;
}

/** Initiale für Avatar-Kreise. */
export function displayInitial(p) {
  const n = displayName(p, '');
  return n ? n[0].toUpperCase() : '?';
}
