/**
 * Verwaltung der Veranstaltungs-Vorlagen.
 * CRUD über /api/veranstaltung/templates — Liste links, Editor rechts.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, FileText, X, Bell, Layers, Award,
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../lib/api';
import { useUser } from '../../contexts/UserContext';

const EINHEITEN = [
  { v: 'minuten', l: 'Min' },
  { v: 'stunden', l: 'Std' },
  { v: 'tage',    l: 'Tage' },
  { v: 'wochen',  l: 'Wochen' },
];

function emptyTemplate() {
  return {
    id: null, name: '', beschreibung: '',
    titel_vorlage: '', beschreibung_vorlage: '', ort_vorlage: '',
    dauer_minuten: 120,
    taetigkeit_ids: [], erforderliche_kompetenzen_ids: [],
    erinnerungen: [],
  };
}

export default function VorlagenPage() {
  const { hasPermission } = useUser();
  const canEdit = hasPermission('veranstaltung.create') || hasPermission('veranstaltung.edit');

  const [templates, setTemplates] = useState([]);
  const [taetigkeiten, setTaetigkeiten] = useState([]);
  const [kompetenzen, setKompetenzen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);  // null oder Template-Objekt
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tpl, tk, kp] = await Promise.all([
        apiClient.get('/veranstaltung/templates'),
        apiClient.get('/veranstaltung/taetigkeitsrollen'),
        apiClient.get('/kompetenzen/alle').catch(() => ({ data: [] })),
      ]);
      setTemplates(tpl.data || []);
      setTaetigkeiten(tk.data || []);
      setKompetenzen(kp.data || []);
    } catch { toast.error('Laden fehlgeschlagen'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing.name.trim()) { toast.error('Name fehlt'); return; }
    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        beschreibung: editing.beschreibung || '',
        titel_vorlage: editing.titel_vorlage || '',
        beschreibung_vorlage: editing.beschreibung_vorlage || '',
        ort_vorlage: editing.ort_vorlage || '',
        dauer_minuten: parseInt(editing.dauer_minuten) || 120,
        taetigkeit_ids: editing.taetigkeit_ids || [],
        erforderliche_kompetenzen_ids: editing.erforderliche_kompetenzen_ids || [],
        erinnerungen: editing.erinnerungen || [],
      };
      if (editing.id) {
        await apiClient.put(`/veranstaltung/templates/${editing.id}`, payload);
        toast.success('Vorlage gespeichert');
      } else {
        await apiClient.post('/veranstaltung/templates', payload);
        toast.success('Vorlage angelegt');
      }
      setEditing(null);
      load();
    } catch { toast.error('Speichern fehlgeschlagen'); }
    finally { setSaving(false); }
  };

  const remove = async (t) => {
    if (!confirm(`Vorlage "${t.name}" wirklich löschen?`)) return;
    try { await apiClient.delete(`/veranstaltung/templates/${t.id}`); load(); }
    catch { toast.error('Löschen fehlgeschlagen'); }
  };

  const toggleSet = (key, id) => setEditing((e) => ({
    ...e,
    [key]: (e[key] || []).includes(id)
      ? e[key].filter(x => x !== id)
      : [...(e[key] || []), id],
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/veranstaltung" className="text-gray-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <FileText className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-white">Veranstaltungs-Vorlagen</h1>
        {canEdit && !editing && (
          <button onClick={() => setEditing(emptyTemplate())}
            className="ml-auto inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
            <Plus className="w-4 h-4" /> Neue Vorlage
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Liste */}
          <div className="space-y-2">
            {templates.length === 0 ? (
              <p className="text-sm text-gray-500">Noch keine Vorlagen.</p>
            ) : templates.map((t) => (
              <div key={t.id}
                className={`p-3 rounded-lg border ${
                  editing?.id === t.id ? 'border-blue-500 bg-blue-600/10' : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                }`}>
                <div className="flex items-start gap-2">
                  <button onClick={() => setEditing({
                    ...t,
                    taetigkeit_ids: t.taetigkeit_ids || [],
                    erforderliche_kompetenzen_ids: t.erforderliche_kompetenzen_ids || [],
                    erinnerungen: t.erinnerungen || [],
                  })} className="flex-1 text-left">
                    <div className="text-white font-medium">{t.name}</div>
                    {t.beschreibung && <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{t.beschreibung}</div>}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">
                        {t.dauer_minuten} Min
                      </span>
                      {(t.taetigkeit_namen || []).slice(0, 3).map(n => (
                        <span key={n} className="text-[10px] px-1.5 py-0.5 bg-purple-600/20 text-purple-300 rounded">{n}</span>
                      ))}
                      {(t.erinnerungen || []).length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-600/20 text-amber-300 rounded">
                          {t.erinnerungen.length} Erinn.
                        </span>
                      )}
                    </div>
                  </button>
                  {canEdit && (
                    <button onClick={() => remove(t)}
                      className="p-1.5 text-gray-500 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Editor */}
          {editing ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  {editing.id ? 'Vorlage bearbeiten' : 'Neue Vorlage'}
                </h2>
                <button onClick={() => setEditing(null)}
                  className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Vorlagen-Name *</label>
                  <input value={editing.name}
                    onChange={(e) => setEditing(s => ({ ...s, name: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Dauer (Min)</label>
                  <input type="number" value={editing.dauer_minuten}
                    onChange={(e) => setEditing(s => ({ ...s, dauer_minuten: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Vorlagen-Beschreibung (intern)</label>
                <textarea rows={2} value={editing.beschreibung}
                  onChange={(e) => setEditing(s => ({ ...s, beschreibung: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
              </div>

              <hr className="border-gray-800" />

              <p className="text-xs text-gray-500">Werte für neu angelegte Veranstaltungen:</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Titel-Vorlage</label>
                  <input value={editing.titel_vorlage}
                    onChange={(e) => setEditing(s => ({ ...s, titel_vorlage: e.target.value }))}
                    placeholder="z.B. Schulkonzert {datum}"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Ort-Vorlage</label>
                  <input value={editing.ort_vorlage}
                    onChange={(e) => setEditing(s => ({ ...s, ort_vorlage: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Beschreibung-Vorlage</label>
                <textarea rows={3} value={editing.beschreibung_vorlage}
                  onChange={(e) => setEditing(s => ({ ...s, beschreibung_vorlage: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono" />
              </div>

              {/* Tätigkeiten */}
              <div>
                <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" /> Tätigkeiten (für Zuweisungen)
                </label>
                <div className="flex flex-wrap gap-1.5 bg-gray-800/40 border border-gray-800 rounded p-2 max-h-32 overflow-y-auto">
                  {taetigkeiten.length === 0 && <span className="text-xs text-gray-600">Keine Tätigkeiten vorhanden</span>}
                  {taetigkeiten.map(t => {
                    const on = (editing.taetigkeit_ids || []).includes(t.id);
                    return (
                      <button key={t.id} onClick={() => toggleSet('taetigkeit_ids', t.id)}
                        className={`px-2 py-1 rounded text-xs ${
                          on ? 'bg-purple-600/30 text-purple-200 border border-purple-500'
                             : 'bg-gray-700 text-gray-300 border border-gray-700'
                        }`}>
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Kompetenzen */}
              <div>
                <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" /> Erforderliche Kompetenzen
                </label>
                <div className="flex flex-wrap gap-1.5 bg-gray-800/40 border border-gray-800 rounded p-2 max-h-32 overflow-y-auto">
                  {kompetenzen.length === 0 && <span className="text-xs text-gray-600">Keine Kompetenzen verfügbar</span>}
                  {kompetenzen.map(k => {
                    const on = (editing.erforderliche_kompetenzen_ids || []).includes(k.id);
                    return (
                      <button key={k.id} onClick={() => toggleSet('erforderliche_kompetenzen_ids', k.id)}
                        className={`px-2 py-1 rounded text-xs ${
                          on ? 'bg-amber-600/30 text-amber-200 border border-amber-500'
                             : 'bg-gray-700 text-gray-300 border border-gray-700'
                        }`}>
                        {k.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Erinnerungen */}
              <div>
                <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                  <Bell className="w-3.5 h-3.5" /> Erinnerungen (vor Beginn)
                </label>
                <div className="space-y-1">
                  {(editing.erinnerungen || []).map((er, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="number" min="1" value={er.zeit_vorher}
                        onChange={(e) => setEditing(s => ({
                          ...s, erinnerungen: s.erinnerungen.map((x, j) => j === i ? { ...x, zeit_vorher: parseInt(e.target.value) || 1 } : x),
                        }))}
                        className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                      <select value={er.einheit}
                        onChange={(e) => setEditing(s => ({
                          ...s, erinnerungen: s.erinnerungen.map((x, j) => j === i ? { ...x, einheit: e.target.value } : x),
                        }))}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm">
                        {EINHEITEN.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}
                      </select>
                      <span className="text-xs text-gray-500">vorher</span>
                      <button onClick={() => setEditing(s => ({
                        ...s, erinnerungen: s.erinnerungen.filter((_, j) => j !== i),
                      }))} className="ml-auto text-gray-500 hover:text-red-400">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setEditing(s => ({
                    ...s, erinnerungen: [...(s.erinnerungen || []), { zeit_vorher: 1, einheit: 'tage' }],
                  }))} className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Erinnerung
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
                <button onClick={() => setEditing(null)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg">
                  Abbrechen
                </button>
                <button onClick={save} disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg inline-flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Speichern
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center text-gray-500">
              {canEdit ? 'Vorlage auswählen oder neue anlegen.' : 'Du hast keine Bearbeitungs-Rechte.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
