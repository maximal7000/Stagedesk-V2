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
      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <EmptyState icon={ShieldCheck} title="Keine Engpässe"
          description="Jede Kompetenz ist bei mehreren Mitgliedern vorhanden." />
      </div>
    );
  }

  const engpaesse = data.filter(e => e.anzahl_user <= 1).length;

  return (
    <div>
      <p className="text-sm text-gray-400 mb-4">
        Kompetenzen, die nur wenige haben, stehen oben.
        {engpaesse > 0 && <> <span className="text-red-300 font-medium tabular-nums">{engpaesse}</span> davon hat höchstens eine Person.</>}
      </p>
      <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800 overflow-hidden">
        {data.map(entry => {
          const ist_eng = entry.anzahl_user <= 1;
          return (
            <div key={entry.kompetenz_id}
                 className={`relative flex items-start gap-3 px-4 py-3 ${ist_eng ? 'bg-red-500/[0.04]' : ''}`}>
              {ist_eng && <span className="absolute left-0 inset-y-0 w-0.5 bg-red-500" aria-hidden="true" />}
              <div className={`w-10 text-center text-xl font-bold tabular-nums leading-tight shrink-0 ${ist_eng ? 'text-red-400' : 'text-gray-400'}`}>
                {entry.anzahl_user}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {ist_eng && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                  <span className="font-medium text-white truncate">{entry.kompetenz_name}</span>
                  <span className="text-xs text-gray-500 shrink-0">{entry.kategorie_name}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5 truncate">
                  {entry.user_liste.length > 0 ? entry.user_liste.join(', ') : 'Niemand'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
