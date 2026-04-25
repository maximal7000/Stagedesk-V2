/**
 * Modal: Dashboard-Widgets auswählen + Reihenfolge ändern.
 */
import { useState, useEffect } from 'react';
import { X, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import apiClient from '../../lib/api';
import { toast } from 'sonner';

export default function DashboardSettingsModal({ active, onClose, onSaved }) {
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(active || []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/users/me/dashboard/catalog')
      .then(r => setCatalog(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCatalog([]))
      .finally(() => setLoading(false));
  }, []);

  const isOn = (code) => selected.includes(code);
  const toggle = (code) => {
    setSelected(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };
  const move = (idx, dir) => {
    setSelected(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await apiClient.put('/users/me/dashboard', { widgets: selected });
      toast.success('Dashboard gespeichert');
      onSaved?.(r.data.widgets || []);
      onClose();
    } catch (e) {
      toast.error('Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  // Aktive in Reihenfolge oben, inaktive verfügbare Widgets darunter
  const activeOrdered = selected.filter(c => catalog.some(w => w.code === c));
  const inactiveWidgets = catalog.filter(w => !selected.includes(w.code));

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white">Dashboard anpassen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-2">Aktiv (Reihenfolge wie angezeigt)</h3>
                {activeOrdered.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">Keine Widgets aktiv</p>
                ) : (
                  <ul className="space-y-2">
                    {activeOrdered.map((code, idx) => {
                      const w = catalog.find(x => x.code === code);
                      if (!w) return null;
                      return (
                        <li key={code} className="flex items-center gap-2 p-3 bg-gray-800 rounded-lg">
                          <input type="checkbox" checked readOnly onClick={() => toggle(code)}
                            className="w-4 h-4 rounded cursor-pointer" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white">{w.name}</div>
                            <div className="text-xs text-gray-500">{w.description}</div>
                          </div>
                          <button onClick={() => move(idx, -1)} disabled={idx === 0}
                            className="p-1 text-gray-400 hover:text-white disabled:opacity-30">
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button onClick={() => move(idx, 1)} disabled={idx === activeOrdered.length - 1}
                            className="p-1 text-gray-400 hover:text-white disabled:opacity-30">
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button onClick={() => toggle(code)}
                            className="p-1 text-gray-400 hover:text-red-400">
                            <X className="w-4 h-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {inactiveWidgets.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">Verfügbar</h3>
                  <ul className="space-y-2">
                    {inactiveWidgets.map(w => (
                      <li key={w.code} className="flex items-center gap-2 p-3 bg-gray-800/40 hover:bg-gray-800 rounded-lg cursor-pointer"
                          onClick={() => toggle(w.code)}>
                        <input type="checkbox" checked={isOn(w.code)} readOnly className="w-4 h-4 rounded" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white">{w.name}</div>
                          <div className="text-xs text-gray-500">{w.description}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {catalog.length === 0 && !loading && (
                <p className="text-sm text-gray-500">Keine Widgets verfügbar — du hast aktuell keine Berechtigungen für Dashboard-Inhalte.</p>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t border-gray-800">
          <button onClick={onClose} disabled={saving}
            className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg disabled:opacity-50">
            Abbrechen
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
