import { useState } from 'react';
import { CalendarPlus, Calendar, Plus, Trash2, Save, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';

export default function TermineSection({ data, refetch, canEdit, eventId }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState([]);
  const [saving, setSaving] = useState(false);

  const openModal = () => {
    setForm((data?.termine || []).map(t => ({
      id: t.id, titel: t.titel || '', datum: t.datum, beginn: t.beginn || '', ende: t.ende || '',
    })));
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/veranstaltung/${eventId}/termine`, {
        termine: form.filter(t => t.datum).map(t => ({
          id: t.id || undefined, titel: t.titel, datum: t.datum,
          beginn: t.beginn || null, ende: t.ende || null,
        })),
      });
      setShowModal(false);
      refetch();
      toast.success('Termine gespeichert');
    } catch {
      toast.error('Termine konnten nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit && !(data?.termine?.length > 0)) return null;

  return (
    <>
      <CollapsibleSection
        icon={CalendarPlus}
        title="Termine"
        count={data?.termine?.length || undefined}
        actions={canEdit && (
          <button type="button" onClick={openModal}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
            <Plus className="w-4 h-4" /> Bearbeiten
          </button>
        )}
      >
        {(data?.termine?.length ?? 0) > 0 ? (
          <div className="space-y-2">
            {data.termine.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-2.5 px-4 bg-gray-800 rounded-lg text-sm">
                <Calendar className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-white font-medium">
                  {new Date(t.datum).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>
                {(t.beginn || t.ende) && (
                  <span className="text-gray-400">
                    {t.beginn && t.beginn.slice(0, 5)}{t.ende ? `–${t.ende.slice(0, 5)}` : ''}
                  </span>
                )}
                {t.titel && <span className="text-blue-400 ml-auto">{t.titel}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Keine Termine eingetragen</p>
        )}
      </CollapsibleSection>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Termine verwalten</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {form.map((t, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input type="text" value={t.titel}
                      onChange={e => { const f = [...form]; f[i].titel = e.target.value; setForm(f); }}
                      placeholder="Titel (optional)"
                      className="col-span-2 px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white" />
                    <input type="date" value={t.datum}
                      onChange={e => { const f = [...form]; f[i].datum = e.target.value; setForm(f); }}
                      className="px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white" />
                    <div className="flex gap-1">
                      <input type="time" value={t.beginn}
                        onChange={e => { const f = [...form]; f[i].beginn = e.target.value; setForm(f); }}
                        className="flex-1 px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white" />
                      <input type="time" value={t.ende}
                        onChange={e => { const f = [...form]; f[i].ende = e.target.value; setForm(f); }}
                        className="flex-1 px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white" />
                    </div>
                  </div>
                  <button onClick={() => setForm(form.filter((_, j) => j !== i))}
                    className="p-1.5 text-red-400 hover:bg-red-900/20 rounded mt-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button onClick={() => setForm([...form, { id: null, titel: '', datum: '', beginn: '', ende: '' }])}
                className="flex items-center gap-2 w-full p-3 text-sm text-blue-400 hover:text-blue-300 hover:bg-gray-800 rounded-lg border border-dashed border-gray-700">
                <Plus className="w-4 h-4" /> Termin hinzufügen
              </button>
            </div>
            <div className="flex gap-2 p-6 pt-4 border-t border-gray-800">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center justify-center gap-2 flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
