import { useState } from 'react';
import { Send, Megaphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';
import { Button } from '../../../components/ui';

const ZIELE = [
  { v: 'zugewiesene', l: 'Zugewiesene' },
  { v: 'angemeldete', l: 'Angemeldete' },
  { v: 'beide',       l: 'Beide' },
];

export default function MitteilungSection({ data, canEdit, eventId }) {
  const [text, setText] = useState('');
  const [titel, setTitel] = useState('');
  const [an, setAn] = useState('zugewiesene');
  const [sending, setSending] = useState(false);

  if (!canEdit) return null;

  const counts = {
    zugewiesene: (data?.zuweisungen || []).length,
    angemeldete: (data?.meldungen || []).length,
  };
  counts.beide = new Set([
    ...(data?.zuweisungen || []).map(z => z.user_keycloak_id),
    ...(data?.meldungen || []).map(m => m.user_keycloak_id),
  ]).size;

  const send = async () => {
    if (!text.trim()) { toast.error('Text fehlt'); return; }
    if (counts[an] === 0) { toast.error('Keine Empfänger in dieser Gruppe'); return; }
    setSending(true);
    try {
      const r = await apiClient.post(`/veranstaltung/${eventId}/mitteilung`, {
        text: text.trim(),
        titel: titel.trim() || undefined,
        an,
      });
      toast.success(`Gesendet an ${r.data.empfaenger} ${r.data.empfaenger === 1 ? 'Person' : 'Personen'}`);
      setText('');
      setTitel('');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Senden fehlgeschlagen');
    } finally { setSending(false); }
  };

  return (
    <CollapsibleSection icon={Megaphone} title="Mitteilung senden">
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-fg-muted mb-1">Titel (optional)</label>
          <input type="text" value={titel}
            onChange={(e) => setTitel(e.target.value)}
            placeholder={`Mitteilung: ${data?.titel || ''}`}
            className="w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-fg-muted mb-1">Nachricht *</label>
          <textarea rows={4} value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Infos, Treffpunkt, Änderungen ..."
            className="w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg text-sm font-mono" />
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-sm font-medium text-fg-muted mb-1">An</label>
            <select value={an} onChange={(e) => setAn(e.target.value)}
              className="w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg text-sm">
              {ZIELE.map(z => (
                <option key={z.v} value={z.v}>
                  {z.l} ({counts[z.v]})
                </option>
              ))}
            </select>
          </div>
          <Button variant="primary" icon={sending ? undefined : Send} onClick={send}
            disabled={sending || !text.trim() || counts[an] === 0}>
            {sending && <Loader2 className="w-4 h-4 animate-spin" />}
            Senden
          </Button>
        </div>
        <p className="text-[11px] text-fg-subtle">
          Empfänger erhalten eine In-App-Notification und (falls aktiviert) eine Web-Push-Notification.
        </p>
      </div>
    </CollapsibleSection>
  );
}
