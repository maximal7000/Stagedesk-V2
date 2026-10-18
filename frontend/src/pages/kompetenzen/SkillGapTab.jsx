/**
 * Skill-Gap: zeigt Kompetenzen, die nur wenige User haben.
 */
import { useState, useEffect } from 'react';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import apiClient from '../../lib/api';
import { EmptyState } from '../../components/ui';

export default function SkillGapTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/kompetenzen/skill-gap').then(r => {
      setData(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>;
  }

  if (!data.length) {
    return (
      <EmptyState icon={ShieldCheck} title="Keine Engpässe gefunden"
        description="Alle Kompetenzen sind aktuell breit genug abgedeckt." />
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-400 mb-4">
        Sortiert nach Anzahl User (aufsteigend). Kompetenzen oben sind Engpässe.
      </div>
      {data.map(entry => {
        const ist_eng = entry.anzahl_user <= 1;
        return (
          <div key={entry.kompetenz_id}
               className={`p-3 rounded-lg border ${
                 ist_eng ? 'bg-red-500/5 border-red-500/30' : 'bg-gray-900 border-gray-800'
               }`}>
            <div className="flex items-start gap-3">
              {ist_eng && <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white truncate">{entry.kompetenz_name}</span>
                  <span className="text-xs text-gray-500 shrink-0">· {entry.kategorie_name}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1 tabular-nums">
                  {entry.anzahl_user} User
                  {entry.user_liste.length > 0 && ': ' + entry.user_liste.join(', ')}
                </div>
              </div>
              <div className={`text-2xl font-bold tabular-nums leading-none shrink-0 ${ist_eng ? 'text-red-400' : 'text-gray-400'}`}>
                {entry.anzahl_user}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
