/**
 * Aufgaben verwalten — eine Liste, Drag&Drop-Sortierung (touch-fähig
 * via @dnd-kit), Status Offen/Abgeschlossen, User zuweisen.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, ListChecks, Loader2, X, ExternalLink, GripVertical, CheckCircle2, Circle,
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../lib/api';
import Markdown from '../../components/Markdown';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function AufgabenPage() {
  const [aufgaben, setAufgaben] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [neuerTitel, setNeuerTitel] = useState('');
  const [editAssignId, setEditAssignId] = useState(null);
  const [search, setSearch] = useState('');

  const sensors = useSensors(
    // PointerSensor: 5px-Schwelle, damit ein Klick auf den Erledigt-Button
    // nicht versehentlich als Drag erkannt wird.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // TouchSensor: 200ms Hold, damit Scrollen auf Mobile weiterhin geht und
    // nur ein längerer Druck den Drag auslöst.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  // ── Drag&Drop via @dnd-kit (Pointer + Touch + Keyboard) ──
  const onDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = aufgaben.findIndex(a => a.id === active.id);
    const toIdx = aufgaben.findIndex(a => a.id === over.id);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = arrayMove(aufgaben, fromIdx, toIdx);
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={aufgaben.map(a => a.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {aufgaben.map(a => (
                <SortableAufgabe
                  key={a.id} a={a}
                  toggleStatus={toggleStatus} toggleAssign={toggleAssign} remove={remove}
                  editAssignId={editAssignId} setEditAssignId={setEditAssignId}
                  users={users} search={search} setSearch={setSearch}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <p className="text-xs text-gray-500">
        Tipp: Aufgaben per Griff <GripVertical className="w-3 h-3 inline" /> neu sortieren —
        funktioniert mit Maus, Touch (lang drücken) und Tastatur.
      </p>
    </div>
  );
}

// Einzelne sortierbare Aufgaben-Karte. Der Griff (GripVertical) trägt die
// Listener — so kann der Erledigt-Button & der Rest weiterhin normal geklickt
// werden, und auf Touch-Geräten bleibt das Scrollen erhalten.
function SortableAufgabe({
  a, toggleStatus, toggleAssign, remove,
  editAssignId, setEditAssignId, users, search, setSearch,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: a.id });
  const done = a.status === 'abgeschlossen';
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li ref={setNodeRef} style={style}
      className={`bg-gray-900 border rounded-xl p-4 ${
        done ? 'border-green-800/40 opacity-70' : 'border-gray-800 hover:border-gray-700'
      } ${isDragging ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <button {...attributes} {...listeners}
          className="shrink-0 mt-1 text-gray-500 hover:text-white cursor-grab active:cursor-grabbing touch-none p-1 -m-1"
          aria-label="Verschieben">
          <GripVertical className="w-5 h-5" />
        </button>
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
          {a.beschreibung && <div className="text-sm mt-0.5"><Markdown>{a.beschreibung}</Markdown></div>}
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
}
