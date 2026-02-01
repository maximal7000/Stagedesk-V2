/**
 * Ausleih-Übersicht und Ausleih-Erstellung
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Plus, Search, Filter, Package, ArrowLeft, 
  Loader2, AlertTriangle, Clock, User, Calendar,
  X, Check, Trash2, Pen
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import apiClient from '../lib/api';

export default function AusleihePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedItemId = searchParams.get('item');
  
  const [ausleihen, setAusleihen] = useState([]);
  const [items, setItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter
  const [filterStatus, setFilterStatus] = useState('');
  const [showNeu, setShowNeu] = useState(!!preselectedItemId);
  
  // Neue Ausleihe Form
  const [formData, setFormData] = useState({
    ausleiher_name: '',
    ausleiher_email: '',
    ausleiher_telefon: '',
    ausleiher_organisation: '',
    zweck: '',
    event_id: '',
    ausleihe_von: '',
    ausleihe_bis: '',
    unterschrift_modus: 'global',
    notizen_ausleihe: '',
  });
  const [selectedItems, setSelectedItems] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Signatur
  const sigPadRef = useRef(null);
  const [showSigPad, setShowSigPad] = useState(false);
  const [currentSigFor, setCurrentSigFor] = useState(null); // null = global, oder item_id
  const [globalSignature, setGlobalSignature] = useState('');
  
  // Rückgabe Modal
  const [showRueckgabeModal, setShowRueckgabeModal] = useState(false);
  const [rueckgabeAusleihe, setRueckgabeAusleihe] = useState(null);
  const rueckgabeSigRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);

      const [ausleihenRes, itemsRes, eventsRes] = await Promise.all([
        apiClient.get(`/inventar/ausleihen?${params}`),
        apiClient.get('/inventar/items?status=verfuegbar'),
        apiClient.get('/kalender/events'),
      ]);

      setAusleihen(ausleihenRes.data);
      setItems(itemsRes.data);
      setEvents(eventsRes.data);
      
      // Preselected Item?
      if (preselectedItemId && itemsRes.data.length > 0) {
        const item = itemsRes.data.find(i => i.id === parseInt(preselectedItemId));
        if (item) {
          setSelectedItems([{
            item_id: item.id,
            item_name: item.name,
            item_inventar_nr: item.inventar_nr,
            menge: 1,
            zustand_ausleihe: item.zustand,
            notizen: '',
            unterschrift: '',
          }]);
        }
      }
    } catch (err) {
      console.error('Fehler:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, preselectedItemId]);

  useEffect(() => {
    fetchData();
    
    // Default-Daten für neue Ausleihe
    const now = new Date();
    const bis = new Date(now);
    bis.setDate(bis.getDate() + 1);
    setFormData(f => ({
      ...f,
      ausleihe_von: now.toISOString().slice(0, 16),
      ausleihe_bis: bis.toISOString().slice(0, 16),
    }));
  }, [fetchData]);

  const addItem = (item) => {
    if (selectedItems.find(si => si.item_id === item.id)) return;
    setSelectedItems([...selectedItems, {
      item_id: item.id,
      item_name: item.name,
      item_inventar_nr: item.inventar_nr,
      menge: 1,
      zustand_ausleihe: item.zustand,
      notizen: '',
      unterschrift: '',
    }]);
    setItemSearch('');
  };

  const removeItem = (itemId) => {
    setSelectedItems(selectedItems.filter(si => si.item_id !== itemId));
  };

  const handleSaveSignature = () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      alert('Bitte unterschreiben');
      return;
    }
    
    const sigData = sigPadRef.current.toDataURL('image/png');
    
    if (currentSigFor === null) {
      // Globale Unterschrift
      setGlobalSignature(sigData);
    } else {
      // Individuelle Unterschrift
      setSelectedItems(selectedItems.map(si => 
        si.item_id === currentSigFor ? { ...si, unterschrift: sigData } : si
      ));
    }
    
    setShowSigPad(false);
    setCurrentSigFor(null);
    sigPadRef.current.clear();
  };

  const handleCreateAusleihe = async () => {
    if (!formData.ausleiher_name || selectedItems.length === 0) {
      alert('Bitte Ausleiher und mindestens ein Item angeben');
      return;
    }
    
    // Prüfe Unterschriften
    if (formData.unterschrift_modus === 'global' && !globalSignature) {
      alert('Bitte unterschreiben');
      return;
    }
    if (formData.unterschrift_modus === 'individuell') {
      const missing = selectedItems.find(si => !si.unterschrift);
      if (missing) {
        alert(`Unterschrift fehlt für: ${missing.item_name}`);
        return;
      }
    }
    
    setSaving(true);
    try {
      const payload = {
        ...formData,
        event_id: formData.event_id || null,
        unterschrift_ausleihe: formData.unterschrift_modus === 'global' ? globalSignature : '',
        positionen: selectedItems.map(si => ({
          item_id: si.item_id,
          menge: si.menge,
          zustand_ausleihe: si.zustand_ausleihe,
          notizen: si.notizen,
          unterschrift: formData.unterschrift_modus === 'individuell' ? si.unterschrift : '',
        })),
      };
      
      const res = await apiClient.post('/inventar/ausleihen', payload);
      navigate(`/ausleihen/${res.data.id}`);
    } catch (err) {
      console.error('Fehler:', err);
      alert('Ausleihe konnte nicht erstellt werden');
    } finally {
      setSaving(false);
    }
  };

  const handleRueckgabe = async () => {
    if (!rueckgabeAusleihe) return;
    
    let sigData = '';
    if (rueckgabeSigRef.current && !rueckgabeSigRef.current.isEmpty()) {
      sigData = rueckgabeSigRef.current.toDataURL('image/png');
    }
    
    try {
      await apiClient.post(`/inventar/ausleihen/${rueckgabeAusleihe.id}/rueckgabe`, {
        unterschrift_rueckgabe: sigData,
        notizen_rueckgabe: '',
        positionen: rueckgabeAusleihe.positionen?.map(p => ({
          item_id: p.item_id,
          zustand_rueckgabe: p.zustand_ausleihe, // Same as before by default
        })) || [],
      });
      
      setShowRueckgabeModal(false);
      setRueckgabeAusleihe(null);
      fetchData();
    } catch (err) {
      alert('Rückgabe fehlgeschlagen');
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    item.inventar_nr.toLowerCase().includes(itemSearch.toLowerCase())
  );

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
          <h1 className="text-2xl font-bold text-white">Ausleihen</h1>
          <p className="text-gray-400">Verwalte Ausleihvorgänge</p>
        </div>
        <button
          onClick={() => setShowNeu(!showNeu)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
        >
          <Plus className="w-5 h-5" />
          Neue Ausleihe
        </button>
      </div>

      {/* Neue Ausleihe Form */}
      {showNeu && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white">Neue Ausleihe</h2>
          
          {/* Ausleiher */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Ausleiher Name *</label>
              <input
                type="text"
                value={formData.ausleiher_name}
                onChange={(e) => setFormData({ ...formData, ausleiher_name: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Organisation</label>
              <input
                type="text"
                value={formData.ausleiher_organisation}
                onChange={(e) => setFormData({ ...formData, ausleiher_organisation: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">E-Mail</label>
              <input
                type="email"
                value={formData.ausleiher_email}
                onChange={(e) => setFormData({ ...formData, ausleiher_email: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Telefon</label>
              <input
                type="tel"
                value={formData.ausleiher_telefon}
                onChange={(e) => setFormData({ ...formData, ausleiher_telefon: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
          </div>
          
          {/* Zeitraum */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Von *</label>
              <input
                type="datetime-local"
                value={formData.ausleihe_von}
                onChange={(e) => setFormData({ ...formData, ausleihe_von: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Bis *</label>
              <input
                type="datetime-local"
                value={formData.ausleihe_bis}
                onChange={(e) => setFormData({ ...formData, ausleihe_bis: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Event (optional)</label>
              <select
                value={formData.event_id}
                onChange={(e) => setFormData({ ...formData, event_id: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              >
                <option value="">Kein Event</option>
                {events.map(e => (
                  <option key={e.id} value={e.id}>{e.titel}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Items */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Items auswählen *</label>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Item suchen..."
                className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              />
              {itemSearch && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg max-h-48 overflow-y-auto z-10">
                  {filteredItems.slice(0, 10).map(item => (
                    <button
                      key={item.id}
                      onClick={() => addItem(item)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-700 text-white"
                    >
                      <span className="font-medium">{item.name}</span>
                      <span className="text-sm text-gray-400 ml-2">{item.inventar_nr}</span>
                    </button>
                  ))}
                  {filteredItems.length === 0 && (
                    <p className="px-3 py-2 text-gray-400">Keine Items gefunden</p>
                  )}
                </div>
              )}
            </div>
            
            {/* Ausgewählte Items */}
            {selectedItems.length > 0 && (
              <div className="space-y-2">
                {selectedItems.map(si => (
                  <div key={si.item_id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div>
                      <span className="font-medium text-white">{si.item_name}</span>
                      <span className="text-sm text-gray-400 ml-2">{si.item_inventar_nr}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {formData.unterschrift_modus === 'individuell' && (
                        <button
                          onClick={() => { setCurrentSigFor(si.item_id); setShowSigPad(true); }}
                          className={`p-2 rounded-lg ${si.unterschrift ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                        >
                          <Pen className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => removeItem(si.item_id)}
                        className="p-2 text-red-400 hover:bg-red-900/20 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Unterschrift Modus */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Unterschrift</label>
            <div className="flex gap-4">
              {[
                { value: 'keine', label: 'Keine Unterschrift' },
                { value: 'global', label: 'Eine für alle (Global)' },
                { value: 'individuell', label: 'Pro Item (Individuell)' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="unterschrift_modus"
                    value={opt.value}
                    checked={formData.unterschrift_modus === opt.value}
                    onChange={(e) => setFormData({ ...formData, unterschrift_modus: e.target.value })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
            
            {/* Globale Unterschrift */}
            {formData.unterschrift_modus === 'global' && (
              <div className="mt-4">
                {globalSignature ? (
                  <div className="flex items-center gap-4">
                    <img src={globalSignature} alt="Unterschrift" className="h-20 bg-white rounded" />
                    <button
                      onClick={() => { setGlobalSignature(''); setCurrentSigFor(null); setShowSigPad(true); }}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Neu unterschreiben
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setCurrentSigFor(null); setShowSigPad(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
                  >
                    <Pen className="w-4 h-4" />
                    Unterschreiben
                  </button>
                )}
              </div>
            )}
          </div>
          
          {/* Notizen */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Notizen</label>
            <textarea
              value={formData.notizen_ausleihe}
              onChange={(e) => setFormData({ ...formData, notizen_ausleihe: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none"
            />
          </div>
          
          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowNeu(false)}
              className="px-4 py-2 text-gray-400 hover:text-white"
            >
              Abbrechen
            </button>
            <button
              onClick={handleCreateAusleihe}
              disabled={saving || !formData.ausleiher_name || selectedItems.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Ausleihe erstellen
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {['', 'aktiv', 'teilrueckgabe', 'zurueckgegeben'].map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              filterStatus === status ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {status === '' ? 'Alle' : 
             status === 'aktiv' ? 'Aktiv' :
             status === 'teilrueckgabe' ? 'Teilrückgabe' : 'Zurückgegeben'}
          </button>
        ))}
      </div>

      {/* Ausleihen Liste */}
      {ausleihen.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Keine Ausleihen vorhanden</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ausleihen.map(a => (
            <div
              key={a.id}
              className={`bg-gray-900 border rounded-xl p-4 ${
                a.ist_ueberfaellig ? 'border-red-600' : 'border-gray-800'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <span className="font-medium text-white">{a.ausleiher_name}</span>
                    {a.ausleiher_organisation && (
                      <span className="text-sm text-gray-400 ml-2">({a.ausleiher_organisation})</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a.ist_ueberfaellig && (
                    <span className="flex items-center gap-1 px-2 py-1 text-xs bg-red-900/30 text-red-400 rounded">
                      <AlertTriangle className="w-3 h-3" />
                      Überfällig
                    </span>
                  )}
                  <span className={`px-2 py-1 text-xs rounded ${
                    a.status === 'aktiv' ? 'bg-blue-900/30 text-blue-400' :
                    a.status === 'zurueckgegeben' ? 'bg-green-900/30 text-green-400' :
                    a.status === 'teilrueckgabe' ? 'bg-yellow-900/30 text-yellow-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {a.status_display}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(a.ausleihe_von).toLocaleDateString('de-DE')} - {new Date(a.ausleihe_bis).toLocaleDateString('de-DE')}
                </span>
                <span className="flex items-center gap-1">
                  <Package className="w-4 h-4" />
                  {a.anzahl_items} Items
                </span>
              </div>
              
              {a.zweck && (
                <p className="text-sm text-gray-400 mb-3">Zweck: {a.zweck}</p>
              )}
              
              <div className="flex justify-end gap-2">
                <Link
                  to={`/ausleihen/${a.id}`}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
                >
                  Details
                </Link>
                {a.status === 'aktiv' && (
                  <button
                    onClick={() => { setRueckgabeAusleihe(a); setShowRueckgabeModal(true); }}
                    className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg"
                  >
                    Rückgabe
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Signatur Modal */}
      {showSigPad && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                {currentSigFor ? 'Unterschrift für Item' : 'Unterschrift'}
              </h2>
              <button onClick={() => { setShowSigPad(false); setCurrentSigFor(null); }} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="bg-white rounded-lg mb-4">
              <SignatureCanvas
                ref={sigPadRef}
                canvasProps={{
                  className: 'w-full h-48',
                  style: { width: '100%', height: '192px' }
                }}
                backgroundColor="white"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => sigPadRef.current?.clear()}
                className="flex-1 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
              >
                Löschen
              </button>
              <button
                onClick={handleSaveSignature}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rückgabe Modal */}
      {showRueckgabeModal && rueckgabeAusleihe && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Rückgabe bestätigen</h2>
              <button onClick={() => { setShowRueckgabeModal(false); setRueckgabeAusleihe(null); }} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-gray-400 mb-4">
              Ausleihe von <strong className="text-white">{rueckgabeAusleihe.ausleiher_name}</strong> wird zurückgegeben.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Unterschrift (optional)</label>
              <div className="bg-white rounded-lg">
                <SignatureCanvas
                  ref={rueckgabeSigRef}
                  canvasProps={{
                    className: 'w-full h-32',
                    style: { width: '100%', height: '128px' }
                  }}
                  backgroundColor="white"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => { setShowRueckgabeModal(false); setRueckgabeAusleihe(null); }}
                className="flex-1 py-2 text-gray-400 hover:text-white"
              >
                Abbrechen
              </button>
              <button
                onClick={handleRueckgabe}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg"
              >
                Rückgabe bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
