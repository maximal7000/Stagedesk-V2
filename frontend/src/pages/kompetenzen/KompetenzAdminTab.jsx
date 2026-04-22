/**
 * Katalog-Verwaltung: Kategorien, Gruppen, Kompetenzen CRUD.
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Save, Loader2, Clock, Zap } from 'lucide-react';
import apiClient from '../../lib/api';

const FALLBACK_ABLAUF = [30, 30, 60, 120, 240];

export default function KompetenzAdminTab({ kategorien, onReload }) {
  const [kompetenzen, setKompetenzen] = useState([]);
  const [gruppen, setGruppen] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // {type, data} | null
  const [filterKat, setFilterKat] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k, g, s] = await Promise.all([
        apiClient.get('/kompetenzen/alle'),
        apiClient.get('/kompetenzen/gruppen'),
        apiClient.get('/kompetenzen/settings'),
      ]);
      setKompetenzen(k.data);
      setGruppen(g.data);
      setSettings(s.data);
    } catch (e) { toast.error('Laden fehlgeschlagen'); }
    setLoading(false);
  }, []);

  const effektivStufen = settings?.effektiv || FALLBACK_ABLAUF;

  useEffect(() => { load(); }, [load]);

  const deleteItem = async (type, id) => {
    if (!confirm('Wirklich löschen?')) return;
    try {
      await apiClient.delete(`/kompetenzen/${type}/${id}`);
      toast.success('Gelöscht');
      load();
      onReload?.();
    } catch (e) { toast.error('Fehler'); }
  };

  const saveEdit = async () => {
    const { type, data } = editing;
    try {
      if (type === 'kompetenz' && data.id) {
        await apiClient.put(`/kompetenzen/${data.id}`, data);
      } else if (type === 'kompetenz') {
        await apiClient.post('/kompetenzen', data);
      } else if (type === 'kategorie' && data.id) {
        await apiClient.put(`/kompetenzen/kategorien/${data.id}`, data);
      } else if (type === 'kategorie') {
        await apiClient.post('/kompetenzen/kategorien', data);
      } else if (type === 'gruppe' && data.id) {
        await apiClient.put(`/kompetenzen/gruppen/${data.id}`, data);
      } else if (type === 'gruppe') {
        await apiClient.post('/kompetenzen/gruppen', data);
      }
      toast.success('Gespeichert');
      setEditing(null);
      load();
      onReload?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Fehler');
    }
  };

  if (loading) return <Loader2 className="w-6 h-6 animate-spin mx-auto" />;

  const gefiltert = filterKat ? kompetenzen.filter(k => k.kategorie_id === Number(filterKat)) : kompetenzen;

  return (
    <div className="space-y-6">
      {/* Globale Settings */}
      <StandardStufenSection
        settings={settings}
        onSaved={load}
      />

      {/* Kategorien */}
      <Section
        title="Kategorien"
        onAdd={() => setEditing({ type: 'kategorie', data: { name: '', icon: '', farbe: 'blue', sortierung: 0 } })}
      >
        <div className="grid gap-2">
          {kategorien.map(k => (
            <Row key={k.id}
                 title={k.name}
                 subtitle={k.farbe || 'Keine Farbe'}
                 onEdit={() => setEditing({ type: 'kategorie', data: { ...k } })}
                 onDelete={() => deleteItem('kategorien', k.id)}
            />
          ))}
        </div>
      </Section>

      {/* Gruppen */}
      <Section
        title="Gruppen"
        onAdd={() => setEditing({ type: 'gruppe', data: { name: '', kategorie_id: kategorien[0]?.id, sortierung: 0 } })}
      >
        <div className="grid gap-2">
          {gruppen.map(g => {
            const kat = kategorien.find(k => k.id === g.kategorie_id);
            return (
              <Row key={g.id}
                   title={g.name}
                   subtitle={kat?.name || ''}
                   onEdit={() => setEditing({ type: 'gruppe', data: { ...g } })}
                   onDelete={() => deleteItem('gruppen', g.id)}
              />
            );
          })}
        </div>
      </Section>

      {/* Kompetenzen */}
      <Section
        title={`Kompetenzen (${gefiltert.length})`}
        onAdd={() => setEditing({
          type: 'kompetenz',
          data: { name: '', kategorie_id: kategorien[0]?.id, gruppe_id: null, punkte: 1,
                  ablauf_stufen: [], aktiv: true, sortierung: 0, beschreibung: '' }
        })}
        extra={
          <select value={filterKat} onChange={(e) => setFilterKat(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white">
            <option value="">Alle Kategorien</option>
            {kategorien.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        }
      >
        <div className="grid gap-1">
          {gefiltert.map(k => (
            <Row key={k.id}
                 title={k.name}
                 subtitle={`${k.kategorie_name}${k.gruppe_name ? ' / ' + k.gruppe_name : ''} · ${k.punkte}P`}
                 dim={!k.aktiv}
                 onEdit={() => setEditing({ type: 'kompetenz', data: { ...k } })}
                 onDelete={() => deleteItem('', k.id)}
            />
          ))}
        </div>
      </Section>

      {editing && (
        <EditModal
          editing={editing}
          setEditing={setEditing}
          kategorien={kategorien}
          gruppen={gruppen}
          onSave={saveEdit}
        />
      )}
    </div>
  );
}

function Section({ title, onAdd, children, extra }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-semibold text-white">{title}</h3>
        <div className="flex-1" />
        {extra}
        <button onClick={onAdd} className="flex items-center gap-1 text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-500">
          <Plus className="w-4 h-4" /> Neu
        </button>
      </div>
      {children}
    </div>
  );
}

