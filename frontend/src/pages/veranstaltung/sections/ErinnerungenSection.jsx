import { useState } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';

const EINHEIT_LABELS = { minuten: 'Min.', stunden: 'Std.', tage: 'Tage', wochen: 'Wochen' };

export default function ErinnerungenSection({ data, refetch, canEdit, eventId }) {
  const [form, setForm] = useState({ zeit_vorher: 1, einheit: 'tage' });

  const add = async () => {
    try { await apiClient.post(`/veranstaltung/${eventId}/erinnerungen`, form); setForm({ zeit_vorher: 1, einheit: 'tage' }); refetch(); }
    catch (err) { console.error('Erinnerung:', err); }
  };

  const remove = async (id) => {
    try { await apiClient.delete(`/veranstaltung/${eventId}/erinnerungen/${id}`); refetch(); }
    catch (err) { console.error('Erinnerung löschen:', err); }
  };

  if (!canEdit && !(data?.erinnerungen?.length > 0)) return null;

  return (
    <CollapsibleSection icon={Bell} title="Erinnerungen">
      {canEdit && (
        <div className="flex flex-wrap gap-2 mb-4">
          <input type="number" min={1} value={form.zeit_vorher}
            onChange={(e) => setForm((p) => ({ ...p, zeit_vorher: parseInt(e.target.value, 10) || 1 }))}
            className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-center" />
          <select value={form.einheit} onChange={(e) => setForm((p) => ({ ...p, einheit: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
            {Object.entries(EINHEIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="py-2 text-gray-400">vorher</span>
          <button type="button" onClick={add}
            className="inline-flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
            <Plus className="w-4 h-4" /> Hinzufügen
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {(data?.erinnerungen || []).map((er) => (
          <li key={er.id} className="flex items-center justify-between py-2 px-3 bg-gray-800 rounded-lg">
            <span className="text-white">
              {er.zeit_vorher} {EINHEIT_LABELS[er.einheit] || er.einheit} vorher
              {er.gesendet && <span className="text-gray-500 text-sm ml-2">(gesendet)</span>}
            </span>
            {!er.gesendet && (
              <button type="button" onClick={() => remove(er.id)} className="text-gray-400 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
        {(!data?.erinnerungen || data.erinnerungen.length === 0) && <li className="text-gray-500 text-sm">Keine Erinnerungen</li>}
      </ul>
    </CollapsibleSection>
  );
}
