import { useState } from 'react';
import { ClipboardList, CalendarPlus, Plus, Wand2, Loader2, ExternalLink, Unlink, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';
import { Button } from '../../../components/ui';

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
            <Button variant="secondary" size="sm" icon={syncing ? undefined : CalendarPlus} onClick={handleSync} disabled={syncing}
              title="Termine aus Veranstaltung in Anwesenheitsliste synchronisieren">
              {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Termine sync
            </Button>
          ) : (
            <>
              <Button variant="primary" size="sm" icon={Wand2} onClick={handleCreate} disabled={creating}>
                Auto-Erstellen
              </Button>
              <Button variant="secondary" size="sm" icon={Plus} onClick={() => { setShowLink(true); fetchAlle(); }}>
                Verknüpfen
              </Button>
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
          <Button variant="primary" size="sm" onClick={link} disabled={!selectedId}>Verknüpfen</Button>
          <button type="button" onClick={() => setShowLink(false)} aria-label="Abbrechen" className="px-3 py-2 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {data?.anwesenheitsliste_id ? (
        <div className="flex items-center justify-between py-3 px-4 bg-gray-800 rounded-lg">
          <div className="flex-1 min-w-0">
            <Link to={`/anwesenheit/${data.anwesenheitsliste_id}`}
              className="text-white hover:text-accent font-medium flex items-center gap-2">
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              {data.anwesenheitsliste_titel || `Anwesenheitsliste #${data.anwesenheitsliste_id}`}
            </Link>
          </div>
          <button type="button" onClick={unlink} title="Verknüpfung entfernen" aria-label="Verknüpfung entfernen"
            className="text-gray-400 hover:text-red-400 ml-2 flex-shrink-0"><Unlink className="w-4 h-4" /></button>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">Keine Anwesenheitsliste verknüpft</p>
      )}
    </CollapsibleSection>
  );
}
