/**
 * Haushalt Detail - Zeigt alle Artikel eines Haushalts
 * Mit Live-Aktualisierung und Inline-Editing
 */
import { useState, useEffect, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Wallet, TrendingUp, TrendingDown,
  Trash2, Edit, ExternalLink, Loader2, Package, RefreshCw,
  Wand2, Save, X, LayoutGrid, List, Columns,
  ChevronUp, ChevronDown, Info, ArrowUpDown, Search, FileDown,
} from 'lucide-react';
import apiClient from '../../lib/api';
import EditHaushaltModal from '../../components/EditHaushaltModal';
import ArtikelModal from '../../components/ArtikelModal';
import ArtikelDetailsPanel from '../../components/ArtikelDetailsPanel';

// Sortier-Optionen für Tabelle
const SORT_OPTIONS = [
  { v: 'manuell',  l: 'Manuell (Drag)' },
  { v: 'name',     l: 'Name A-Z' },
  { v: '-name',    l: 'Name Z-A' },
  { v: '-preis',   l: 'Preis ↓' },
  { v: 'preis',    l: 'Preis ↑' },
  { v: '-erstellt_am', l: 'Neueste zuerst' },
  { v: 'erstellt_am',  l: 'Älteste zuerst' },
  { v: 'status',   l: 'Status' },
];

const STATUS_LABEL = {
  geplant:   'Geplant',
  beantragt: 'Beantragt',
  genehmigt: 'Genehmigt',
  bestellt:  'Bestellt',
  geliefert: 'Geliefert',
  abgelehnt: 'Abgelehnt',
};
const STATUS_CLASS = {
  geplant:   'bg-gray-500/20 text-gray-300',
  beantragt: 'bg-amber-500/20 text-amber-300',
  genehmigt: 'bg-blue-500/20 text-blue-300',
  bestellt:  'bg-purple-500/20 text-purple-300',
  geliefert: 'bg-green-500/20 text-green-300',
  abgelehnt: 'bg-red-500/20 text-red-300',
};

const POLL_INTERVAL = 5000;

// Preis formatieren mit € hinten
const formatPreis = (value) => {
  const num = parseFloat(value) || 0;
  return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
};

