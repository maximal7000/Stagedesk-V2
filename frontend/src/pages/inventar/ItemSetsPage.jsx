/**
 * Item-Sets Verwaltung - Erstellen und Verwalten von Item-Sets
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Layers, ArrowLeft, 
  Loader2, X, Check, Trash2, Edit2, Package
} from 'lucide-react';
import apiClient from '../../lib/api';
import { toast } from 'sonner';
import { PageHeader, Button, EmptyState } from '../../components/ui';

export default function ItemSetsPage() {
  const navigate = useNavigate();
  const [sets, setSets] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingSet, setEditingSet] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    beschreibung: '',
    farbe: '#8B5CF6',
  });
  const [selectedItems, setSelectedItems] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Ausleihen Modal State
  const [showAusleihenModal, setShowAusleihenModal] = useState(false);
  const [ausleihenSetId, setAusleihenSetId] = useState(null);
  const [ausleihenForm, setAusleihenForm] = useState({
    ausleiher_name: '',
    ausleiher_organisation: '',
    zweck: '',
    frist: '',
  });
  const [ausleihenSaving, setAusleihenSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [setsRes, itemsRes] = await Promise.all([
        apiClient.get('/inventar/sets'),
        apiClient.get('/inventar/items'),
      ]);

      setSets(setsRes.data);
      setItems(itemsRes.data);
    } catch (err) {
      console.error('Fehler beim Laden:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreateModal = () => {
    setEditingSet(null);
    setFormData({
      name: '',
      beschreibung: '',
      farbe: '#8B5CF6',
    });
    setSelectedItems([]);
    setShowModal(true);
  };

  const openEditModal = (set) => {
    setEditingSet(set);
    setFormData({
      name: set.name,
      beschreibung: set.beschreibung,
      farbe: set.farbe,
    });
    setSelectedItems(set.positionen.map(p => ({
      item_id: p.item_id,
      item_name: p.item_name,
      anzahl: p.anzahl,
      notizen: p.notizen,
    })));
    setShowModal(true);
  };

  const addItem = (item) => {
    if (selectedItems.find(si => si.item_id === item.id)) {
      // Item bereits vorhanden, Anzahl erhöhen
      setSelectedItems(selectedItems.map(si => 
        si.item_id === item.id ? { ...si, anzahl: si.anzahl + 1 } : si
      ));
    } else {
      setSelectedItems([...selectedItems, {
        item_id: item.id,
        item_name: item.name,
        anzahl: 1,
        notizen: '',
      }]);
    }
    setItemSearch('');
  };

  const removeItem = (itemId) => {
    setSelectedItems(selectedItems.filter(si => si.item_id !== itemId));
  };

  const updateItemAnzahl = (itemId, anzahl) => {
    setSelectedItems(selectedItems.map(si => 
      si.item_id === itemId ? { ...si, anzahl: Math.max(1, parseInt(anzahl) || 1) } : si
    ));
  };

  const handleSave = async () => {
    if (!formData.name || selectedItems.length === 0) {
      toast.error('Bitte Name eingeben und mindestens ein Item hinzufügen');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        beschreibung: formData.beschreibung,
        farbe: formData.farbe,
        positionen: selectedItems.map(si => ({
          item_id: si.item_id,
          anzahl: si.anzahl,
          notizen: si.notizen,
        })),
      };

      if (editingSet) {
        await apiClient.put(`/inventar/sets/${editingSet.id}`, payload);
      } else {
        await apiClient.post('/inventar/sets', payload);
      }

      setShowModal(false);
      fetchData();
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      toast.error('Set konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (setId) => {
    if (!confirm('Set wirklich löschen?')) return;

    try {
      await apiClient.delete(`/inventar/sets/${setId}`);
      fetchData();
    } catch (err) {
      console.error('Fehler beim Löschen:', err);
      toast.error('Set konnte nicht gelöscht werden');
    }
  };

  const openAusleihenModal = (setId) => {
    setAusleihenSetId(setId);
    setAusleihenForm({
      ausleiher_name: '',
      ausleiher_organisation: '',
      zweck: '',
      frist: '',
    });
    setShowAusleihenModal(true);
  };

  const handleAusleihen = async () => {
    if (!ausleihenForm.ausleiher_name || !ausleihenForm.frist) {
      toast.error('Bitte Name und Frist angeben');
      return;
    }

    setAusleihenSaving(true);
    try {
      const res = await apiClient.post(`/inventar/sets/${ausleihenSetId}/ausleihen`, {
        ausleiher_name: ausleihenForm.ausleiher_name,
        ausleiher_organisation: ausleihenForm.ausleiher_organisation,
        zweck: ausleihenForm.zweck,
        frist: ausleihenForm.frist,
        modus: 'global',
      });
      toast.success('Set erfolgreich ausgeliehen');
      setShowAusleihenModal(false);
      navigate(`/ausleihen/${res.data.id}`);
    } catch (err) {
      console.error('Fehler beim Ausleihen:', err);
      toast.error(err.response?.data?.detail || 'Set konnte nicht ausgeliehen werden');
    } finally {
      setAusleihenSaving(false);
    }
  };

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    (item.seriennummer && item.seriennummer.toLowerCase().includes(itemSearch.toLowerCase()))
  );

  const FARBEN = [
    '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#EC4899', '#6366F1', '#14B8A6', '#F97316', '#84CC16'
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-accent-fg animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" icon={ArrowLeft} aria-label="Zurück" className="mt-1"
          onClick={() => navigate('/inventar')} />
        <div className="flex-1 min-w-0">
          <PageHeader
            title="Item-Sets"
            meta="Vordefinierte Zusammenstellungen für schnelles Ausleihen"
            actions={<Button variant="primary" size="sm" icon={Plus} onClick={openCreateModal}>Neues Set</Button>}
          />
        </div>
      </div>

      {/* Sets Liste */}
      {sets.length === 0 ? (
        <div className="bg-surface rounded-lg">
          <EmptyState icon={Layers} title="Noch keine Item-Sets vorhanden"
            description="Vordefinierte Zusammenstellungen beschleunigen das Ausleihen."
            action={<Button variant="primary" size="sm" icon={Plus} onClick={openCreateModal}>Erstes Set erstellen</Button>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sets.map(set => (
            <div
              key={set.id}
              className="bg-surface rounded-lg p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 flex items-center justify-center"
                  >
                    <Layers className="w-5 h-5" style={{ color: set.farbe }} />
                  </div>
                  <div>
                    <h3 className="font-medium text-fg">{set.name}</h3>
                    <p className="text-sm text-fg-muted tabular-nums">{set.anzahl_items} Items</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEditModal(set)}
                    className="p-2 text-fg-muted hover:text-fg hover:bg-raised rounded-sm"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(set.id)}
                    className="p-2 text-fg-muted hover:text-bad hover:bg-raised rounded-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {set.beschreibung && (
                <p className="text-sm text-fg-subtle mb-3">{set.beschreibung}</p>
              )}

              <div className="space-y-1">
                {set.positionen.slice(0, 3).map(pos => (
                  <div key={pos.id} className="flex items-center gap-2 text-sm">
                    <Package className="w-3 h-3 text-fg-subtle" />
                    <span className="text-fg-muted tabular-nums">{pos.anzahl}x</span>
                    <span className="text-fg-muted truncate">{pos.item_name}</span>
                  </div>
                ))}
                {set.positionen.length > 3 && (
                  <p className="text-xs text-fg-subtle mt-1 tabular-nums">
                    + {set.positionen.length - 3} weitere Items
                  </p>
                )}
              </div>

              <button
                onClick={() => openAusleihenModal(set.id)}
                className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 bg-raised hover:bg-hover text-fg text-sm font-semibold rounded-md transition-colors"
              >
                <Package className="w-4 h-4" />
                Set ausleihen
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Ausleihen Modal */}
      {showAusleihenModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-overlay border border-line rounded-lg shadow-overlay w-full max-w-md">
            <div className="border-b border-line-subtle p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-fg">Set ausleihen</h2>
              <button
                onClick={() => setShowAusleihenModal(false)}
                className="text-fg-muted hover:text-fg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg-muted mb-1">Ausleiher Name *</label>
                <input
                  type="text"
                  value={ausleihenForm.ausleiher_name}
                  onChange={(e) => setAusleihenForm({ ...ausleihenForm, ausleiher_name: e.target.value })}
                  placeholder="Name des Ausleihers"
                  className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-muted mb-1">Organisation</label>
                <input
                  type="text"
                  value={ausleihenForm.ausleiher_organisation}
                  onChange={(e) => setAusleihenForm({ ...ausleihenForm, ausleiher_organisation: e.target.value })}
                  placeholder="Organisation / Firma"
                  className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-muted mb-1">Zweck</label>
                <input
                  type="text"
                  value={ausleihenForm.zweck}
                  onChange={(e) => setAusleihenForm({ ...ausleihenForm, zweck: e.target.value })}
                  placeholder="Verwendungszweck"
                  className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-muted mb-1">Frist *</label>
                <input
                  type="date"
                  value={ausleihenForm.frist}
                  onChange={(e) => setAusleihenForm({ ...ausleihenForm, frist: e.target.value })}
                  className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="border-t border-line-subtle p-4 flex justify-end gap-2">
              <button
                onClick={() => setShowAusleihenModal(false)}
                className="px-4 py-2 text-fg-muted hover:text-fg"
              >
                Abbrechen
              </button>
              <button
                onClick={handleAusleihen}
                disabled={ausleihenSaving || !ausleihenForm.ausleiher_name || !ausleihenForm.frist}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-semibold rounded-md"
              >
                {ausleihenSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                Ausleihen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-overlay border border-line rounded-lg shadow-overlay w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-overlay border-b border-line-subtle p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-fg">
                {editingSet ? 'Set bearbeiten' : 'Neues Set erstellen'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-fg-muted hover:text-fg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Name & Farbe */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-fg-muted mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="z.B. PA-Set Klein"
                    className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-muted mb-1">Farbe</label>
                  <div className="flex gap-2 flex-wrap">
                    {FARBEN.map(farbe => (
                      <button
                        key={farbe}
                        onClick={() => setFormData({ ...formData, farbe })}
                        className={`w-8 h-8 rounded-md ${formData.farbe === farbe ? 'ring-2 ring-fg ring-offset-2 ring-offset-overlay' : ''}`}
                        style={{ backgroundColor: farbe }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-fg-muted mb-1">Beschreibung</label>
                <textarea
                  value={formData.beschreibung}
                  onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
                  rows={2}
                  placeholder="Optionale Beschreibung..."
                  className="w-full px-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none resize-none"
                />
              </div>

              {/* Items hinzufügen */}
              <div>
                <label className="block text-sm font-medium text-fg-muted mb-2">Items hinzufügen *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Item suchen..."
                    className="w-full pl-9 pr-3 py-2 bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                  {itemSearch && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-overlay border border-line rounded-md shadow-overlay max-h-48 overflow-y-auto z-10">
                      {filteredItems.slice(0, 10).map(item => (
                        <button
                          key={item.id}
                          onClick={() => addItem(item)}
                          className="w-full text-left px-3 py-2 hover:bg-hover text-fg"
                        >
                          <span className="font-medium">{item.name}</span>
                          {item.hersteller_name && (
                            <span className="text-sm text-fg-muted ml-2">{item.hersteller_name}</span>
                          )}
                        </button>
                      ))}
                      {filteredItems.length === 0 && (
                        <p className="px-3 py-2 text-fg-muted">Keine Items gefunden</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Ausgewählte Items */}
              {selectedItems.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-fg-muted">Enthaltene Items (<span className="tabular-nums">{selectedItems.length}</span>)</label>
                  {selectedItems.map(si => (
                    <div key={si.item_id} className="flex items-center gap-3 p-3 bg-raised rounded-md">
                      <input
                        type="number"
                        value={si.anzahl}
                        onChange={(e) => updateItemAnzahl(si.item_id, e.target.value)}
                        min="1"
                        className="w-16 px-2 py-1 bg-raised border border-line rounded-md text-fg focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none text-center tabular-nums"
                      />
                      <span className="text-fg-muted">×</span>
                      <span className="flex-1 font-medium text-fg">{si.item_name}</span>
                      <button
                        onClick={() => removeItem(si.item_id)}
                        className="p-1.5 text-fg-muted hover:text-bad hover:bg-raised rounded-sm"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-overlay border-t border-line-subtle p-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowModal(false)}>Abbrechen</Button>
              <Button variant="primary" onClick={handleSave}
                disabled={saving || !formData.name || selectedItems.length === 0}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editingSet ? 'Speichern' : 'Erstellen'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
