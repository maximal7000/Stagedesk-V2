/**
 * Ausleih-Übersicht: Listen erstellen, dann Items hinzufügen und aktivieren.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { 
  Plus, Search, Package, ArrowLeft, 
  Loader2, AlertTriangle, Clock, User, Calendar,
  X, Check, Pen, Mail, RefreshCw, Play
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import apiClient from '../lib/api';

export default function AusleihePage() {
  const navigate = useNavigate();
  const { id: listId } = useParams();
  const [searchParams] = useSearchParams();
  const preselectedItemId = searchParams.get('item');
  
  const [ausleihen, setAusleihen] = useState([]);
  const [detailListe, setDetailListe] = useState(null);
  const [items, setItems] = useState([]);
  const [ausleiherListe, setAusleiherListe] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter (nur auf Übersicht)
  const [filterStatus, setFilterStatus] = useState('');
  const [showNeu, setShowNeu] = useState(false);
  
  // Neue Liste (nur Metadaten, keine Items)
  const [formData, setFormData] = useState({
    ausleiher_id: '',
    ausleiher_name: '',
    ausleiher_organisation: '',
    zweck: '',
    frist: '',
    modus: 'global',
    notizen: '',
  });
  const [ausleiherSearch, setAusleiherSearch] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Detail: Item hinzufügen (bei offener Liste)
  const [itemSearch, setItemSearch] = useState('');
  
  // Signatur (für Aktivieren)
  const sigPadRef = useRef(null);
  const [showSigPad, setShowSigPad] = useState(false);
  const [globalSignature, setGlobalSignature] = useState('');
  const [activating, setActivating] = useState(false);
  
  // Rückgabe Modal
  const [showRueckgabeModal, setShowRueckgabeModal] = useState(false);
  const [rueckgabeAusleihe, setRueckgabeAusleihe] = useState(null);
  const rueckgabeSigRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);

      const [ausleihenRes, itemsRes, ausleiherRes] = await Promise.all([
        apiClient.get(`/inventar/ausleihen?${params}`),
        apiClient.get('/inventar/items?status=verfuegbar'),
        apiClient.get('/inventar/ausleiher'),
      ]);

      setAusleihen(ausleihenRes.data);
      setItems(itemsRes.data);
      setAusleiherListe(ausleiherRes.data);
    } catch (err) {
      console.error('Fehler:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  const fetchDetailListe = useCallback(async () => {
    if (!listId) return;
    try {
      const [listRes, itemsRes] = await Promise.all([
        apiClient.get(`/inventar/ausleihlisten/${listId}`),
        apiClient.get('/inventar/items?status=verfuegbar'),
      ]);
      setDetailListe(listRes.data);
      setItems(itemsRes.data);
    } catch (err) {
      console.error('Fehler:', err);
      setDetailListe(null);
    }
  }, [listId]);

  useEffect(() => {
    if (listId) {
      setLoading(true);
      fetchDetailListe().finally(() => setLoading(false));
    } else {
      fetchData();
    }
  }, [listId, fetchDetailListe, fetchData]);

  useEffect(() => {
    if (!listId) {
      const frist = new Date();
      frist.setDate(frist.getDate() + 7);
      setFormData(f => ({ ...f, frist: frist.toISOString().slice(0, 10) }));
    }
  }, [listId]);

  const selectAusleiher = (ausleiher) => {
    setFormData(f => ({
      ...f,
      ausleiher_id: ausleiher.id,
      ausleiher_name: ausleiher.name,
      ausleiher_organisation: ausleiher.organisation || '',
    }));
    setAusleiherSearch('');
  };

  /** Neue Liste erstellen (ohne Items) → Weiterleitung zur Liste zum Items hinzufügen */
  const handleCreateListe = async () => {
    if (!formData.ausleiher_name) {
      alert('Bitte Ausleiher angeben');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ausleiher_id: formData.ausleiher_id || null,
        ausleiher_name: formData.ausleiher_name,
        ausleiher_organisation: formData.ausleiher_organisation,
        zweck: formData.zweck,
        frist: formData.frist || null,
        modus: formData.modus,
        notizen: formData.notizen,
        positionen: [],
      };
      const res = await apiClient.post('/inventar/ausleihlisten', payload);
      setShowNeu(false);
      navigate(`/ausleihen/${res.data.id}`);
    } catch (err) {
      console.error('Fehler:', err);
      alert('Liste konnte nicht erstellt werden');
    } finally {
      setSaving(false);
    }
  };

  /** Item zu offener Liste hinzufügen */
  const handleAddItemToList = async (item) => {
    if (!detailListe || detailListe.status !== 'offen') return;
    try {
      await apiClient.post(`/inventar/ausleihlisten/${listId}/positionen`, {
        item_id: item.id,
        zustand_ausleihe: 'ok',
        unterschrift: '',
        foto_ausleihe: '',
      });
      setItemSearch('');
      fetchDetailListe();
      // Verfügbare Items neu laden (Item ist dann nicht mehr verfügbar nach Aktivierung, aber bis dahin noch)
      const itemsRes = await apiClient.get('/inventar/items?status=verfuegbar');
      setItems(itemsRes.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Item konnte nicht hinzugefügt werden');
    }
  };

  /** Position aus offener Liste entfernen */
  const handleRemovePosition = async (positionId) => {
    if (!detailListe || detailListe.status !== 'offen') return;
    try {
      await apiClient.delete(`/inventar/ausleihlisten/${listId}/positionen/${positionId}`);
      fetchDetailListe();
      const itemsRes = await apiClient.get('/inventar/items?status=verfuegbar');
      setItems(itemsRes.data);
    } catch (err) {
      alert('Entfernen fehlgeschlagen');
    }
  };

  const handleSaveSignature = () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      alert('Bitte unterschreiben');
      return;
    }
    setGlobalSignature(sigPadRef.current.toDataURL('image/png'));
    setShowSigPad(false);
    sigPadRef.current.clear();
  };

  /** Offene Liste aktivieren */
  const handleAktivieren = async () => {
    if (!detailListe || detailListe.status !== 'offen') return;
    if (detailListe.positionen.length === 0) {
      alert('Mindestens ein Item hinzufügen');
      return;
    }
    if (detailListe.modus === 'global' && !globalSignature) {
      setShowSigPad(true);
      return;
    }
    setActivating(true);
    try {
      await apiClient.post(`/inventar/ausleihlisten/${listId}/aktivieren`, {
        unterschrift_ausleihe: detailListe.modus === 'global' ? globalSignature : '',
        positionen_unterschriften: [],
      });
      setGlobalSignature('');
      fetchDetailListe();
    } catch (err) {
      alert(err.response?.data?.error || 'Aktivieren fehlgeschlagen');
    } finally {
      setActivating(false);
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
        rueckgabe_zustand: 'ok',
        positionen: rueckgabeAusleihe.positionen?.map(p => ({
          item_id: p.item_id,
          zustand_rueckgabe: 'ok',
        })) || [],
      });
      
      setShowRueckgabeModal(false);
      setRueckgabeAusleihe(null);
      fetchData();
    } catch (err) {
      alert('Rückgabe fehlgeschlagen');
    }
  };

  const handleSendMahnung = async (ausleihId) => {
    try {
      const res = await apiClient.post(`/inventar/ausleihlisten/${ausleihId}/mahnung`);
      if (res.data.success) {
        alert('Mahnung per E-Mail gesendet!');
      } else {
        alert(`Fehler: ${res.data.message}`);
      }
    } catch (err) {
      alert('Mahnung konnte nicht gesendet werden');
    }
  };

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    (item.seriennummer && item.seriennummer.toLowerCase().includes(itemSearch.toLowerCase()))
  );
  const filteredAusleiher = ausleiherListe.filter(a =>
    a.name.toLowerCase().includes(ausleiherSearch.toLowerCase()) ||
    (a.organisation && a.organisation.toLowerCase().includes(ausleiherSearch.toLowerCase()))
  );

  if (loading && !listId) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      </div>
    );
  }

  // Detail-Ansicht: eine Ausleihliste (Items hinzufügen / aktivieren / Rückgabe)
  if (listId) {
    if (!detailListe) {
      return (
        <div className="space-y-6">
          <button onClick={() => navigate('/ausleihen')} className="flex items-center gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" /> Zurück
          </button>
          <div className="text-gray-400">Liste wird geladen…</div>
        </div>
      );
    }
    const isOffen = detailListe.status === 'offen';

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/ausleihen')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Ausleihliste #{detailListe.id}</h1>
            <p className="text-gray-400">{detailListe.ausleiher_name}{detailListe.ausleiher_organisation ? ` (${detailListe.ausleiher_organisation})` : ''}</p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-gray-400">
            {detailListe.frist && <span>Frist: {new Date(detailListe.frist).toLocaleDateString('de-DE')}</span>}
            {detailListe.zweck && <span>Zweck: {detailListe.zweck}</span>}
            <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300">{detailListe.status_display || detailListe.status}</span>
          </div>

          {isOffen && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Items in diese Liste hinzufügen</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Item suchen..."
                    className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  />
                  {itemSearch && (
                    <ul className="absolute left-0 right-0 mt-1 py-1 bg-gray-800 border border-gray-700 rounded-lg max-h-48 overflow-y-auto z-10">
                      {filteredItems.slice(0, 10).map(item => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => handleAddItemToList(item)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 text-white"
                          >
                            {item.name}
                            {item.seriennummer && <span className="text-gray-400 ml-2">{item.seriennummer}</span>}
                          </button>
                        </li>
                      ))}
                      {filteredItems.length === 0 && <li className="px-3 py-2 text-gray-400">Keine verfügbaren Items</li>}
                    </ul>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-white">Enthaltene Items ({detailListe.positionen?.length || 0})</h3>
                {detailListe.modus === 'global' && (
                  <div className="flex items-center gap-2">
                    {globalSignature ? (
                      <span className="text-green-400 text-sm">Unterschrift vorhanden</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowSigPad(true)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 text-white rounded-lg text-sm"
                      >
                        <Pen className="w-4 h-4" /> Unterschreiben
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          <ul className="space-y-2">
            {(detailListe.positionen || []).map(pos => (
              <li key={pos.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                <span className="font-medium text-white">{pos.item_name}</span>
                {isOffen && (
                  <button
                    type="button"
                    onClick={() => handleRemovePosition(pos.id)}
                    className="p-1.5 text-red-400 hover:bg-red-900/20 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
            {(!detailListe.positionen || detailListe.positionen.length === 0) && (
              <li className="text-gray-400 py-4 text-center">Noch keine Items in der Liste</li>
            )}
          </ul>

          {isOffen && (
            <div className="pt-4 border-t border-gray-800">
              <button
                type="button"
                onClick={handleAktivieren}
                disabled={activating || (detailListe.positionen?.length || 0) === 0 || (detailListe.modus === 'global' && !globalSignature)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-lg"
              >
                {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Ausleihe aktivieren
              </button>
            </div>
          )}

          {detailListe.status === 'aktiv' && (
            <div className="pt-4 border-t border-gray-800">
              <button
                type="button"
                onClick={() => { setRueckgabeAusleihe(detailListe); setShowRueckgabeModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg"
              >
                <RefreshCw className="w-4 h-4" /> Rückgabe
              </button>
            </div>
          )}
        </div>

        {/* Signatur-Modal für Aktivieren */}
        {showSigPad && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Unterschrift (für Aktivierung)</h2>
              <div className="bg-white rounded-lg mb-4">
                <SignatureCanvas ref={sigPadRef} canvasProps={{ className: 'w-full h-48', style: { width: '100%', height: '192px' } }} backgroundColor="white" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => sigPadRef.current?.clear()} className="flex-1 py-2 bg-gray-800 text-white rounded-lg">Löschen</button>
                <button type="button" onClick={handleSaveSignature} className="flex-1 py-2 bg-blue-600 text-white font-semibold rounded-lg">Übernehmen</button>
              </div>
            </div>
          </div>
        )}

        {/* Rückgabe-Modal (wie unten) */}
        {showRueckgabeModal && rueckgabeAusleihe && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Rückgabe bestätigen</h2>
                <button type="button" onClick={() => { setShowRueckgabeModal(false); setRueckgabeAusleihe(null); }} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-gray-400 mb-4">Ausleihe von <strong className="text-white">{rueckgabeAusleihe.ausleiher_name}</strong> wird zurückgegeben.</p>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Unterschrift (optional)</label>
                <div className="bg-white rounded-lg">
                  <SignatureCanvas ref={rueckgabeSigRef} canvasProps={{ className: 'w-full h-32', style: { width: '100%', height: '128px' } }} backgroundColor="white" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowRueckgabeModal(false); setRueckgabeAusleihe(null); }} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
                <button type="button" onClick={handleRueckgabe} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg">Rückgabe bestätigen</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Übersicht: alle Listen + "Neue Ausleihliste"
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/inventar')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Ausleihen</h1>
          <p className="text-gray-400">Listen erstellen, Items hinzufügen und aktivieren</p>
        </div>
        <button
          onClick={() => setShowNeu(!showNeu)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
        >
          <Plus className="w-5 h-5" />
          Neue Ausleihliste
        </button>
      </div>

      {/* Formular: nur Liste anlegen (ohne Items) */}
      {showNeu && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Neue Ausleihliste anlegen</h2>
          <p className="text-sm text-gray-400">Danach kannst du die Liste öffnen und Items hinzufügen.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Ausleiher aus Datenbank</label>
              <div className="relative">
                <input
                  type="text"
                  value={ausleiherSearch}
                  onChange={(e) => setAusleiherSearch(e.target.value)}
                  placeholder="Suchen..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
                {ausleiherSearch && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg max-h-40 overflow-y-auto z-10">
                    {filteredAusleiher.slice(0, 5).map(a => (
                      <button key={a.id} type="button" onClick={() => selectAusleiher(a)} className="w-full text-left px-3 py-2 hover:bg-gray-700 text-white">
                        {a.name}{a.organisation ? ` (${a.organisation})` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name *</label>
              <input type="text" value={formData.ausleiher_name} onChange={(e) => setFormData({ ...formData, ausleiher_name: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Organisation</label>
              <input type="text" value={formData.ausleiher_organisation} onChange={(e) => setFormData({ ...formData, ausleiher_organisation: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Rückgabe-Frist</label>
              <input type="date" value={formData.frist} onChange={(e) => setFormData({ ...formData, frist: e.target.value })} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Zweck</label>
            <input type="text" value={formData.zweck} onChange={(e) => setFormData({ ...formData, zweck: e.target.value })} placeholder="z.B. Konzert, Veranstaltung" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Unterschrift bei Aktivierung</label>
            <div className="flex gap-4">
              {['keine', 'global', 'individuell'].map(v => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="modus" value={v} checked={formData.modus === v} onChange={(e) => setFormData({ ...formData, modus: e.target.value })} className="w-4 h-4" />
                  <span className="text-sm text-gray-300">{v === 'keine' ? 'Keine' : v === 'global' ? 'Eine für alle' : 'Pro Item'}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Notizen</label>
            <textarea value={formData.notizen} onChange={(e) => setFormData({ ...formData, notizen: e.target.value })} rows={2} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowNeu(false)} className="px-4 py-2 text-gray-400 hover:text-white">Abbrechen</button>
            <button type="button" onClick={handleCreateListe} disabled={saving || !formData.ausleiher_name} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Liste anlegen und Items hinzufügen
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: '', label: 'Alle' },
          { value: 'aktiv', label: 'Aktiv' },
          { value: 'teilrueckgabe', label: 'Teilrückgabe' },
          { value: 'abgeschlossen', label: 'Abgeschlossen' },
        ].map(s => (
          <button
            key={s.value}
            onClick={() => setFilterStatus(s.value)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              filterStatus === s.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {s.label}
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
                    a.status === 'abgeschlossen' ? 'bg-green-900/30 text-green-400' :
                    a.status === 'teilrueckgabe' ? 'bg-yellow-900/30 text-yellow-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {a.status_display || a.status}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
                {a.frist && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Frist: {new Date(a.frist).toLocaleDateString('de-DE')}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Package className="w-4 h-4" />
                  {a.anzahl_items} Items
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {new Date(a.erstellt_am).toLocaleDateString('de-DE')}
                </span>
              </div>
              
              {a.zweck && (
                <p className="text-sm text-gray-400 mb-3">Zweck: {a.zweck}</p>
              )}
              
              <div className="flex justify-end gap-2">
                {a.ist_ueberfaellig && (
                  <button
                    onClick={() => handleSendMahnung(a.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-orange-400 hover:text-orange-300 hover:bg-orange-900/20 rounded-lg"
                  >
                    <Mail className="w-4 h-4" />
                    Mahnung
                  </button>
                )}
                <Link
                  to={`/ausleihen/${a.id}`}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
                >
                  Details
                </Link>
                {a.status === 'aktiv' && (
                  <button
                    onClick={() => { setRueckgabeAusleihe(a); setShowRueckgabeModal(true); }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg"
                  >
                    <RefreshCw className="w-4 h-4" />
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
