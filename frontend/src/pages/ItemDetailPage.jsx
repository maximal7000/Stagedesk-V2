/**
 * Item Detail-Seite mit QR-Code, Historie, Wartung
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, Edit, Trash2, Save, X, Loader2, Package,
  QrCode, MapPin, Calendar, DollarSign, Wrench, History,
  AlertTriangle, Clock, Tag, FileText, Plus
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import apiClient from '../lib/api';

const STATUS_FARBEN = {
  verfuegbar: 'bg-green-500',
  ausgeliehen: 'bg-blue-500',
  reserviert: 'bg-yellow-500',
  wartung: 'bg-orange-500',
  defekt: 'bg-red-500',
};

const ZUSTAND_OPTIONS = [
  { value: 'neu', label: 'Neu' },
  { value: 'sehr_gut', label: 'Sehr gut' },
  { value: 'gut', label: 'Gut' },
  { value: 'verschleiss', label: 'Verschleiß' },
  { value: 'beschaedigt', label: 'Beschädigt' },
  { value: 'defekt', label: 'Defekt' },
];

export default function ItemDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'neu';
  
  const [item, setItem] = useState(null);
  const [kategorien, setKategorien] = useState([]);
  const [lagerorte, setLagerorte] = useState([]);
  const [wartungen, setWartungen] = useState([]);
  const [ausleihen, setAusleihen] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew);
  const [activeTab, setActiveTab] = useState('details');
  
  // Form Data
  const [formData, setFormData] = useState({
    name: '',
    beschreibung: '',
    kategorie_id: '',
    seriennummer: '',
    barcode: '',
    zustand: 'gut',
    zustand_notizen: '',
    lagerort_id: '',
    lagerplatz: '',
    menge: 1,
    einheit: 'Stück',
    mindestbestand: 0,
    kaufdatum: '',
    kaufpreis: '',
    lieferant: '',
    garantie_bis: '',
    aktueller_wert: '',
    abschreibung_jahre: 5,
    wartungsintervall_tage: 365,
    notizen: '',
    tags: [],
    bilder: [],
    technische_daten: {},
  });

  // Wartungs-Modal
  const [showWartungModal, setShowWartungModal] = useState(false);
  const [wartungData, setWartungData] = useState({
    typ: 'inspektion',
    datum: new Date().toISOString().split('T')[0],
    beschreibung: '',
    kosten: '',
    dienstleister: '',
    zustand_vorher: '',
    zustand_nachher: '',
  });

  const fetchData = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const [itemRes, kategorienRes, lagerorteRes, wartungenRes] = await Promise.all([
        apiClient.get(`/inventar/items/${id}`),
        apiClient.get('/inventar/kategorien'),
        apiClient.get('/inventar/lagerorte'),
        apiClient.get(`/inventar/wartungen?item_id=${id}`),
      ]);

      setItem(itemRes.data);
      setKategorien(kategorienRes.data);
      setLagerorte(lagerorteRes.data);
      setWartungen(wartungenRes.data);
      
      // Ausleihen für dieses Item laden
      const ausleihenRes = await apiClient.get(`/inventar/ausleihen?item_id=${id}`);
      setAusleihen(ausleihenRes.data);

      // Form befüllen
      const i = itemRes.data;
      setFormData({
        name: i.name || '',
        beschreibung: i.beschreibung || '',
        kategorie_id: i.kategorie_id || '',
        seriennummer: i.seriennummer || '',
        barcode: i.barcode || '',
        zustand: i.zustand || 'gut',
        zustand_notizen: i.zustand_notizen || '',
        lagerort_id: i.lagerort_id || '',
        lagerplatz: i.lagerplatz || '',
        menge: i.menge || 1,
        einheit: i.einheit || 'Stück',
        mindestbestand: i.mindestbestand || 0,
        kaufdatum: i.kaufdatum || '',
        kaufpreis: i.kaufpreis || '',
        lieferant: i.lieferant || '',
        garantie_bis: i.garantie_bis || '',
        aktueller_wert: i.aktueller_wert || '',
        abschreibung_jahre: i.abschreibung_jahre || 5,
        wartungsintervall_tage: i.wartungsintervall_tage || 365,
        notizen: i.notizen || '',
        tags: i.tags || [],
        bilder: i.bilder || [],
        technische_daten: i.technische_daten || {},
      });
    } catch (err) {
      console.error('Fehler:', err);
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    fetchData();
    // Kategorien und Lagerorte auch bei neuem Item laden
    if (isNew) {
      Promise.all([
        apiClient.get('/inventar/kategorien'),
        apiClient.get('/inventar/lagerorte'),
      ]).then(([katRes, lagRes]) => {
        setKategorien(katRes.data);
        setLagerorte(lagRes.data);
      });
    }
  }, [fetchData, isNew]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...formData,
        kategorie_id: formData.kategorie_id || null,
        lagerort_id: formData.lagerort_id || null,
        kaufpreis: parseFloat(formData.kaufpreis) || 0,
        aktueller_wert: parseFloat(formData.aktueller_wert) || 0,
        kaufdatum: formData.kaufdatum || null,
        garantie_bis: formData.garantie_bis || null,
      };

      if (isNew) {
        const res = await apiClient.post('/inventar/items', payload);
        navigate(`/inventar/${res.data.id}`);
      } else {
        await apiClient.put(`/inventar/items/${id}`, payload);
        setEditing(false);
        fetchData();
      }
    } catch (err) {
      console.error('Speichern fehlgeschlagen:', err);
      alert('Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Item wirklich löschen?')) return;
    try {
      await apiClient.delete(`/inventar/items/${id}`);
      navigate('/inventar');
    } catch (err) {
      alert('Löschen fehlgeschlagen');
    }
  };

  const handleAddWartung = async () => {
    try {
      await apiClient.post('/inventar/wartungen', {
        item_id: parseInt(id),
        ...wartungData,
        kosten: parseFloat(wartungData.kosten) || 0,
      });
      setShowWartungModal(false);
      setWartungData({
        typ: 'inspektion',
        datum: new Date().toISOString().split('T')[0],
        beschreibung: '',
        kosten: '',
        dienstleister: '',
        zustand_vorher: '',
        zustand_nachher: '',
      });
      fetchData();
    } catch (err) {
      alert('Wartung konnte nicht gespeichert werden');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/inventar')}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">
            {isNew ? 'Neues Item' : (editing ? 'Item bearbeiten' : item?.name)}
          </h1>
          {!isNew && item && (
            <p className="text-gray-400">{item.inventar_nr}</p>
          )}
        </div>

        {!isNew && !editing && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
            >
              <Edit className="w-4 h-4" />
              Bearbeiten
            </button>
            <button
              onClick={handleDelete}
              className="p-2 text-red-400 hover:bg-red-900/20 rounded-lg"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        )}

        {(isNew || editing) && (
          <div className="flex gap-2">
            {!isNew && (
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Abbrechen
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !formData.name}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Speichern
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs */}
          {!isNew && !editing && (
            <div className="border-b border-gray-800">
              <div className="flex gap-4">
                {[
                  { id: 'details', label: 'Details', icon: FileText },
                  { id: 'wartung', label: 'Wartung', icon: Wrench },
                  { id: 'historie', label: 'Historie', icon: History },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-400'
                        : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form / Details */}
          {(isNew || editing || activeTab === 'details') && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
              {/* Basis */}
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Basis-Informationen</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={!editing && !isNew}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Kategorie</label>
                    <select
                      value={formData.kategorie_id}
                      onChange={(e) => setFormData({ ...formData, kategorie_id: e.target.value })}
                      disabled={!editing && !isNew}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    >
                      <option value="">Keine Kategorie</option>
                      {kategorien.map(k => (
                        <option key={k.id} value={k.id}>{k.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Zustand</label>
                    <select
                      value={formData.zustand}
                      onChange={(e) => setFormData({ ...formData, zustand: e.target.value })}
                      disabled={!editing && !isNew}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    >
                      {ZUSTAND_OPTIONS.map(z => (
                        <option key={z.value} value={z.value}>{z.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Seriennummer</label>
                    <input
                      type="text"
                      value={formData.seriennummer}
                      onChange={(e) => setFormData({ ...formData, seriennummer: e.target.value })}
                      disabled={!editing && !isNew}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Barcode</label>
                    <input
                      type="text"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      disabled={!editing && !isNew}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Beschreibung</label>
                    <textarea
                      value={formData.beschreibung}
                      onChange={(e) => setFormData({ ...formData, beschreibung: e.target.value })}
                      disabled={!editing && !isNew}
                      rows={3}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Standort */}
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Standort & Menge</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Lagerort</label>
                    <select
                      value={formData.lagerort_id}
                      onChange={(e) => setFormData({ ...formData, lagerort_id: e.target.value })}
                      disabled={!editing && !isNew}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    >
                      <option value="">Kein Lagerort</option>
                      {lagerorte.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Lagerplatz</label>
                    <input
                      type="text"
                      value={formData.lagerplatz}
                      onChange={(e) => setFormData({ ...formData, lagerplatz: e.target.value })}
                      disabled={!editing && !isNew}
                      placeholder="z.B. Regal A3, Case 5"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Menge</label>
                    <input
                      type="number"
                      value={formData.menge}
                      onChange={(e) => setFormData({ ...formData, menge: parseInt(e.target.value) || 1 })}
                      disabled={!editing && !isNew}
                      min="1"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Einheit</label>
                    <input
                      type="text"
                      value={formData.einheit}
                      onChange={(e) => setFormData({ ...formData, einheit: e.target.value })}
                      disabled={!editing && !isNew}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>

              {/* Kaufinfos */}
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Kaufinformationen</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Kaufdatum</label>
                    <input
                      type="date"
                      value={formData.kaufdatum}
                      onChange={(e) => setFormData({ ...formData, kaufdatum: e.target.value })}
                      disabled={!editing && !isNew}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Kaufpreis (€)</label>
                    <input
                      type="number"
                      value={formData.kaufpreis}
                      onChange={(e) => setFormData({ ...formData, kaufpreis: e.target.value })}
                      disabled={!editing && !isNew}
                      step="0.01"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Lieferant</label>
                    <input
                      type="text"
                      value={formData.lieferant}
                      onChange={(e) => setFormData({ ...formData, lieferant: e.target.value })}
                      disabled={!editing && !isNew}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Garantie bis</label>
                    <input
                      type="date"
                      value={formData.garantie_bis}
                      onChange={(e) => setFormData({ ...formData, garantie_bis: e.target.value })}
                      disabled={!editing && !isNew}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Wartung Tab */}
          {!isNew && !editing && activeTab === 'wartung' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-white">Wartungsprotokoll</h3>
                <button
                  onClick={() => setShowWartungModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                  Wartung eintragen
                </button>
              </div>
              
              {wartungen.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Keine Wartungen dokumentiert</p>
              ) : (
                <div className="space-y-3">
                  {wartungen.map(w => (
                    <div key={w.id} className="p-4 bg-gray-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-white">{w.typ_display}</span>
                        <span className="text-sm text-gray-400">{w.datum}</span>
                      </div>
                      <p className="text-sm text-gray-300">{w.beschreibung}</p>
                      {w.kosten > 0 && (
                        <p className="text-sm text-green-400 mt-2">Kosten: {w.kosten} €</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Historie Tab */}
          {!isNew && !editing && activeTab === 'historie' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-medium text-white mb-4">Ausleih-Historie</h3>
              
              {ausleihen.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Keine Ausleihen für dieses Item</p>
              ) : (
                <div className="space-y-3">
                  {ausleihen.map(a => (
                    <Link
                      key={a.id}
                      to={`/ausleihen/${a.id}`}
                      className="block p-4 bg-gray-800 rounded-lg hover:bg-gray-700"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-white">{a.ausleiher_name}</span>
                        <span className={`text-sm ${
                          a.status === 'aktiv' ? 'text-blue-400' :
                          a.status === 'zurueckgegeben' ? 'text-green-400' :
                          'text-gray-400'
                        }`}>
                          {a.status_display}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">
                        {new Date(a.ausleihe_von).toLocaleDateString('de-DE')} - {new Date(a.ausleihe_bis).toLocaleDateString('de-DE')}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* QR Code */}
          {!isNew && item && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
              <QRCodeSVG
                value={item.qr_code}
                size={180}
                bgColor="transparent"
                fgColor="#ffffff"
                className="mx-auto"
              />
              <p className="mt-4 text-sm text-gray-400 font-mono">{item.qr_code}</p>
            </div>
          )}

          {/* Status */}
          {!isNew && item && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-medium text-white mb-4">Status</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Status</span>
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${STATUS_FARBEN[item.status]}`} />
                    {item.status_display}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Zustand</span>
                  <span className="text-white">{item.zustand_display}</span>
                </div>
                {item.braucht_wartung && (
                  <div className="flex items-center gap-2 text-orange-400 mt-4">
                    <AlertTriangle className="w-4 h-4" />
                    Wartung fällig!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {!isNew && item && item.status === 'verfuegbar' && (
            <Link
              to={`/ausleihen/neu?item=${item.id}`}
              className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-center"
            >
              Ausleihen
            </Link>
          )}
        </div>
      </div>

      {/* Wartung Modal */}
      {showWartungModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Wartung eintragen</h2>
              <button onClick={() => setShowWartungModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Typ</label>
                <select
                  value={wartungData.typ}
                  onChange={(e) => setWartungData({ ...wartungData, typ: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                >
                  <option value="inspektion">Inspektion</option>
                  <option value="reinigung">Reinigung</option>
                  <option value="reparatur">Reparatur</option>
                  <option value="pruefung">Prüfung (BGV)</option>
                  <option value="update">Software/Firmware Update</option>
                  <option value="sonstiges">Sonstiges</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Datum</label>
                <input
                  type="date"
                  value={wartungData.datum}
                  onChange={(e) => setWartungData({ ...wartungData, datum: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Beschreibung *</label>
                <textarea
                  value={wartungData.beschreibung}
                  onChange={(e) => setWartungData({ ...wartungData, beschreibung: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Kosten (€)</label>
                  <input
                    type="number"
                    value={wartungData.kosten}
                    onChange={(e) => setWartungData({ ...wartungData, kosten: e.target.value })}
                    step="0.01"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Dienstleister</label>
                  <input
                    type="text"
                    value={wartungData.dienstleister}
                    onChange={(e) => setWartungData({ ...wartungData, dienstleister: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowWartungModal(false)}
                className="flex-1 py-2 text-gray-400 hover:text-white"
              >
                Abbrechen
              </button>
              <button
                onClick={handleAddWartung}
                disabled={!wartungData.beschreibung}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
