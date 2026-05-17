/**
 * Keycloak OIDC-Konfiguration für react-oidc-context (basiert auf oidc-client-ts).
 *
 * Wichtige Anpassungen:
 *   - userStore = localStorage  → Session überlebt Tab-/Browser-Neustart.
 *     Vorher (Default sessionStorage) wurde bei jedem neuen Tab/Reload eine
 *     neue Sitzung erzwungen.
 *   - automaticSilentRenew = true → Access-Token wird kurz vor Ablauf still
 *     refreshed, ohne dass der User irgendetwas merkt.
 *   - clockSkewInSeconds gegen "Token not active"-Fehler.
 *
 * Sitzungs-Längen (SSO-Idle, SSO-Max, Access-Token-TTL) werden im Keycloak-
 * Realm gesetzt; Frontend zieht das automatisch über das Refresh-Token nach.
 *
 * VITE_KEYCLOAK_URL/REALM/CLIENT kommen aus .env.production bzw. .env.local.
 */
import { WebStorageStateStore } from 'oidc-client-ts';

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || 'https://auth.t410.de';
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM || 'master';
const KEYCLOAK_CLIENT = import.meta.env.VITE_KEYCLOAK_CLIENT || 'stagedesk';

const ORIGIN = typeof window !== 'undefined'
  ? window.location.origin
  : 'http://localhost:5173';

export const oidcConfig = {
  authority: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
  client_id: KEYCLOAK_CLIENT,

  redirect_uri: ORIGIN,
  post_logout_redirect_uri: ORIGIN,

  scope: 'openid profile email',
  response_type: 'code',

  // ── Persistenz ───────────────────────────────────────────────────
  // Session überlebt Tab-Reload und Browser-Neustart (solange Refresh-Token
  // gültig ist und Keycloak SSO-Session lebt). Vorher: sessionStorage →
  // Neuanmeldung bei jedem neuen Tab.
  userStore: typeof window !== 'undefined'
    ? new WebStorageStateStore({ store: window.localStorage })
    : undefined,

  // ── Token-Refresh ────────────────────────────────────────────────
  // Stilles Token-Refresh ~1 min vor Ablauf via iframe-redirect. Verhindert
  // dass ein Klick mit abgelaufenem Token in einen 401 läuft.
  automaticSilentRenew: true,
  silentRequestTimeoutInSeconds: 10,
  // Toleranz für Server-/Client-Uhren-Drift (Default 5 min, hier explizit).
  // Sollte "Token not active"-Fehler nach Refresh abfangen.
  clockSkewInSeconds: 300,

  // ── Sonst ────────────────────────────────────────────────────────
  monitorSession: false,
  loadUserInfo: false,
  includeIdTokenInSilentRenew: false,
  validateSubOnSilentRenew: true,
  filterProtocolClaims: true,
  revokeTokensOnSignout: false,
};

export default oidcConfig;
