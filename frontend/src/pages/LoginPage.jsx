/**
 * Login-Seite - Startet Keycloak-Authentifizierung
 */
import { useAuth } from 'react-oidc-context';
import { Navigate } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (auth.isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = () => {
    auth.signinRedirect();
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Stagedesk</h1>
            <p className="text-gray-400">Haushalts- und Budget-Management</p>
          </div>

          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors"
          >
            <LogIn className="w-5 h-5" />
            Mit Keycloak anmelden
          </button>

          {auth.error && (
            <div className="mt-4 p-4 bg-red-900/20 border border-red-800 rounded-xl text-red-400 text-sm">
              Fehler: {auth.error.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
