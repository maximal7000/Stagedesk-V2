/**
 * Dashboard - Übersichtsseite
 */
import { useAuth } from 'react-oidc-context';

export default function DashboardPage() {
  const auth = useAuth();
  const user = auth.user?.profile;

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">
          Willkommen zurück, {user?.preferred_username || user?.name}! 👋
        </h1>
        <p className="text-gray-400">
          Verwalte deine Haushalte und behalte den Überblick über deine Finanzen.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Schnellzugriff</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors group">
            <div className="text-3xl mb-2">🏠</div>
            <h3 className="font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
              Neuer Haushalt
            </h3>
            <p className="text-sm text-gray-400">Erstelle einen neuen Haushalt</p>
          </button>

          <button className="p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors group">
            <div className="text-3xl mb-2">🛒</div>
            <h3 className="font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
              Artikel hinzufügen
            </h3>
            <p className="text-sm text-gray-400">Füge einen neuen Artikel hinzu</p>
          </button>

          <button className="p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors group">
            <div className="text-3xl mb-2">📊</div>
            <h3 className="font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
              Bericht erstellen
            </h3>
            <p className="text-sm text-gray-400">Erstelle einen Finanz-Bericht</p>
          </button>
        </div>
      </div>

      {/* Recent Activity (Platzhalter) */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Letzte Aktivitäten</h2>
        <div className="text-center py-8 text-gray-500">
          <p>Noch keine Aktivitäten vorhanden</p>
          <p className="text-sm mt-2">Erstelle deinen ersten Haushalt, um loszulegen!</p>
        </div>
      </div>
    </div>
  );
}
