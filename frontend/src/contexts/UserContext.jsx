/**
 * User Context - Verwaltet User-Profil, Permissions und Sessions
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from 'react-oidc-context';
import apiClient from '../lib/api';
import { useTheme } from './ThemeContext';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const auth = useAuth();
  const { setTheme, setForcedTheme, setCanChangeTheme } = useTheme();
  
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [keycloakRoles, setKeycloakRoles] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!auth.isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      const response = await apiClient.get('/users/me');
      const data = response.data;
      
      setProfile(data);
      setPermissions(data.permissions || []);
      setKeycloakRoles(data.keycloak_roles || []);
      setIsAdmin(data.is_admin);
      
      if (data.forced_theme) {
        setForcedTheme(data.forced_theme);
        setCanChangeTheme(false);
      } else {
        setForcedTheme(null);
        setCanChangeTheme(!data.theme_locked);
        setTheme(data.theme || 'dark');
      }
      
      setInitialized(true);
    } catch (err) {
      console.error('Fehler beim Laden des Profils:', err);
    } finally {
      setLoading(false);
    }
  }, [auth.isAuthenticated, setTheme, setForcedTheme, setCanChangeTheme]);

  const fetchSessions = useCallback(async () => {
    if (!auth.isAuthenticated) return;

    try {
      const response = await apiClient.get('/users/me/sessions');
      setSessions(response.data);
    } catch (err) {
      console.error('Fehler beim Laden der Sessions:', err);
    }
  }, [auth.isAuthenticated]);

  const registerSession = useCallback(async () => {
    if (!auth.isAuthenticated) return;

    try {
      await apiClient.post('/users/me/sessions/register');
    } catch (err) {
      console.error('Fehler beim Registrieren der Session:', err);
    }
  }, [auth.isAuthenticated]);

  const revokeSession = useCallback(async (sessionId) => {
    try {
      await apiClient.delete(`/users/me/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      return true;
    } catch (err) {
      console.error('Fehler beim Widerrufen der Session:', err);
      return false;
    }
  }, []);

  const updateTheme = useCallback(async (newTheme) => {
    try {
      await apiClient.put('/users/me', { theme: newTheme });
      setTheme(newTheme);
      return true;
    } catch (err) {
      console.error('Fehler beim Aktualisieren des Themes:', err);
      return false;
    }
  }, [setTheme]);

  const hasPermission = useCallback((permissionCode) => {
    if (isAdmin) return true;
    return permissions.includes(permissionCode);
  }, [isAdmin, permissions]);

  const initializeSystem = useCallback(async () => {
    try {
      const response = await apiClient.post('/users/setup/init');
      await fetchProfile();
      return response.data;
    } catch (err) {
      console.error('Fehler beim Initialisieren:', err);
      return null;
    }
  }, [fetchProfile]);

  useEffect(() => {
    if (auth.isAuthenticated && !initialized) {
      fetchProfile();
      registerSession();
    }
  }, [auth.isAuthenticated, initialized, fetchProfile, registerSession]);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setProfile(null);
      setPermissions([]);
      setKeycloakRoles([]);
      setSessions([]);
      setIsAdmin(false);
      setInitialized(false);
      setLoading(true);
    }
  }, [auth.isAuthenticated]);

  const value = {
    profile,
    permissions,
    keycloakRoles,
    sessions,
    loading,
    isAdmin,
    initialized,
    hasPermission,
    fetchProfile,
    fetchSessions,
    revokeSession,
    updateTheme,
    initializeSystem,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
