/**
 * Aufgaben verwalten — eine Liste, Drag&Drop-Sortierung,
 * Status Offen/Abgeschlossen, User zuweisen.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, ListChecks, Loader2, X, ExternalLink, GripVertical, CheckCircle2, Circle,
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../lib/api';

export default function AufgabenPage() {
  const [aufgaben, setAufgaben] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [neuerTitel, setNeuerTitel] = useState('');
  const [editAssignId, setEditAssignId] = useState(null);
  const [search, setSearch] = useState('');
  const dragId = useRef(null);
  const overId = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, u] = await Promise.all([
        apiClient.get('/aufgaben'),
        apiClient.get('/aufgaben/users'),
      ]);
      setAufgaben(a.data || []);
      setUsers(u.data || []);
    } catch { toast.error('Laden fehlgeschlagen'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addAufgabe = async () => {
    if (!neuerTitel.trim()) return;
    try {
      await apiClient.post('/aufgaben', {
        titel: neuerTitel.trim(),
        sortierung: aufgaben.length,
      });
      setNeuerTitel(''); load();
    } catch { toast.error('Fehler beim Anlegen'); }
  };

  const toggleStatus = async (a) => {
    const status = a.status === 'offen' ? 'abgeschlossen' : 'offen';
    try {
      await apiClient.put(`/aufgaben/${a.id}`, { status });
      load();
    } catch { toast.error('Fehler'); }
  };

  const toggleAssign = async (a, userId) => {
    const ids = a.zugewiesene.map(z => z.id);
    const next = ids.includes(userId) ? ids.filter(i => i !== userId) : [...ids, userId];
    try {
      await apiClient.put(`/aufgaben/${a.id}`, { zugewiesene_ids: next });
      load();
    } catch { toast.error('Fehler'); }
  };

  const remove = async (a) => {
    if (!confirm(`Aufgabe "${a.titel}" wirklich löschen?`)) return;
    try { await apiClient.delete(`/aufgaben/${a.id}`); load(); }
    catch { toast.error('Fehler'); }
  };

  // ── Drag&Drop ──
  const onDragStart = (id) => { dragId.current = id; };
  const onDragOver = (id, e) => { e.preventDefault(); overId.current = id; };
  const onDrop = async (e) => {
    e.preventDefault();
    const from = dragId.current; const to = overId.current;
    dragId.current = null; overId.current = null;
    if (!from || !to || from === to) return;
    const next = [...aufgaben];
    const fromIdx = next.findIndex(a => a.id === from);
    const toIdx = next.findIndex(a => a.id === to);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setAufgaben(next);
    try {
      await apiClient.put('/aufgaben/reorder', { ids: next.map(a => a.id) });
    } catch { toast.error('Reihenfolge speichern fehlgeschlagen'); load(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-gray-400" />
          <h1 className="text-2xl font-bold text-white">Aufgaben</h1>
          <span className="text-sm text-gray-500">{aufgaben.length}</span>
        </div>
        <a href="/aufgaben-monitor" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-lg text-sm">
          <ExternalLink className="w-4 h-4" /> Monitor-Vollbild öffnen
        </a>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row gap-2">
        <input type="text" placeholder="Neue Aufgabe…" value={neuerTitel}
          onChange={(e) => setNeuerTitel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addAufgabe()}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
        <button onClick={addAufgabe} disabled={!neuerTitel.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg inline-flex items-center gap-2">
          <Plus className="w-4 h-4" /> Hinzufügen
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : aufgaben.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Keine Aufgaben</div>
      ) : (
        <ul className="space-y-2">
          {aufgaben.map(a => {
            const done = a.status === 'abgeschlossen';
            return (
              <li key={a.id}
                draggable
                onDragStart={() => onDragStart(a.id)}
                onDragOver={(e) => onDragOver(a.id, e)}
                onDrop={onDrop}
                className={`bg-gray-900 border rounded-xl p-4 cursor-move ${
                  done ? 'border-green-800/40 opacity-70' : 'border-gray-800 hover:border-gray-700'
                }`}>
                <div className="flex items-start gap-3 flex-wrap">
                  <GripVertical className="w-5 h-5 text-gray-600 mt-1 shrink-0" />
                  <button onClick={() => toggleStatus(a)}
                    title={done ? 'Wieder öffnen' : 'Als erledigt markieren'}
                    className="shrink-0 mt-0.5">
                    {done
                      ? <CheckCircle2 className="w-6 h-6 text-green-500" />
                      : <Circle className="w-6 h-6 text-gray-500 hover:text-white" />}
                  </button>
                  <div className="flex-1 min-w-[200px]">
                    <div className={`font-medium ${done ? 'text-gray-500 line-through' : 'text-white'}`}>
                      {a.titel}
                    </div>
                    {a.beschreibung && <p className="text-sm text-gray-400 mt-0.5">{a.beschreibung}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.zugewiesene.map(z => (
                        <span key={z.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">
                          {z.name}
                          <button onClick={() => toggleAssign(a, z.id)} className="hover:text-white">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <button onClick={() => setEditAssignId(editAssignId === a.id ? null : a.id)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs">
                        <Plus className="w-3 h-3" /> Zuweisen
                      </button>
                    </div>
                    {editAssignId === a.id && (
                      <div className="mt-2 p-2 bg-gray-800/60 border border-gray-700 rounded-lg space-y-1 max-h-48 overflow-y-auto">
                        <input type="text" placeholder="Suchen…" value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm mb-1" />
                        {users
                          .filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase())
                            || (u.username || '').toLowerCase().includes(search.toLowerCase()))
                          .map(u => {
                            const on = a.zugewiesene.some(z => z.id === u.id);
                            return (
                              <label key={u.id}
                                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-700/60 cursor-pointer">
                                <input type="checkbox" checked={on}
                                  onChange={() => toggleAssign(a, u.id)}
                                  className="rounded border-gray-600 bg-gray-700 text-blue-500" />
                                <span className="text-sm text-white">{u.name}</span>
                              </label>
                            );
                          })
                        }
                      </div>
                    )}
                  </div>
                  <button onClick={() => remove(a)}
                    className="p-2 text-gray-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-gray-500">Tipp: Aufgaben per Drag&Drop neu sortieren.</p>
    </div>
  );
}
