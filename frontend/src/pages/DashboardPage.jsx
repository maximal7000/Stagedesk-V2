/**
 * Dashboard - Übersichtsseite
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { Calendar, ChevronRight, Loader2 } from 'lucide-react';
import apiClient from '../lib/api';

function formatDatum(d) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DashboardPage() {
  const auth = useAuth();
  const user = auth.user?.profile;
  const [meineVeranstaltungen, setMeineVeranstaltungen] = useState([]);
  const [loadingVeranstaltungen, setLoadingVeranstaltungen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingVeranstaltungen(true);
    apiClient
      .get('/veranstaltung/meine')
      .then((res) => {
        if (!cancelled) {
          const list = Array.isArray(res.data) ? res.data : [];
          setMeineVeranstaltungen(list.slice(0, 5));
        }
      })
      .catch(() => {
        if (!cancelled) setMeineVeranstaltungen([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingVeranstaltungen(false);
      });
    return () => { cancelled = true; };
  }, []);

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

      {/* Meine Veranstaltungen */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Meine Veranstaltungen
          </h2>
          <Link
            to="/veranstaltung"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Alle anzeigen
          </Link>
        </div>
        {loadingVeranstaltungen ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : meineVeranstaltungen.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Du bist keiner Veranstaltung zugewiesen.</p>
            <Link to="/veranstaltung" className="text-blue-400 hover:underline mt-2 inline-block">
              Zum Veranstaltungsplaner
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {meineVeranstaltungen.map((v) => (
              <li key={v.id}>
                <Link
                  to={`/veranstaltung/${v.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-800 transition-colors group"
                >
                  <div>
                    <span className="font-medium text-white group-hover:text-blue-400">
                      {v.titel}
                    </span>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {formatDatum(v.datum_von)}
                      {v.ort && ` · ${v.ort}`}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-blue-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Schnellzugriff</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/veranstaltung/neu"
            className="p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors group"
          >
            <div className="text-3xl mb-2">📅</div>
            <h3 className="font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
              Neue Veranstaltung
            </h3>
            <p className="text-sm text-gray-400">Veranstaltung anlegen</p>
          </Link>

          <Link
            to="/haushalte"
            className="p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors group"
          >
            <div className="text-3xl mb-2">🏠</div>
            <h3 className="font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
              Haushalte
            </h3>
            <p className="text-sm text-gray-400">Haushalte verwalten</p>
          </Link>

          <Link
            to="/inventar"
            className="p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-left transition-colors group"
          >
            <div className="text-3xl mb-2">📦</div>
            <h3 className="font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
              Inventar
            </h3>
            <p className="text-sm text-gray-400">Inventar durchsuchen</p>
          </Link>
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
