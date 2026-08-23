/**
 * Dashboard - rendert vom User ausgewählte Widgets.
 */
import { useState, useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { Settings, Loader2, LayoutDashboard } from 'lucide-react';
import apiClient from '../lib/api';
import { WIDGET_REGISTRY } from '../components/dashboard/DashboardWidgets';
import DashboardSettingsModal from '../components/dashboard/DashboardSettingsModal';
import { PageHeader, Button, EmptyState } from '../components/ui';

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

  const name = (user?.given_name || user?.family_name)
    ? [user?.given_name, user?.family_name].filter(Boolean).join(' ')
    : (user?.name || user?.preferred_username);

  return (
    <div className="max-w-6xl space-y-8">
      <PageHeader
        title={`Willkommen zurück, ${name}! 👋`}
        meta="Schön, dass du da bist."
        actions={<Button variant="secondary" icon={Settings} onClick={() => setShowSettings(true)}>Anpassen</Button>}
      />

      {widgets === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : widgets.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <EmptyState icon={LayoutDashboard} title="Dein Dashboard ist leer"
            description="Füge Widgets hinzu, um hier Kennzahlen und Aktivitäten auf einen Blick zu sehen."
            action={<Button variant="primary" icon={Settings} onClick={() => setShowSettings(true)}>Widgets hinzufügen</Button>} />
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
