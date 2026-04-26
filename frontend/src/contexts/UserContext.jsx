/**
 * User Context - Verwaltet User-Profil, Permissions und Sessions
 * Admin-Status und Rollen kommen aus Keycloak JWT
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from 'react-oidc-context';
import apiClient from '../lib/api';
import { useTheme } from './ThemeContext';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const auth = useAuth();
  const { setTheme, setForcedTheme, setCanChangeTheme, setLightModeAllowed } = useTheme();
  
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [keycloakRoles, setKeycloakRoles] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Impersonate (User-Sicht für Admins): wenn gesetzt, verwendet die UI die
  // Permissions/Admin-Status des simulierten Users. API-Calls bleiben mit
  // Admin-Token — also nur Frontend-seitige Filter (Routes, Sidebar, Buttons).
  const [impersonate, setImpersonateState] = useState(() => {
    try {
      const raw = localStorage.getItem('stagedesk_impersonate');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const setImpersonate = useCallback((data) => {
    if (data) {
      localStorage.setItem('stagedesk_impersonate', JSON.stringify(data));
    } else {
      localStorage.removeItem('stagedesk_impersonate');
    }
    setImpersonateState(data);
  }, []);

  // Profil laden
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
      setIsAdmin(data.is_admin);  // Kommt aus Keycloak

      // Theme-Permission an ThemeContext melden — sonst kann der User über
      // die System-Einstellung Light Mode bekommen, obwohl er die Permission nicht hat.
      const lightAllowed = !!data.is_admin
        || (data.permissions || []).includes('theme.light_mode');
      setLightModeAllowed(lightAllowed);

      // Theme aus Profil übernehmen
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
  }, [auth.isAuthenticated, setTheme, setForcedTheme, setCanChangeTheme, setLightModeAllowed]);

  // Sessions laden
  const fetchSessions = useCallback(async () => {
    if (!auth.isAuthenticated) return;

    try {
      const response = await apiClient.get('/users/me/sessions');
      setSessions(response.data);
    } catch (err) {
      console.error('Fehler beim Laden der Sessions:', err);
    }
  }, [auth.isAuthenticated]);

  // Session registrieren
  const registerSession = useCallback(async () => {
    if (!auth.isAuthenticated) return;

    try {
      await apiClient.post('/users/me/sessions/register');
    } catch (err) {
      console.error('Fehler beim Registrieren der Session:', err);
    }
  }, [auth.isAuthenticated]);

  // Session widerrufen
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

  // Theme aktualisieren
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

  // Impersonate ist nur ein UI-Filter und wird NUR akzeptiert, wenn der echte
  // User Admin ist. Jeder andere localStorage-Wert wird ignoriert — sonst
  // könnte sich ein normaler User durch manuelles Setzen die Admin-Sicht
  // verschaffen (Backend filtert ohnehin, aber UI darf das nicht zeigen).
  const impersonateActive = isAdmin && impersonate ? impersonate : null;
  const effectiveIsAdmin = impersonateActive ? !!impersonateActive.is_admin : isAdmin;
  const effectivePermissions = impersonateActive ? (impersonateActive.permissions || []) : permissions;

  // Permission prüfen — verwendet effektive Werte, sodass Admin im Impersonate
  // -Modus exakt das sieht, was der simulierte User sehen würde.
  const hasPermission = useCallback((permissionCode) => {
    if (effectiveIsAdmin) return true;
    return effectivePermissions.includes(permissionCode);
  }, [effectiveIsAdmin, effectivePermissions]);

  // System initialisieren (macht ersten User zum Admin)
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

  // Beim Login Profil und Session laden
  useEffect(() => {
    if (auth.isAuthenticated && !initialized) {
      fetchProfile();
      registerSession();
    }
  }, [auth.isAuthenticated, initialized, fetchProfile, registerSession]);

  // Beim Logout zurücksetzen
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
    permissions: effectivePermissions,
    keycloakRoles,
    sessions,
    loading,
    isAdmin: effectiveIsAdmin,
    realIsAdmin: isAdmin,  // echtes Admin-Recht (für Impersonate-Banner)
    impersonate: impersonateActive,
    setImpersonate,
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
