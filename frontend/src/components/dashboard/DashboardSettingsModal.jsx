/**
 * Modal: Dashboard-Widgets auswählen + Reihenfolge ändern.
 */
import { useState, useEffect } from 'react';
import { X, ChevronUp, ChevronDown, Loader2, Plus } from 'lucide-react';
import apiClient from '../../lib/api';
import { toast } from 'sonner';
import { Button } from '../ui';

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
        <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-800">
          <div>
            <h2 className="font-display text-lg font-bold text-white">Dashboard anpassen</h2>
            <p className="text-sm text-gray-500 mt-0.5">Wähle Widgets aus und lege ihre Reihenfolge fest.</p>
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose}
            title="Schließen" aria-label="Schließen" className="shrink-0 !px-2" />
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
          ) : (
            <>
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 mb-2">
                  Aktiv · Reihenfolge wie angezeigt
                </h3>
                {activeOrdered.length === 0 ? (
                  <p className="text-sm text-gray-500 py-3">Noch keine Widgets aktiv.</p>
                ) : (
                  <ul className="space-y-2">
                    {activeOrdered.map((code, idx) => {
                      const w = catalog.find(x => x.code === code);
                      if (!w) return null;
                      return (
                        <li key={code} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                          <span className="w-5 h-5 shrink-0 rounded-full bg-gray-700 text-gray-300 text-xs font-semibold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{w.name}</div>
                            <div className="text-xs text-gray-500 truncate">{w.description}</div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => move(idx, -1)} disabled={idx === 0}
                              title="Nach oben" aria-label="Nach oben"
                              className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors">
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button onClick={() => move(idx, 1)} disabled={idx === activeOrdered.length - 1}
                              title="Nach unten" aria-label="Nach unten"
                              className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 transition-colors">
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <button onClick={() => toggle(code)}
                              title="Entfernen" aria-label="Entfernen"
                              className="p-1.5 text-gray-400 hover:text-red-400 transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {inactiveWidgets.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 mb-2">
                    Verfügbar
                  </h3>
                  <ul className="space-y-2">
                    {inactiveWidgets.map(w => (
                      <li key={w.code}>
                        <button onClick={() => toggle(w.code)}
                          className="w-full flex items-center gap-3 p-3 bg-gray-800/40 hover:bg-gray-800 border border-gray-800 rounded-lg text-left transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{w.name}</div>
                            <div className="text-xs text-gray-500 truncate">{w.description}</div>
                          </div>
                          <Plus className="w-4 h-4 text-gray-500 shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {catalog.length === 0 && !loading && (
                <p className="text-sm text-gray-500">
                  Keine Widgets verfügbar. Dir fehlt die Berechtigung für Dashboard-Inhalte.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t border-gray-800">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button variant="primary" className="flex-1" onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
}
