/**
 * Ressourcen-Verwaltung
 * Equipment, Räume, Personal, Fahrzeuge
 */
import { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Edit, Trash2, Save, X, Loader2, 
  Package, Building, Users, Truck, HelpCircle,
  DollarSign, AlertCircle
} from 'lucide-react';
import apiClient from '../../lib/api';

const RESSOURCE_TYPEN = [
  { value: 'equipment', label: 'Equipment', icon: Package, color: 'text-blue-400' },
  { value: 'raum', label: 'Raum/Location', icon: Building, color: 'text-green-400' },
  { value: 'personal', label: 'Personal/Crew', icon: Users, color: 'text-purple-400' },
  { value: 'fahrzeug', label: 'Fahrzeug', icon: Truck, color: 'text-orange-400' },
  { value: 'sonstiges', label: 'Sonstiges', icon: HelpCircle, color: 'text-gray-400' },
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
    return found ? found.color : 'text-gray-400';
  };

  // Form Component für Ressource
  const RessourceForm = ({ data, setData, onSave, onCancel, isSaving, isNew }) => (
    <div className="p-4 bg-gray-800/50 rounded-lg space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Name *</label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
            placeholder="Ressourcenname"
          />
        </div>

        {/* Typ */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Typ</label>
          <select
            value={data.typ}
            onChange={(e) => setData({ ...data, typ: e.target.value })}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          >
            {RESSOURCE_TYPEN.map(typ => (
              <option key={typ.value} value={typ.value}>{typ.label}</option>
            ))}
          </select>
        </div>

        {/* Farbe */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Farbe</label>
          <div className="flex gap-2">
            {FARBEN.map(farbe => (
              <button
                key={farbe}
                type="button"
                onClick={() => setData({ ...data, farbe })}
                className={`w-6 h-6 rounded ${data.farbe === farbe ? 'ring-2 ring-white' : ''}`}
                style={{ backgroundColor: farbe }}
              />
            ))}
          </div>
        </div>

        {/* Max gleichzeitig */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Max. gleichzeitig buchbar</label>
          <input
            type="number"
            value={data.max_gleichzeitig}
            onChange={(e) => setData({ ...data, max_gleichzeitig: parseInt(e.target.value) || 1 })}
            min="1"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          />
        </div>

        {/* Kosten pro Tag */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Kosten pro Tag (€)</label>
          <input
            type="number"
            value={data.kosten_pro_tag}
            onChange={(e) => setData({ ...data, kosten_pro_tag: e.target.value })}
            min="0"
            step="0.01"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          />
        </div>

        {/* Kosten pro Stunde */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Kosten pro Stunde (€)</label>
          <input
            type="number"
            value={data.kosten_pro_stunde}
            onChange={(e) => setData({ ...data, kosten_pro_stunde: e.target.value })}
            min="0"
            step="0.01"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          />
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

      {/* Verfügbar */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={data.ist_verfuegbar}
          onChange={(e) => setData({ ...data, ist_verfuegbar: e.target.checked })}
          className="w-4 h-4 rounded"
        />
        <span className="text-sm text-gray-300">Verfügbar für Buchungen</span>
      </label>

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
          <h1 className="text-2xl font-bold text-white">Ressourcen</h1>
          <p className="text-gray-400 mt-1">Verwalte Equipment, Räume, Personal und mehr</p>
        </div>

        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
        >
          <Plus className="w-5 h-5" />
          Neue Ressource
        </button>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterTyp(null)}
          className={`px-4 py-2 rounded-lg text-sm transition-colors ${
            !filterTyp ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Alle
        </button>
        {RESSOURCE_TYPEN.map(typ => {
          const Icon = typ.icon;
          return (
            <button
              key={typ.value}
              onClick={() => setFilterTyp(typ.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                filterTyp === typ.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {typ.label}
            </button>
          );
        })}
      </div>

      {/* Neue Ressource Form */}
      {showNew && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-lg font-semibold text-white mb-4">Neue Ressource</h3>
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
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-8 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      ) : ressourcen.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Keine Ressourcen gefunden</p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-4 text-blue-400 hover:text-blue-300"
          >
            Erste Ressource erstellen
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ressourcen.map(ressource => {
            const Icon = getTypIcon(ressource.typ);
            const isEditing = editingId === ressource.id;

            if (isEditing) {
              return (
                <div key={ressource.id} className="bg-gray-900 border border-blue-600 rounded-xl">
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
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: ressource.farbe + '20' }}
                    >
                      <Icon className={`w-5 h-5 ${getTypColor(ressource.typ)}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{ressource.name}</h3>
                      <p className="text-xs text-gray-500">{ressource.typ_display}</p>
                    </div>
                  </div>
                  
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: ressource.farbe }}
                  />
                </div>

                {ressource.beschreibung && (
                  <p className="text-sm text-gray-400 mb-3 line-clamp-2">{ressource.beschreibung}</p>
                )}

                <div className="flex flex-wrap gap-2 mb-3">
                  {!ressource.ist_verfuegbar && (
                    <span className="flex items-center gap-1 px-2 py-1 text-xs bg-red-900/30 text-red-400 rounded">
                      <AlertCircle className="w-3 h-3" />
                      Nicht verfügbar
                    </span>
                  )}
                  {ressource.max_gleichzeitig > 1 && (
                    <span className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded">
                      Max. {ressource.max_gleichzeitig}x
                    </span>
                  )}
                  {(ressource.kosten_pro_tag > 0 || ressource.kosten_pro_stunde > 0) && (
                    <span className="flex items-center gap-1 px-2 py-1 text-xs bg-green-900/30 text-green-400 rounded">
                      <DollarSign className="w-3 h-3" />
                      {ressource.kosten_pro_stunde > 0 
                        ? `${ressource.kosten_pro_stunde}€/h` 
                        : `${ressource.kosten_pro_tag}€/Tag`
                      }
                    </span>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
                  <button
                    onClick={() => startEditing(ressource)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(ressource.id)}
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
    </div>
  );
}
