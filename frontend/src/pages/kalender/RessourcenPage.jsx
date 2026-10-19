/**
 * Ressourcen-Verwaltung
 * Equipment, Räume, Personal, Fahrzeuge
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit, Trash2, Save, Loader2,
  Package, Building, Users, Truck, HelpCircle,
  Euro
} from 'lucide-react';
import apiClient from '../../lib/api';
import { PageHeader, Button, StatusBadge, EmptyState } from '../../components/ui';

const RESSOURCE_TYPEN = [
  { value: 'equipment', label: 'Equipment', icon: Package, color: 'text-blue-400' },
  { value: 'raum', label: 'Raum/Location', icon: Building, color: 'text-green-400' },
  { value: 'personal', label: 'Personal/Crew', icon: Users, color: 'text-purple-400' },
  { value: 'fahrzeug', label: 'Fahrzeug', icon: Truck, color: 'text-orange-400' },
  { value: 'sonstiges', label: 'Sonstiges', icon: HelpCircle, color: 'text-fg-subtle' },
];

const FARBEN = [
  '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444',
  '#06B6D4', '#EC4899', '#6B7280', '#84CC16', '#F97316',
];

export default function RessourcenPage() {
  const [ressourcen, setRessourcen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter
  const [filterTyp, setFilterTyp] = useState(null);

  // Editing
  const [editingId, setEditingId] = useState(null);
  const [editingData, setEditingData] = useState({});
  const [savingId, setSavingId] = useState(null);

  // Neue Ressource
  const [showNew, setShowNew] = useState(false);
  const [newData, setNewData] = useState({
    name: '',
    typ: 'equipment',
    beschreibung: '',
    farbe: '#3B82F6',
    ist_verfuegbar: true,
    max_gleichzeitig: 1,
    kosten_pro_tag: '',
    kosten_pro_stunde: '',
    notizen: '',
  });

  const fetchRessourcen = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterTyp ? `?typ=${filterTyp}` : '';
      const response = await apiClient.get(`/kalender/ressourcen${params}`);
      setRessourcen(response.data);
    } catch (err) {
      setError('Ressourcen konnten nicht geladen werden.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterTyp]);

  useEffect(() => {
    fetchRessourcen();
  }, [fetchRessourcen]);

  const handleCreate = async () => {
    setSavingId('new');
    try {
      await apiClient.post('/kalender/ressourcen', {
        ...newData,
        kosten_pro_tag: parseFloat(newData.kosten_pro_tag) || 0,
        kosten_pro_stunde: parseFloat(newData.kosten_pro_stunde) || 0,
      });
      setShowNew(false);
      setNewData({
        name: '',
        typ: 'equipment',
        beschreibung: '',
        farbe: '#3B82F6',
        ist_verfuegbar: true,
        max_gleichzeitig: 1,
        kosten_pro_tag: '',
        kosten_pro_stunde: '',
        notizen: '',
      });
      fetchRessourcen();
    } catch (err) {
      alert('Erstellen fehlgeschlagen');
    } finally {
      setSavingId(null);
    }
  };

  const handleUpdate = async (id) => {
    setSavingId(id);
    try {
      await apiClient.put(`/kalender/ressourcen/${id}`, {
        ...editingData,
        kosten_pro_tag: parseFloat(editingData.kosten_pro_tag) || 0,
        kosten_pro_stunde: parseFloat(editingData.kosten_pro_stunde) || 0,
      });
      setEditingId(null);
      fetchRessourcen();
    } catch (err) {
      alert('Speichern fehlgeschlagen');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Ressource wirklich löschen?')) return;
    try {
      await apiClient.delete(`/kalender/ressourcen/${id}`);
      fetchRessourcen();
    } catch (err) {
      alert('Löschen fehlgeschlagen');
    }
  };

  const startEditing = (ressource) => {
    setEditingId(ressource.id);
    setEditingData({
      name: ressource.name,
      typ: ressource.typ,
      beschreibung: ressource.beschreibung,
      farbe: ressource.farbe,
      ist_verfuegbar: ressource.ist_verfuegbar,
      max_gleichzeitig: ressource.max_gleichzeitig,
      kosten_pro_tag: ressource.kosten_pro_tag,
      kosten_pro_stunde: ressource.kosten_pro_stunde,
      notizen: ressource.notizen,
    });
  };

  const getTypIcon = (typ) => {
    const found = RESSOURCE_TYPEN.find(t => t.value === typ);
    return found ? found.icon : HelpCircle;
  };

  const getTypColor = (typ) => {
    const found = RESSOURCE_TYPEN.find(t => t.value === typ);
    return found ? found.color : 'text-fg-subtle';
  };

  // Form Component für Ressource
  const RessourceForm = ({ data, setData, onSave, onCancel, isSaving, isNew }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-muted">Name *</label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            className="w-full rounded-md border border-line bg-raised px-3 py-2 text-fg transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="z. B. Beamer, Werkstatt, Transporter"
          />
        </div>

        {/* Typ */}
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-muted">Typ</label>
          <select
            value={data.typ}
            onChange={(e) => setData({ ...data, typ: e.target.value })}
            className="w-full rounded-md border border-line bg-raised px-3 py-2 text-fg transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {RESSOURCE_TYPEN.map(typ => (
              <option key={typ.value} value={typ.value}>{typ.label}</option>
            ))}
          </select>
        </div>

        {/* Farbe */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg-muted">Farbe</label>
          <div className="flex gap-2">
            {FARBEN.map(farbe => (
              <button
                key={farbe}
                type="button"
                onClick={() => setData({ ...data, farbe })}
                aria-label={`Farbe ${farbe}`}
                className={`h-6 w-6 rounded-sm transition-transform ${
                  data.farbe === farbe ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-surface' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: farbe }}
              />
            ))}
          </div>
        </div>

        {/* Max gleichzeitig */}
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-muted">Max. gleichzeitig buchbar</label>
          <input
            type="number"
            value={data.max_gleichzeitig}
            onChange={(e) => setData({ ...data, max_gleichzeitig: parseInt(e.target.value) || 1 })}
            min="1"
            className="w-full rounded-md border border-line bg-raised px-3 py-2 text-fg transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Kosten pro Tag */}
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-muted">Kosten pro Tag (€)</label>
          <input
            type="number"
            value={data.kosten_pro_tag}
            onChange={(e) => setData({ ...data, kosten_pro_tag: e.target.value })}
            min="0"
            step="0.01"
            className="w-full rounded-md border border-line bg-raised px-3 py-2 text-fg transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Kosten pro Stunde */}
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-muted">Kosten pro Stunde (€)</label>
          <input
            type="number"
            value={data.kosten_pro_stunde}
            onChange={(e) => setData({ ...data, kosten_pro_stunde: e.target.value })}
            min="0"
            step="0.01"
            className="w-full rounded-md border border-line bg-raised px-3 py-2 text-fg transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Beschreibung */}
      <div>
        <label className="mb-1 block text-sm font-medium text-fg-muted">Beschreibung</label>
        <textarea
          value={data.beschreibung}
          onChange={(e) => setData({ ...data, beschreibung: e.target.value })}
          rows={2}
          className="w-full resize-none rounded-md border border-line bg-raised px-3 py-2 text-fg transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="Optionaler Hinweis zur Ressource"
        />
      </div>

      {/* Verfügbar */}
      <label className="flex w-fit cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={data.ist_verfuegbar}
          onChange={(e) => setData({ ...data, ist_verfuegbar: e.target.checked })}
          className="h-4 w-4 rounded-sm accent-accent"
        />
        <span className="text-sm text-fg-muted">Verfügbar für Buchungen</span>
      </label>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        <Button
          variant="primary"
          icon={isSaving ? undefined : Save}
          onClick={onSave}
          disabled={isSaving || !data.name}
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          {isNew ? 'Erstellen' : 'Speichern'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        eyebrow="Kalender"
        title="Ressourcen"
        meta={loading ? undefined : `${ressourcen.length} ${ressourcen.length === 1 ? 'Ressource' : 'Ressourcen'}`}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setShowNew(true)}>
            Neue Ressource
          </Button>
        }
      />

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterTyp(null)}
          className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
            !filterTyp ? 'bg-raised text-fg' : 'bg-surface text-fg-muted hover:bg-raised hover:text-fg'
          }`}
        >
          Alle
        </button>
        {RESSOURCE_TYPEN.map(typ => {
          const Icon = typ.icon;
          const active = filterTyp === typ.value;
          return (
            <button
              key={typ.value}
              onClick={() => setFilterTyp(typ.value)}
              className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-raised text-fg' : 'bg-surface text-fg-muted hover:bg-raised hover:text-fg'
              }`}
            >
              <Icon className={`h-4 w-4 ${typ.color}`} />
              {typ.label}
            </button>
          );
        })}
      </div>

      {/* Neue Ressource Form */}
      {showNew && (
        <div className="rounded-lg bg-surface p-4">
          <h3 className="mb-4 text-lg font-semibold text-fg">Neue Ressource</h3>
          <RessourceForm
            data={newData}
            setData={setNewData}
            onSave={handleCreate}
            onCancel={() => setShowNew(false)}
            isSaving={savingId === 'new'}
            isNew
          />
        </div>
      )}

      {/* Ressourcen Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-fg-subtle" />
        </div>
      ) : error ? (
        <div className="rounded-lg bg-surface p-8 text-center">
          <p className="text-bad">{error}</p>
        </div>
      ) : ressourcen.length === 0 ? (
        <div className="rounded-lg bg-surface">
          <EmptyState
            icon={Package}
            title={filterTyp ? 'Keine Ressourcen in diesem Typ' : 'Noch keine Ressourcen'}
            description="Lege Equipment, Räume, Crew und Fahrzeuge an, um sie Terminen zuzuordnen."
            action={<Button variant="primary" icon={Plus} onClick={() => setShowNew(true)}>Erste Ressource erstellen</Button>}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ressourcen.map(ressource => {
            const Icon = getTypIcon(ressource.typ);
            const isEditing = editingId === ressource.id;

            if (isEditing) {
              return (
                <div key={ressource.id} className="rounded-lg bg-surface p-4">
                  <RessourceForm
                    data={editingData}
                    setData={setEditingData}
                    onSave={() => handleUpdate(ressource.id)}
                    onCancel={() => setEditingId(null)}
                    isSaving={savingId === ressource.id}
                  />
                </div>
              );
            }

            return (
              <div
                key={ressource.id}
                className="group flex flex-col rounded-lg bg-surface p-4"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon className={`h-5 w-5 shrink-0 ${getTypColor(ressource.typ)}`} />
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-fg">{ressource.name}</h3>
                      <p className="text-xs text-fg-subtle">{ressource.typ_display}</p>
                    </div>
                  </div>

                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-full ring-2 ring-surface"
                    style={{ backgroundColor: ressource.farbe }}
                  />
                </div>

                {ressource.beschreibung && (
                  <p className="mb-3 line-clamp-2 text-sm text-fg-muted">{ressource.beschreibung}</p>
                )}

                <div className="mb-3 flex flex-wrap gap-2">
                  {ressource.ist_verfuegbar
                    ? <StatusBadge tone="positive" dot label="Verfügbar" />
                    : <StatusBadge tone="danger" dot label="Nicht verfügbar" />}
                  {ressource.max_gleichzeitig > 1 && (
                    <span className="inline-flex items-center rounded-sm bg-raised px-2 py-[3px] text-[11px] font-semibold leading-none tracking-wide text-fg-muted">
                      Max. {ressource.max_gleichzeitig}x
                    </span>
                  )}
                  {(ressource.kosten_pro_tag > 0 || ressource.kosten_pro_stunde > 0) && (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-raised px-2 py-[3px] text-[11px] font-semibold leading-none tracking-wide text-ok">
                      <Euro className="h-3 w-3" />
                      {ressource.kosten_pro_stunde > 0
                        ? `${ressource.kosten_pro_stunde} / h`
                        : `${ressource.kosten_pro_tag} / Tag`
                      }
                    </span>
                  )}
                </div>

                <div className="mt-auto flex justify-end gap-1 border-t border-line-subtle pt-2">
                  <button
                    onClick={() => startEditing(ressource)}
                    className="rounded-sm p-2 text-fg-muted transition-colors hover:bg-raised hover:text-fg"
                    aria-label="Bearbeiten"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(ressource.id)}
                    className="rounded-sm p-2 text-fg-muted transition-colors hover:bg-raised hover:text-bad"
                    aria-label="Löschen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
