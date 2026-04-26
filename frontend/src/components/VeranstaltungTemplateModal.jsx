/**
 * Modal: aus einer Veranstaltungs-Vorlage eine neue Veranstaltung anlegen.
 * User wählt eine Vorlage und einen Start-Zeitpunkt; Backend setzt Ende = start + dauer_minuten,
 * kopiert Erinnerungen und erforderliche Kompetenzen.
 */
import { useState, useEffect } from 'react';
import { X, Loader2, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import apiClient from '../lib/api';

export default function VeranstaltungTemplateModal({ open, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [datumVon, setDatumVon] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiClient.get('/veranstaltung/templates')
      .then(r => setTemplates(Array.isArray(r.data) ? r.data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
    // Default-Datum: morgen 18:00
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(18, 0, 0, 0);
    setDatumVon(d.toISOString().slice(0, 16));
  }, [open]);

  const create = async () => {
    if (!selected || !datumVon) return;
    setCreating(true);
    try {
      const res = await apiClient.post(
        `/veranstaltung/templates/${selected.id}/anlegen`,
        { template_id: selected.id, datum_von: new Date(datumVon).toISOString() },
      );
      toast.success('Veranstaltung angelegt');
      onClose();
      navigate(`/veranstaltung/${res.data.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Anlegen fehlgeschlagen');
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2 text-white">
            <FileText className="w-5 h-5" />
            <h2 className="font-semibold">Aus Vorlage anlegen</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-500">Keine Vorlagen vorhanden. Lege Vorlagen im Django-Admin unter „Veranstaltungs-Templates" an.</p>
          ) : (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Vorlage</label>
                <ul className="space-y-1 max-h-56 overflow-y-auto">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => setSelected(t)}
                        className={`w-full text-left p-3 rounded-lg border ${
                          selected?.id === t.id
                            ? 'bg-blue-600/20 border-blue-500'
                            : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                        }`}>
                        <div className="text-white font-medium">{t.name}</div>
                        {t.beschreibung && <div className="text-xs text-gray-400 mt-0.5">{t.beschreibung}</div>}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">
                            {t.dauer_minuten} Min
                          </span>
                          {(t.taetigkeit_namen || []).map(n => (
                            <span key={n} className="text-[10px] px-1.5 py-0.5 bg-purple-600/20 text-purple-300 rounded">
                              {n}
                            </span>
                          ))}
                          {(t.erinnerungen || []).length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-600/20 text-amber-300 rounded">
                              {t.erinnerungen.length} Erinnerung{t.erinnerungen.length === 1 ? '' : 'en'}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {selected && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Start-Zeitpunkt</label>
                  <input type="datetime-local" value={datumVon}
                    onChange={(e) => setDatumVon(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
                  <p className="text-xs text-gray-500 mt-1">
                    Ende wird auf Start + {selected.dauer_minuten} Min gesetzt.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-gray-800">
          <button onClick={onClose} disabled={creating}
            className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg disabled:opacity-50">
            Abbrechen
          </button>
          <button onClick={create} disabled={!selected || !datumVon || creating}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            Anlegen
          </button>
        </div>
      </div>
    </div>
  );
}
