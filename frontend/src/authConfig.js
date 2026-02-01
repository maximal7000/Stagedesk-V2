/**
 * Keycloak OIDC-Konfiguration für react-oidc-context
 * 
 * Diese Datei enthält die Konfiguration für die Authentifizierung
 * mit Keycloak über OpenID Connect (OIDC).
 */

export const oidcConfig = {
  // URL des Keycloak-Servers
  authority: "https://auth.t410.de/realms/master",
  
  // Client-ID der Anwendung in Keycloak
  client_id: "stagedesk",
  
  // Redirect-URL nach erfolgreicher Anmeldung
  redirect_uri: "http://localhost:5173",
  
  // URL nach dem Logout
  post_logout_redirect_uri: "http://localhost:5173",
  
  // Gewünschte Scopes
  scope: "openid profile email",
  
  // Response-Typ
  response_type: "code",
  
  // ===== WICHTIG: Alle automatischen Token-Operationen DEAKTIVIEREN =====
  
  // KEIN automatisches Silent Renew (verursacht 2x/Sekunde Anfragen!)
  automaticSilentRenew: false,
  
  // KEIN Session-Monitoring
  monitorSession: false,
  
  // KEINE automatischen User-Info Abfragen
  loadUserInfo: false,
  
  // Keine Check-Session iframe
  includeIdTokenInSilentRenew: false,
  
  // Kein automatischer Silent Sign-in beim Start
  silentRequestTimeoutInSeconds: 10,
  
  // Keine automatische Metadaten-Validierung
  validateSubOnSilentRenew: false,
  filterProtocolClaims: true,
  
  // Wichtig: revokeTokensOnSignout deaktivieren
  revokeTokensOnSignout: false,
};

export default oidcConfig;
