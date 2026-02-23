/**
 * Event-Kategorien Verwaltung
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Save, X, Loader2, Tag, GripVertical } from 'lucide-react';
import apiClient from '../../lib/api';

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
    <div className="p-4 space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Name *</label>
        <input
          type="text"
          value={data.name}
          onChange={(e) => setData({ ...data, name: e.target.value })}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          placeholder="Kategoriename"
        />
      </div>

      {/* Farbe */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Farbe</label>
        <div className="flex flex-wrap gap-2">
          {FARBEN.map(farbe => (
            <button
              key={farbe}
              type="button"
              onClick={() => setData({ ...data, farbe })}
              className={`w-8 h-8 rounded-lg transition-transform ${
                data.farbe === farbe ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: farbe }}
            />
          ))}
        </div>
      </div>

      {/* Beschreibung */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Beschreibung</label>
        <textarea
          value={data.beschreibung}
          onChange={(e) => setData({ ...data, beschreibung: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none"
        />
      </div>

      {/* Sortierung */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">Sortierung</label>
        <input
          type="number"
          value={data.sortierung}
          onChange={(e) => setData({ ...data, sortierung: parseInt(e.target.value) || 0 })}
          className="w-20 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-400 hover:text-white rounded-lg"
        >
          Abbrechen
        </button>
        <button
          onClick={onSave}
          disabled={isSaving || !data.name}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isNew ? 'Erstellen' : 'Speichern'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Event-Kategorien</h1>
          <p className="text-gray-400 mt-1">Verwalte Kategorien für deine Events</p>
        </div>

        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
        >
          <Plus className="w-5 h-5" />
          Neue Kategorie
        </button>
      </div>

      {/* Neue Kategorie Form */}
      {showNew && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="p-4 border-b border-gray-800">
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
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-8 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      ) : kategorien.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Tag className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Keine Kategorien vorhanden</p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-4 text-blue-400 hover:text-blue-300"
          >
            Erste Kategorie erstellen
          </button>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {kategorien.map((kategorie, index) => {
            const isEditing = editingId === kategorie.id;

            if (isEditing) {
              return (
                <div key={kategorie.id} className="border-b border-gray-800 bg-gray-800/30">
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
                className="flex items-center justify-between p-4 border-b border-gray-800 last:border-b-0 hover:bg-gray-800/30"
              >
                <div className="flex items-center gap-4">
                  <GripVertical className="w-4 h-4 text-gray-600 cursor-grab" />
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: kategorie.farbe }}
                  >
                    {kategorie.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{kategorie.name}</h3>
                    {kategorie.beschreibung && (
                      <p className="text-sm text-gray-500">{kategorie.beschreibung}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 mr-2">#{kategorie.sortierung}</span>
                  <button
                    onClick={() => startEditing(kategorie)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(kategorie.id)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4">
        <h4 className="text-blue-400 font-medium mb-2">Tipp</h4>
        <p className="text-sm text-gray-400">
          Kategorien helfen dir, Events zu organisieren und im Kalender farblich zu unterscheiden.
          Beispiele: "Shows", "Proben", "Meetings", "Wartung".
        </p>
      </div>
    </div>
  );
}
