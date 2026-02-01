/**
 * Zentrale API-Konfiguration mit Axios
 */
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

// Axios-Instanz
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth-Context speichern (wird von App.jsx gesetzt)
let authContext = null;

export const setAuthContext = (auth) => {
  authContext = auth;
};

// Request Interceptor - fügt Token hinzu
apiClient.interceptors.request.use(
  (config) => {
    if (authContext?.user?.access_token) {
      config.headers.Authorization = `Bearer ${authContext.user.access_token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor - behandelt 401 Fehler
let isRefreshing = false;
let lastRefreshAttempt = 0;
const REFRESH_COOLDOWN = 30000;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      const now = Date.now();
      
      if (now - lastRefreshAttempt < REFRESH_COOLDOWN) {
        return Promise.reject(error);
      }
      
      if (isRefreshing) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      isRefreshing = true;
      lastRefreshAttempt = now;
      
      if (authContext) {
        try {
          await authContext.signinSilent();
          isRefreshing = false;
          if (authContext.user?.access_token) {
            originalRequest.headers.Authorization = `Bearer ${authContext.user.access_token}`;
            return apiClient.request(originalRequest);
          }
        } catch (refreshError) {
          isRefreshing = false;
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
