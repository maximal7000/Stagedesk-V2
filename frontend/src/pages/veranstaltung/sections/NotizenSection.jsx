import { useState } from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';

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
        <div className="flex gap-2 mb-4">
          <textarea placeholder="Notiz hinzufügen…" value={newNotiz}
            onChange={(e) => setNewNotiz(e.target.value)} rows={2}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
          <button type="button" onClick={addNotiz} disabled={!newNotiz.trim()}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg self-end">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}
      <ul className="space-y-3">
        {(data?.notizen || []).map((n) => (
          <li key={n.id} className="py-2 px-3 bg-gray-800 rounded-lg">
            <p className="text-white whitespace-pre-wrap">{n.text}</p>
            <p className="text-xs text-gray-500 mt-1">{n.created_by_username || 'Unbekannt'} · {formatDatum(n.created_at)}</p>
          </li>
        ))}
        {(!data?.notizen || data.notizen.length === 0) && <li className="text-gray-500 text-sm">Keine Notizen</li>}
      </ul>
    </CollapsibleSection>
  );
}
