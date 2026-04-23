/**
 * Keycloak OIDC-Konfiguration für react-oidc-context
 *
 * Werte kommen aus Vite-Env-Variablen. Für Produktion in `.env.production`
 * (oder direkt beim Build) setzen:
 *   VITE_KEYCLOAK_URL=https://auth.t410.de
 *   VITE_KEYCLOAK_REALM=technik-ag
 *   VITE_KEYCLOAK_CLIENT=stagedesk
 *
 * redirect_uri/post_logout_redirect_uri nehmen automatisch die aktuelle
 * Origin (funktioniert in Dev und Prod gleichermaßen).
 */

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

  scope: "openid profile email",
  response_type: "code",

  // Alle automatischen Token-Operationen deaktiviert
  automaticSilentRenew: false,
  monitorSession: false,
  loadUserInfo: false,
  includeIdTokenInSilentRenew: false,
  silentRequestTimeoutInSeconds: 10,
  validateSubOnSilentRenew: false,
  filterProtocolClaims: true,
  revokeTokensOnSignout: false,
};

export default oidcConfig;
