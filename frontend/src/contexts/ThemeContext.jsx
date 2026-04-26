/**
 * Theme Context - Verwaltet Dark/Light Mode
 */
import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');
  const [forcedTheme, setForcedTheme] = useState(null);
  const [canChangTheme, setCanChangeTheme] = useState(true);
  // Wenn false, fällt 'system' & 'light' immer auf 'dark' zurück — verhindert,
  // dass User ohne theme.light_mode-Permission über das System-Setting Light Mode bekommen.
  const [lightModeAllowed, setLightModeAllowed] = useState(true);

  // Tatsächliches Theme nach Permission-Check ableiten
  const requested = forcedTheme || theme;
  const systemPrefersDark = typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
  let resolved = requested;
  if (requested === 'system') resolved = systemPrefersDark ? 'dark' : 'light';
  if (resolved === 'light' && !lightModeAllowed) resolved = 'dark';
  const effectiveTheme = resolved;

  // Theme auf DOM anwenden
  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
  }, [effectiveTheme]);

  // System Theme Listener — re-render bei Wechsel, damit oben effectiveTheme neu gerechnet wird
  useEffect(() => {
    if (requested !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => { setTheme((t) => (t === 'system' ? 'system' : t)); };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [requested]);

  const value = {
    theme,
    setTheme,
    forcedTheme,
    setForcedTheme,
    effectiveTheme,
    canChangTheme,
    setCanChangeTheme,
    lightModeAllowed,
    setLightModeAllowed,
    isDark: effectiveTheme === 'dark',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
