/**
 * Keycloak OIDC Konfiguration
 */
const oidcConfig = {
  authority: 'https://auth.t410.de/realms/master',
  client_id: 'stagedesk',
  redirect_uri: window.location.origin + '/',
  post_logout_redirect_uri: window.location.origin + '/login',
  response_type: 'code',
  scope: 'openid email profile',
  
  // Deaktiviere automatische Token-Operationen
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
