import { useState } from 'react';
import { ClipboardList, CalendarPlus, Plus, Wand2, Loader2, ExternalLink, Unlink, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';

export default function AnwesenheitSection({ data, refetch, canEdit, eventId }) {
  const [showLink, setShowLink] = useState(false);
  const [alleAnwesenheit, setAlleAnwesenheit] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchAlle = async () => {
    try { const res = await apiClient.get('/anwesenheit'); setAlleAnwesenheit(res.data || []); }
    catch { setAlleAnwesenheit([]); }
  };

  const link = async () => {
    if (!selectedId) return;
    try {
      await apiClient.post(`/veranstaltung/${eventId}/anwesenheit/${selectedId}`);
      setSelectedId(''); setShowLink(false); refetch();
      toast.success('Anwesenheitsliste verknüpft');
    } catch (err) { toast.error(err.response?.data?.detail || 'Verknüpfung fehlgeschlagen'); }
  };

  const unlink = async () => {
    try { await apiClient.delete(`/veranstaltung/${eventId}/anwesenheit`); refetch(); toast.success('Verknüpfung entfernt'); }
    catch (err) { toast.error(err.response?.data?.detail || 'Entfernen fehlgeschlagen'); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await apiClient.post(`/veranstaltung/${eventId}/anwesenheit-sync`);
      const d = res.data;
      const parts = [];
      if (d.termine_added || d.termine_deleted) parts.push(`Termine: +${d.termine_added}/-${d.termine_deleted}`);
      if (d.teilnehmer_added || d.teilnehmer_removed) parts.push(`Personen: +${d.teilnehmer_added}/-${d.teilnehmer_removed}`);
      toast.success(parts.length ? `Sync: ${parts.join(', ')}` : 'Alles bereits aktuell');
      refetch();
    } catch (err) { toast.error(err.response?.data?.detail || 'Synchronisierung fehlgeschlagen'); }
    finally { setSyncing(false); }
  };

  const handleCreate = async () => {
    if (!confirm('Anwesenheitsliste automatisch aus Veranstaltung erstellen? Zugewiesene Personen und Termine werden übernommen.')) return;
    setCreating(true);
    try {
      const res = await apiClient.post(`/veranstaltung/${eventId}/anwesenheit-erstellen`);
      refetch(); toast.success(`Anwesenheitsliste erstellt (${res.data.teilnehmer} Personen, ${res.data.termine} Termine)`);
    } catch (err) { toast.error(err.response?.data?.detail || 'Erstellen fehlgeschlagen'); }
    finally { setCreating(false); }
  };

  if (!canEdit && !data?.anwesenheitsliste_id) return null;

  return (
    <CollapsibleSection
      icon={ClipboardList}
      title="Anwesenheit"
      actions={canEdit && (
        <div className="flex gap-2">
          {data?.anwesenheitsliste_id ? (
            <button type="button" onClick={handleSync} disabled={syncing}
              title="Termine aus Veranstaltung in Anwesenheitsliste synchronisieren"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />} Termine sync
            </button>
          ) : (
            <>
              <button type="button" onClick={handleCreate} disabled={creating}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm">
                <Wand2 className="w-4 h-4" /> Auto-Erstellen
              </button>
              <button type="button" onClick={() => { setShowLink(true); fetchAlle(); }}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                <Plus className="w-4 h-4" /> Verknüpfen
              </button>
            </>
          )}
        </div>
      )}
    >
      {showLink && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-gray-800/50 rounded-lg">
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white min-w-[200px]">
            <option value="">Anwesenheitsliste wählen…</option>
            {alleAnwesenheit.map((a) => (
              <option key={a.id} value={a.id}>{a.titel} {a.ort ? `(${a.ort})` : ''} – {a.status === 'aktiv' ? 'Aktiv' : 'Abgeschlossen'}</option>
            ))}
          </select>
          <button type="button" onClick={link} disabled={!selectedId}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm">Verknüpfen</button>
          <button type="button" onClick={() => setShowLink(false)} className="px-3 py-2 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {data?.anwesenheitsliste_id ? (
        <div className="flex items-center justify-between py-3 px-4 bg-gray-800 rounded-lg">
          <div className="flex-1 min-w-0">
            <Link to={`/anwesenheit/${data.anwesenheitsliste_id}`}
              className="text-white hover:text-blue-400 font-medium flex items-center gap-2">
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              {data.anwesenheitsliste_titel || `Anwesenheitsliste #${data.anwesenheitsliste_id}`}
            </Link>
          </div>
          <button type="button" onClick={unlink} title="Verknüpfung entfernen"
            className="text-gray-400 hover:text-red-400 ml-2 flex-shrink-0"><Unlink className="w-4 h-4" /></button>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">Keine Anwesenheitsliste verknüpft</p>
      )}
    </CollapsibleSection>
  );
}
