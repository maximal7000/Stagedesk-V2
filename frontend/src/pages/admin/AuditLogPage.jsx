/**
 * Admin: modul-übergreifendes Audit-Log mit Filter nach Entity-Typ und Suche.
 */
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, RefreshCw, ScrollText } from 'lucide-react';
import apiClient from '../../lib/api';
import { PageHeader, Button, StatusBadge, EmptyState } from '../../components/ui';

const ENTITY_LABELS = {
  haushalt: 'Haushalt',
  veranstaltung: 'Veranstaltung',
  kalender_event: 'Kalender-Event',
  anwesenheit: 'Anwesenheit',
  item: 'Inventar-Item',
  ausleihliste: 'Ausleihe',
  reservierung: 'Reservierung',
};

// Aktion → StatusBadge-Ton
const AKTION_TONE = {
  erstellt: 'positive',
  aktualisiert: 'info',
  status_geaendert: 'info',
  geloescht: 'danger',
  ausgeliehen: 'warning',
  zurueckgegeben: 'positive',
  mahnung: 'danger',
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
      <PageHeader eyebrow="Admin" title="Audit-Log"
        meta={<span className="tabular-nums">{items.length} Einträge</span>}
        actions={<Button variant="ghost" icon={RefreshCw} onClick={load} title="Neu laden" aria-label="Neu laden"
          className={loading ? '[&>svg]:animate-spin' : ''} />} />

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Name des Eintrags"
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent">
          <option value="">Alle Module</option>
          {entityTypes.map((t) => <option key={t} value={t}>{ENTITY_LABELS[t] || t}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
      ) : items.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <EmptyState icon={ScrollText} title="Keine Einträge"
            description={search || filterType ? 'Für diese Filter gibt es keine Änderungen.' : 'Änderungen an Veranstaltungen, Inventar und Co. erscheinen hier.'} />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 text-gray-500 text-[11px] font-semibold uppercase tracking-[0.08em]">
              <tr>
                <th className="px-4 py-2 text-left">Aktion</th>
                <th className="px-4 py-2 text-left">Modul</th>
                <th className="px-4 py-2 text-left">Name / ID</th>
                <th className="px-4 py-2 text-left">Von</th>
                <th className="px-4 py-2 text-right">Zeit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {items.map((e) => (
                <tr key={e.id} className="hover:bg-gray-800/40">
                  <td className="px-4 py-2">
                    <StatusBadge tone={AKTION_TONE[e.aktion] || 'neutral'} label={e.aktion_display || e.aktion} />
                  </td>
                  <td className="px-4 py-2 text-gray-300">{ENTITY_LABELS[e.entity_type] || e.entity_type}</td>
                  <td className="px-4 py-2 text-white">
                    {e.entity_name || `#${e.entity_id}`}
                    {e.entity_name && <span className="text-gray-500 text-xs ml-1">#{e.entity_id}</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-400">{e.user_username || '–'}</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-500 tabular-nums whitespace-nowrap">
                    {e.timestamp ? new Date(e.timestamp).toLocaleString('de-DE') : '–'}
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
