/**
 * Item Detail-Seite (v2 - vereinfacht)
 * Autocomplete für Kategorie/Standort/Hersteller, QR rechts neben Basis-Infos.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, Edit, Trash2, Save, Loader2, Package,
  QrCode, MapPin, Building, Plus, X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import apiClient from '../lib/api';
import AutocompleteInput from '../components/AutocompleteInput';

const STATUS_FARBEN = {
  verfuegbar: 'bg-green-500',
  ausgeliehen: 'bg-blue-500',
  reserviert: 'bg-yellow-500',
  defekt: 'bg-red-500',
};

const STATUS_LABELS = {
  verfuegbar: 'Verfügbar',
  ausgeliehen: 'Ausgeliehen',
  reserviert: 'Reserviert',
  defekt: 'Defekt',
};

export default function ItemDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'neu' || !id;
  
  const [item, setItem] = useState(null);
  const [kategorien, setKategorien] = useState([]);
  const [standorte, setStandorte] = useState([]);
  const [hersteller, setHersteller] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew);
  
  // QR-Code Modal
  const [showQrModal, setShowQrModal] = useState(false);
  const [newQrCode, setNewQrCode] = useState('');
  const [newQrBezeichnung, setNewQrBezeichnung] = useState('');
  
  // Form Data
  const [formData, setFormData] = useState({
    name: '',
    beschreibung: '',
    kategorie_id: '',
    standort_id: '',
    hersteller_id: '',
    seriennummer: '',
    status: 'verfuegbar',
    notizen: '',
    bilder: [],
    qr_codes: [],
  });

  const fetchData = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const [itemRes, kategorienRes, standorteRes, herstellerRes] = await Promise.all([
        apiClient.get(`/inventar/items/${id}`),
        apiClient.get('/inventar/kategorien'),
        apiClient.get('/inventar/standorte'),
        apiClient.get('/inventar/hersteller'),
      ]);

      setItem(itemRes.data);
      setKategorien(kategorienRes.data);
      setStandorte(standorteRes.data);
      setHersteller(herstellerRes.data);

      // Form befüllen
      const i = itemRes.data;
      setFormData({
        name: i.name || '',
        beschreibung: i.beschreibung || '',
        kategorie_id: i.kategorie_id || '',
        standort_id: i.standort_id || '',
        hersteller_id: i.hersteller_id || '',
        seriennummer: i.seriennummer || '',
        status: i.status || 'verfuegbar',
        notizen: i.notizen || '',
        bilder: i.bilder || [],
        qr_codes: i.qr_codes || [],
      });
    } catch (err) {
      console.error('Fehler:', err);
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    fetchData();
    // Stammdaten auch bei neuem Item laden
    if (isNew) {
      Promise.all([
        apiClient.get('/inventar/kategorien'),
        apiClient.get('/inventar/standorte'),
        apiClient.get('/inventar/hersteller'),
      ]).then(([katRes, standRes, herRes]) => {
        setKategorien(katRes.data);
        setStandorte(standRes.data);
        setHersteller(herRes.data);
      });
    }
  }, [fetchData, isNew]);

  const handleSave = async () => {
    if (!formData.name) {
      alert('Bitte einen Namen eingeben');
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        beschreibung: formData.beschreibung,
        kategorie_id: formData.kategorie_id || null,
        standort_id: formData.standort_id || null,
        hersteller_id: formData.hersteller_id || null,
        seriennummer: formData.seriennummer,
        status: formData.status,
        notizen: formData.notizen,
        bilder: formData.bilder,
        qr_codes: isNew ? formData.qr_codes : undefined, // QR-Codes nur bei Erstellen
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

  const handleAddQrCode = async () => {
    if (!newQrCode) return;
    
    if (isNew) {
      // Bei neuem Item nur lokal hinzufügen
      setFormData(f => ({
        ...f,
        qr_codes: [...f.qr_codes, { code: newQrCode, bezeichnung: newQrBezeichnung, ist_primaer: f.qr_codes.length === 0 }]
      }));
    } else {
      // Bei existierendem Item API aufrufen
      try {
        await apiClient.post(`/inventar/items/${id}/qr`, {
          code: newQrCode,
          bezeichnung: newQrBezeichnung,
          ist_primaer: formData.qr_codes.length === 0,
        });
        fetchData();
      } catch (err) {
        alert('QR-Code konnte nicht hinzugefügt werden');
        return;
      }
    }
    
    setShowQrModal(false);
    setNewQrCode('');
    setNewQrBezeichnung('');
  };

  const handleDeleteQrCode = async (qrId, qrCode) => {
    if (!confirm('QR-Code löschen?')) return;
    
    if (isNew) {
      setFormData(f => ({
        ...f,
        qr_codes: f.qr_codes.filter(q => q.code !== qrCode)
      }));
    } else {
      try {
        await apiClient.delete(`/inventar/items/${id}/qr/${qrId}`);
        fetchData();
      } catch (err) {
        alert('QR-Code konnte nicht gelöscht werden');
      }
    }
  };

  const getDisplayName = (list, id) => list.find((o) => o.id === id)?.name || '';

  const handleCreateKategorie = async (name) => {
    const res = await apiClient.post('/inventar/kategorien', { name });
    setKategorien((prev) => [...prev, res.data]);
    return res.data;
  };
  const handleCreateStandort = async (name) => {
    const res = await apiClient.post('/inventar/standorte', { name });
    setStandorte((prev) => [...prev, res.data]);
    return res.data;
  };
  const handleCreateHersteller = async (name) => {
    const res = await apiClient.post('/inventar/hersteller', { name });
    setHersteller((prev) => [...prev, res.data]);
    return res.data;
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
          {!isNew && item?.seriennummer && (
            <p className="text-gray-400">SN: {item.seriennummer}</p>
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

      {/* Erste Zeile: Basis-Infos links, QR-Code rechts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Basis-Informationen (links) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
            <h3 className="text-lg font-medium text-white">Basis-Informationen</h3>
            
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
                <AutocompleteInput
                  options={kategorien}
                  valueId={formData.kategorie_id}
                  displayName={getDisplayName(kategorien, formData.kategorie_id)}
                  onChange={(id) => setFormData((f) => ({ ...f, kategorie_id: id || '' }))}
                  onCreateNew={(editing || isNew) ? handleCreateKategorie : undefined}
                  placeholder="Suchen oder neu anlegen..."
                  disabled={!editing && !isNew}
                  getOptionLabel={(o) => o.name}
                  getOptionValue={(o) => o.id}
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Standort</label>
                <AutocompleteInput
                  options={standorte}
                  valueId={formData.standort_id}
                  displayName={getDisplayName(standorte, formData.standort_id)}
                  onChange={(id) => setFormData((f) => ({ ...f, standort_id: id || '' }))}
                  onCreateNew={(editing || isNew) ? handleCreateStandort : undefined}
                  placeholder="Suchen oder neu anlegen..."
                  disabled={!editing && !isNew}
                  getOptionLabel={(o) => o.name}
                  getOptionValue={(o) => o.id}
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Hersteller</label>
                <AutocompleteInput
                  options={hersteller}
                  valueId={formData.hersteller_id}
                  displayName={getDisplayName(hersteller, formData.hersteller_id)}
                  onChange={(id) => setFormData((f) => ({ ...f, hersteller_id: id || '' }))}
                  onCreateNew={(editing || isNew) ? handleCreateHersteller : undefined}
                  placeholder="Suchen oder neu anlegen..."
                  disabled={!editing && !isNew}
                  getOptionLabel={(o) => o.name}
                  getOptionValue={(o) => o.id}
                />
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
              
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">Notizen</label>
                <textarea
                  value={formData.notizen}
                  onChange={(e) => setFormData({ ...formData, notizen: e.target.value })}
                  disabled={!editing && !isNew}
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-60 resize-none"
                />
              </div>
            </div>
          </div>

          {/* QR-Codes Liste */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">QR-Codes</h3>
              {(editing || isNew) && (
                <button
                  onClick={() => setShowQrModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                  QR-Code hinzufügen
                </button>
              )}
            </div>
            
            {formData.qr_codes.length === 0 ? (
              <p className="text-gray-400 text-center py-4">Keine QR-Codes vorhanden</p>
            ) : (
              <div className="space-y-2">
                {formData.qr_codes.map((qr, idx) => (
                  <div key={qr.id || idx} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <QrCode className="w-5 h-5 text-gray-400" />
                      <div>
                        <span className="font-mono text-white">{qr.code}</span>
                        {qr.bezeichnung && <span className="text-sm text-gray-400 ml-2">({qr.bezeichnung})</span>}
                        {qr.ist_primaer && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded ml-2">Primär</span>}
                      </div>
                    </div>
                    {(editing || isNew) && (
                      <button
                        onClick={() => handleDeleteQrCode(qr.id, qr.code)}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* QR Code Display */}
          {!isNew && item && item.haupt_qr_code && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
              <QRCodeSVG
                value={item.haupt_qr_code}
                size={180}
                bgColor="transparent"
                fgColor="#ffffff"
                className="mx-auto"
              />
              <p className="mt-4 text-sm text-gray-400 font-mono">{item.haupt_qr_code}</p>
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
                    <span className={`w-2 h-2 rounded-full ${STATUS_FARBEN[item.status] || 'bg-gray-500'}`} />
                    {item.status_display || STATUS_LABELS[item.status] || item.status}
                  </span>
                </div>
                {item.kategorie_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Kategorie</span>
                    <span className="text-white">{item.kategorie_name}</span>
                  </div>
                )}
                {item.standort_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Standort</span>
                    <span className="text-white flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {item.standort_name}
                    </span>
                  </div>
                )}
                {item.hersteller_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Hersteller</span>
                    <span className="text-white flex items-center gap-1">
                      <Building className="w-4 h-4" />
                      {item.hersteller_name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {!isNew && item && item.status === 'verfuegbar' && (
            <Link
              to={`/ausleihen?item=${item.id}`}
              className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-center"
            >
              Ausleihen
            </Link>
          )}
        </div>
      </div>

      {/* QR-Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">QR-Code hinzufügen</h2>
              <button onClick={() => setShowQrModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">QR-Code *</label>
                <input
                  type="text"
                  value={newQrCode}
                  onChange={(e) => setNewQrCode(e.target.value)}
                  placeholder="Code eingeben oder scannen..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Bezeichnung (optional)</label>
                <input
                  type="text"
                  value={newQrBezeichnung}
                  onChange={(e) => setNewQrBezeichnung(e.target.value)}
                  placeholder="z.B. Hauptaufkleber, Ersatz..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowQrModal(false)}
                className="flex-1 py-2 text-gray-400 hover:text-white"
              >
                Abbrechen
              </button>
              <button
                onClick={handleAddQrCode}
                disabled={!newQrCode}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg"
              >
                Hinzufügen
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
