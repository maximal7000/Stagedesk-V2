import { useState } from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';
import Markdown, { MarkdownHint } from '../../../components/Markdown';
import { Button } from '../../../components/ui';

function formatDatum(d) {
  if (!d) return '–';
  return new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NotizenSection({ data, refetch, canEdit, eventId }) {
  const [newNotiz, setNewNotiz] = useState('');

  const addNotiz = async () => {
    if (!newNotiz.trim()) return;
    try {
      await apiClient.post(`/veranstaltung/${eventId}/notizen`, { text: newNotiz.trim() });
      setNewNotiz(''); refetch();
    } catch (err) { console.error('Notiz:', err); }
  };

  if (!canEdit && !(data?.notizen?.length > 0)) return null;

  return (
    <CollapsibleSection icon={MessageSquare} title="Notizen">
      {canEdit && (
        <div className="mb-4">
          <div className="flex gap-2">
            <textarea placeholder="Notiz hinzufügen…" value={newNotiz}
              onChange={(e) => setNewNotiz(e.target.value)} rows={2}
              className="flex-1 bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg placeholder:text-fg-subtle font-mono text-sm" />
            <Button variant="secondary" icon={Plus} onClick={addNotiz} disabled={!newNotiz.trim()}
              className="self-end" title="Notiz hinzufügen" aria-label="Notiz hinzufügen" />
          </div>
          <MarkdownHint />
        </div>
      )}
      <ul className="bg-surface rounded-lg divide-y divide-line-subtle">
        {(data?.notizen || []).map((n) => (
          <li key={n.id} className="py-2 px-3">
            <Markdown>{n.text}</Markdown>
            <p className="text-xs text-fg-subtle mt-1">{n.created_by_username || 'Unbekannt'} · {formatDatum(n.created_at)}</p>
          </li>
        ))}
        {(!data?.notizen || data.notizen.length === 0) && <li className="text-fg-subtle text-sm px-3 py-2">Keine Notizen</li>}
      </ul>
    </CollapsibleSection>
  );
}
