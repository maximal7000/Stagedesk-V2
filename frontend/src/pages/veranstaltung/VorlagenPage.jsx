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
import { PageHeader, Button, EmptyState } from '../../components/ui';

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
      <PageHeader
        eyebrow="Veranstaltungen"
        title="Vorlagen"
        actions={
          <>
            <Button as={Link} to="/veranstaltung" variant="ghost" icon={ArrowLeft}>Zurück</Button>
            {canEdit && !editing && (
              <Button variant="primary" icon={Plus} onClick={() => setEditing(emptyTemplate())}>
                Neue Vorlage
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-fg-subtle" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Liste */}
          <div className="space-y-2">
            {templates.length === 0 ? (
              <p className="text-sm text-fg-subtle">Noch keine Vorlagen.</p>
            ) : templates.map((t) => (
              <div key={t.id}
                className={`p-3 rounded-lg ${
                  editing?.id === t.id ? 'bg-raised' : 'bg-surface hover:bg-raised'
                }`}>
                <div className="flex items-start gap-2">
                  <button onClick={() => setEditing({
                    ...t,
                    taetigkeit_ids: t.taetigkeit_ids || [],
                    erforderliche_kompetenzen_ids: t.erforderliche_kompetenzen_ids || [],
                    erinnerungen: t.erinnerungen || [],
                  })} className="flex-1 text-left">
                    <div className="text-fg font-medium">{t.name}</div>
                    {t.beschreibung && <div className="text-xs text-fg-muted mt-0.5 line-clamp-2">{t.beschreibung}</div>}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 bg-hover text-fg-muted rounded-sm tabular-nums">
                        {t.dauer_minuten} Min
                      </span>
                      {(t.taetigkeit_namen || []).slice(0, 3).map(n => (
                        <span key={n} className="text-[10px] px-1.5 py-0.5 bg-hover text-fg-muted rounded-sm">{n}</span>
                      ))}
                      {(t.erinnerungen || []).length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-hover text-warn rounded-sm tabular-nums">
                          {t.erinnerungen.length} Erinnerung{t.erinnerungen.length !== 1 ? 'en' : ''}
                        </span>
                      )}
                    </div>
                  </button>
                  {canEdit && (
                    <button onClick={() => remove(t)} aria-label={`Vorlage "${t.name}" löschen`}
                      className="p-1.5 text-fg-subtle hover:text-bad">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Editor */}
          {editing ? (
            <div className="bg-surface rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-fg">
                  {editing.id ? 'Vorlage bearbeiten' : 'Neue Vorlage'}
                </h2>
                <button onClick={() => setEditing(null)} aria-label="Schließen"
                  className="text-fg-subtle hover:text-fg"><X className="w-5 h-5" /></button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-fg-muted mb-1">Vorlagen-Name *</label>
                  <input value={editing.name}
                    onChange={(e) => setEditing(s => ({ ...s, name: e.target.value }))}
                    className="w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-muted mb-1">Dauer (Min)</label>
                  <input type="number" value={editing.dauer_minuten}
                    onChange={(e) => setEditing(s => ({ ...s, dauer_minuten: e.target.value }))}
                    className="w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-muted mb-1">Vorlagen-Beschreibung (intern)</label>
                <textarea rows={2} value={editing.beschreibung}
                  onChange={(e) => setEditing(s => ({ ...s, beschreibung: e.target.value }))}
                  className="w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg text-sm" />
              </div>

              <hr className="border-line-subtle" />

              <p className="text-xs text-fg-subtle">Werte für neu angelegte Veranstaltungen:</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-fg-muted mb-1">Titel-Vorlage</label>
                  <input value={editing.titel_vorlage}
                    onChange={(e) => setEditing(s => ({ ...s, titel_vorlage: e.target.value }))}
                    placeholder="z.B. Schulkonzert {datum}"
                    className="w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-muted mb-1">Ort-Vorlage</label>
                  <input value={editing.ort_vorlage}
                    onChange={(e) => setEditing(s => ({ ...s, ort_vorlage: e.target.value }))}
                    className="w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-muted mb-1">Beschreibung-Vorlage</label>
                <textarea rows={3} value={editing.beschreibung_vorlage}
                  onChange={(e) => setEditing(s => ({ ...s, beschreibung_vorlage: e.target.value }))}
                  className="w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg text-sm font-mono" />
              </div>

              {/* Tätigkeiten */}
              <div>
                <label className="block text-sm font-medium text-fg-muted mb-1 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" /> Tätigkeiten (für Zuweisungen)
                </label>
                <div className="flex flex-wrap gap-1.5 bg-raised rounded-md p-2 max-h-32 overflow-y-auto">
                  {taetigkeiten.length === 0 && <span className="text-xs text-fg-subtle">Keine Tätigkeiten vorhanden</span>}
                  {taetigkeiten.map(t => {
                    const on = (editing.taetigkeit_ids || []).includes(t.id);
                    return (
                      <button key={t.id} onClick={() => toggleSet('taetigkeit_ids', t.id)}
                        className={`px-2 py-1 rounded-sm text-xs ${
                          on ? 'bg-hover text-fg border border-accent'
                             : 'bg-hover text-fg-muted border border-line'
                        }`}>
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Kompetenzen */}
              <div>
                <label className="block text-sm font-medium text-fg-muted mb-1 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" /> Erforderliche Kompetenzen
                </label>
                <div className="flex flex-wrap gap-1.5 bg-raised rounded-md p-2 max-h-32 overflow-y-auto">
                  {kompetenzen.length === 0 && <span className="text-xs text-fg-subtle">Keine Kompetenzen verfügbar</span>}
                  {kompetenzen.map(k => {
                    const on = (editing.erforderliche_kompetenzen_ids || []).includes(k.id);
                    return (
                      <button key={k.id} onClick={() => toggleSet('erforderliche_kompetenzen_ids', k.id)}
                        className={`px-2 py-1 rounded-sm text-xs ${
                          on ? 'bg-hover text-fg border border-accent'
                             : 'bg-hover text-fg-muted border border-line'
                        }`}>
                        {k.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Erinnerungen */}
              <div>
                <label className="block text-sm font-medium text-fg-muted mb-1 flex items-center gap-1">
                  <Bell className="w-3.5 h-3.5" /> Erinnerungen (vor Beginn)
                </label>
                <div className="space-y-1">
                  {(editing.erinnerungen || []).map((er, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="number" min="1" value={er.zeit_vorher}
                        onChange={(e) => setEditing(s => ({
                          ...s, erinnerungen: s.erinnerungen.map((x, j) => j === i ? { ...x, zeit_vorher: parseInt(e.target.value) || 1 } : x),
                        }))}
                        className="w-20 bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-2 py-1 text-fg text-sm" />
                      <select value={er.einheit}
                        onChange={(e) => setEditing(s => ({
                          ...s, erinnerungen: s.erinnerungen.map((x, j) => j === i ? { ...x, einheit: e.target.value } : x),
                        }))}
                        className="bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-2 py-1 text-fg text-sm">
                        {EINHEITEN.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}
                      </select>
                      <span className="text-xs text-fg-subtle">vorher</span>
                      <button onClick={() => setEditing(s => ({
                        ...s, erinnerungen: s.erinnerungen.filter((_, j) => j !== i),
                      }))} aria-label="Erinnerung entfernen" className="ml-auto text-fg-subtle hover:text-bad">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setEditing(s => ({
                    ...s, erinnerungen: [...(s.erinnerungen || []), { zeit_vorher: 1, einheit: 'tage' }],
                  }))} className="text-xs text-accent-fg hover:opacity-80 inline-flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Erinnerung
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-line-subtle">
                <Button variant="secondary" onClick={() => setEditing(null)}>Abbrechen</Button>
                <Button variant="primary" onClick={save} disabled={saving}
                  icon={saving ? undefined : Save}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Speichern
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-surface rounded-lg">
              <EmptyState icon={FileText}
                title={canEdit ? 'Keine Vorlage ausgewählt' : 'Keine Bearbeitungs-Rechte'}
                description={canEdit
                  ? 'Wähle links eine Vorlage aus oder lege oben rechts eine neue an.'
                  : 'Du kannst Vorlagen ansehen, aber nicht bearbeiten.'} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
