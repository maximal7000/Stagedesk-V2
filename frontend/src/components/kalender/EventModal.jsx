/**
 * Event Modal - Erstellen und Bearbeiten von Events
 */
import { useState, useEffect } from 'react';
import { 
  X, Save, Trash2, Loader2, Calendar, Clock, MapPin,
  Users, DollarSign, Tag, Plus, FileText, Repeat
} from 'lucide-react';
import { format, parseISO, addHours } from 'date-fns';
import apiClient from '../../lib/api';

const STATUS_OPTIONS = [
  { value: 'geplant', label: 'Geplant', color: 'bg-gray-600' },
  { value: 'bestaetigt', label: 'Bestätigt', color: 'bg-green-600' },
  { value: 'laufend', label: 'Laufend', color: 'bg-blue-600' },
  { value: 'abgeschlossen', label: 'Abgeschlossen', color: 'bg-gray-500' },
  { value: 'abgesagt', label: 'Abgesagt', color: 'bg-red-600' },
];

const WIEDERHOLUNG_OPTIONS = [
  { value: 'keine', label: 'Keine' },
  { value: 'taeglich', label: 'Täglich' },
  { value: 'woechentlich', label: 'Wöchentlich' },
  { value: 'monatlich', label: 'Monatlich' },
  { value: 'jaehrlich', label: 'Jährlich' },
];

