/**
 * Ausleih-System v2: Listen mit Sektionen, modaler Erstellung, Mehrfachauswahl, Signaturflow
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Package, ArrowLeft,
  Loader2, AlertTriangle, Clock, User, Calendar,
  X, Check, Pen, Mail, RefreshCw, Play,
  ScanLine, FileDown, ExternalLink, Layers,
  ChevronDown, ChevronRight, MapPin, Send,
  Trash2, PlusCircle
} from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import apiClient from '../lib/api';
import QRScanner from '../components/QRScanner';
import { downloadLeihschein, generateLeihscheinPdf } from '../lib/pdfGenerator';

// ─── Hilfs-Komponenten ────────────────────────────────────────────

function SectionHeader({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-2 text-left group"
      >
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <span className="font-semibold text-white">{title}</span>
        <span className="text-sm text-gray-500">({count})</span>
      </button>
      {open && <div className="space-y-3 pb-4">{children}</div>}
    </div>
  );
}

function StatusBadge({ status, statusDisplay, istUeberfaellig }) {
  const colors = {
    offen: 'bg-gray-700 text-gray-300',
    aktiv: 'bg-blue-900/30 text-blue-400',
    teilrueckgabe: 'bg-yellow-900/30 text-yellow-400',
    abgeschlossen: 'bg-green-900/30 text-green-400',
    abgebrochen: 'bg-red-900/30 text-red-400',
  };
  return (
    <div className="flex items-center gap-2">
      {istUeberfaellig && (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-red-900/30 text-red-400 rounded">
          <AlertTriangle className="w-3 h-3" /> Überfällig
        </span>
      )}
      <span className={`px-2 py-0.5 text-xs rounded ${colors[status] || 'bg-gray-700 text-gray-400'}`}>
        {statusDisplay || status}
      </span>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────

export default function AusleihePage() {
  const navigate = useNavigate();
  const { id: listId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [ausleihen, setAusleihen] = useState([]);
  const [detailListe, setDetailListe] = useState(null);
  const [items, setItems] = useState([]);
  const [ausleiherListe, setAusleiherListe] = useState([]);
  const [loading, setLoading] = useState(true);

  // ─── Modale ────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showSignatureFlow, setShowSignatureFlow] = useState(false);
  const [showRueckgabeModal, setShowRueckgabeModal] = useState(false);
  const [showEinzelrueckgabe, setShowEinzelrueckgabe] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // ─── Create-Modal State ────
  const [createForm, setCreateForm] = useState({
    titel: '',
    modus: 'global',
    ausleiher_name: '',
    ausleiher_ort: '',
    zweck: '',
    frist: '',
    notizen: '',
  });
  const [saving, setSaving] = useState(false);

  // ─── Item-Modal State ────
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState([]); // [{item, anzahl, ausleiher_name, ausleiher_ort}]
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [addingItems, setAddingItems] = useState(false);

  // ─── Signatur-Flow State ────
  const [signatureMode, setSignatureMode] = useState(null); // null | 'none' | 'single' | 'per_item'
  const [signatureStep, setSignatureStep] = useState('choose'); // 'choose' | 'sign'
  const [globalSignature, setGlobalSignature] = useState('');
  const [itemSignatures, setItemSignatures] = useState({}); // {item_id: base64}
  const [currentSignItemIdx, setCurrentSignItemIdx] = useState(0);
  const sigPadRef = useRef(null);
  const [activating, setActivating] = useState(false);

  // ─── Rückgabe State ────
  const [rueckgabeAusleihe, setRueckgabeAusleihe] = useState(null);
  const rueckgabeSigRef = useRef(null);
  const [einzelrueckgabePos, setEinzelrueckgabePos] = useState(null);
  const [einzelZustand, setEinzelZustand] = useState('ok');
  const [einzelNotizen, setEinzelNotizen] = useState('');

  // ─── QR State ────
  const [scanMode, setScanMode] = useState(null);

  // ─── Item-Sets ────
  const [itemSets, setItemSets] = useState([]);
  const [showSetDropdown, setShowSetDropdown] = useState(false);

  // ─── Email State ────
  const [emailForm, setEmailForm] = useState({ email: '', betreff: '', nachricht: '' });
  const [sendingEmail, setSendingEmail] = useState(false);

  // ═══ Daten laden ═══

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ausleihenRes, ausleiherRes] = await Promise.all([
        apiClient.get('/inventar/ausleihen'),
        apiClient.get('/inventar/ausleiher'),
      ]);
      setAusleihen(ausleihenRes.data);
      setAusleiherListe(ausleiherRes.data);
    } catch (err) {
      console.error('Fehler:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetailListe = useCallback(async () => {
    if (!listId) return;
    try {
      const [listRes, itemsRes, setsRes] = await Promise.all([
        apiClient.get(`/inventar/ausleihlisten/${listId}`),
        apiClient.get('/inventar/items'),
        apiClient.get('/inventar/sets'),
      ]);
      setDetailListe(listRes.data);
      setItems(itemsRes.data);
      setItemSets(setsRes.data || []);
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

  // ═══ Erstellen ═══

  const handleCreateListe = async () => {
    if (!createForm.titel) {
      toast.error('Bitte Titel angeben');
      return;
    }
    if (createForm.modus === 'global' && !createForm.ausleiher_name) {
      toast.error('Bitte Ausleiher-Name angeben');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        titel: createForm.titel,
        modus: createForm.modus,
        ausleiher_name: createForm.modus === 'global' ? createForm.ausleiher_name : '',
        ausleiher_ort: createForm.modus === 'global' ? createForm.ausleiher_ort : '',
        zweck: createForm.zweck,
        frist: createForm.frist || null,
        notizen: createForm.notizen,
        positionen: [],
      };
      const res = await apiClient.post('/inventar/ausleihlisten', payload);
      setShowCreateModal(false);
      setCreateForm({ titel: '', modus: 'global', ausleiher_name: '', ausleiher_ort: '', zweck: '', frist: '', notizen: '' });
      navigate(`/ausleihen/${res.data.id}`);
    } catch (err) {
      toast.error('Liste konnte nicht erstellt werden');
    } finally {
      setSaving(false);
    }
  };

  // ═══ Item-Auswahl Modal ═══

  const openItemModal = async () => {
    setSelectedItems([]);
    setItemSearch('');
    setShowQuickAdd(false);
    // Items laden falls noch nicht geladen
    if (items.length === 0) {
      try {
        const res = await apiClient.get('/inventar/items');
        setItems(res.data);
      } catch {}
    }
    setShowItemModal(true);
  };

  const toggleItemSelection = (item) => {
    setSelectedItems(prev => {
      const exists = prev.find(s => s.item.id === item.id);
      if (exists) return prev.filter(s => s.item.id !== item.id);
      return [...prev, { item, anzahl: 1, ausleiher_name: '', ausleiher_ort: '' }];
    });
  };

  const updateSelectedItem = (itemId, field, value) => {
    setSelectedItems(prev => prev.map(s =>
      s.item.id === itemId ? { ...s, [field]: value } : s
    ));
  };

  const handleQuickAddItem = async () => {
    if (!quickAddName.trim()) return;
    try {
      const res = await apiClient.post('/inventar/items', { name: quickAddName.trim() });
      setItems(prev => [...prev, res.data]);
      toggleItemSelection(res.data);
      setQuickAddName('');
      setShowQuickAdd(false);
      toast.success(`"${res.data.name}" zum Inventar hinzugefügt`);
    } catch (err) {
      toast.error('Item konnte nicht erstellt werden');
    }
  };

  const handleAddSelectedItems = async () => {
    if (!detailListe || detailListe.status !== 'offen' || selectedItems.length === 0) return;
    setAddingItems(true);
    const existingIds = new Set((detailListe.positionen || []).map(p => p.item_id));
    let added = 0, errors = 0;

    for (const sel of selectedItems) {
      if (existingIds.has(sel.item.id)) continue;
      try {
        await apiClient.post(`/inventar/ausleihlisten/${listId}/positionen`, {
          item_id: sel.item.id,
          anzahl: sel.anzahl,
          ausleiher_name: sel.ausleiher_name,
          ausleiher_ort: sel.ausleiher_ort,
          zustand_ausleihe: 'ok',
          unterschrift: '',
          foto_ausleihe: '',
        });
        added++;
      } catch {
        errors++;
      }
    }

    setShowItemModal(false);
    setAddingItems(false);
    if (added > 0) toast.success(`${added} Artikel hinzugefügt`);
    if (errors > 0) toast.error(`${errors} Artikel konnten nicht hinzugefügt werden`);
    fetchDetailListe();
  };

  // ─── Set hinzufügen ────
  const handleAddSetToList = async (set) => {
    if (!detailListe || detailListe.status !== 'offen') return;
    if (!set.positionen || set.positionen.length === 0) {
      toast.error('Dieses Set enthält keine Items');
      return;
    }
    const existingIds = new Set((detailListe.positionen || []).map(p => p.item_id));
    let added = 0, errors = 0;
    for (const pos of set.positionen) {
      if (existingIds.has(pos.item_id)) continue;
      try {
        await apiClient.post(`/inventar/ausleihlisten/${listId}/positionen`, {
          item_id: pos.item_id,
          zustand_ausleihe: 'ok',
          unterschrift: '',
          foto_ausleihe: '',
        });
        added++;
      } catch { errors++; }
    }
    setShowSetDropdown(false);
    if (added > 0) toast.success(`${added} Item(s) aus "${set.name}" hinzugefügt`);
    if (errors > 0) toast.error(`${errors} konnten nicht hinzugefügt werden`);
    fetchDetailListe();
  };

  // ═══ Signatur-Flow ═══

  const openSignatureFlow = () => {
    setSignatureMode(null);
    setSignatureStep('choose');
    setGlobalSignature('');
    setItemSignatures({});
    setCurrentSignItemIdx(0);
    setShowSignatureFlow(true);
  };

  const handleSignatureChoiceDone = () => {
    if (signatureMode === 'none') {
      handleAktivieren('');
    } else {
      setSignatureStep('sign');
    }
  };

  const handleSaveGlobalSignature = () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      toast.error('Bitte unterschreiben');
      return;
    }
    const sig = sigPadRef.current.toDataURL('image/png');
    setGlobalSignature(sig);
  };

  const handleSaveItemSignature = () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      toast.error('Bitte unterschreiben');
      return;
    }
    const positions = detailListe.positionen || [];
    const pos = positions[currentSignItemIdx];
    const sig = sigPadRef.current.toDataURL('image/png');
    setItemSignatures(prev => ({ ...prev, [pos.item_id]: sig }));

    // Nächstes Item oder fertig
    if (currentSignItemIdx < positions.length - 1) {
      setCurrentSignItemIdx(currentSignItemIdx + 1);
      sigPadRef.current.clear();
    }
  };

  const allItemsSigned = () => {
    const positions = detailListe?.positionen || [];
    return positions.every(p => itemSignatures[p.item_id]);
  };

  const handleAktivieren = async (signature) => {
    if (!detailListe) return;
    setActivating(true);
    try {
      const payload = {
        unterschrift_ausleihe: '',
        positionen_unterschriften: [],
      };

      if (signatureMode === 'single') {
        payload.unterschrift_ausleihe = signature || globalSignature;
      } else if (signatureMode === 'per_item') {
        payload.positionen_unterschriften = Object.entries(itemSignatures).map(([itemId, sig]) => ({
          item_id: parseInt(itemId),
          unterschrift: sig,
        }));
      }

      await apiClient.post(`/inventar/ausleihlisten/${listId}/aktivieren`, payload);
      setShowSignatureFlow(false);
      toast.success('Ausleihe aktiviert');
      fetchDetailListe();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Aktivieren fehlgeschlagen');
    } finally {
      setActivating(false);
    }
  };

  // ═══ Rückgabe ═══

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
      if (listId) fetchDetailListe(); else fetchData();
    } catch { toast.error('Rückgabe fehlgeschlagen'); }
  };

  const handleEinzelrueckgabe = async () => {
    if (!einzelrueckgabePos || !detailListe) return;
    try {
      await apiClient.post(`/inventar/ausleihen/${detailListe.id}/rueckgabe`, {
        unterschrift_rueckgabe: '',
        notizen_rueckgabe: '',
        rueckgabe_zustand: einzelZustand,
        positionen: [{ item_id: einzelrueckgabePos.item_id, zustand_rueckgabe: einzelZustand, rueckgabe_notizen: einzelNotizen }],
      });
      setShowEinzelrueckgabe(false);
      toast.success(`${einzelrueckgabePos.item_name} zurückgegeben`);
      fetchDetailListe();
    } catch { toast.error('Rückgabe fehlgeschlagen'); }
  };

  const handleRemovePosition = async (positionId) => {
    if (!detailListe || detailListe.status !== 'offen') return;
    try {
      await apiClient.delete(`/inventar/ausleihlisten/${listId}/positionen/${positionId}`);
      fetchDetailListe();
    } catch { toast.error('Entfernen fehlgeschlagen'); }
  };

  const handleSendMahnung = async (ausleihId) => {
    try {
      const res = await apiClient.post(`/inventar/ausleihlisten/${ausleihId}/mahnung`);
      if (res.data.success) toast.success('Mahnung gesendet!');
      else toast.error(`Fehler: ${res.data.message}`);
    } catch { toast.error('Mahnung konnte nicht gesendet werden'); }
  };

  // ═══ QR-Scanner ═══

  const handleQRScan = async (code) => {
    if (scanMode === 'add' && detailListe?.status === 'offen') {
      try {
        const res = await apiClient.get(`/inventar/items/qr/${encodeURIComponent(code)}`);
        await apiClient.post(`/inventar/ausleihlisten/${listId}/positionen`, {
          item_id: res.data.id, zustand_ausleihe: 'ok', unterschrift: '', foto_ausleihe: '',
        });
        toast.success(`${res.data.name} hinzugefügt`);
        fetchDetailListe();
      } catch (err) { toast.error(err.response?.data?.error || 'Nicht gefunden'); }
    } else if (scanMode === 'rueckgabe') {
      try {
        const res = await apiClient.post('/inventar/schnellrueckgabe', { qr_code: code, zustand: 'ok', notizen: '' });
        toast.success(`${res.data.item_name} zurückgegeben`);
        if (listId) fetchDetailListe(); else fetchData();
      } catch (err) { toast.error(err.response?.data?.error || 'Fehlgeschlagen'); }
    }
  };

  // ═══ PDF & Email ═══

  const handleDownloadPdf = () => {
    if (detailListe) { downloadLeihschein(detailListe); toast.success('PDF erstellt'); }
  };

  const handleSendEmail = async () => {
    if (!emailForm.email || !detailListe) return;
    setSendingEmail(true);
    try {
      const doc = generateLeihscheinPdf(detailListe);
      const pdfBlob = doc.output('arraybuffer');
      const base64 = btoa(new Uint8Array(pdfBlob).reduce((data, byte) => data + String.fromCharCode(byte), ''));
      await apiClient.post(`/inventar/ausleihlisten/${detailListe.id}/email`, {
        email: emailForm.email,
        betreff: emailForm.betreff || `Leihschein #${detailListe.id}`,
        nachricht: emailForm.nachricht,
        pdf_base64: base64,
      });
      toast.success(`E-Mail an ${emailForm.email} gesendet`);
      setShowEmailModal(false);
      setEmailForm({ email: '', betreff: '', nachricht: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'E-Mail konnte nicht gesendet werden');
    } finally { setSendingEmail(false); }
  };

  // ═══ Filter-Hilfsfunktionen ═══

  const filteredItems = items.filter(item => {
    if (!itemSearch) return true;
    const q = itemSearch.toLowerCase();
    return item.name.toLowerCase().includes(q) ||
      (item.seriennummer && item.seriennummer.toLowerCase().includes(q));
  });

  const existingPositionIds = new Set((detailListe?.positionen || []).map(p => p.item_id));

  // Gruppierung für Übersicht
  const sections = [
    { key: 'offen', title: 'Offene Listen', items: ausleihen.filter(a => a.status === 'offen'), defaultOpen: true },
    { key: 'aktiv', title: 'Aktive Ausleihen', items: ausleihen.filter(a => a.status === 'aktiv'), defaultOpen: true },
    { key: 'teilrueckgabe', title: 'Teilrückgaben', items: ausleihen.filter(a => a.status === 'teilrueckgabe'), defaultOpen: true },
    { key: 'abgeschlossen', title: 'Abgeschlossene Ausleihen', items: ausleihen.filter(a => a.status === 'abgeschlossen'), defaultOpen: false },
    { key: 'abgebrochen', title: 'Abgebrochene Ausleihen', items: ausleihen.filter(a => a.status === 'abgebrochen'), defaultOpen: false },
  ].filter(s => s.items.length > 0);

  // ═══ Loading ═══

  if (loading && !listId) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // DETAIL-ANSICHT
  // ═══════════════════════════════════════════════════════════════

  if (listId) {
    if (!detailListe) {
      return (
        <div className="space-y-6">
          <button onClick={() => navigate('/ausleihen')} className="flex items-center gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" /> Zurück
          </button>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        </div>
      );
    }

    const isOffen = detailListe.status === 'offen';
    const isAktiv = detailListe.status === 'aktiv' || detailListe.status === 'teilrueckgabe';

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/ausleihen')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white truncate">
              {detailListe.titel || `Ausleihliste #${detailListe.id}`}
            </h1>
            <div className="flex items-center gap-3 text-gray-400 text-sm mt-1">
              {detailListe.ausleiher_name && (
                <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {detailListe.ausleiher_name}</span>
              )}
              {detailListe.ausleiher_ort && (
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {detailListe.ausleiher_ort}</span>
              )}
              <StatusBadge status={detailListe.status} statusDisplay={detailListe.status_display} istUeberfaellig={detailListe.ist_ueberfaellig} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOffen && (
              <>
                <button onClick={() => { setScanMode('add'); setShowQRScanner(true); }}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                  <ScanLine className="w-4 h-4" /> QR
                </button>
              </>
            )}
            {!isOffen && (
              <>
                <button onClick={handleDownloadPdf}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                  <FileDown className="w-4 h-4" /> PDF
                </button>
                <button onClick={() => {
                  setEmailForm({
                    email: detailListe.ausleiher_email || '',
                    betreff: `Leihschein #${detailListe.id} – ${detailListe.titel || detailListe.ausleiher_name}`,
                    nachricht: `Anbei der Leihschein für Ihre Ausleihe #${detailListe.id}.\n\nMit freundlichen Grüßen,\nStagedesk`,
                  });
                  setShowEmailModal(true);
                }}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                  <Mail className="w-4 h-4" /> E-Mail
                </button>
              </>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-gray-400">
            <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300">
              {detailListe.modus === 'global' ? 'Globale Ausleihe' : 'Individuelle Ausleihe'}
            </span>
            {detailListe.frist && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Frist: {new Date(detailListe.frist).toLocaleDateString('de-DE')}</span>}
            {detailListe.zweck && <span>Zweck: {detailListe.zweck}</span>}
            {detailListe.veranstaltung_id && (
              <Link to={`/veranstaltung/${detailListe.veranstaltung_id}`} className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                <ExternalLink className="w-3 h-3" /> Veranstaltung #{detailListe.veranstaltung_id}
              </Link>
            )}
          </div>

          {/* Items hinzufügen (nur bei offener Liste) */}
          {isOffen && (
            <div className="flex items-center gap-2">
              <button onClick={openItemModal}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                <Plus className="w-4 h-4" /> Artikel hinzufügen
              </button>
              <div className="relative">
                <button onClick={() => setShowSetDropdown(!showSetDropdown)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm">
                  <Layers className="w-4 h-4" /> Set
                </button>
                {showSetDropdown && (
                  <ul className="absolute right-0 mt-1 py-1 bg-gray-800 border border-gray-700 rounded-lg max-h-60 overflow-y-auto z-10 min-w-[220px]">
                    {itemSets.length > 0 ? itemSets.map(set => (
                      <li key={set.id}>
                        <button type="button" onClick={() => handleAddSetToList(set)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-700 text-white">
                          <span className="font-medium">{set.name}</span>
                          <span className="text-gray-400 text-xs ml-2">({set.positionen?.length || 0} Items)</span>
                        </button>
                      </li>
                    )) : <li className="px-3 py-2 text-gray-400 text-sm">Keine Sets</li>}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Items-Liste */}
          <div>
            <h3 className="font-medium text-white mb-2">Enthaltene Artikel ({detailListe.positionen?.length || 0})</h3>
            <ul className="space-y-2">
              {(detailListe.positionen || []).map(pos => (
                <li key={pos.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-white">{pos.item_name}</span>
                    {pos.anzahl > 1 && <span className="text-gray-400 ml-2">×{pos.anzahl}</span>}
                    {detailListe.modus === 'individuell' && pos.ausleiher_name && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        <User className="w-3 h-3 inline mr-1" />{pos.ausleiher_name}
                        {pos.ausleiher_ort && <><MapPin className="w-3 h-3 inline ml-2 mr-1" />{pos.ausleiher_ort}</>}
                      </div>
                    )}
                    {!isOffen && (
                      <div className="flex items-center gap-2 mt-1">
                        {pos.ist_zurueckgegeben ? (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                            <Check className="w-3 h-3" /> Zurückgegeben
                            {pos.zustand_rueckgabe && pos.zustand_rueckgabe !== 'ok' && (
                              <span className="text-yellow-400 ml-1">({pos.zustand_rueckgabe})</span>
                            )}
                          </span>
                        ) : isAktiv ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">Ausgeliehen</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    {isOffen && (
                      <button onClick={() => handleRemovePosition(pos.id)}
                        className="p-1.5 text-red-400 hover:bg-red-900/20 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {isAktiv && !pos.ist_zurueckgegeben && (
                      <button onClick={() => { setEinzelrueckgabePos(pos); setEinzelZustand('ok'); setEinzelNotizen(''); setShowEinzelrueckgabe(true); }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded">
                        <RefreshCw className="w-3 h-3" /> Zurückgeben
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {(!detailListe.positionen || detailListe.positionen.length === 0) && (
                <li className="text-gray-400 py-8 text-center">Noch keine Artikel in der Liste</li>
              )}
            </ul>
          </div>

          {/* Aktionen */}
          {isOffen && (
            <div className="pt-4 border-t border-gray-700">
              <button onClick={openSignatureFlow}
                disabled={activating || (detailListe.positionen?.length || 0) === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Ausleihe aktivieren
              </button>
            </div>
          )}

          {isAktiv && (
            <div className="pt-4 border-t border-gray-700 flex items-center gap-3">
              <button onClick={() => { setRueckgabeAusleihe(detailListe); setShowRueckgabeModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg">
                <RefreshCw className="w-4 h-4" /> Alles zurückgeben
              </button>
              {detailListe.status === 'teilrueckgabe' && (
                <span className="text-sm text-yellow-400">
                  {(detailListe.positionen || []).filter(p => !p.ist_zurueckgegeben).length} von {(detailListe.positionen || []).length} noch ausgeliehen
                </span>
              )}
            </div>
          )}
        </div>

        {/* ─── Item-Auswahl Modal ───────────────────────────── */}
        {showItemModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-800">
                <h2 className="text-lg font-semibold text-white">Artikel auswählen</h2>
                <button onClick={() => setShowItemModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              {/* Ausgewählte Artikel */}
              {selectedItems.length > 0 && (
                <div className="px-6 pt-4">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Ausgewählte Artikel ({selectedItems.length})</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedItems.map(sel => (
                      <div key={sel.item.id} className="flex items-center gap-3 p-2 bg-blue-900/20 border border-blue-800/30 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-white">{sel.item.name}</span>
                          {detailListe?.modus === 'individuell' && (
                            <div className="flex gap-2 mt-1">
                              <input type="text" value={sel.ausleiher_name} onChange={e => updateSelectedItem(sel.item.id, 'ausleiher_name', e.target.value)}
                                placeholder="Ausleiher Name" className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500" />
                              <input type="text" value={sel.ausleiher_ort} onChange={e => updateSelectedItem(sel.item.id, 'ausleiher_ort', e.target.value)}
                                placeholder="Ort" className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500" />
                            </div>
                          )}
                        </div>
                        <button onClick={() => toggleItemSelection(sel.item)} className="p-1 text-red-400 hover:bg-red-900/20 rounded">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suche & Schnell-Hinzufügen */}
              <div className="px-6 pt-4 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                    placeholder="Artikel suchen..." className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <button onClick={() => setShowQuickAdd(!showQuickAdd)}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                  <PlusCircle className="w-3.5 h-3.5" /> Neuen Artikel zum Inventar hinzufügen
                </button>
                {showQuickAdd && (
                  <div className="flex gap-2">
                    <input type="text" value={quickAddName} onChange={e => setQuickAddName(e.target.value)}
                      placeholder="Name des neuen Artikels" className="flex-1 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white"
                      onKeyDown={e => e.key === 'Enter' && handleQuickAddItem()} />
                    <button onClick={handleQuickAddItem} disabled={!quickAddName.trim()}
                      className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg">
                      Hinzufügen
                    </button>
                  </div>
                )}
              </div>

              {/* Items-Liste */}
              <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                <ul className="space-y-1">
                  {filteredItems.slice(0, 50).map(item => {
                    const isSelected = selectedItems.some(s => s.item.id === item.id);
                    const isInList = existingPositionIds.has(item.id);
                    return (
                      <li key={item.id}>
                        <button type="button" onClick={() => !isInList && toggleItemSelection(item)} disabled={isInList}
                          className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${
                            isInList ? 'opacity-40 cursor-not-allowed' :
                            isSelected ? 'bg-blue-900/30 border border-blue-700' :
                            'hover:bg-gray-800'
                          }`}>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-600'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-white font-medium">{item.name}</span>
                            {item.seriennummer && <span className="text-gray-500 text-xs ml-2">{item.seriennummer}</span>}
                            {item.kategorie_name && <span className="text-gray-500 text-xs ml-2">• {item.kategorie_name}</span>}
                          </div>
                          {isInList && <span className="text-xs text-gray-500">Bereits enthalten</span>}
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            item.status === 'verfuegbar' ? 'bg-green-900/30 text-green-400' :
                            item.status === 'ausgeliehen' ? 'bg-blue-900/30 text-blue-400' :
                            'bg-gray-700 text-gray-400'
                          }`}>{item.status_display || item.status}</span>
                        </button>
                      </li>
                    );
                  })}
                  {filteredItems.length === 0 && <li className="text-gray-400 py-4 text-center">Keine Artikel gefunden</li>}
                </ul>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-6 pt-4 border-t border-gray-800">
                <span className="text-sm text-gray-400">{selectedItems.length} ausgewählt</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowItemModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Abbrechen</button>
                  <button onClick={handleAddSelectedItems} disabled={selectedItems.length === 0 || addingItems}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                    {addingItems ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Artikel hinzufügen
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Signatur-Flow Modal ──────────────────────────── */}
        {showSignatureFlow && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
              {signatureStep === 'choose' && (
                <>
                  <h2 className="text-lg font-semibold text-white mb-4">Unterschrift wählen</h2>
                  <div className="space-y-3">
                    {[
                      { value: 'none', label: 'Ohne Unterschrift', desc: 'Direkt aktivieren' },
                      { value: 'single', label: 'Eine Unterschrift', desc: 'Eine Unterschrift für die gesamte Ausleihe' },
                      { value: 'per_item', label: 'Pro Artikel unterschreiben', desc: 'Jeder Artikel wird einzeln unterschrieben' },
                    ].map(opt => (
                      <button key={opt.value} onClick={() => setSignatureMode(opt.value)}
                        className={`w-full text-left p-4 rounded-lg border transition-colors ${
                          signatureMode === opt.value ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 hover:border-gray-600'
                        }`}>
                        <div className="font-medium text-white">{opt.label}</div>
                        <div className="text-sm text-gray-400">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button onClick={() => setShowSignatureFlow(false)} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
                    <button onClick={handleSignatureChoiceDone} disabled={!signatureMode || activating}
                      className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                      {activating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : signatureMode === 'none' ? 'Aktivieren' : 'Weiter'}
                    </button>
                  </div>
                </>
              )}

              {signatureStep === 'sign' && signatureMode === 'single' && (
                <>
                  <h2 className="text-lg font-semibold text-white mb-4">Unterschrift</h2>
                  <div className="rounded-xl mb-4 overflow-hidden border-2 border-gray-600">
                    <SignatureCanvas ref={sigPadRef}
                      canvasProps={{ className: 'w-full', style: { width: '100%', height: '320px', background: '#ffffff' } }}
                      penColor="black" backgroundColor="#ffffff" />
                  </div>
                  {globalSignature && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-400 mb-1">Vorschau:</p>
                      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 inline-block">
                        <img src={globalSignature} alt="Unterschrift" className="h-16 invert" />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => sigPadRef.current?.clear()} className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700">Löschen</button>
                    <button onClick={() => { handleSaveGlobalSignature(); }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Übernehmen</button>
                    <button onClick={() => handleAktivieren(globalSignature)} disabled={!globalSignature || activating}
                      className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                      {activating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Aktivieren'}
                    </button>
                  </div>
                </>
              )}

              {signatureStep === 'sign' && signatureMode === 'per_item' && (
                <>
                  {(() => {
                    const positions = detailListe?.positionen || [];
                    const pos = positions[currentSignItemIdx];
                    if (!pos) return null;
                    return (
                      <>
                        <h2 className="text-lg font-semibold text-white mb-1">
                          Unterschrift für: <span className="text-blue-400">{pos.item_name}</span>
                        </h2>
                        <p className="text-sm text-gray-400 mb-4">Artikel {currentSignItemIdx + 1} von {positions.length}</p>
                        <div className="rounded-xl mb-4 overflow-hidden border-2 border-gray-600">
                          <SignatureCanvas ref={sigPadRef}
                            canvasProps={{ className: 'w-full', style: { width: '100%', height: '320px', background: '#ffffff' } }}
                            penColor="black" backgroundColor="#ffffff" />
                        </div>
                        {itemSignatures[pos.item_id] && (
                          <div className="mb-4">
                            <p className="text-xs text-gray-400 mb-1">Vorschau:</p>
                            <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 inline-block">
                              <img src={itemSignatures[pos.item_id]} alt="Unterschrift" className="h-14 invert" />
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => sigPadRef.current?.clear()} className="px-3 py-2 bg-gray-800 text-white rounded-lg text-sm">Löschen</button>
                          <button onClick={handleSaveItemSignature}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">
                            {currentSignItemIdx < positions.length - 1 ? 'Nächster' : 'Übernehmen'}
                          </button>
                          <button onClick={() => handleAktivieren('')} disabled={!allItemsSigned() || activating}
                            className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-lg text-sm">
                            {activating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Aktivieren (${Object.keys(itemSignatures).length}/${positions.length})`}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── Rückgabe Modal ────────────────────────────────── */}
        {showRueckgabeModal && rueckgabeAusleihe && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Rückgabe bestätigen</h2>
                <button onClick={() => { setShowRueckgabeModal(false); setRueckgabeAusleihe(null); }} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-gray-400 mb-4">
                Alle Items von <strong className="text-white">{rueckgabeAusleihe.ausleiher_name || rueckgabeAusleihe.titel}</strong> werden zurückgegeben.
              </p>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Unterschrift (optional)</label>
                <div className="rounded-xl overflow-hidden border-2 border-gray-600">
                  <SignatureCanvas ref={rueckgabeSigRef}
                    canvasProps={{ className: 'w-full', style: { width: '100%', height: '200px', background: '#ffffff' } }}
                    penColor="black" backgroundColor="#ffffff" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowRueckgabeModal(false); setRueckgabeAusleihe(null); }} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
                <button onClick={handleRueckgabe} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg">Rückgabe bestätigen</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Einzelrückgabe Modal ──────────────────────────── */}
        {showEinzelrueckgabe && einzelrueckgabePos && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Artikel zurückgeben</h2>
                <button onClick={() => setShowEinzelrueckgabe(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-gray-300 mb-4"><strong className="text-white">{einzelrueckgabePos.item_name}</strong></p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Zustand</label>
                  <select value={einzelZustand} onChange={e => setEinzelZustand(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
                    <option value="ok">OK</option>
                    <option value="leichte_maengel">Leichte Mängel</option>
                    <option value="beschaedigt">Beschädigt</option>
                    <option value="defekt">Defekt</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Notizen</label>
                  <textarea value={einzelNotizen} onChange={e => setEinzelNotizen(e.target.value)}
                    placeholder="Bemerkungen..." rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500" />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={() => setShowEinzelrueckgabe(false)} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
                <button onClick={handleEinzelrueckgabe} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg">Zurückgeben</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── E-Mail Modal ──────────────────────────────────── */}
        {showEmailModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Leihschein per E-Mail senden</h2>
                <button onClick={() => setShowEmailModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">E-Mail-Adresse *</label>
                  <input type="email" value={emailForm.email} onChange={e => setEmailForm({ ...emailForm, email: e.target.value })}
                    placeholder="empfaenger@beispiel.de" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Betreff</label>
                  <input type="text" value={emailForm.betreff} onChange={e => setEmailForm({ ...emailForm, betreff: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nachricht</label>
                  <textarea value={emailForm.nachricht} onChange={e => setEmailForm({ ...emailForm, nachricht: e.target.value })}
                    rows={4} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none" />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={() => setShowEmailModal(false)} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
                <button onClick={handleSendEmail} disabled={!emailForm.email || sendingEmail}
                  className="flex items-center justify-center gap-2 flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                  {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Senden
                </button>
              </div>
            </div>
          </div>
        )}

        {/* QR-Scanner */}
        {showQRScanner && (
          <QRScanner onScan={handleQRScan} onClose={() => { setShowQRScanner(false); setScanMode(null); }}
            continuous={scanMode === 'add'} label={scanMode === 'add' ? 'Item per QR hinzufügen' : 'Schnellrückgabe per QR'} />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // ÜBERSICHT
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/inventar')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Ausleihen</h1>
          <p className="text-gray-400">Listen erstellen, Artikel hinzufügen und aktivieren</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setScanMode('rueckgabe'); setShowQRScanner(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
            <ScanLine className="w-5 h-5" /> Schnellrückgabe
          </button>
          <button onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">
            <Plus className="w-5 h-5" /> Neue Ausleihliste
          </button>
        </div>
      </div>

      {/* ─── Erstellen Modal ─────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Neue Ausleihliste</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Titel *</label>
                <input type="text" value={createForm.titel} onChange={e => setCreateForm({ ...createForm, titel: e.target.value })}
                  placeholder="z.B. Stadtfest 2026, Konzert Setup..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Art der Ausleihe</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'global', label: 'Globale Ausleihe', desc: 'Ein Ausleiher für alle Artikel' },
                    { value: 'individuell', label: 'Individuelle Ausleihe', desc: 'Unterschiedliche Ausleiher pro Artikel' },
                  ].map(opt => (
                    <button key={opt.value} onClick={() => setCreateForm({ ...createForm, modus: opt.value })}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        createForm.modus === opt.value ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 hover:border-gray-600'
                      }`}>
                      <div className="font-medium text-white text-sm">{opt.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {createForm.modus === 'global' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Ausleiher (Name) *</label>
                    <input type="text" value={createForm.ausleiher_name} onChange={e => setCreateForm({ ...createForm, ausleiher_name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Ausleiher (Ort)</label>
                    <input type="text" value={createForm.ausleiher_ort} onChange={e => setCreateForm({ ...createForm, ausleiher_ort: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Rückgabefrist</label>
                  <input type="date" value={createForm.frist} onChange={e => setCreateForm({ ...createForm, frist: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Zweck</label>
                  <input type="text" value={createForm.zweck} onChange={e => setCreateForm({ ...createForm, zweck: e.target.value })}
                    placeholder="z.B. Konzert" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Notizen</label>
                <textarea value={createForm.notizen} onChange={e => setCreateForm({ ...createForm, notizen: e.target.value })}
                  rows={2} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none" />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
              <button onClick={handleCreateListe} disabled={saving || !createForm.titel || (createForm.modus === 'global' && !createForm.ausleiher_name)}
                className="flex items-center justify-center gap-2 flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Liste erstellen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Listen nach Sektionen ───────────────────────── */}
      {sections.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Keine Ausleihen vorhanden</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sections.map(section => (
            <SectionHeader key={section.key} title={section.title} count={section.items.length} defaultOpen={section.defaultOpen}>
              {section.items.map(a => (
                <div key={a.id}
                  className={`bg-gray-900 border rounded-xl p-4 ${a.ist_ueberfaellig ? 'border-red-600' : 'border-gray-800'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <span className="font-medium text-white">{a.titel || `Liste #${a.id}`}</span>
                        {a.ausleiher_name && (
                          <span className="text-sm text-gray-400 ml-2">
                            <User className="w-3 h-3 inline mr-1" />{a.ausleiher_name}
                          </span>
                        )}
                        {a.ausleiher_ort && (
                          <span className="text-sm text-gray-400 ml-2">
                            <MapPin className="w-3 h-3 inline mr-1" />{a.ausleiher_ort}
                          </span>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={a.status} statusDisplay={a.status_display} istUeberfaellig={a.ist_ueberfaellig} />
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
                    {a.frist && (
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(a.frist).toLocaleDateString('de-DE')}</span>
                    )}
                    <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {a.anzahl_items} Artikel</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {new Date(a.erstellt_am).toLocaleDateString('de-DE')}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800">{a.modus === 'global' ? 'Global' : 'Individuell'}</span>
                  </div>

                  <div className="flex justify-end gap-2">
                    {a.ist_ueberfaellig && (
                      <button onClick={() => handleSendMahnung(a.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-orange-400 hover:text-orange-300 hover:bg-orange-900/20 rounded-lg">
                        <Mail className="w-4 h-4" /> Mahnung
                      </button>
                    )}
                    <Link to={`/ausleihen/${a.id}`}
                      className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
                      Details
                    </Link>
                    {a.status === 'aktiv' && (
                      <button onClick={async () => {
                        try {
                          const res = await apiClient.get(`/inventar/ausleihlisten/${a.id}`);
                          setRueckgabeAusleihe(res.data);
                          setShowRueckgabeModal(true);
                        } catch { toast.error('Liste konnte nicht geladen werden'); }
                      }}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg">
                        <RefreshCw className="w-4 h-4" /> Rückgabe
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </SectionHeader>
          ))}
        </div>
      )}

      {/* QR-Scanner Modal */}
      {showQRScanner && (
        <QRScanner onScan={handleQRScan} onClose={() => { setShowQRScanner(false); setScanMode(null); }}
          continuous={scanMode === 'add'} label={scanMode === 'add' ? 'Item per QR hinzufügen' : 'Schnellrückgabe per QR'} />
      )}

      {/* Rückgabe Modal (von Übersicht aus) */}
      {showRueckgabeModal && rueckgabeAusleihe && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Rückgabe bestätigen</h2>
              <button onClick={() => { setShowRueckgabeModal(false); setRueckgabeAusleihe(null); }} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-gray-400 mb-4">
              Ausleihe von <strong className="text-white">{rueckgabeAusleihe.ausleiher_name || rueckgabeAusleihe.titel}</strong> wird zurückgegeben.
            </p>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Unterschrift (optional)</label>
              <div className="rounded-lg overflow-hidden">
                <SignatureCanvas ref={rueckgabeSigRef}
                  canvasProps={{ className: 'w-full h-32', style: { width: '100%', height: '128px', background: '#1f2937' } }}
                  penColor="white" backgroundColor="#1f2937" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowRueckgabeModal(false); setRueckgabeAusleihe(null); }} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
              <button onClick={handleRueckgabe} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg">Rückgabe bestätigen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
