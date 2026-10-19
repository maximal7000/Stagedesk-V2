import { useState } from 'react';
import { CheckSquare, Plus, Trash2, Calendar, AlertCircle } from 'lucide-react';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';
import { Button } from '../../../components/ui';

function deadlineState(item) {
  if (!item.deadline) return null;
  const d = new Date(item.deadline);
  const now = new Date();
  const diff = (d - now) / (1000 * 60 * 60); // Stunden
  if (item.erledigt) return { cls: 'text-fg-subtle', label: d.toLocaleDateString('de-DE') };
  if (diff < 0) return { cls: 'text-bad', label: `überfällig (${d.toLocaleDateString('de-DE')})`, urgent: true };
  if (diff < 24) return { cls: 'text-warn', label: `${Math.round(diff)}h verbleibend` };
  if (diff < 72) return { cls: 'text-warn', label: `${Math.round(diff/24)} Tage` };
  return { cls: 'text-fg-muted', label: d.toLocaleDateString('de-DE') };
}

export default function ChecklisteSection({ data, refetch, canEdit, eventId }) {
  const [newItem, setNewItem] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [editingDeadlineId, setEditingDeadlineId] = useState(null);

  const addItem = async () => {
    if (!newItem.trim()) return;
    try {
      await apiClient.post(`/veranstaltung/${eventId}/checkliste`, {
        titel: newItem.trim(),
        sortierung: (data?.checkliste?.length ?? 0),
        deadline: newDeadline ? new Date(newDeadline).toISOString() : null,
      });
      setNewItem(''); setNewDeadline(''); refetch();
    } catch (err) { console.error('Checkliste:', err); }
  };

  const toggleItem = async (itemId, erledigt) => {
    try { await apiClient.put(`/veranstaltung/${eventId}/checkliste/${itemId}`, { erledigt }); refetch(); }
    catch (err) { console.error('Toggle:', err); }
  };

  const setDeadline = async (itemId, isoOrNull) => {
    try {
      await apiClient.put(`/veranstaltung/${eventId}/checkliste/${itemId}`, { deadline: isoOrNull });
      setEditingDeadlineId(null);
      refetch();
    } catch (err) { console.error('Deadline:', err); }
  };

  const deleteItem = async (itemId) => {
    try { await apiClient.delete(`/veranstaltung/${eventId}/checkliste/${itemId}`); refetch(); }
    catch (err) { console.error('Löschen:', err); }
  };

  if (!canEdit && !(data?.checkliste?.length > 0)) return null;

  const done = (data?.checkliste || []).filter(i => i.erledigt).length;
  const total = (data?.checkliste || []).length;

  return (
    <CollapsibleSection
      icon={CheckSquare}
      title="Checkliste"
      count={total > 0 ? `${done}/${total}` : undefined}
    >
      {canEdit && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input type="text" placeholder="Punkt hinzufügen…" value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem())}
            className="flex-1 bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg placeholder:text-fg-subtle" />
          <input type="datetime-local" value={newDeadline}
            onChange={(e) => setNewDeadline(e.target.value)}
            title="Optionale Frist"
            className="bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg text-sm" />
          <Button variant="secondary" icon={Plus} onClick={addItem} title="Punkt hinzufügen" aria-label="Punkt hinzufügen" />
        </div>
      )}
      <ul className="bg-surface rounded-lg divide-y divide-line-subtle">
        {(data?.checkliste || []).map((item) => {
          const ds = deadlineState(item);
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-3 py-2 px-3">
              {canEdit ? (
                <button type="button" onClick={() => toggleItem(item.id, !item.erledigt)}
                  aria-label={item.erledigt ? 'Als offen markieren' : 'Als erledigt markieren'} className="flex-shrink-0">
                  <CheckSquare className={`w-5 h-5 ${item.erledigt ? 'text-ok' : 'text-fg-subtle'}`} />
                </button>
              ) : (
                <CheckSquare className={`w-5 h-5 flex-shrink-0 ${item.erledigt ? 'text-ok' : 'text-fg-subtle'}`} />
              )}
              <span className={`flex-1 min-w-0 ${item.erledigt ? 'text-fg-subtle line-through' : 'text-fg'}`}>{item.titel}</span>
              {ds && (
                <span className={`text-xs inline-flex items-center gap-1 tabular-nums ${ds.cls}`}>
                  {ds.urgent ? <AlertCircle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                  {ds.label}
                </span>
              )}
              {canEdit && editingDeadlineId === item.id ? (
                <input type="datetime-local"
                  defaultValue={item.deadline ? new Date(item.deadline).toISOString().slice(0, 16) : ''}
                  onBlur={(e) => setDeadline(item.id, e.target.value ? new Date(e.target.value).toISOString() : null)}
                  autoFocus
                  className="bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-2 py-1 text-fg text-xs" />
              ) : canEdit && (
                <button type="button" onClick={() => setEditingDeadlineId(item.id)}
                  title={item.deadline ? 'Frist ändern' : 'Frist setzen'}
                  className="text-fg-subtle hover:text-fg">
                  <Calendar className="w-4 h-4" />
                </button>
              )}
              {canEdit && (
                <button type="button" onClick={() => deleteItem(item.id)} aria-label="Punkt löschen" className="text-fg-muted hover:text-bad">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          );
        })}
        {(!data?.checkliste || data.checkliste.length === 0) && (
          <li className="text-fg-subtle text-sm px-3 py-2">Keine Punkte</li>
        )}
      </ul>
    </CollapsibleSection>
  );
}
