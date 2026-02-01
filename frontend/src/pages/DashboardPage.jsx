/**
 * Dashboard-Seite - Hauptseite nach dem Login
 */
import { useAuth } from 'react-oidc-context';
import { Wallet, TrendingUp, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const auth = useAuth();
  const user = auth.user?.profile;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Willkommen, {user?.preferred_username || user?.name || 'Benutzer'}!
        </h1>
        <p className="text-gray-400 mt-1">Hier ist deine Übersicht</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          to="/haushalte"
          className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-blue-600 transition-colors group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center group-hover:bg-blue-600/30 transition-colors">
              <Wallet className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Haushalte</h3>
              <p className="text-sm text-gray-400">Budget verwalten</p>
            </div>
          </div>
        </Link>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-600/20 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Statistik</h3>
              <p className="text-sm text-gray-400">Demnächst verfügbar</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Verlauf</h3>
              <p className="text-sm text-gray-400">Demnächst verfügbar</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
