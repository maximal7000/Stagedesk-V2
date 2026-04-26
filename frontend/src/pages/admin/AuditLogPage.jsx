/**
 * Admin: modul-übergreifendes Audit-Log mit Filter nach Entity-Typ und Suche.
 */
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, RefreshCw, ScrollText } from 'lucide-react';
import apiClient from '../../lib/api';

const ENTITY_LABELS = {
  haushalt: 'Haushalt',
  veranstaltung: 'Veranstaltung',
  kalender_event: 'Kalender-Event',
  anwesenheit: 'Anwesenheit',
  item: 'Inventar-Item',
  ausleihliste: 'Ausleihe',
  reservierung: 'Reservierung',
};

const AKTION_FARBE = {
  erstellt: 'bg-green-500/20 text-green-400',
  aktualisiert: 'bg-blue-500/20 text-blue-400',
  status_geaendert: 'bg-blue-500/20 text-blue-400',
  geloescht: 'bg-red-500/20 text-red-400',
  ausgeliehen: 'bg-amber-500/20 text-amber-400',
  zurueckgegeben: 'bg-cyan-500/20 text-cyan-400',
  mahnung: 'bg-orange-500/20 text-orange-400',
};

export default function AuditLogPage() {
  const [items, setItems] = useState([]);
  const [entityTypes, setEntityTypes] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType) params.entity_type = filterType;
      if (search.trim()) params.q = search.trim();
      const res = await apiClient.get('/audit', { params });
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterType, search]);

  useEffect(() => {
    apiClient.get('/audit/entity-types').then(r => setEntityTypes(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-gray-400" />
          <h2 className="text-xl font-bold text-white">Audit-Log</h2>
          <span className="text-sm text-gray-500">{items.length} Einträge</span>
        </div>
        <button onClick={load} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg" title="Neu laden">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Nach Entity-Name suchen…"
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
          <option value="">Alle Module</option>
          {entityTypes.map((t) => <option key={t} value={t}>{ENTITY_LABELS[t] || t}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Keine Einträge</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Aktion</th>
                <th className="px-4 py-2 text-left">Modul</th>
                <th className="px-4 py-2 text-left">Name / ID</th>
                <th className="px-4 py-2 text-left">User</th>
                <th className="px-4 py-2 text-right">Zeit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {items.map((e) => (
                <tr key={e.id} className="hover:bg-gray-800/40">
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 text-[10px] rounded ${AKTION_FARBE[e.aktion] || 'bg-gray-500/20 text-gray-400'}`}>
                      {e.aktion_display || e.aktion}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-300">{ENTITY_LABELS[e.entity_type] || e.entity_type}</td>
                  <td className="px-4 py-2 text-white">
                    {e.entity_name || `#${e.entity_id}`}
                    {e.entity_name && <span className="text-gray-500 text-xs ml-1">#{e.entity_id}</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-400">{e.user_username || '—'}</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-500">
                    {e.timestamp ? new Date(e.timestamp).toLocaleString('de-DE') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
