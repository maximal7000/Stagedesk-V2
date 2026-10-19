/**
 * Katalog-Verwaltung: Kategorien, Gruppen, Kompetenzen CRUD.
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Save, Loader2, Clock, Zap, Infinity } from 'lucide-react';
import apiClient from '../../lib/api';
import { Button } from '../../components/ui';

const FALLBACK_ABLAUF = [30, 30, 60, 120, 240];
const TYPE_LABELS = { kategorie: 'Kategorie', gruppe: 'Gruppe', kompetenz: 'Kompetenz' };

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

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-fg-subtle" /></div>;
  }

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
        count={kategorien.length}
        addLabel="Kategorie"
        onAdd={() => setEditing({ type: 'kategorie', data: { name: '', icon: '', farbe: 'blue', sortierung: 0 } })}
      >
        <div className="grid gap-0.5">
          {kategorien.map(k => (
            <Row key={k.id}
                 title={k.name}
                 subtitle={FARBE_LABEL[k.farbe] || k.farbe || 'Keine Farbe'}
                 swatch={FARBE_SWATCH[k.farbe]}
                 onEdit={() => setEditing({ type: 'kategorie', data: { ...k } })}
                 onDelete={() => deleteItem('kategorien', k.id)}
            />
          ))}
        </div>
      </Section>

      {/* Gruppen */}
      <Section
        title="Gruppen"
        count={gruppen.length}
        addLabel="Gruppe"
        onAdd={() => setEditing({ type: 'gruppe', data: { name: '', kategorie_id: kategorien[0]?.id, sortierung: 0 } })}
      >
        <div className="grid gap-0.5">
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
        title="Kompetenzen"
        count={gefiltert.length}
        addLabel="Kompetenz"
        onAdd={() => setEditing({
          type: 'kompetenz',
          data: { name: '', kategorie_id: kategorien[0]?.id, gruppe_id: null, punkte: 1,
                  ablauf_stufen: [], aktiv: true, sortierung: 0, beschreibung: '' }
        })}
        extra={
          <select value={filterKat} onChange={(e) => setFilterKat(e.target.value)}
                  className="px-2.5 py-1.5 text-sm bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none">
            <option value="">Alle Kategorien</option>
            {kategorien.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        }
      >
        <div className="grid gap-0.5">
          {gefiltert.map(k => (
            <Row key={k.id}
                 title={k.name}
                 subtitle={`${k.kategorie_name}${k.gruppe_name ? ' / ' + k.gruppe_name : ''} · ${k.punkte} P`}
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

// Kategorie-Farben (Katalogdaten) als kleine Farbmarke
const FARBE_SWATCH = {
  blue: 'bg-blue-500', yellow: 'bg-amber-500', purple: 'bg-purple-500', gray: 'bg-[#6b7280]', green: 'bg-green-500',
};
const FARBE_LABEL = { blue: 'Blau', yellow: 'Gelb', purple: 'Lila', gray: 'Grau', green: 'Grün' };

function Section({ title, count, onAdd, addLabel = 'Neu', children, extra }) {
  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3.5 flex-wrap">
        <h3 className="font-display text-lg font-semibold tracking-tight text-fg leading-none">{title}</h3>
        {count !== undefined && <span className="text-sm tabular-nums text-fg-subtle">{count}</span>}
        <div className="flex-1" />
        {extra}
        <Button variant="secondary" size="sm" icon={Plus} onClick={onAdd}>{addLabel}</Button>
      </div>
      {children}
    </div>
  );
}

function Row({ title, subtitle, swatch, onEdit, onDelete, dim }) {
  return (
    <div className={`group flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-raised transition-colors ${dim ? 'opacity-50' : ''}`}>
      {swatch && <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${swatch}`} aria-hidden="true" />}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-fg truncate">{title}{dim && <span className="ml-2 text-xs text-fg-subtle">inaktiv</span>}</div>
        <div className="text-xs text-fg-subtle truncate tabular-nums">{subtitle}</div>
      </div>
      <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit} title="Bearbeiten" aria-label={`${title} bearbeiten`} />
      <Button variant="ghost" size="sm" icon={Trash2} onClick={onDelete} title="Löschen" aria-label={`${title} löschen`} />
    </div>
  );
}

function EditModal({ editing, setEditing, kategorien, gruppen, onSave }) {
  const { type, data } = editing;
  const updateField = (f, v) => setEditing({ ...editing, data: { ...data, [f]: v } });
  const filteredGruppen = gruppen.filter(g => g.kategorie_id === data.kategorie_id);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" className="bg-overlay border border-line rounded-lg shadow-overlay max-w-lg w-full p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl font-semibold tracking-tight text-fg">
            {TYPE_LABELS[type] || type} {data.id ? 'bearbeiten' : 'anlegen'}
          </h3>
          <Button variant="ghost" size="sm" icon={X} onClick={() => setEditing(null)}
                  title="Schließen" aria-label="Schließen" />
        </div>

        <div className="space-y-3">
          <Field label="Name">
            <input value={data.name || ''} onChange={(e) => updateField('name', e.target.value)}
                   className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none" />
          </Field>

          {type === 'kategorie' && (
            <>
              <Field label="Farbe">
                <select value={data.farbe || 'blue'} onChange={(e) => updateField('farbe', e.target.value)}
                        className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none">
                  <option value="blue">Blau</option>
                  <option value="yellow">Gelb</option>
                  <option value="purple">Lila</option>
                  <option value="gray">Grau</option>
                  <option value="green">Grün</option>
                </select>
              </Field>
              <Field label="Icon (Lucide-Name)">
                <input value={data.icon || ''} onChange={(e) => updateField('icon', e.target.value)}
                       className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none" />
              </Field>
            </>
          )}

          {(type === 'gruppe' || type === 'kompetenz') && (
            <Field label="Kategorie">
              <select value={data.kategorie_id || ''} onChange={(e) => updateField('kategorie_id', Number(e.target.value))}
                      className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none">
                {kategorien.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </Field>
          )}

          {type === 'kompetenz' && (
            <>
              <Field label="Gruppe (optional)">
                <select value={data.gruppe_id || ''}
                        onChange={(e) => updateField('gruppe_id', e.target.value ? Number(e.target.value) : null)}
                        className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none">
                  <option value="">Keine Gruppe</option>
                  {filteredGruppen.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
              <Field label="Punkte">
                <input type="number" value={data.punkte || 1}
                       onChange={(e) => updateField('punkte', Number(e.target.value))}
                       className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none" />
              </Field>
              <Field label="Ablaufstufen in Tagen (leer = Standard, 0 = läuft nicht ab)">
                <div className="flex gap-2">
                  <input
                    value={(data.ablauf_stufen || []).join(', ')}
                    onChange={(e) => updateField('ablauf_stufen',
                      e.target.value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0))}
                    placeholder={FALLBACK_ABLAUF.join(', ')}
                    className="flex-1 px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                  <button type="button" onClick={() => updateField('ablauf_stufen', [0])}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-raised text-ok rounded-md hover:bg-hover text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          title="Läuft nie ab">
                    <Infinity className="w-4 h-4" /> Unbegrenzt
                  </button>
                </div>
                {(data.ablauf_stufen || []).length > 0 && (data.ablauf_stufen || []).every(n => n === 0) && (
                  <p className="text-xs text-ok mt-1">Läuft nie ab</p>
                )}
              </Field>
              <Field label="Beschreibung">
                <textarea value={data.beschreibung || ''} onChange={(e) => updateField('beschreibung', e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none" />
              </Field>
              <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
                <input type="checkbox" checked={!!data.aktiv} onChange={(e) => updateField('aktiv', e.target.checked)}
                       className="w-4 h-4 rounded cursor-pointer accent-accent focus-visible:ring-2 focus-visible:ring-accent" />
                Aktiv
              </label>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-line-subtle">
          <Button variant="ghost" onClick={() => setEditing(null)}>Abbrechen</Button>
          <Button variant="primary" icon={Save} onClick={onSave}>Speichern</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-fg-muted mb-1">{label}</label>
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

  const fmt = (arr) => (arr?.length && arr.every(n => n === 0)) ? 'läuft nicht ab' : (arr?.join(', ') || '');
  const systemDefault = fmt(settings?.system_default);
  const effektiv = fmt(settings?.effektiv);

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Clock className="w-4 h-4 text-fg-subtle" />
        <h3 className="font-display text-lg font-semibold tracking-tight text-fg leading-none">Standard-Ablaufstufen</h3>
      </div>
      <p className="text-sm text-fg-muted mb-4">
        Gilt für Kompetenzen ohne eigene Stufen. Aktuell: <span className="text-fg font-medium tabular-nums">{effektiv || '–'}</span>
        <span className="text-fg-subtle"> · System-Standard {systemDefault}</span>
      </p>
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-sm font-medium text-fg-muted mb-1">Tage, kommagetrennt (leer = System-Standard, 0 = läuft nicht ab)</label>
          <input
            value={stufen}
            onChange={(e) => setStufen(e.target.value)}
            placeholder={systemDefault}
            className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
          />
        </div>
        <button onClick={() => setStufen('0')} type="button"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-raised text-ok rounded-md hover:bg-hover text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                title="Läuft nie ab" aria-label="Unbegrenzt setzen">
          <Infinity className="w-4 h-4" />
        </button>
        <Button variant="primary" icon={Save} disabled={saving} onClick={saveDefault}>Speichern</Button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button variant="secondary" size="sm" icon={Zap} disabled={saving} onClick={() => applyToAll(false)}>
          Auf Kompetenzen ohne eigene Stufen anwenden
        </Button>
        <Button variant="danger" size="sm" icon={Zap} disabled={saving} onClick={() => applyToAll(true)}>
          Auf alle anwenden und überschreiben
        </Button>
      </div>
    </div>
  );
}
