/**
 * Ausleih-System v2: Listen mit Sektionen, modaler Erstellung, Mehrfachauswahl, Signaturflow
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Package, ArrowLeft,
  Loader2, AlertTriangle, Clock, User, Calendar,
  X, Check, Pen, Mail, RefreshCw,
  ScanLine, FileDown, ExternalLink, Layers,
  ChevronDown, ChevronRight, MapPin, Send,
  Trash2, PlusCircle
} from 'lucide-react';
import SignatureModal from '../components/SignatureModal';
import apiClient from '../lib/api';
import QRScanner from '../components/QRScanner';
import { downloadLeihschein, generateLeihscheinPdf, generateGroupedLeihscheinPdf } from '../lib/pdfGenerator';

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

function PositionItem({ pos, isOffen, isAktiv, showBorrower, onRemove, onReturn }) {
  return (
    <li className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-white">{pos.item_name}</span>
        {pos.anzahl > 1 && <span className="text-gray-400 ml-2">&times;{pos.anzahl}</span>}
        {showBorrower && pos.ausleiher_name && (
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
          <button onClick={() => onRemove(pos.id)}
            className="p-1.5 text-red-400 hover:bg-red-900/20 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        {isAktiv && !pos.ist_zurueckgegeben && (
          <button onClick={() => onReturn(pos)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded">
            <RefreshCw className="w-3 h-3" /> Zurückgeben
          </button>
        )}
      </div>
    </li>
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
  const [selectedItems, setSelectedItems] = useState([]); // [{item, anzahl}]
  const [modalAusleiherName, setModalAusleiherName] = useState('');
  const [modalAusleiherOrt, setModalAusleiherOrt] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [addingItems, setAddingItems] = useState(false);

  // ─── Signatur-Flow (beim Hinzufügen) ────
  const [signaturePhase, setSignaturePhase] = useState(null); // null | 'choose' | 'sign-global' | 'sign-single' | 'sign-per-item'
  const [pendingSignatureItems, setPendingSignatureItems] = useState([]);
  const [globalSignature, setGlobalSignature] = useState('');
  const [itemSignatures, setItemSignatures] = useState({});
  const [currentSignItemIdx, setCurrentSignItemIdx] = useState(0);
  const [showSignatureModal, setShowSignatureModal] = useState(false);

  // ─── Rückgabe State ────
  const [rueckgabeAusleihe, setRueckgabeAusleihe] = useState(null);
  const [showRueckgabeSigModal, setShowRueckgabeSigModal] = useState(false);
  const [rueckgabeSignature, setRueckgabeSignature] = useState('');
  const [einzelrueckgabePos, setEinzelrueckgabePos] = useState(null);
  const [einzelZustand, setEinzelZustand] = useState('ok');
  const [einzelNotizen, setEinzelNotizen] = useState('');

  // ─── QR State ────
  const [scanMode, setScanMode] = useState(null);

  // ─── Item-Sets ────
  const [itemSets, setItemSets] = useState([]);
  const [showSetDropdown, setShowSetDropdown] = useState(false);

  // ─── PDF Dropdown ────
  const [showPdfDropdown, setShowPdfDropdown] = useState(false);

  // ─── Email State ────
  const [emailForm, setEmailForm] = useState({ email: '', betreff: '', nachricht: '', pdfMode: 'gesamt' });
  const [sendingEmail, setSendingEmail] = useState(false);

  // ─── Gruppierung (Individuelle Ausleihen) ────
  const [groupBy, setGroupBy] = useState('none'); // 'none' | 'borrower' | 'location'
  const [expandedGroups, setExpandedGroups] = useState({});

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
    if (createForm.modus === 'global' && !createForm.ausleiher_name && !createForm.ausleiher_ort) {
      toast.error('Bitte Name oder Ort angeben');
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
    setModalAusleiherName('');
    setModalAusleiherOrt('');
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
      return [...prev, { item, anzahl: 1 }];
    });
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

  const handleAddSelectedItems = () => {
    if (!detailListe || selectedItems.length === 0) return;
    if (detailListe.status === 'abgeschlossen' || detailListe.status === 'abgebrochen') return;
    setPendingSignatureItems([...selectedItems]);
    setShowItemModal(false);

    if (detailListe.modus === 'global') {
      setSignaturePhase('sign-global');
      setShowSignatureModal(true);
    } else {
      setSignaturePhase('choose');
    }
  };

  const handleSignatureChoice = (mode) => {
    if (mode === 'none') {
      submitItemsWithSignatures('', {});
      setSignaturePhase(null);
    } else if (mode === 'single') {
      setSignaturePhase('sign-single');
      setShowSignatureModal(true);
    } else if (mode === 'per_item') {
      setCurrentSignItemIdx(0);
      setItemSignatures({});
      setSignaturePhase('sign-per-item');
      setShowSignatureModal(true);
    }
  };

  const handleSignatureSaved = (dataUrl) => {
    if (signaturePhase === 'sign-global') {
      setShowSignatureModal(false);
      submitItemsWithSignatures(dataUrl, {});

    } else if (signaturePhase === 'sign-single') {
      setShowSignatureModal(false);
      const sigs = {};
      pendingSignatureItems.forEach(sel => { sigs[sel.item.id] = dataUrl; });
      submitItemsWithSignatures('', sigs);

    } else if (signaturePhase === 'sign-per-item') {
      const currentItem = pendingSignatureItems[currentSignItemIdx];
      const newSigs = { ...itemSignatures, [currentItem.item.id]: dataUrl };
      setItemSignatures(newSigs);

      if (currentSignItemIdx < pendingSignatureItems.length - 1) {
        setCurrentSignItemIdx(currentSignItemIdx + 1);
        // Modal bleibt offen für nächstes Item
      } else {
        setShowSignatureModal(false);
        submitItemsWithSignatures('', newSigs);
      }
    }
  };

  const submitItemsWithSignatures = async (globalSig, perItemSigs) => {
    setAddingItems(true);
    const existingIds = new Set((detailListe.positionen || []).map(p => p.item_id));

    const positionen = pendingSignatureItems
      .filter(sel => !existingIds.has(sel.item.id))
      .map(sel => ({
        item_id: sel.item.id,
        anzahl: sel.anzahl || 1,
        ausleiher_name: detailListe.modus === 'individuell' ? modalAusleiherName : '',
        ausleiher_ort: detailListe.modus === 'individuell' ? modalAusleiherOrt : '',
        zustand_ausleihe: 'ok',
        unterschrift: perItemSigs[sel.item.id] || globalSig || '',
        foto_ausleihe: '',
      }));

    try {
      await apiClient.post(`/inventar/ausleihlisten/${listId}/positionen/batch`, {
        positionen,
        unterschrift_ausleihe: detailListe.modus === 'global' ? globalSig : '',
      });
      toast.success(`${positionen.length} Artikel hinzugefügt`);
    } catch {
      toast.error('Fehler beim Hinzufügen');
    }

    setAddingItems(false);
    setSignaturePhase(null);
    setPendingSignatureItems([]);
    setGlobalSignature('');
    setItemSignatures({});
    setCurrentSignItemIdx(0);
    setModalAusleiherName('');
    setModalAusleiherOrt('');
    fetchDetailListe();
  };

  // ─── Set hinzufügen ────
  const handleAddSetToList = async (set) => {
    if (!detailListe || detailListe.status === 'abgeschlossen' || detailListe.status === 'abgebrochen') return;
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

  // ═══ Rückgabe ═══

  const handleRueckgabe = async () => {
    if (!rueckgabeAusleihe) return;
    try {
      await apiClient.post(`/inventar/ausleihen/${rueckgabeAusleihe.id}/rueckgabe`, {
        unterschrift_rueckgabe: rueckgabeSignature,
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

  const handleAbschliessen = async () => {
    if (!detailListe) return;
    try {
      await apiClient.post(`/inventar/ausleihlisten/${detailListe.id}/abschliessen`);
      toast.success('Liste abgeschlossen');
      fetchDetailListe();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Abschließen fehlgeschlagen');
    }
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
    if (scanMode === 'add' && detailListe && detailListe.status !== 'abgeschlossen' && detailListe.status !== 'abgebrochen') {
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

  const handleDownloadPdf = (groupBy = null) => {
    if (detailListe) {
      downloadLeihschein(detailListe, groupBy);
      setShowPdfDropdown(false);
      toast.success('PDF erstellt');
    }
  };

  const handleSendEmail = async () => {
    if (!emailForm.email || !detailListe) return;
    setSendingEmail(true);
    try {
      const pdfMode = emailForm.pdfMode || 'gesamt';
      const groupBy = pdfMode === 'person' ? 'person' : pdfMode === 'ort' ? 'ort' : null;
      const doc = groupBy ? generateGroupedLeihscheinPdf(detailListe, groupBy) : generateLeihscheinPdf(detailListe);
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
      setEmailForm({ email: '', betreff: '', nachricht: '', pdfMode: 'gesamt' });
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

  // Gruppierung für Items in individuellen Ausleihen
  const groupPositions = useCallback((positionen) => {
    if (!positionen || positionen.length === 0) return [];
    const groups = {};
    for (const pos of positionen) {
      const key = groupBy === 'borrower'
        ? (pos.ausleiher_name || 'Kein Ausleiher')
        : (pos.ausleiher_ort || 'Kein Ort');
      if (!groups[key]) groups[key] = [];
      groups[key].push(pos);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [groupBy]);

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

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
            <button onClick={() => { setScanMode('add'); setShowQRScanner(true); }}
              className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
              <ScanLine className="w-4 h-4" /> QR
            </button>
            {(detailListe.positionen?.length || 0) > 0 && (
              <>
                {detailListe.modus === 'individuell' ? (
                  <div className="relative">
                    <button onClick={() => setShowPdfDropdown(!showPdfDropdown)}
                      className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                      <FileDown className="w-4 h-4" /> PDF <ChevronDown className="w-3 h-3 ml-0.5" />
                    </button>
                    {showPdfDropdown && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowPdfDropdown(false)} />
                        <div className="absolute right-0 mt-1 py-1 bg-gray-800 border border-gray-700 rounded-lg z-20 min-w-[180px] shadow-xl">
                          <button onClick={() => handleDownloadPdf(null)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 text-white text-sm">
                            Gesamt-PDF
                          </button>
                          <button onClick={() => handleDownloadPdf('person')}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 text-white text-sm">
                            <User className="w-3.5 h-3.5 inline mr-1.5" />Pro Person
                          </button>
                          <button onClick={() => handleDownloadPdf('ort')}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 text-white text-sm">
                            <MapPin className="w-3.5 h-3.5 inline mr-1.5" />Pro Ort
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <button onClick={() => handleDownloadPdf()}
                    className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                    <FileDown className="w-4 h-4" /> PDF
                  </button>
                )}
                <button onClick={() => {
                  setEmailForm({
                    email: detailListe.ausleiher_email || '',
                    betreff: `Leihschein #${detailListe.id} – ${detailListe.titel || detailListe.ausleiher_name}`,
                    nachricht: `Anbei der Leihschein für Ihre Ausleihe #${detailListe.id}.\n\nMit freundlichen Grüßen,\nStagedesk`,
                    pdfMode: 'gesamt',
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

          {/* Items hinzufügen (immer sichtbar ausser bei abgeschlossen/abgebrochen) */}
          {detailListe.status !== 'abgeschlossen' && detailListe.status !== 'abgebrochen' && (
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
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSetDropdown(false)} />
                    <ul className="absolute right-0 mt-1 py-1 bg-gray-800 border border-gray-700 rounded-lg max-h-60 overflow-y-auto z-20 min-w-[220px]">
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
                  </>
                )}
              </div>
            </div>
          )}

          {/* Items-Liste */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-white">Enthaltene Artikel ({detailListe.positionen?.length || 0})</h3>
              {detailListe.modus === 'individuell' && (detailListe.positionen?.length || 0) > 0 && (
                <select value={groupBy} onChange={e => { setGroupBy(e.target.value); setExpandedGroups({}); }}
                  className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300">
                  <option value="none">Keine Gruppierung</option>
                  <option value="borrower">Nach Person</option>
                  <option value="location">Nach Ort</option>
                </select>
              )}
            </div>

            {/* Gruppierte Ansicht */}
            {detailListe.modus === 'individuell' && groupBy !== 'none' && (detailListe.positionen?.length || 0) > 0 ? (
              <div className="space-y-3">
                {groupPositions(detailListe.positionen).map(([groupKey, groupItems]) => {
                  const isExpanded = expandedGroups[groupKey] !== false; // default open
                  const returned = groupItems.filter(p => p.ist_zurueckgegeben).length;
                  return (
                    <div key={groupKey} className="border border-gray-700 rounded-lg overflow-hidden">
                      <button onClick={() => toggleGroup(groupKey)}
                        className="w-full flex items-center justify-between p-3 bg-gray-800/50 hover:bg-gray-800 text-left">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                          {groupBy === 'borrower' ? <User className="w-4 h-4 text-gray-400" /> : <MapPin className="w-4 h-4 text-gray-400" />}
                          <span className="font-medium text-white">{groupKey}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span>{groupItems.length} Artikel</span>
                          {!isOffen && returned > 0 && (
                            <span className="text-green-400">{returned}/{groupItems.length} zurück</span>
                          )}
                        </div>
                      </button>
                      {isExpanded && (
                        <ul className="divide-y divide-gray-800">
                          {groupItems.map(pos => (
                            <PositionItem key={pos.id} pos={pos} isOffen={isOffen} isAktiv={isAktiv} showBorrower={groupBy !== 'borrower'}
                              onRemove={handleRemovePosition} onReturn={(p) => { setEinzelrueckgabePos(p); setEinzelZustand('ok'); setEinzelNotizen(''); setShowEinzelrueckgabe(true); }} />
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Flache Ansicht */
              <ul className="space-y-2">
                {(detailListe.positionen || []).map(pos => (
                  <PositionItem key={pos.id} pos={pos} isOffen={isOffen} isAktiv={isAktiv} showBorrower={detailListe.modus === 'individuell'}
                    onRemove={handleRemovePosition} onReturn={(p) => { setEinzelrueckgabePos(p); setEinzelZustand('ok'); setEinzelNotizen(''); setShowEinzelrueckgabe(true); }} />
                ))}
                {(!detailListe.positionen || detailListe.positionen.length === 0) && (
                  <li className="text-gray-400 py-8 text-center">Noch keine Artikel in der Liste</li>
                )}
              </ul>
            )}
          </div>

          {/* Rückgabe-Aktionen */}
          {isAktiv && (() => {
            const positionen = detailListe.positionen || [];
            const nochOffen = positionen.filter(p => !p.ist_zurueckgegeben).length;
            const alleZurueck = positionen.length > 0 && nochOffen === 0;
            return (
              <div className="pt-4 border-t border-gray-700 flex items-center gap-3 flex-wrap">
                {!alleZurueck && (
                  <button onClick={() => { setRueckgabeAusleihe(detailListe); setShowRueckgabeModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg">
                    <RefreshCw className="w-4 h-4" /> Alles zurückgeben
                  </button>
                )}
                {alleZurueck && (
                  <button onClick={handleAbschliessen}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg">
                    <Check className="w-4 h-4" /> Liste abschließen
                  </button>
                )}
                {nochOffen > 0 && (
                  <span className="text-sm text-yellow-400">
                    {nochOffen} von {positionen.length} noch ausgeliehen
                  </span>
                )}
                {alleZurueck && (
                  <span className="text-sm text-green-400">
                    Alle Artikel zurückgegeben
                  </span>
                )}
              </div>
            );
          })()}
        </div>

        {/* ─── Item-Auswahl Modal ───────────────────────────── */}
        {showItemModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-800">
                <h2 className="text-lg font-semibold text-white">Artikel zur Ausleihe hinzufügen</h2>
                <button onClick={() => setShowItemModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {/* Ausleiher-Information (nur bei individuell) */}
                {detailListe?.modus === 'individuell' && (
                  <div className="mx-6 mt-4 p-4 border border-gray-700 rounded-lg">
                    <h3 className="text-sm font-semibold text-white mb-3">Ausleiher-Information</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Name</label>
                        <input type="text" value={modalAusleiherName} onChange={e => setModalAusleiherName(e.target.value)}
                          placeholder="z.B. Max Mustermann" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Ort/Raum</label>
                        <input type="text" value={modalAusleiherOrt} onChange={e => setModalAusleiherOrt(e.target.value)}
                          placeholder="z.B. Büro 201" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Ausgewählte Artikel als Chips */}
                {selectedItems.length > 0 && (
                  <div className="mx-6 mt-4 p-4 border border-gray-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-white">Ausgewählte Artikel ({selectedItems.length})</h3>
                      <button onClick={() => setSelectedItems([])} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                        <X className="w-3 h-3" /> ALLE ENTFERNEN
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedItems.map(sel => (
                        <span key={sel.item.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white">
                          {sel.item.name}
                          <button onClick={() => toggleItemSelection(sel.item)} className="text-gray-400 hover:text-red-400">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suche */}
                <div className="px-6 pt-4 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                      placeholder="Artikel suchen..." className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setScanMode('add'); setShowQRScanner(true); setShowItemModal(false); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 rounded-lg">
                      <ScanLine className="w-3.5 h-3.5" /> SCAN-MODUS
                    </button>
                    <button onClick={() => setShowQuickAdd(!showQuickAdd)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 rounded-lg">
                      <PlusCircle className="w-3.5 h-3.5" /> QUICK-ADD
                    </button>
                    <button onClick={() => {
                      const available = filteredItems.filter(i => !existingPositionIds.has(i.id) && i.status === 'verfuegbar');
                      setSelectedItems(available.slice(0, 50).map(item => ({ item, anzahl: 1 })));
                    }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 rounded-lg">
                      <Check className="w-3.5 h-3.5" /> ALLE AUSWÄHLEN
                    </button>
                  </div>
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
                <div className="px-6 py-4">
                  <ul className="space-y-1">
                    {filteredItems.slice(0, 50).map(item => {
                      const isSelected = selectedItems.some(s => s.item.id === item.id);
                      const isInList = existingPositionIds.has(item.id);
                      return (
                        <li key={item.id}>
                          <button type="button" onClick={() => !isInList && toggleItemSelection(item)} disabled={isInList}
                            className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${
                              isInList ? 'opacity-40 cursor-not-allowed' :
                              isSelected ? 'bg-blue-900/30 border-l-2 border-l-blue-500' :
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
                            <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${
                              item.status === 'verfuegbar' ? 'bg-green-900/30 text-green-400' :
                              item.status === 'ausgeliehen' ? 'bg-blue-900/30 text-blue-400' :
                              'bg-gray-700 text-gray-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                item.status === 'verfuegbar' ? 'bg-green-400' :
                                item.status === 'ausgeliehen' ? 'bg-blue-400' : 'bg-gray-400'
                              }`} />
                              {item.status_display || item.status}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {filteredItems.length === 0 && <li className="text-gray-400 py-4 text-center">Keine Artikel gefunden</li>}
                  </ul>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-6 pt-4 border-t border-gray-800">
                <button onClick={() => setShowItemModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">ABBRECHEN</button>
                <button onClick={handleAddSelectedItems} disabled={selectedItems.length === 0 || addingItems}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                  {addingItems ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {selectedItems.length} Artikel hinzufügen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Signatur-Auswahl (individueller Modus) ──────── */}
        {signaturePhase === 'choose' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Unterschrift wählen</h2>
              <div className="space-y-3">
                {[
                  { value: 'none', label: 'Ohne Unterschrift', desc: 'Artikel direkt hinzufügen' },
                  { value: 'single', label: 'Eine Unterschrift', desc: 'Eine Unterschrift für alle Artikel' },
                  { value: 'per_item', label: 'Pro Artikel unterschreiben', desc: 'Jeder Artikel wird einzeln unterschrieben' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => handleSignatureChoice(opt.value)}
                    className="w-full text-left p-4 rounded-lg border border-gray-700 hover:border-blue-500 hover:bg-blue-900/20 transition-colors">
                    <div className="font-medium text-white">{opt.label}</div>
                    <div className="text-sm text-gray-400">{opt.desc}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => { setSignaturePhase(null); setPendingSignatureItems([]); }}
                className="mt-4 w-full py-2 text-gray-400 hover:text-white">Abbrechen</button>
            </div>
          </div>
        )}

        {/* ─── Signatur-Modal ────────────────────────────────── */}
        <SignatureModal
          isOpen={showSignatureModal}
          onClose={() => {
            setShowSignatureModal(false);
            setSignaturePhase(null);
            setPendingSignatureItems([]);
          }}
          onSave={handleSignatureSaved}
          title={
            signaturePhase === 'sign-global' ? 'Unterschrift für Ausleihe' :
            signaturePhase === 'sign-single' ? 'Unterschrift für alle Artikel' :
            signaturePhase === 'sign-per-item' ? `Unterschrift: ${pendingSignatureItems[currentSignItemIdx]?.item?.name || ''}` :
            'Unterschrift'
          }
          subtitle={
            signaturePhase === 'sign-global' ? `${pendingSignatureItems.length} Artikel an ${detailListe?.ausleiher_name || ''}` :
            signaturePhase === 'sign-per-item' ? `Artikel ${currentSignItemIdx + 1} von ${pendingSignatureItems.length}` :
            null
          }
          progress={
            signaturePhase === 'sign-per-item' ? `${currentSignItemIdx + 1} / ${pendingSignatureItems.length}` : null
          }
        />

        {/* ─── Rückgabe Modal ────────────────────────────────── */}
        {showRueckgabeModal && rueckgabeAusleihe && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Rückgabe bestätigen</h2>
                <button onClick={() => { setShowRueckgabeModal(false); setRueckgabeAusleihe(null); setRueckgabeSignature(''); }} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-gray-400 mb-4">
                Alle Items von <strong className="text-white">{rueckgabeAusleihe.ausleiher_name || rueckgabeAusleihe.titel}</strong> werden zurückgegeben.
              </p>
              {rueckgabeSignature ? (
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">Unterschrift</label>
                  <div className="bg-white rounded-lg p-3 border border-gray-600 inline-block">
                    <img src={rueckgabeSignature} alt="Unterschrift" className="h-16" />
                  </div>
                  <button onClick={() => setRueckgabeSignature('')} className="block text-xs text-red-400 mt-1 hover:text-red-300">Entfernen</button>
                </div>
              ) : (
                <button onClick={() => setShowRueckgabeSigModal(true)}
                  className="flex items-center gap-2 px-3 py-2 mb-4 text-sm border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 rounded-lg">
                  <Pen className="w-4 h-4" /> Unterschrift hinzufügen (optional)
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setShowRueckgabeModal(false); setRueckgabeAusleihe(null); setRueckgabeSignature(''); }} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
                <button onClick={handleRueckgabe} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg">Rückgabe bestätigen</button>
              </div>
            </div>
          </div>
        )}

        {/* Rückgabe Signatur Modal */}
        <SignatureModal
          isOpen={showRueckgabeSigModal}
          onClose={() => setShowRueckgabeSigModal(false)}
          onSave={(sig) => { setRueckgabeSignature(sig); setShowRueckgabeSigModal(false); }}
          title="Rückgabe-Unterschrift"
        />

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
                {detailListe?.modus === 'individuell' && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">PDF-Variante</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'gesamt', label: 'Gesamt', icon: FileDown },
                        { value: 'person', label: 'Pro Person', icon: User },
                        { value: 'ort', label: 'Pro Ort', icon: MapPin },
                      ].map(opt => (
                        <button key={opt.value} onClick={() => setEmailForm({ ...emailForm, pdfMode: opt.value })}
                          className={`flex items-center justify-center gap-1.5 px-2 py-2 text-xs rounded-lg border transition-colors ${
                            emailForm.pdfMode === opt.value
                              ? 'border-blue-500 bg-blue-900/20 text-blue-400'
                              : 'border-gray-700 text-gray-400 hover:border-gray-600'
                          }`}>
                          <opt.icon className="w-3.5 h-3.5" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                    <label className="block text-sm text-gray-400 mb-1">Ausleiher (Name)</label>
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
              <button onClick={handleCreateListe} disabled={saving || !createForm.titel || (createForm.modus === 'global' && !createForm.ausleiher_name && !createForm.ausleiher_ort)}
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
              <button onClick={() => { setShowRueckgabeModal(false); setRueckgabeAusleihe(null); setRueckgabeSignature(''); }} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-gray-400 mb-4">
              Ausleihe von <strong className="text-white">{rueckgabeAusleihe.ausleiher_name || rueckgabeAusleihe.titel}</strong> wird zurückgegeben.
            </p>
            {rueckgabeSignature ? (
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Unterschrift</label>
                <div className="bg-white rounded-lg p-3 border border-gray-600 inline-block">
                  <img src={rueckgabeSignature} alt="Unterschrift" className="h-16" />
                </div>
                <button onClick={() => setRueckgabeSignature('')} className="block text-xs text-red-400 mt-1 hover:text-red-300">Entfernen</button>
              </div>
            ) : (
              <button onClick={() => setShowRueckgabeSigModal(true)}
                className="flex items-center gap-2 px-3 py-2 mb-4 text-sm border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 rounded-lg">
                <Pen className="w-4 h-4" /> Unterschrift hinzufügen (optional)
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setShowRueckgabeModal(false); setRueckgabeAusleihe(null); setRueckgabeSignature(''); }} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
              <button onClick={handleRueckgabe} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg">Rückgabe bestätigen</button>
            </div>
          </div>
        </div>
      )}

      {/* Rückgabe Signatur Modal (Übersicht) */}
      <SignatureModal
        isOpen={showRueckgabeSigModal}
        onClose={() => setShowRueckgabeSigModal(false)}
        onSave={(sig) => { setRueckgabeSignature(sig); setShowRueckgabeSigModal(false); }}
        title="Rückgabe-Unterschrift"
      />
    </div>
  );
}
