import { useState } from 'react';
import { Package, Plus, ExternalLink, Unlink, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';
import { Button, StatusBadge } from '../../../components/ui';

const AUSLEIHE_TONE = { aktiv: 'accent', abgeschlossen: 'positive', offen: 'warning', storniert: 'danger' };

export default function AusleihllistenSection({ data, refetch, canEdit, eventId, ausleihlisten }) {
  const [showLink, setShowLink] = useState(false);
  const [alleAusleihlisten, setAlleAusleihlisten] = useState([]);
  const [selectedId, setSelectedId] = useState('');

  const fetchAlle = async () => {
    try {
      const res = await apiClient.get('/inventar/ausleihen');
      setAlleAusleihlisten(res.data || []);
    } catch { setAlleAusleihlisten([]); }
  };

  const link = async () => {
    if (!selectedId) return;
    try {
      await apiClient.post(`/inventar/ausleihlisten/${selectedId}/veranstaltung/${eventId}`);
      setSelectedId(''); setShowLink(false); refetch();
      toast.success('Ausleihliste verknüpft');
    } catch (err) { toast.error(err.response?.data?.detail || 'Verknüpfung fehlgeschlagen'); }
  };

  const unlink = async (id) => {
    try {
      await apiClient.delete(`/inventar/ausleihlisten/${id}/veranstaltung`);
      refetch(); toast.success('Verknüpfung entfernt');
    } catch (err) { toast.error(err.response?.data?.detail || 'Entfernen fehlgeschlagen'); }
  };

  if (!canEdit && ausleihlisten.length === 0) return null;

  return (
    <CollapsibleSection
      icon={Package}
      title="Ausleihlisten"
      count={ausleihlisten.length > 0 ? ausleihlisten.length : undefined}
      actions={canEdit && (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => { setShowLink(true); fetchAlle(); }}>
            Verknüpfen
          </Button>
          <Button as={Link} to={`/ausleihen?veranstaltung=${eventId}`} variant="primary" size="sm" icon={Plus}>
            Neue Ausleihe
          </Button>
        </div>
      )}
    >
      {showLink && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-surface rounded-lg">
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg min-w-[200px]">
            <option value="">Ausleihliste wählen…</option>
            {alleAusleihlisten.filter((a) => !a.veranstaltung_id).map((a) => (
              <option key={a.id} value={a.id}>#{a.id} – {a.ausleiher_name || 'Unbekannt'} ({a.status_display || a.status})</option>
            ))}
          </select>
          <Button variant="primary" size="sm" onClick={link} disabled={!selectedId}>Verknüpfen</Button>
          <button type="button" onClick={() => setShowLink(false)} aria-label="Abbrechen" className="px-3 py-2 text-fg-muted hover:text-fg"><X className="w-4 h-4" /></button>
        </div>
      )}

      {ausleihlisten.length > 0 ? (
        <div className="bg-surface rounded-lg divide-y divide-line-subtle">
          {ausleihlisten.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-3 px-4">
              <div className="flex-1 min-w-0">
                <Link to={`/ausleihen/${a.id}`} className="text-fg hover:text-accent-fg font-medium flex items-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                  #{a.id} – {a.ausleiher_name || 'Unbekannt'}
                </Link>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-fg-muted tabular-nums">
                  {a.zweck && <span>{a.zweck}</span>}
                  <StatusBadge tone={AUSLEIHE_TONE[a.status] || 'neutral'} label={a.status_display || a.status} />
                  <span>{a.anzahl_items} Items</span>
                  {a.frist && <span>Frist: {new Date(a.frist).toLocaleDateString('de-DE')}</span>}
                  {a.ist_ueberfaellig && <span className="text-bad font-medium">Überfällig</span>}
                </div>
              </div>
              <button type="button" onClick={() => unlink(a.id)} title="Verknüpfung entfernen" aria-label="Verknüpfung entfernen"
                className="text-fg-muted hover:text-bad ml-2 flex-shrink-0"><Unlink className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-fg-subtle text-sm">Keine Ausleihlisten verknüpft</p>
      )}
    </CollapsibleSection>
  );
}
