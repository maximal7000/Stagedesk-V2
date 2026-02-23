/**
 * Item Detail-Seite (v2 - vereinfacht)
 * Autocomplete für Kategorie/Standort/Hersteller, QR rechts neben Basis-Infos.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Edit, Trash2, Save, Loader2, Package,
  QrCode, MapPin, Building, Plus, X,
  Upload, Copy, History, AlertCircle, ImageIcon
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
import { toast } from 'sonner';
import apiClient from '../../lib/api';
import { useUser } from '../../contexts/UserContext';
import AutocompleteInput from '../../components/AutocompleteInput';

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
  const { user } = useUser();
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

  // Zustandslog
  const [zustandslog, setZustandslog] = useState([]);
  const [zustandslogOpen, setZustandslogOpen] = useState(false);
  const [zustandslogLoading, setZustandslogLoading] = useState(false);

  // Item-Bilder
  const [bilderUploading, setBilderUploading] = useState(false);

  // Verfuegbarkeit
  const [verfuegbarkeit, setVerfuegbarkeit] = useState([]);
  const [verfuegbarkeitLoading, setVerfuegbarkeitLoading] = useState(false);

  // Duplizieren
  const [duplicating, setDuplicating] = useState(false);
  
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
      toast.error('Bitte einen Namen eingeben');
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
      toast.error('Speichern fehlgeschlagen');
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
      toast.error('Löschen fehlgeschlagen');
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
        toast.error('QR-Code konnte nicht hinzugefügt werden');
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
        toast.error('QR-Code konnte nicht gelöscht werden');
      }
    }
  };

  // --- Duplizieren ---
  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const res = await apiClient.post(`/inventar/items/${id}/duplizieren`);
      toast.success('Item dupliziert');
      navigate(`/inventar/${res.data.id}`);
    } catch (err) {
      console.error('Duplizieren fehlgeschlagen:', err);
      toast.error('Duplizieren fehlgeschlagen');
    } finally {
      setDuplicating(false);
    }
  };

  // --- Zustandslog ---
  const fetchZustandslog = async () => {
    if (isNew) return;
    setZustandslogLoading(true);
    try {
      const res = await apiClient.get(`/inventar/items/${id}/zustandslog`);
      setZustandslog(res.data);
    } catch (err) {
      console.error('Zustandslog laden fehlgeschlagen:', err);
    } finally {
      setZustandslogLoading(false);
    }
  };

  const handleToggleZustandslog = () => {
    const next = !zustandslogOpen;
    setZustandslogOpen(next);
    if (next && zustandslog.length === 0) {
      fetchZustandslog();
    }
  };

  // --- Item-Bilder ---
  const handleBildUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setBilderUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        await apiClient.post(`/inventar/items/${id}/bilder`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      toast.success('Bild(er) hochgeladen');
      fetchData();
    } catch (err) {
      console.error('Bild-Upload fehlgeschlagen:', err);
      toast.error('Bild-Upload fehlgeschlagen');
    } finally {
      setBilderUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteBild = async (bildId) => {
    if (!confirm('Bild wirklich löschen?')) return;
    try {
      await apiClient.delete(`/inventar/items/${id}/bilder/${bildId}`);
      toast.success('Bild gelöscht');
      fetchData();
    } catch (err) {
      toast.error('Bild löschen fehlgeschlagen');
    }
  };

  // --- Verfuegbarkeit ---
  const fetchVerfuegbarkeit = useCallback(async () => {
    if (isNew) return;
    setVerfuegbarkeitLoading(true);
    try {
      const res = await apiClient.get(`/inventar/items/${id}/verfuegbarkeit?tage=30`);
      setVerfuegbarkeit(res.data);
    } catch (err) {
      console.error('Verfügbarkeit laden fehlgeschlagen:', err);
    } finally {
      setVerfuegbarkeitLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    if (!isNew && id) {
      fetchVerfuegbarkeit();
    }
  }, [fetchVerfuegbarkeit, isNew, id]);

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
              onClick={handleDuplicate}
              disabled={duplicating}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {duplicating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
              Duplizieren
            </button>
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
          {/* QR Code & Barcode Display */}
          {!isNew && item && item.haupt_qr_code && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
              <div className="text-center">
                <QRCodeSVG
                  value={item.haupt_qr_code}
                  size={150}
                  bgColor="transparent"
                  fgColor="#ffffff"
                  className="mx-auto"
                />
              </div>
              <div className="text-center bg-white rounded-lg p-2">
                <Barcode
                  value={item.haupt_qr_code}
                  width={1.5}
                  height={40}
                  fontSize={11}
                  margin={2}
                  displayValue={true}
                />
              </div>
              <p className="text-xs text-gray-500 text-center font-mono">{item.haupt_qr_code}</p>
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
                {item.menge_gesamt > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Menge</span>
                    <span className="text-white font-semibold text-lg">
                      <span className="text-green-400">{item.menge_verfuegbar ?? '?'}</span>
                      <span className="text-gray-500 mx-1">/</span>
                      <span>{item.menge_gesamt}</span>
                      <span className="text-sm text-gray-400 ml-1 font-normal">verfügbar</span>
                    </span>
                  </div>
                )}
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

      {/* Item-Bilder Upload */}
      {!isNew && item && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-gray-400" />
              Bilder
            </h3>
            <label className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg cursor-pointer">
              {bilderUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Bild hochladen
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleBildUpload}
                disabled={bilderUploading}
                className="hidden"
              />
            </label>
          </div>

          {item.item_bilder && item.item_bilder.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {item.item_bilder.map((bild) => (
                <div key={bild.id} className="relative group">
                  <img
                    src={bild.bild_url}
                    alt="Item Bild"
                    className="w-full h-32 object-cover rounded-lg border border-gray-700"
                  />
                  <button
                    onClick={() => handleDeleteBild(bild.id)}
                    className="absolute top-1 right-1 p-1 bg-red-600 hover:bg-red-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-6">Keine Bilder vorhanden</p>
          )}
        </div>
      )}

      {/* Zustandshistorie */}
      {!isNew && item && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <button
            onClick={handleToggleZustandslog}
            className="w-full flex items-center justify-between p-6 text-left"
          >
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <History className="w-5 h-5 text-gray-400" />
              Zustandshistorie
            </h3>
            <span className={`text-gray-400 transition-transform ${zustandslogOpen ? 'rotate-180' : ''}`}>
              &#9660;
            </span>
          </button>

          {zustandslogOpen && (
            <div className="px-6 pb-6">
              {zustandslogLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : zustandslog.length === 0 ? (
                <p className="text-gray-400 text-center py-4">Keine Einträge vorhanden</p>
              ) : (
                <div className="relative ml-4">
                  {/* Vertical line */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-700" />

                  <div className="space-y-4">
                    {zustandslog.map((entry, idx) => {
                      const dotColor =
                        entry.typ === 'rueckgabe' ? 'bg-green-500' :
                        entry.typ === 'ausleihe' ? 'bg-blue-500' :
                        'bg-gray-500';
                      const typLabel =
                        entry.typ === 'rueckgabe' ? 'Rückgabe' :
                        entry.typ === 'ausleihe' ? 'Ausleihe' :
                        'Manuell';

                      return (
                        <div key={idx} className="relative flex items-start gap-4 pl-6">
                          {/* Dot */}
                          <div className={`absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-gray-900 ${dotColor}`} />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white">{typLabel}</span>
                              {entry.zustand_vorher && entry.zustand_nachher && (
                                <span className="text-xs text-gray-400">
                                  {entry.zustand_vorher} &rarr; {entry.zustand_nachher}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-gray-500">
                                {new Date(entry.erstellt_am || entry.datum).toLocaleDateString('de-DE', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </span>
                              {entry.benutzer_name && (
                                <span className="text-xs text-gray-500">
                                  &mdash; {entry.benutzer_name}
                                </span>
                              )}
                            </div>
                            {entry.bemerkung && (
                              <p className="text-sm text-gray-400 mt-1">{entry.bemerkung}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Verfügbarkeit (30 Tage) */}
      {!isNew && item && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-medium text-white mb-4">Verfügbarkeit (30 Tage)</h3>

          {verfuegbarkeitLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          ) : verfuegbarkeit.length === 0 ? (
            <div className="flex items-center gap-2 text-gray-400 py-4 justify-center">
              <AlertCircle className="w-4 h-4" />
              <span>Keine Verfügbarkeitsdaten vorhanden</span>
            </div>
          ) : (
            <div>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />
                  Verfügbar
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
                  Ausgeliehen
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm bg-yellow-500 inline-block" />
                  Reserviert
                </span>
              </div>

              {/* Timeline bar */}
              <div className="flex gap-0.5 rounded-lg overflow-hidden">
                {verfuegbarkeit.map((tag, idx) => {
                  const farbe =
                    tag.status === 'ausgeliehen' ? 'bg-blue-500' :
                    tag.status === 'reserviert' ? 'bg-yellow-500' :
                    'bg-green-500';
                  const datum = new Date(tag.datum);
                  const label = datum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

                  return (
                    <div
                      key={idx}
                      className="flex-1 group relative"
                    >
                      <div className={`h-8 ${farbe} hover:opacity-80 transition-opacity`} />
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                        <div className="bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap border border-gray-700">
                          {label} - {tag.status === 'ausgeliehen' ? 'Ausgeliehen' : tag.status === 'reserviert' ? 'Reserviert' : 'Verfügbar'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Day indicators */}
              <div className="flex gap-0.5 mt-1">
                {verfuegbarkeit.map((tag, idx) => {
                  const datum = new Date(tag.datum);
                  const showLabel = idx === 0 || idx === Math.floor(verfuegbarkeit.length / 2) || idx === verfuegbarkeit.length - 1;
                  return (
                    <div key={idx} className="flex-1 text-center">
                      {showLabel && (
                        <span className="text-[10px] text-gray-500">
                          {datum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
