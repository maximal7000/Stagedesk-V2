/**
 * Dashboard - rendert vom User ausgewählte Widgets.
 */
import { useState, useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { Settings, Loader2 } from 'lucide-react';
import apiClient from '../lib/api';
import { WIDGET_REGISTRY } from '../components/dashboard/DashboardWidgets';
import DashboardSettingsModal from '../components/dashboard/DashboardSettingsModal';

export default function DashboardPage() {
  const auth = useAuth();
  const user = auth.user?.profile;
  const [widgets, setWidgets] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    apiClient.get('/users/me/dashboard')
      .then(r => setWidgets(Array.isArray(r.data?.widgets) ? r.data.widgets : []))
      .catch(() => setWidgets([]));
  }, []);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Willkommen zurück, {(user?.given_name || user?.family_name)
              ? [user?.given_name, user?.family_name].filter(Boolean).join(' ')
              : (user?.name || user?.preferred_username)}! 👋
          </h1>
          <p className="text-gray-400">Schön, dass du da bist.</p>
        </div>
        <button onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-gray-300 rounded-lg shrink-0">
          <Settings className="w-4 h-4" /> Anpassen
        </button>
      </div>

      {widgets === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : widgets.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-400 mb-4">Dein Dashboard ist leer.</p>
          <button onClick={() => setShowSettings(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            <Settings className="w-4 h-4" /> Widgets hinzufügen
          </button>
        </div>
      ) : (
        widgets.map((code) => {
          const Widget = WIDGET_REGISTRY[code];
          if (!Widget) return null;
          return <Widget key={code} />;
        })
      )}

      {showSettings && (
        <DashboardSettingsModal
          active={widgets || []}
          onClose={() => setShowSettings(false)}
          onSaved={(next) => setWidgets(next)}
        />
      )}
    </div>
  );
}