// Separate Editing-Row Komponente mit eigenem lokalem State (verhindert Parent-Rerenders)
const EditingRow = memo(function EditingRow({ 
  item, 
  onSave, 
  onCancel, 
  onParse, 
  parsingId, 
  savingId 
}) {
  const [localData, setLocalData] = useState({
    name: item.name || '',
    link: item.link || '',
    preis: item.preis || '',
    anzahl: item.anzahl || 1
  });

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSave(localData);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleParse = async () => {
    const result = await onParse(item.id, localData.link);
    if (result) {
      setLocalData(prev => ({
        ...prev,
        name: result.name || prev.name,
        preis: result.preis || prev.preis,
      }));
    }
  };

  return (
    <tr className="bg-blue-950/20 border-b border-gray-800">
      <td className="p-2">
        <input
          type="text"
          value={localData.name}
          onChange={(e) => setLocalData({ ...localData, name: e.target.value })}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:ring-2 focus:ring-blue-500"
        />
      </td>
      <td className="p-2">
        <div className="flex gap-1">
          <input
            type="text"
            value={localData.link}
            onChange={(e) => setLocalData({ ...localData, link: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="https://..."
            className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleParse}
            disabled={!localData.link || parsingId === item.id}
            className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded"
            title="Auto-Vervollständigen"
          >
            {parsingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          </button>
        </div>
      </td>
      <td className="p-2">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={localData.preis}
            onChange={(e) => setLocalData({ ...localData, preis: e.target.value })}
            onKeyDown={handleKeyDown}
            step="0.01"
            className="w-20 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm text-right focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-500 text-sm">€</span>
        </div>
      </td>
      <td className="p-2">
        <input
          type="number"
          value={localData.anzahl}
          onChange={(e) => setLocalData({ ...localData, anzahl: e.target.value })}
          onKeyDown={handleKeyDown}
          min="1"
          className="w-16 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm text-center focus:ring-2 focus:ring-blue-500"
        />
      </td>
      <td className="p-2 text-right text-white font-medium">
        {formatPreis((parseFloat(localData.preis) || 0) * (parseInt(localData.anzahl) || 1))}
      </td>
      <td className="p-2">
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => onSave(localData)}
            disabled={savingId === item.id}
            className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded"
          >
            {savingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </button>
          <button onClick={onCancel} className="p-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
});

// Separate NewRow Komponente mit eigenem lokalem State
const NewRowComponent = memo(function NewRowComponent({ 
  kategorie, 
  onSave, 
  onCancel, 
  onParse, 
  parsingId, 
  savingId 
}) {
  const [localData, setLocalData] = useState({
    name: '',
    link: '',
    preis: '',
    anzahl: 1
  });

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (localData.name) onSave(localData, kategorie);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleParse = async () => {
    const result = await onParse(localData.link);
    if (result) {
      setLocalData(prev => ({
        ...prev,
        name: result.name || prev.name,
        preis: result.preis || prev.preis,
      }));
    }
  };

  return (
    <tr className="bg-green-950/20 border-b border-gray-800">
      <td className="p-2">
        <input
          type="text"
          value={localData.name}
          onChange={(e) => setLocalData({ ...localData, name: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder="Produktname..."
          className="w-full px-2 py-1.5 bg-gray-800 border border-green-600 rounded text-white text-sm focus:ring-2 focus:ring-green-500"
          autoFocus
        />
      </td>
      <td className="p-2">
        <div className="flex gap-1">
          <input
            type="text"
            value={localData.link}
            onChange={(e) => setLocalData({ ...localData, link: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="https://..."
            className="flex-1 px-2 py-1.5 bg-gray-800 border border-green-600 rounded text-white text-sm focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={handleParse}
            disabled={!localData.link || parsingId === 'new'}
            className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded"
          >
            {parsingId === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          </button>
        </div>
      </td>
      <td className="p-2">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={localData.preis}
            onChange={(e) => setLocalData({ ...localData, preis: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="0.00"
            step="0.01"
            className="w-20 px-2 py-1.5 bg-gray-800 border border-green-600 rounded text-white text-sm text-right focus:ring-2 focus:ring-green-500"
          />
          <span className="text-gray-500 text-sm">€</span>
        </div>
      </td>
      <td className="p-2">
        <input
          type="number"
          value={localData.anzahl}
          onChange={(e) => setLocalData({ ...localData, anzahl: e.target.value })}
          onKeyDown={handleKeyDown}
          min="1"
          className="w-16 px-2 py-1.5 bg-gray-800 border border-green-600 rounded text-white text-sm text-center focus:ring-2 focus:ring-green-500"
        />
      </td>
      <td className="p-2 text-right text-white font-medium">
        {formatPreis((parseFloat(localData.preis) || 0) * (parseInt(localData.anzahl) || 1))}
      </td>
      <td className="p-2">
        <div className="flex gap-1 justify-end">
          <button
            onClick={() => onSave(localData, kategorie)}
            disabled={!localData.name || savingId === 'new'}
            className="p-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded"
          >
            {savingId === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </button>
          <button onClick={onCancel} className="p-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
});

export default function HaushaltDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [haushalt, setHaushalt] = useState(null);
  const [artikel, setArtikel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isPolling, setIsPolling] = useState(true);
  const pollIntervalRef = useRef(null);
  
  // Ansicht: 'tabs' | 'split' | 'stacked'
  const [viewMode, setViewMode] = useState('tabs');
  const [activeTab, setActiveTab] = useState('konsumitiv');
  
  // Inline-Editing States
  const [editingId, setEditingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [parsingId, setParsingId] = useState(null);
  
  // Neue Zeile (Inline-Edit — bleibt für Inline-Workflow erhalten)
  const [newRow, setNewRow] = useState(null);

  // Add-Modal pro Kategorie + Sortier-State pro Kategorie
  const [addModalKategorie, setAddModalKategorie] = useState(null);
  // Edit-Modal: nutzt dasselbe ArtikelModal, gibt vorhandenes Item als Prop mit
  const [editItem, setEditItem] = useState(null);
  const [sortBy, setSortBy] = useState({ konsumitiv: 'manuell', investiv: 'manuell' });
  // Welche Beschreibungen sind aufgeklappt
  const [openDesc, setOpenDesc] = useState(() => new Set());
  // Suche/Filter + Bulk-Selection
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [lastClickedId, setLastClickedId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [statusSummary, setStatusSummary] = useState(null);

  const fetchStatusSummary = async () => {
    try {
      const r = await apiClient.get(`/haushalte/${id}/status-summary`);
      setStatusSummary(r.data);
    } catch {}
  };
  useEffect(() => { if (id) fetchStatusSummary(); }, [id, artikel.length]);

  const filterItems = (items) => items.filter((a) => {
    if (filterStatus && a.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.name.toLowerCase().includes(q) && !(a.beschreibung || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const toggleSelect = (id) => setSelectedIds((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  // Klick mit ggf. Shift: bei Shift+Klick wird der Bereich zwischen
  // letzter Auswahl und aktueller Zeile (innerhalb derselben sichtbaren
  // Reihenfolge) auf den Zustand der aktuellen Zeile gesetzt.
  const handleSelectClick = (item, event, orderedItems) => {
    const id = item.id;
    if (event.shiftKey && lastClickedId != null && orderedItems?.length) {
      const ids = orderedItems.map(i => i.id);
      const a = ids.indexOf(lastClickedId);
      const b = ids.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = ids.slice(lo, hi + 1);
        const shouldSelect = !selectedIds.has(id);
        setSelectedIds((s) => {
          const n = new Set(s);
          range.forEach((rid) => { shouldSelect ? n.add(rid) : n.delete(rid); });
          return n;
        });
        setLastClickedId(id);
        return;
      }
    }
    toggleSelect(id);
    setLastClickedId(id);
  };
  const clearSelection = () => { setSelectedIds(new Set()); setLastClickedId(null); };

  const bulkSetStatus = async (status) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await apiClient.put(`/haushalte/${id}/artikel/bulk`, {
        ids: Array.from(selectedIds), status,
      });
      clearSelection();
      fetchData();
    } catch {} finally { setBulkBusy(false); }
  };

  const exportCsv = async () => {
    try {
      const res = await apiClient.get(`/haushalte/${id}/artikel.csv`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `${haushalt?.name || 'artikel'}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  // Initiales Laden - nur bei ID-Wechsel
  useEffect(() => {
    fetchData();
  }, [id]);
  
  // Polling - pausiert während Bearbeitung
  useEffect(() => {
    if (isPolling && !editingId && !newRow) {
      pollIntervalRef.current = setInterval(() => {
        fetchData(true);
      }, POLL_INTERVAL);
    }
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [id, isPolling, editingId, newRow]);

  const fetchData = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      
      const [haushaltRes, artikelRes] = await Promise.all([
        apiClient.get(`/haushalte/${id}`),
        apiClient.get(`/haushalte/${id}/artikel`),
      ]);
      
      setHaushalt(haushaltRes.data);
      setArtikel(artikelRes.data);
      setLastUpdate(new Date());
    } catch (err) {
      if (!silent) {
        setError('Daten konnten nicht geladen werden.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  // Inline-Editing
  const startEditing = (item) => {
    setEditingId(item.id);
  };

  // Speichern für EditingRow (erhält Daten als Parameter)
  const handleSaveEditing = async (localData) => {
    if (!editingId) return;
    
    setSavingId(editingId);
    try {
      await apiClient.put(`/haushalte/${id}/artikel/${editingId}`, {
        name: localData.name,
        preis: parseFloat(localData.preis) || 0,
        anzahl: parseInt(localData.anzahl) || 1,
        link: localData.link || '',
        beschreibung: '',
      });
      
      setEditingId(null);
      fetchData();
    } catch (err) {
      alert('Änderungen konnten nicht gespeichert werden.');
    } finally {
      setSavingId(null);
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  // Parse für EditingRow - gibt Ergebnis zurück
  const handleParseLink = async (artikelId, link) => {
    if (!link) return null;
    
    setParsingId(artikelId);
    try {
      const response = await apiClient.post('/haushalte/parse-link/', { url: link });
      return response.data;
    } catch (err) {
      console.error('Parse-Fehler:', err);
      return null;
    } finally {
      setParsingId(null);
    }
  };

  // Neue Zeile
  const addNewRow = (kategorie) => {
    setNewRow({
      name: '',
      preis: '',
      anzahl: 1,
      link: '',
      beschreibung: '',
      kategorie,
    });
    if (viewMode === 'tabs') {
      setActiveTab(kategorie);
    }
  };

  // Speichern für NewRow (erhält Daten als Parameter)
  const handleSaveNewRow = async (localData, kategorie) => {
    if (!localData.name) return;
    
    setSavingId('new');
    try {
      await apiClient.post(`/haushalte/${id}/artikel`, {
        name: localData.name,
        preis: parseFloat(localData.preis) || 0,
        anzahl: parseInt(localData.anzahl) || 1,
        kategorie: kategorie,
        link: localData.link || '',
        beschreibung: '',
      });
      
      setNewRow(null);
      fetchData();
    } catch (err) {
      alert('Artikel konnte nicht erstellt werden.');
    } finally {
      setSavingId(null);
    }
  };

  const cancelNewRow = () => {
    setNewRow(null);
  };

  // Parse für NewRow - gibt Ergebnis zurück
  const handleParseNewRow = async (link) => {
    if (!link) return null;
    
    setParsingId('new');
    try {
      const response = await apiClient.post('/haushalte/parse-link/', { url: link });
      return response.data;
    } catch (err) {
      console.error('Parse-Fehler:', err);
      return null;
    } finally {
      setParsingId(null);
    }
  };

  const handleDeleteArtikel = async (artikelId) => {
    if (!confirm('Möchtest du diesen Artikel wirklich löschen?')) return;
    
    try {
      await apiClient.delete(`/haushalte/${id}/artikel/${artikelId}`);
      fetchData();
    } catch (err) {
      alert('Artikel konnte nicht gelöscht werden.');
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error || !haushalt) {
    return (
      <div className="bg-gray-900 border border-red-800 rounded-xl p-12 text-center">
        <p className="text-red-400 mb-4">{error || 'Haushalt nicht gefunden'}</p>
        <button
          onClick={() => navigate('/haushalte')}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg"
        >
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  const budgetKonsumitiv = parseFloat(haushalt.budget_konsumitiv) || 0;
  const budgetInvestitiv = parseFloat(haushalt.budget_investiv) || 0;
  const gesamtKonsumitiv = parseFloat(haushalt.gesamt_konsumitiv) || 0;
  const gesamtInvestitiv = parseFloat(haushalt.gesamt_investiv) || 0;
  const gesamtBudget = budgetKonsumitiv + budgetInvestitiv;
  const gesamtAusgaben = gesamtKonsumitiv + gesamtInvestitiv;

  const artikelKonsumitiv = artikel.filter(a => a.kategorie === 'konsumitiv');
  const artikelInvestitiv = artikel.filter(a => a.kategorie === 'investiv');

  const sortItems = (items, mode) => {
    if (mode === 'manuell') return [...items].sort((a, b) => (a.sortierung || 0) - (b.sortierung || 0));
    const desc = mode.startsWith('-');
    const key = desc ? mode.slice(1) : mode;
    return [...items].sort((a, b) => {
      const av = key === 'preis' ? parseFloat(a.preis || 0) : (a[key] || '');
      const bv = key === 'preis' ? parseFloat(b.preis || 0) : (b[key] || '');
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });
  };

  const toggleDesc = (id) => setOpenDesc((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // Reihenfolge per ↑↓ ändern + speichern
  const moveItem = async (item, items, dir) => {
    const sorted = [...items].sort((a, b) => (a.sortierung || 0) - (b.sortierung || 0));
    const idx = sorted.findIndex(i => i.id === item.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= sorted.length) return;
    [sorted[idx], sorted[j]] = [sorted[j], sorted[idx]];
    // optimistisch update
    setArtikel((prev) => {
      const otherKat = prev.filter(a => a.kategorie !== item.kategorie);
      return [...otherKat, ...sorted.map((it, i) => ({ ...it, sortierung: i }))];
    });
    try {
      await apiClient.put(`/haushalte/${id}/artikel/reorder`, { ids: sorted.map(i => i.id) });
    } catch { fetchData(); }
  };

  const handleStatusChange = async (item, status) => {
    try {
      await apiClient.put(`/haushalte/${id}/artikel/${item.id}`, { status });
      setArtikel((prev) => prev.map(a => a.id === item.id ? { ...a, status } : a));
    } catch (e) { /* still */ fetchData(); }
  };

  // Tabellen-Zeile Komponente — Inline-Editing wurde entfernt; Klick auf
  // Name/Preis/Anzahl oder den Bearbeiten-Button öffnet das ArtikelModal.
  const ArtikelRow = ({ item, kategorie, orderedItems }) => {
    const openEdit = () => setEditItem(item);
    const allKatItems = kategorie === 'konsumitiv' ? artikelKonsumitiv : artikelInvestitiv;
    const manuellOrder = (sortBy[kategorie] === 'manuell');
    const descOpen = openDesc.has(item.id);
    return (
      <>
      <tr className="border-b border-gray-800 hover:bg-gray-800/30 group align-middle">
        {/* Checkbox — Shift+Klick wählt einen Bereich aus */}
        <td className="p-2 w-[32px]">
          <input type="checkbox"
            checked={selectedIds.has(item.id)}
            onClick={(e) => { e.preventDefault(); handleSelectClick(item, e, orderedItems); }}
            onChange={() => {}}
            className="rounded border-gray-600 bg-gray-700 text-blue-500" />
        </td>
        {/* Status */}
        <td className="p-2 w-[110px]">
          <select value={item.status || 'beantragt'}
            onChange={(e) => handleStatusChange(item, e.target.value)}
            className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border-0 cursor-pointer ${STATUS_CLASS[item.status] || STATUS_CLASS.beantragt}`}>
            {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k} className="bg-gray-900 text-white">{l}</option>)}
          </select>
        </td>
        {/* Bild */}
        <td className="p-2 w-[48px]">
          {item.bild_url ? (
            <img src={item.bild_url} alt="" className="w-9 h-9 object-cover rounded bg-gray-800" loading="lazy" />
          ) : (
            <div className="w-9 h-9 bg-gray-800 rounded flex items-center justify-center">
              <Package className="w-4 h-4 text-gray-600" />
            </div>
          )}
        </td>
        {/* Name + Beschreibung-Toggle */}
        <td className="p-2">
          <span className="text-white cursor-pointer hover:text-blue-400"
            onClick={openEdit}>
            {item.name}
          </span>
          <button onClick={() => toggleDesc(item.id)}
            title={descOpen ? 'Details verbergen' : 'Details (Beschreibung, Kommentare, Verlauf, Quittung)'}
            className="ml-1.5 text-gray-500 hover:text-gray-300 align-middle">
            <Info className="w-3.5 h-3.5 inline" />
          </button>
        </td>
        {/* Link */}
        <td className="p-2">
          {item.link ? (
            <a href={item.link} target="_blank" rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-sm">
              <ExternalLink className="w-3 h-3" /> Link
            </a>
          ) : (
            <span className="text-gray-600 text-sm">—</span>
          )}
        </td>
        <td className="p-2 text-right text-gray-300 cursor-pointer hover:text-blue-400" onClick={openEdit}>
          {formatPreis(item.preis)}
        </td>
        <td className="p-2 text-center text-gray-300 cursor-pointer hover:text-blue-400" onClick={openEdit}>
          {item.anzahl}
        </td>
        <td className="p-2 text-right text-white font-medium">
          {formatPreis(item.gesamtpreis)}
        </td>
        {/* Reorder ↑↓ (nur bei manueller Sortierung sinnvoll) */}
        <td className="p-2 w-[60px]">
          {manuellOrder && (
            <div className="flex flex-col gap-0.5 items-center opacity-50 group-hover:opacity-100">
              <button onClick={() => moveItem(item, allKatItems, -1)}
                className="p-0.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => moveItem(item, allKatItems, +1)}
                className="p-0.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </td>
        <td className="p-2">
          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={openEdit}
              className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded">
              <Edit className="w-4 h-4" />
            </button>
            <button onClick={() => handleDeleteArtikel(item.id)}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
      {descOpen && (
        <tr className="border-b border-gray-800 bg-gray-900/40">
          <td colSpan={10} className="px-0 py-0">
            <ArtikelDetailsPanel
              haushaltId={id}
              artikel={item}
              canEdit={true}
              onRefresh={fetchData}
            />
          </td>
        </tr>
      )}
      </>
    );
  };

  // Neue Zeile Komponente Wrapper
  const NewRow = ({ kategorie }) => {
    if (!newRow || newRow.kategorie !== kategorie) return null;
    
    return (
      <NewRowComponent
        kategorie={kategorie}
        onSave={handleSaveNewRow}
        onCancel={cancelNewRow}
        onParse={handleParseNewRow}
        parsingId={parsingId}
        savingId={savingId}
      />
    );
  };

  // Tabellen-Komponente
  const ArtikelTabelle = ({ items, kategorie, color, icon: Icon, budget, ausgaben }) => {
    const sorted = sortItems(items, sortBy[kategorie]);
    return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className={`p-4 border-b border-gray-800 ${color === 'orange' ? 'bg-orange-950/20' : 'bg-green-950/20'}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${color === 'orange' ? 'text-orange-400' : 'text-green-400'}`} />
            <h3 className="font-bold text-white">{kategorie === 'konsumitiv' ? 'Konsumitiv' : 'Investitiv'}</h3>
            <span className="text-sm text-gray-400">({items.length})</span>
          </div>
          <p className={`text-lg font-bold ${color === 'orange' ? 'text-orange-400' : 'text-green-400'}`}>
            {formatPreis(ausgaben)} <span className="text-gray-500 text-sm font-normal">/ {formatPreis(budget)}</span>
          </p>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-3">
          <div
            className={`h-full transition-all ${
              budget > 0 && (ausgaben / budget) > 0.9
                ? 'bg-red-500'
                : color === 'orange' ? 'bg-orange-500' : 'bg-green-500'
            }`}
            style={{ width: `${budget > 0 ? Math.min((ausgaben / budget) * 100, 100) : 0}%` }}
          />
        </div>
        {/* Action-Bar: Add-Button + Sortierung */}
        <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
          <button onClick={() => setAddModalKategorie(kategorie)}
            data-shortcut="new"
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg ${
              color === 'orange'
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}>
            <Plus className="w-4 h-4" /> Artikel hinzufügen
          </button>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
            <select value={sortBy[kategorie]}
              onChange={(e) => setSortBy(s => ({ ...s, [kategorie]: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
              {SORT_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="p-2 w-[32px]"></th>
              <th className="p-2 w-[110px]">Status</th>
              <th className="p-2 w-[48px]"></th>
              <th className="p-2">Name</th>
              <th className="p-2 w-[100px]">Link</th>
              <th className="p-2 w-[100px] text-right">Preis</th>
              <th className="p-2 w-[60px] text-center">Anz.</th>
              <th className="p-2 w-[110px] text-right">Gesamt</th>
              <th className="p-2 w-[60px]"></th>
              <th className="p-2 w-[80px]"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <ArtikelRow key={item.id} item={item} kategorie={kategorie} orderedItems={sorted} />
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={10} className="p-6 text-center text-gray-500 text-sm">Noch keine Artikel</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/haushalte')}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{haushalt.name}</h1>
            <button
              onClick={() => setShowEditModal(true)}
              className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded"
            >
              <Edit className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {haushalt.beschreibung && <p className="text-gray-400 text-sm">{haushalt.beschreibung}</p>}
            <button
              onClick={() => setIsPolling(!isPolling)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                isPolling ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${isPolling ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
              {isPolling ? 'Live' : 'Pausiert'}
            </button>
            {lastUpdate && <span className="text-xs text-gray-600">{lastUpdate.toLocaleTimeString('de-DE')}</span>}
          </div>
        </div>
        
        {/* Ansicht-Umschalter */}
        <div className="flex bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setViewMode('tabs')}
            className={`p-2 rounded ${viewMode === 'tabs' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            title="Tabs"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`p-2 rounded ${viewMode === 'split' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            title="Nebeneinander"
          >
            <Columns className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('stacked')}
            className={`p-2 rounded ${viewMode === 'stacked' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            title="Untereinander"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Budget Übersicht */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-blue-400" />
            <span className="text-gray-400">Gesamt</span>
          </div>
          <p className="text-lg font-bold text-white">
            {formatPreis(gesamtAusgaben)} <span className="text-gray-500 text-sm font-normal">/ {formatPreis(gesamtBudget)}</span>
          </p>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden mt-3">
          <div
            className={`h-full transition-all ${
              gesamtBudget > 0 && (gesamtAusgaben / gesamtBudget) > 0.9 ? 'bg-red-500' : 'bg-blue-500'
            }`}
            style={{ width: `${gesamtBudget > 0 ? Math.min((gesamtAusgaben / gesamtBudget) * 100, 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Such/Filter/Bulk + CSV-Export */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input type="text" placeholder="Suchen…" value={search}
            data-shortcut="search"
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white">
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button onClick={exportCsv}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg">
          <FileDown className="w-4 h-4" /> CSV
        </button>
        {selectedIds.size > 0 && (
          <>
            <span className="text-sm text-gray-400">{selectedIds.size} ausgewählt</span>
            <select onChange={(e) => { if (e.target.value) { bulkSetStatus(e.target.value); e.target.value = ''; } }}
              disabled={bulkBusy}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm rounded px-2 py-2 border-0">
              <option value="">Status setzen…</option>
              {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k} className="bg-gray-900">{l}</option>)}
            </select>
            <button onClick={clearSelection}
              className="text-sm text-gray-400 hover:text-white px-2">Auswahl×</button>
          </>
        )}
      </div>

      {/* Status-Summary (Budget-Aufteilung) */}
      {statusSummary && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Budget nach Status</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {['konsumitiv', 'investiv'].map((kat) => {
              const sums = statusSummary[kat] || {};
              const total = Object.values(sums).reduce((s, x) => s + (x.summe || 0), 0);
              return (
                <div key={kat}>
                  <div className="text-xs text-gray-400 mb-1 capitalize">{kat}</div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {Object.entries(STATUS_LABEL).map(([s, l]) => {
                      const v = sums[s];
                      if (!v) return null;
                      return (
                        <span key={s} className={`px-2 py-0.5 rounded ${STATUS_CLASS[s]}`}>
                          {l}: {v.summe.toLocaleString('de-DE', {minimumFractionDigits: 2})} € ({v.anzahl})
                        </span>
                      );
                    })}
                    {total === 0 && <span className="text-gray-600">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabellen - Je nach Ansicht */}
      {viewMode === 'tabs' && (
        <div>
          {/* Tab-Buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('konsumitiv')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'konsumitiv'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <TrendingDown className="w-5 h-5" />
              Konsumitiv ({artikelKonsumitiv.length})
            </button>
            <button
              onClick={() => setActiveTab('investiv')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'investiv'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <TrendingUp className="w-5 h-5" />
              Investitiv ({artikelInvestitiv.length})
            </button>
          </div>
          
          {/* Aktive Tabelle */}
          {activeTab === 'konsumitiv' && (
            <ArtikelTabelle
              items={filterItems(artikelKonsumitiv)}
              kategorie="konsumitiv"
              color="orange"
              icon={TrendingDown}
              budget={budgetKonsumitiv}
              ausgaben={gesamtKonsumitiv}
            />
          )}
          {activeTab === 'investiv' && (
            <ArtikelTabelle
              items={filterItems(artikelInvestitiv)}
              kategorie="investiv"
              color="green"
              icon={TrendingUp}
              budget={budgetInvestitiv}
              ausgaben={gesamtInvestitiv}
            />
          )}
        </div>
      )}

      {viewMode === 'split' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ArtikelTabelle
            items={filterItems(artikelKonsumitiv)}
            kategorie="konsumitiv"
            color="orange"
            icon={TrendingDown}
            budget={budgetKonsumitiv}
            ausgaben={gesamtKonsumitiv}
          />
          <ArtikelTabelle
            items={filterItems(artikelInvestitiv)}
            kategorie="investiv"
            color="green"
            icon={TrendingUp}
            budget={budgetInvestitiv}
            ausgaben={gesamtInvestitiv}
          />
        </div>
      )}

      {viewMode === 'stacked' && (
        <div className="space-y-6">
          <ArtikelTabelle
            items={filterItems(artikelKonsumitiv)}
            kategorie="konsumitiv"
            color="orange"
            icon={TrendingDown}
            budget={budgetKonsumitiv}
            ausgaben={gesamtKonsumitiv}
          />
          <ArtikelTabelle
            items={filterItems(artikelInvestitiv)}
            kategorie="investiv"
            color="green"
            icon={TrendingUp}
            budget={budgetInvestitiv}
            ausgaben={gesamtInvestitiv}
          />
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <EditHaushaltModal
          haushalt={haushalt}
          onClose={() => setShowEditModal(false)}
          onUpdated={(updated) => {
            setHaushalt(updated);
            setShowEditModal(false);
          }}
        />
      )}

      {/* Add-Artikel-Modal (gleiche Komponente wie in der Haushaltsübersicht) */}
      {addModalKategorie && (
        <ArtikelModal
          haushalt={haushalt}
          initialKategorie={addModalKategorie}
          onClose={() => setAddModalKategorie(null)}
          onCreated={() => { setAddModalKategorie(null); fetchData(); }}
        />
      )}

      {/* Edit-Artikel-Modal (gleiche Komponente, nur mit vorbelegtem Item) */}
      {editItem && (
        <ArtikelModal
          haushalt={haushalt}
          initialKategorie={editItem.kategorie}
          artikel={editItem}
          onClose={() => setEditItem(null)}
          onCreated={() => { setEditItem(null); fetchData(); }}
        />
      )}
    </div>
  );
}
