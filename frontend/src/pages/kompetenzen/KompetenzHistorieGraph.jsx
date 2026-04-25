/**
 * History-Graph: Entwicklung aktiver Kompetenzen über die Zeit.
 */
import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Loader2 } from 'lucide-react';
import apiClient from '../../lib/api';

const AKTION_LABELS = {
  erworben: 'Erworben',
  bestaetigt: 'Bestätigt',
  entzogen: 'Entzogen',
  abgelaufen: 'Abgelaufen',
};

export default function KompetenzHistorieGraph({ userId }) {
  const [historie, setHistorie] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = userId ? `/kompetenzen/historie/user/${userId}` : '/kompetenzen/historie/me';
    apiClient.get(url).then(r => {
      setHistorie(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  // Daten: pro Tag die Anzahl Kompetenzen "aktiv"
  const chartData = useMemo(() => {
    if (!historie.length) return [];
    const events = [...historie].sort((a, b) => new Date(a.erstellt_am) - new Date(b.erstellt_am));

    const kompetenzState = {}; // kompetenz_name -> hat_kompetenz
    const buckets = {}; // date -> {aktiv, erworben, entzogen}

    for (const e of events) {
      const day = new Date(e.erstellt_am).toISOString().slice(0, 10);
      if (!buckets[day]) buckets[day] = { date: day, erworben: 0, entzogen: 0, abgelaufen: 0 };
      if (e.aktion === 'erworben') {
        kompetenzState[e.kompetenz_name] = true;
        buckets[day].erworben += 1;
      } else if (e.aktion === 'bestaetigt') {
        kompetenzState[e.kompetenz_name] = true;
      } else if (e.aktion === 'entzogen') {
        kompetenzState[e.kompetenz_name] = false;
        buckets[day].entzogen += 1;
      } else if (e.aktion === 'abgelaufen') {
        kompetenzState[e.kompetenz_name] = false;
        buckets[day].abgelaufen += 1;
      }
      buckets[day].gesamt = Object.values(kompetenzState).filter(Boolean).length;
    }

    return Object.values(buckets);
  }, [historie]);

  if (loading) return <Loader2 className="w-6 h-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="font-semibold text-white mb-4">Kompetenz-Entwicklung</h3>
        {chartData.length === 0 ? (
          <div className="text-gray-500 text-center py-12">Noch keine Historie</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 6 }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Legend />
              <Line type="monotone" dataKey="gesamt" name="Aktive Kompetenzen" stroke="#3b82f6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="font-semibold text-white mb-3">Letzte Aktivitäten</h3>
        <div className="space-y-1 max-h-96 overflow-auto">
          {historie.slice(0, 50).map(h => (
            <div key={h.id} className="flex items-center gap-3 py-2 border-b border-gray-800/50 text-sm">
              <span className={`px-2 py-0.5 text-xs rounded ${
                h.aktion === 'erworben' ? 'bg-green-500/20 text-green-400' :
                h.aktion === 'bestaetigt' ? 'bg-blue-500/20 text-blue-400' :
                h.aktion === 'entzogen' ? 'bg-red-500/20 text-red-400' :
                'bg-yellow-500/20 text-yellow-400'
              }`}>
                {AKTION_LABELS[h.aktion] || h.aktion}
              </span>
              <span className="text-white flex-1 truncate">{h.kompetenz_name}</span>
              <span className="text-xs text-gray-500">
                {new Date(h.erstellt_am).toLocaleDateString('de-DE')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
