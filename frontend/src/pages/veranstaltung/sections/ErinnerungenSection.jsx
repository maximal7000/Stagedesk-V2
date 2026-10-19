import { useState } from 'react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';
import { Button } from '../../../components/ui';

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
            className="w-16 bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-2 py-2 text-fg text-center" />
          <select value={form.einheit} onChange={(e) => setForm((p) => ({ ...p, einheit: e.target.value }))}
            className="bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg">
            {Object.entries(EINHEIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="py-2 text-fg-muted">vorher</span>
          <Button variant="secondary" icon={Plus} onClick={add}>Hinzufügen</Button>
        </div>
      )}
      <ul className="bg-surface rounded-lg divide-y divide-line-subtle">
        {(data?.erinnerungen || []).map((er) => (
          <li key={er.id} className="flex items-center justify-between py-2 px-3">
            <span className="text-fg tabular-nums">
              {er.zeit_vorher} {EINHEIT_LABELS[er.einheit] || er.einheit} vorher
              {er.gesendet && <span className="text-fg-subtle text-sm ml-2">(gesendet)</span>}
            </span>
            {!er.gesendet && (
              <button type="button" onClick={() => remove(er.id)} aria-label="Erinnerung löschen" className="text-fg-muted hover:text-bad">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
        {(!data?.erinnerungen || data.erinnerungen.length === 0) && <li className="text-fg-subtle text-sm px-3 py-2">Keine Erinnerungen</li>}
      </ul>
    </CollapsibleSection>
  );
}
