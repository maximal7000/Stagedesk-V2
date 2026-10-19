/**
 * Protected Route Component
 * Nur authentifizierte Benutzer haben Zugriff
 */
import { useAuth } from 'react-oidc-context';
import { useEffect } from 'react';

export default function ProtectedRoute({ children }) {
  const auth = useAuth();

  useEffect(() => {
    // Wenn nicht authentifiziert und nicht bereits im Login-Flow
    if (!auth.isAuthenticated && !auth.isLoading && !auth.activeNavigator) {
      auth.signinRedirect();
    }
  }, [auth.isAuthenticated, auth.isLoading, auth.activeNavigator, auth]);

  // Loading-State
  if (auth.isLoading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto"></div>
          <p className="mt-4 text-fg-muted">Authentifizierung läuft...</p>
        </div>
      </div>
    );
  }

  // Error-State
  if (auth.error) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center max-w-md p-6 bg-surface rounded-lg">
          <h2 className="text-xl font-bold text-bad mb-2">Authentifizierungsfehler</h2>
          <p className="text-fg-muted mb-4">{auth.error.message}</p>
          <button
            onClick={() => auth.signinRedirect()}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-md transition"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  // Nicht authentifiziert → wird automatisch weitergeleitet
  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto"></div>
          <p className="mt-4 text-fg-muted">Weiterleitung zum Login...</p>
        </div>
      </div>
    );
  }

  // Authentifiziert → Inhalt anzeigen
  return children;
}
