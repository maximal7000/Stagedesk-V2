import { useState } from 'react';
import { CheckSquare, Plus, Trash2 } from 'lucide-react';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';

export default function ChecklisteSection({ data, refetch, canEdit, eventId }) {
  const [newItem, setNewItem] = useState('');

  const addItem = async () => {
    if (!newItem.trim()) return;
    try {
      await apiClient.post(`/veranstaltung/${eventId}/checkliste`, {
        titel: newItem.trim(), sortierung: (data?.checkliste?.length ?? 0),
      });
      setNewItem(''); refetch();
    } catch (err) { console.error('Checkliste:', err); }
  };

  const toggleItem = async (itemId, erledigt) => {
    try { await apiClient.put(`/veranstaltung/${eventId}/checkliste/${itemId}`, { erledigt }); refetch(); }
    catch (err) { console.error('Toggle:', err); }
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
        <div className="flex gap-2 mb-4">
          <input type="text" placeholder="Punkt hinzufügen…" value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem())}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
          <button type="button" onClick={addItem} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {(data?.checkliste || []).map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2 px-3 bg-gray-800 rounded-lg">
            {canEdit ? (
              <button type="button" onClick={() => toggleItem(item.id, !item.erledigt)} className="flex-shrink-0">
                <CheckSquare className={`w-5 h-5 ${item.erledigt ? 'text-green-500' : 'text-gray-500'}`} />
              </button>
            ) : (
              <CheckSquare className={`w-5 h-5 flex-shrink-0 ${item.erledigt ? 'text-green-500' : 'text-gray-500'}`} />
            )}
            <span className={`flex-1 ${item.erledigt ? 'text-gray-500 line-through' : 'text-white'}`}>{item.titel}</span>
            {canEdit && (
              <button type="button" onClick={() => deleteItem(item.id)} className="text-gray-400 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
        {(!data?.checkliste || data.checkliste.length === 0) && (
          <li className="text-gray-500 text-sm">Keine Punkte</li>
        )}
      </ul>
    </CollapsibleSection>
  );
}