export default function EventModal({ event, initialDate, kategorien, onClose, onSaved }) {
  const isEditing = !!event;
  
  const [formData, setFormData] = useState({
    titel: '',
    beschreibung: '',
    kategorie_id: '',
    start: '',
    ende: '',
    ganztaegig: false,
    ort: '',
    adresse: '',
    status: 'geplant',
    wiederholung: 'keine',
    wiederholung_ende: '',
    geschaetztes_budget: '',
    verantwortlicher: '',
    teilnehmer_anzahl: '',
    notizen: '',
  });
  
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('basis');
  
  // Ressourcen
  const [ressourcen, setRessourcen] = useState([]);
  const [availableRessourcen, setAvailableRessourcen] = useState([]);
  const [selectedRessourcen, setSelectedRessourcen] = useState([]);
  
  // Haushalte für Budget-Verknüpfung
  const [haushalte, setHaushalte] = useState([]);
  const [selectedHaushalt, setSelectedHaushalt] = useState('');

  useEffect(() => {
    // Initialisiere Formular
    if (event) {
      setFormData({
        titel: event.titel || '',
        beschreibung: event.beschreibung || '',
        kategorie_id: event.kategorie_id || '',
        start: event.start ? format(parseISO(event.start), "yyyy-MM-dd'T'HH:mm") : '',
        ende: event.ende ? format(parseISO(event.ende), "yyyy-MM-dd'T'HH:mm") : '',
        ganztaegig: event.ganztaegig || false,
        ort: event.ort || '',
        adresse: event.adresse || '',
        status: event.status || 'geplant',
        wiederholung: event.wiederholung || 'keine',
        wiederholung_ende: event.wiederholung_ende || '',
        geschaetztes_budget: event.geschaetztes_budget || '',
        verantwortlicher: event.verantwortlicher || '',
        teilnehmer_anzahl: event.teilnehmer_anzahl || '',
        notizen: event.notizen || '',
      });
      setSelectedHaushalt(event.haushalt_id || '');
      setSelectedRessourcen(event.ressourcen || []);
    } else if (initialDate) {
      const startDate = initialDate;
      const endDate = addHours(startDate, 2);
      setFormData(prev => ({
        ...prev,
        start: format(startDate, "yyyy-MM-dd'T'HH:mm"),
        ende: format(endDate, "yyyy-MM-dd'T'HH:mm"),
      }));
    }
    
    // Lade Ressourcen und Haushalte
    loadData();
  }, [event, initialDate]);

  const loadData = async () => {
    try {
      const [ressourcenRes, haushalteRes] = await Promise.all([
        apiClient.get('/kalender/ressourcen'),
        apiClient.get('/haushalte/'),
      ]);
      setAvailableRessourcen(ressourcenRes.data);
      setHaushalte(haushalteRes.data);
    } catch (err) {
      console.error('Fehler beim Laden:', err);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const payload = {
        ...formData,
        kategorie_id: formData.kategorie_id || null,
        haushalt_id: selectedHaushalt || null,
        geschaetztes_budget: parseFloat(formData.geschaetztes_budget) || 0,
        teilnehmer_anzahl: parseInt(formData.teilnehmer_anzahl) || 0,
        ressourcen: selectedRessourcen.map(r => ({
          ressource_id: r.ressource_id || r.id,
          anzahl: r.anzahl || 1,
        })),
      };

      if (isEditing) {
        await apiClient.put(`/kalender/events/${event.id}`, payload);
      } else {
        await apiClient.post('/kalender/events', payload);
      }

      onSaved();
    } catch (err) {
      setError('Speichern fehlgeschlagen. Bitte prüfe die Eingaben.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Event wirklich löschen?')) return;
    
    setDeleting(true);
    try {
      await apiClient.delete(`/kalender/events/${event.id}`);
      onSaved();
    } catch (err) {
      setError('Löschen fehlgeschlagen.');
    } finally {
      setDeleting(false);
    }
  };

  const addRessource = (ressource) => {
    if (!selectedRessourcen.find(r => (r.ressource_id || r.id) === ressource.id)) {
      setSelectedRessourcen([...selectedRessourcen, { 
        ressource_id: ressource.id,
        ressource_name: ressource.name,
        ressource_farbe: ressource.farbe,
        anzahl: 1 
      }]);
    }
  };

  const removeRessource = (ressourceId) => {
    setSelectedRessourcen(selectedRessourcen.filter(r => (r.ressource_id || r.id) !== ressourceId));
  };

  const tabs = [
    { id: 'basis', label: 'Basis', icon: Calendar },
    { id: 'details', label: 'Details', icon: FileText },
    { id: 'ressourcen', label: 'Ressourcen', icon: Users },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">
            {isEditing ? 'Event bearbeiten' : 'Neues Event'}
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-800 px-4">
          <div className="flex gap-4">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-3 border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Basis Tab */}
          {activeTab === 'basis' && (
            <div className="space-y-4">
              {/* Titel */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Titel *</label>
                <input
                  type="text"
                  name="titel"
                  value={formData.titel}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                  placeholder="Event-Titel"
                />
              </div>

              {/* Kategorie */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Kategorie</label>
                <select
                  name="kategorie_id"
                  value={formData.kategorie_id}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                >
                  <option value="">Keine Kategorie</option>
                  {kategorien.map(kat => (
                    <option key={kat.id} value={kat.id}>{kat.name}</option>
                  ))}
                </select>
              </div>

              {/* Datum & Zeit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Start *</label>
                  <input
                    type="datetime-local"
                    name="start"
                    value={formData.start}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Ende *</label>
                  <input
                    type="datetime-local"
                    name="ende"
                    value={formData.ende}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Ganztägig */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="ganztaegig"
                  checked={formData.ganztaegig}
                  onChange={handleChange}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-300">Ganztägig</span>
              </label>

              {/* Ort */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Ort</label>
                <input
                  type="text"
                  name="ort"
                  value={formData.ort}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  placeholder="Veranstaltungsort"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Status</label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, status: opt.value }))}
                      className={`px-3 py-1.5 rounded-lg text-sm text-white transition-colors ${
                        formData.status === opt.value ? opt.color : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Beschreibung */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Beschreibung</label>
                <textarea
                  name="beschreibung"
                  value={formData.beschreibung}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none"
                  placeholder="Beschreibung des Events..."
                />
              </div>

              {/* Adresse */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Adresse</label>
                <textarea
                  name="adresse"
                  value={formData.adresse}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none"
                  placeholder="Vollständige Adresse..."
                />
              </div>

              {/* Wiederholung */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Wiederholung</label>
                  <select
                    name="wiederholung"
                    value={formData.wiederholung}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  >
                    {WIEDERHOLUNG_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {formData.wiederholung !== 'keine' && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Wiederholung bis</label>
                    <input
                      type="date"
                      name="wiederholung_ende"
                      value={formData.wiederholung_ende}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                )}
              </div>

              {/* Verantwortlicher & Teilnehmer */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Verantwortlicher</label>
                  <input
                    type="text"
                    name="verantwortlicher"
                    value={formData.verantwortlicher}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Teilnehmeranzahl</label>
                  <input
                    type="number"
                    name="teilnehmer_anzahl"
                    value={formData.teilnehmer_anzahl}
                    onChange={handleChange}
                    min="0"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Budget */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Haushalt verknüpfen</label>
                  <select
                    value={selectedHaushalt}
                    onChange={(e) => setSelectedHaushalt(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  >
                    <option value="">Kein Haushalt</option>
                    {haushalte.map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Geschätztes Budget (€)</label>
                  <input
                    type="number"
                    name="geschaetztes_budget"
                    value={formData.geschaetztes_budget}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Notizen */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Notizen</label>
                <textarea
                  name="notizen"
                  value={formData.notizen}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none"
                />
              </div>
            </div>
          )}

          {/* Ressourcen Tab */}
          {activeTab === 'ressourcen' && (
            <div className="space-y-4">
              {/* Ausgewählte Ressourcen */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Gebuchte Ressourcen</label>
                {selectedRessourcen.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">Keine Ressourcen ausgewählt</p>
                ) : (
                  <div className="space-y-2">
                    {selectedRessourcen.map(res => (
                      <div
                        key={res.ressource_id || res.id}
                        className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: res.ressource_farbe }}
                          />
                          <span className="text-white">{res.ressource_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={res.anzahl}
                            onChange={(e) => {
                              const newRessourcen = selectedRessourcen.map(r =>
                                (r.ressource_id || r.id) === (res.ressource_id || res.id)
                                  ? { ...r, anzahl: parseInt(e.target.value) || 1 }
                                  : r
                              );
                              setSelectedRessourcen(newRessourcen);
                            }}
                            min="1"
                            className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-center text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeRessource(res.ressource_id || res.id)}
                            className="p-1 text-red-400 hover:bg-red-900/20 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Verfügbare Ressourcen */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Ressource hinzufügen</label>
                <div className="grid grid-cols-2 gap-2">
                  {availableRessourcen
                    .filter(r => !selectedRessourcen.find(sr => (sr.ressource_id || sr.id) === r.id))
                    .map(res => (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => addRessource(res)}
                        className="flex items-center gap-2 p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-left transition-colors"
                      >
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: res.farbe }}
                        />
                        <div className="min-w-0">
                          <div className="text-white text-sm truncate">{res.name}</div>
                          <div className="text-xs text-gray-500">{res.typ_display}</div>
                        </div>
                        <Plus className="w-4 h-4 text-gray-400 ml-auto" />
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex items-center justify-between">
          <div>
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-900/20 rounded-lg"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Löschen
              </button>
            )}
          </div>
          
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
