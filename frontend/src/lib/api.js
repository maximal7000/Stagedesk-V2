/**
 * Zentraler API-Client mit Axios
 * Automatisches Anhängen des Keycloak Bearer Tokens
 * Zentrale Fehlerbehandlung (401 → Login)
 */
import axios from 'axios';

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Axios-Instanz erstellen
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth-Context wird zur Laufzeit gesetzt
let authContext = null;

// Verhindert mehrfache gleichzeitige Token-Refresh-Versuche
let isRefreshing = false;
let lastRefreshAttempt = 0;
const REFRESH_COOLDOWN = 30000; // 30 Sekunden Cooldown zwischen Refresh-Versuchen

export const setAuthContext = (auth) => {
  authContext = auth;
};

// Request-Interceptor: Bearer Token anhängen
apiClient.interceptors.request.use(
  (config) => {
    if (authContext?.user?.access_token) {
      config.headers.Authorization = `Bearer ${authContext.user.access_token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response-Interceptor: 401 Fehler behandeln (mit Loop-Schutz)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Nur bei 401 und wenn noch nicht retry versucht wurde
    if (error.response?.status === 401 && !originalRequest._retry) {
      const now = Date.now();
      
      // Prüfen ob Cooldown noch aktiv ist
      if (now - lastRefreshAttempt < REFRESH_COOLDOWN) {
        console.warn('Token-Refresh Cooldown aktiv, überspringe...');
        return Promise.reject(error);
      }
      
      // Prüfen ob bereits ein Refresh läuft
      if (isRefreshing) {
        console.warn('Token-Refresh bereits aktiv, überspringe...');
        return Promise.reject(error);
      }
      
      originalRequest._retry = true;
      isRefreshing = true;
      lastRefreshAttempt = now;
      
      console.warn('Token abgelaufen, versuche Silent Refresh...');
      
      if (authContext) {
        try {
          await authContext.signinSilent();
          isRefreshing = false;
          
          // Token neu setzen und Request wiederholen
          if (authContext.user?.access_token) {
            originalRequest.headers.Authorization = `Bearer ${authContext.user.access_token}`;
            return apiClient.request(originalRequest);
          }
        } catch (refreshError) {
          console.error('Token-Refresh fehlgeschlagen:', refreshError);
          isRefreshing = false;
          // NICHT automatisch ausloggen - nur Fehler werfen
          // Der User kann manuell neu einloggen wenn nötig
        }
      }
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;
