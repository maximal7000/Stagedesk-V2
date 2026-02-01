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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Authentifizierung läuft...</p>
        </div>
      </div>
    );
  }

  // Error-State
  if (auth.error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md p-6 bg-gray-900 rounded-lg border border-red-500">
          <h2 className="text-xl font-bold text-red-400 mb-2">Authentifizierungsfehler</h2>
          <p className="text-gray-300 mb-4">{auth.error.message}</p>
          <button
            onClick={() => auth.signinRedirect()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Weiterleitung zum Login...</p>
        </div>
      </div>
    );
  }

  // Authentifiziert → Inhalt anzeigen
  return children;
}