function Row({ title, subtitle, onEdit, onDelete, dim }) {
  return (
    <div className={`flex items-center gap-3 p-2 bg-gray-800/60 rounded ${dim ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">{title}</div>
        <div className="text-xs text-gray-500 truncate">{subtitle}</div>
      </div>
      <button onClick={onEdit} className="p-2 text-gray-400 hover:text-white"><Pencil className="w-4 h-4" /></button>
      <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

function EditModal({ editing, setEditing, kategorien, gruppen, onSave }) {
  const { type, data } = editing;
  const updateField = (f, v) => setEditing({ ...editing, data: { ...data, [f]: v } });
  const filteredGruppen = gruppen.filter(g => g.kategorie_id === data.kategorie_id);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-lg max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            {data.id ? 'Bearbeiten' : 'Neu'}: {type}
          </h3>
          <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Name">
            <input value={data.name || ''} onChange={(e) => updateField('name', e.target.value)}
                   className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" />
          </Field>

          {type === 'kategorie' && (
            <>
              <Field label="Farbe">
                <select value={data.farbe || 'blue'} onChange={(e) => updateField('farbe', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white">
                  <option value="blue">Blau</option>
                  <option value="yellow">Gelb</option>
                  <option value="purple">Lila</option>
                  <option value="gray">Grau</option>
                  <option value="green">Grün</option>
                </select>
              </Field>
              <Field label="Icon (Lucide-Name)">
                <input value={data.icon || ''} onChange={(e) => updateField('icon', e.target.value)}
                       className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" />
              </Field>
            </>
          )}

          {(type === 'gruppe' || type === 'kompetenz') && (
            <Field label="Kategorie">
              <select value={data.kategorie_id || ''} onChange={(e) => updateField('kategorie_id', Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white">
                {kategorien.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </Field>
          )}

          {type === 'kompetenz' && (
            <>
              <Field label="Gruppe (optional)">
                <select value={data.gruppe_id || ''}
                        onChange={(e) => updateField('gruppe_id', e.target.value ? Number(e.target.value) : null)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white">
                  <option value="">— keine —</option>
                  {filteredGruppen.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
              <Field label="Punkte">
                <input type="number" value={data.punkte || 1}
                       onChange={(e) => updateField('punkte', Number(e.target.value))}
                       className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" />
              </Field>
              <Field label="Ablauf-Stufen in Tagen (leer = globaler Standard, 0 = unbegrenzt)">
                <div className="flex gap-2">
                  <input
                    value={(data.ablauf_stufen || []).join(', ')}
                    onChange={(e) => updateField('ablauf_stufen',
                      e.target.value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0))}
                    placeholder={FALLBACK_ABLAUF.join(', ')}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                  />
                  <button type="button" onClick={() => updateField('ablauf_stufen', [0])}
                          className="px-3 py-2 bg-green-700 text-white rounded hover:bg-green-600 text-sm"
                          title="Nie ablaufend">
                    ∞ Unbegrenzt
                  </button>
                </div>
                {(data.ablauf_stufen || []).length > 0 && (data.ablauf_stufen || []).every(n => n === 0) && (
                  <p className="text-xs text-green-400 mt-1">Läuft nie ab</p>
                )}
              </Field>
              <Field label="Beschreibung">
                <textarea value={data.beschreibung || ''} onChange={(e) => updateField('beschreibung', e.target.value)}
                          rows={2}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" />
              </Field>
              <label className="flex items-center gap-2 text-white">
                <input type="checkbox" checked={!!data.aktiv} onChange={(e) => updateField('aktiv', e.target.checked)} />
                Aktiv
              </label>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setEditing(null)} className="px-4 py-2 text-gray-400 hover:text-white">
            Abbrechen
          </button>
          <button onClick={onSave} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
            <Save className="w-4 h-4" /> Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function StandardStufenSection({ settings, onSaved }) {
  const [stufen, setStufen] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setStufen((settings.standard_ablauf_stufen || []).join(', '));
    }
  }, [settings]);

  const parseStufen = () => stufen
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n >= 0);

  const saveDefault = async () => {
    setSaving(true);
    try {
      await apiClient.put('/kompetenzen/settings', { standard_ablauf_stufen: parseStufen() });
      toast.success('Standard-Stufen gespeichert');
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const applyToAll = async (overwrite) => {
    const liste = parseStufen();
    if (!liste.length) {
      toast.error('Erst gültige Stufen eingeben');
      return;
    }
    const msg = overwrite
      ? `ALLE Kompetenzen überschreiben mit: ${liste.join(', ')} Tagen?`
      : `Nur Kompetenzen ohne eigene Stufen auf ${liste.join(', ')} Tage setzen?`;
    if (!confirm(msg)) return;
    setSaving(true);
    try {
      const r = await apiClient.post('/kompetenzen/settings/apply-all', {
        ablauf_stufen: liste,
        overwrite,
      });
      toast.success(`${r.data.aktualisiert} Kompetenzen aktualisiert`);
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Fehler');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (arr) => (arr?.length && arr.every(n => n === 0)) ? '∞ unbegrenzt' : (arr?.join(', ') || '');
  const systemDefault = fmt(settings?.system_default);
  const effektiv = fmt(settings?.effektiv);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-blue-400" />
        <h3 className="font-semibold text-white">Standard Ablauf-Stufen</h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Globaler Default für Kompetenzen ohne eigene Stufen. System-Fallback: <span className="text-gray-400">{systemDefault}</span>.
        Aktuell effektiv: <span className="text-gray-300">{effektiv}</span>.
      </p>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">Tage (kommagetrennt, leer = System-Default, 0 = unbegrenzt)</label>
          <input
            value={stufen}
            onChange={(e) => setStufen(e.target.value)}
            placeholder={systemDefault}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
          />
        </div>
        <button onClick={() => setStufen('0')} type="button"
                className="px-3 py-2 bg-green-700 text-white rounded hover:bg-green-600 text-sm"
                title="Nie ablaufend">
          ∞
        </button>
        <button onClick={saveDefault} disabled={saving}
                className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50">
          <Save className="w-4 h-4" /> Speichern
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => applyToAll(false)} disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-800 text-gray-300 rounded hover:bg-gray-700 disabled:opacity-50">
          <Zap className="w-3.5 h-3.5" /> Auf Kompetenzen ohne eigene Stufen anwenden
        </button>
        <button onClick={() => applyToAll(true)} disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 disabled:opacity-50">
          <Zap className="w-3.5 h-3.5" /> Auf ALLE anwenden (überschreibt)
        </button>
      </div>
    </div>
  );
}
