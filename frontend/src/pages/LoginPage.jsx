/**
 * Login-Seite mit Keycloak-Authentifizierung
 */
import { useAuth } from 'react-oidc-context';
import { useEffect } from 'react';
import { LogIn, Shield } from 'lucide-react';

export default function LoginPage() {
  const auth = useAuth();

  useEffect(() => {
    // Automatisch zum Dashboard weiterleiten, wenn bereits eingeloggt
    if (auth.isAuthenticated) {
      window.location.href = '/';
    }
  }, [auth.isAuthenticated]);

  const handleLogin = () => {
    auth.signinRedirect();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Stagedesk</h1>
          <p className="text-gray-400">Haushalts- und Budget-Management</p>
        </div>

        {/* Login Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Willkommen zurück</h2>
          
          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={auth.isLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-blue-500/50 disabled:cursor-not-allowed"
          >
            {auth.isLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Lädt...</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                <span>Mit Keycloak anmelden</span>
              </>
            )}
          </button>

          {/* Error Message */}
          {auth.error && (
            <div className="mt-4 p-4 bg-red-950 border border-red-800 rounded-lg">
              <p className="text-sm text-red-300">
                <strong>Fehler:</strong> {auth.error.message}
              </p>
            </div>
          )}

          {/* Info */}
          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-sm text-gray-500 text-center">
              Sichere Authentifizierung über Keycloak
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl mb-1">🏠</div>
            <p className="text-xs text-gray-500">Haushalte</p>
          </div>
          <div>
            <div className="text-2xl mb-1">💰</div>
            <p className="text-xs text-gray-500">Budget</p>
          </div>
          <div>
            <div className="text-2xl mb-1">📊</div>
            <p className="text-xs text-gray-500">Tracking</p>
          </div>
        </div>
      </div>
    </div>
  );
}
