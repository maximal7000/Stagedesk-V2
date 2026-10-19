/**
 * History-Graph: Entwicklung aktiver Kompetenzen über die Zeit.
 */
import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Loader2, TrendingUp, History } from 'lucide-react';
import { EmptyState, StatusBadge } from '../../components/ui';
import apiClient from '../../lib/api';

const AKTION_TONE = {
  erworben: 'positive', bestaetigt: 'info', entzogen: 'danger', abgelaufen: 'warning',
};

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

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-fg-subtle" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-lg p-4">
        <h3 className="font-display text-lg font-semibold tracking-tight text-fg mb-4">Aktive Kompetenzen im Verlauf</h3>
        {chartData.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Noch kein Verlauf"
            description="Sobald Kompetenzen bestätigt oder entzogen werden, entsteht hier die Kurve." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#24221f" vertical={false} />
              <XAxis dataKey="date" stroke="#8a847b" fontSize={12} tickLine={false} axisLine={{ stroke: '#35322e' }}
                tickFormatter={(d) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} />
              <YAxis stroke="#8a847b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
              <Tooltip
                contentStyle={{ background: '#211f1c', border: '1px solid #35322e', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#f2efe9' }}
                labelFormatter={(d) => new Date(d).toLocaleDateString('de-DE')}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#b3ada4' }} />
              <Line type="stepAfter" dataKey="gesamt" name="Aktive Kompetenzen" stroke="#da1f3d" strokeWidth={2}
                dot={{ r: 2.5, fill: '#da1f3d', strokeWidth: 0 }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-surface rounded-lg p-4">
        <h3 className="font-display text-lg font-semibold tracking-tight text-fg mb-3">Letzte Änderungen</h3>
        {historie.length === 0 ? (
          <EmptyState icon={History} title="Noch keine Änderungen" />
        ) : (
          <div className="max-h-96 overflow-auto divide-y divide-line-subtle">
            {historie.slice(0, 50).map(h => (
              <div key={h.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-24 shrink-0">
                  <StatusBadge tone={AKTION_TONE[h.aktion] || 'neutral'} label={AKTION_LABELS[h.aktion] || h.aktion} />
                </span>
                <span className="text-fg flex-1 truncate">{h.kompetenz_name}</span>
                <span className="text-xs text-fg-subtle tabular-nums shrink-0">
                  {new Date(h.erstellt_am).toLocaleDateString('de-DE')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
