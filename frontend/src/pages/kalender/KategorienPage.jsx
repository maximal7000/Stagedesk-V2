/**
 * Event-Kategorien Verwaltung
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Save, Loader2, Tags, GripVertical } from 'lucide-react';
import apiClient from '../../lib/api';
import { PageHeader, Button, EmptyState } from '../../components/ui';

const FARBEN = [
  '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444',
  '#06B6D4', '#EC4899', '#6B7280', '#84CC16', '#F97316',
  '#14B8A6', '#A855F7', '#F43F5E', '#22D3EE', '#FACC15',
];

const ICONS = [
  'calendar', 'music', 'mic', 'video', 'camera', 'monitor',
  'users', 'briefcase', 'star', 'heart', 'flag', 'zap',
  'award', 'target', 'coffee', 'truck', 'home', 'building',
];

export default function KategorienPage() {
  const [kategorien, setKategorien] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Editing
  const [editingId, setEditingId] = useState(null);
  const [editingData, setEditingData] = useState({});
  const [savingId, setSavingId] = useState(null);

  // Neue Kategorie
  const [showNew, setShowNew] = useState(false);
  const [newData, setNewData] = useState({
    name: '',
    farbe: '#3B82F6',
    icon: 'calendar',
    beschreibung: '',
    sortierung: 0,
  });

  const fetchKategorien = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/kalender/kategorien');
      setKategorien(response.data);
    } catch (err) {
      setError('Kategorien konnten nicht geladen werden.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKategorien();
  }, [fetchKategorien]);

  const handleCreate = async () => {
    setSavingId('new');
    try {
      await apiClient.post('/kalender/kategorien', newData);
      setShowNew(false);
      setNewData({
        name: '',
        farbe: '#3B82F6',
        icon: 'calendar',
        beschreibung: '',
        sortierung: kategorien.length,
      });
      fetchKategorien();
    } catch (err) {
      alert('Erstellen fehlgeschlagen');
    } finally {
      setSavingId(null);
    }
  };

  const handleUpdate = async (id) => {
    setSavingId(id);
    try {
      await apiClient.put(`/kalender/kategorien/${id}`, editingData);
      setEditingId(null);
      fetchKategorien();
    } catch (err) {
      alert('Speichern fehlgeschlagen');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Kategorie wirklich löschen? Events mit dieser Kategorie verlieren ihre Zuordnung.')) return;
    try {
      await apiClient.delete(`/kalender/kategorien/${id}`);
      fetchKategorien();
    } catch (err) {
      alert('Löschen fehlgeschlagen');
    }
  };

  const startEditing = (kategorie) => {
    setEditingId(kategorie.id);
    setEditingData({
      name: kategorie.name,
      farbe: kategorie.farbe,
      icon: kategorie.icon,
      beschreibung: kategorie.beschreibung,
      sortierung: kategorie.sortierung,
    });
  };

  // Form Component
  const KategorieForm = ({ data, setData, onSave, onCancel, isSaving, isNew }) => (
    <div className="space-y-4 p-4">
      {/* Name */}
      <div>
        <label className="mb-1 block text-sm text-gray-400">Name *</label>
        <input
          type="text"
          value={data.name}
          onChange={(e) => setData({ ...data, name: e.target.value })}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white transition-colors focus:border-accent focus:outline-none"
          placeholder="z. B. Shows"
        />
      </div>

      {/* Farbe */}
      <div>
        <label className="mb-1.5 block text-sm text-gray-400">Farbe</label>
        <div className="flex flex-wrap gap-2">
          {FARBEN.map(farbe => (
            <button
              key={farbe}
              type="button"
              onClick={() => setData({ ...data, farbe })}
              aria-label={`Farbe ${farbe}`}
              className={`h-8 w-8 rounded-lg transition-transform ${
                data.farbe === farbe ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-gray-900' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: farbe }}
            />
          ))}
        </div>
      </div>

      {/* Beschreibung */}
      <div>
        <label className="mb-1 block text-sm text-gray-400">Beschreibung</label>
        <textarea
          value={data.beschreibung}
          onChange={(e) => setData({ ...data, beschreibung: e.target.value })}
          rows={2}
          className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white transition-colors focus:border-accent focus:outline-none"
          placeholder="Optionaler Hinweis zur Kategorie"
        />
      </div>

      {/* Sortierung */}
      <div>
        <label className="mb-1 block text-sm text-gray-400">Sortierung</label>
        <input
          type="number"
          value={data.sortierung}
          onChange={(e) => setData({ ...data, sortierung: parseInt(e.target.value) || 0 })}
          className="w-20 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white transition-colors focus:border-accent focus:outline-none"
        />
      </div>

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
        title="Kategorien"
        meta={loading ? undefined : `${kategorien.length} ${kategorien.length === 1 ? 'Kategorie' : 'Kategorien'}`}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setShowNew(true)}>
            Neue Kategorie
          </Button>
        }
      />

      {/* Neue Kategorie Form */}
      {showNew && (
        <div className="rounded-xl border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 p-4">
            <h3 className="text-lg font-semibold text-white">Neue Kategorie</h3>
          </div>
          <KategorieForm
            data={newData}
            setData={setNewData}
            onSave={handleCreate}
            onCancel={() => setShowNew(false)}
            isSaving={savingId === 'new'}
            isNew
          />
        </div>
      )}

      {/* Kategorien Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-gray-500" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-8 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      ) : kategorien.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900">
          <EmptyState
            icon={Tags}
            title="Noch keine Kategorien"
            description="Kategorien ordnen Termine im Kalender und geben ihnen Farbe."
            action={<Button variant="primary" icon={Plus} onClick={() => setShowNew(true)}>Erste Kategorie erstellen</Button>}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          {kategorien.map((kategorie) => {
            const isEditing = editingId === kategorie.id;

            if (isEditing) {
              return (
                <div key={kategorie.id} className="border-b border-gray-800 bg-gray-800/30 last:border-b-0">
                  <KategorieForm
                    data={editingData}
                    setData={setEditingData}
                    onSave={() => handleUpdate(kategorie.id)}
                    onCancel={() => setEditingId(null)}
                    isSaving={savingId === kategorie.id}
                  />
                </div>
              );
            }

            return (
              <div
                key={kategorie.id}
                className="group flex items-center justify-between border-b border-gray-800 p-4 transition-colors last:border-b-0 hover:bg-gray-800/30"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-600" />
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-display text-lg font-bold text-white"
                    style={{ backgroundColor: kategorie.farbe }}
                  >
                    {kategorie.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-white">{kategorie.name}</h3>
                    {kategorie.beschreibung && (
                      <p className="truncate text-sm text-gray-500">{kategorie.beschreibung}</p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <span className="mr-1 text-xs tabular-nums text-gray-500">#{kategorie.sortierung}</span>
                  <button
                    onClick={() => startEditing(kategorie)}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                    aria-label="Bearbeiten"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(kategorie.id)}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-red-400"
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

      {/* Info Box */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h4 className="mb-1 text-sm font-semibold text-white">So helfen Kategorien</h4>
        <p className="text-sm text-gray-400">
          Jede Kategorie gibt ihren Terminen im Kalender eine feste Farbe, sodass sich Shows,
          Proben, Meetings und Wartung auf einen Blick unterscheiden lassen.
        </p>
      </div>
    </div>
  );
}
