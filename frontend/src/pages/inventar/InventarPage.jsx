/**
 * Inventar — Kompakte Übersicht mit Tabs: Items | Ausleihen | Statistik
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Filter, Package, Grid, List,
  Loader2, MapPin, Building, Layers,
  X, ChevronRight, ChevronDown, Upload, CheckSquare, Square,
  Trash2, Tag, ScanLine, BookmarkPlus,
  AlertTriangle, Clock, User, Calendar, RefreshCw,
  Mail, BarChart3, TrendingUp,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { toast } from 'sonner';
import apiClient from '../../lib/api';
import QRScanner from '../../components/QRScanner';

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
const STATUS_COLORS_CHART = { verfuegbar: '#22C55E', ausgeliehen: '#3B82F6', reserviert: '#EAB308', defekt: '#EF4444' };
const AUSLEIHE_STATUS_COLORS = {
  offen: 'bg-gray-700 text-gray-300',
  aktiv: 'bg-blue-900/30 text-blue-400',
  teilrueckgabe: 'bg-yellow-900/30 text-yellow-400',
  abgeschlossen: 'bg-green-900/30 text-green-400',
  abgebrochen: 'bg-red-900/30 text-red-400',
};

function SectionHeader({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full py-1.5 text-left">
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        <span className="text-sm font-semibold text-white">{title}</span>
        <span className="text-xs text-gray-500">({count})</span>
      </button>
      {open && <div className="space-y-2 pb-3">{children}</div>}
    </div>
  );
}

export default function InventarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);

  const activeTab = searchParams.get('tab') || 'items';
  const setActiveTab = (tab) => {
    const params = new URLSearchParams();
    if (tab !== 'items') params.set('tab', tab);
    setSearchParams(params, { replace: true });
  };

  // Items State
  const [items, setItems] = useState([]);
  const [kategorien, setKategorien] = useState([]);
  const [standorte, setStandorte] = useState([]);
  const [hersteller, setHersteller] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [suche, setSuche] = useState(searchParams.get('suche') || '');
  const [filterKategorie, setFilterKategorie] = useState(searchParams.get('kategorie') || '');
  const [filterStandort, setFilterStandort] = useState(searchParams.get('standort') || '');
  const [filterHersteller, setFilterHersteller] = useState(searchParams.get('hersteller') || '');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
  const [showFilter, setShowFilter] = useState(
    !!(searchParams.get('kategorie') || searchParams.get('standort') || searchParams.get('hersteller') || searchParams.get('status'))
  );
  const [viewMode, setViewMode] = useState('list');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkKategorie, setShowBulkKategorie] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [savedFilters, setSavedFilters] = useState([]);
  const [showSaveFilter, setShowSaveFilter] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [scanMode, setScanMode] = useState('find');

  // Ausleihen State
  const [ausleihen, setAusleihen] = useState([]);
  const [ausleihenLoading, setAusleihenLoading] = useState(false);
  const [ausleihenSuche, setAusleihenSuche] = useState('');

  // Statistik State
  const [erweitert, setErweitert] = useState(null);
  const [statistikLoading, setStatistikLoading] = useState(false);

  // ═══ Data Fetching ═══

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (suche) p.append('suche', suche);
      if (filterKategorie) p.append('kategorie_id', filterKategorie);
      if (filterStandort) p.append('standort_id', filterStandort);
      if (filterHersteller) p.append('hersteller_id', filterHersteller);
      if (filterStatus) p.append('status', filterStatus);
      const [itemsRes, katRes, standRes, herstRes, statsRes] = await Promise.all([
        apiClient.get(`/inventar/items?${p}`),
        apiClient.get('/inventar/kategorien'),
        apiClient.get('/inventar/standorte'),
        apiClient.get('/inventar/hersteller'),
        apiClient.get('/inventar/stats'),
      ]);
      setItems(itemsRes.data);
      setKategorien(katRes.data);
      setStandorte(standRes.data);
      setHersteller(herstRes.data);
      setStats(statsRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [suche, filterKategorie, filterStandort, filterHersteller, filterStatus]);

  useEffect(() => { if (activeTab === 'items') fetchItems(); }, [fetchItems, activeTab]);

  useEffect(() => {
    apiClient.get('/inventar/filter').then(r => setSavedFilters(r.data || [])).catch(() => {});
  }, []);

  const fetchAusleihen = useCallback(async () => {
    setAusleihenLoading(true);
    try { setAusleihen((await apiClient.get('/inventar/ausleihen')).data); }
    catch (err) { console.error(err); }
    finally { setAusleihenLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === 'ausleihen') fetchAusleihen(); }, [activeTab, fetchAusleihen]);

  const fetchStatistik = useCallback(async () => {
    setStatistikLoading(true);
    try {
      const [s, e] = await Promise.all([apiClient.get('/inventar/stats'), apiClient.get('/inventar/stats/erweitert')]);
      setStats(s.data); setErweitert(e.data);
    } catch (err) { console.error(err); }
    finally { setStatistikLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === 'statistik') fetchStatistik(); }, [activeTab, fetchStatistik]);

  // ═══ Items Actions ═══

  const handleQRScan = async (code) => {
    if (scanMode === 'rueckgabe') {
      try {
        const r = await apiClient.post('/inventar/schnellrueckgabe', { qr_code: code, zustand: 'ok', notizen: '' });
        toast.success(`${r.data.item_name} zurückgegeben`);
        if (activeTab === 'ausleihen') fetchAusleihen(); else fetchItems();
      } catch (err) { toast.error(err.response?.data?.error || 'Rückgabe fehlgeschlagen'); }
    } else {
      try {
        const r = await apiClient.get(`/inventar/items/qr/${encodeURIComponent(code)}`);
        setShowQRScanner(false); navigate(`/inventar/${r.data.id}`);
      } catch { toast.error('Item nicht gefunden'); }
    }
  };

  const clearFilters = () => { setSuche(''); setFilterKategorie(''); setFilterStandort(''); setFilterHersteller(''); setFilterStatus(''); };
  const hasActiveFilters = suche || filterKategorie || filterStandort || filterHersteller || filterStatus;

  const handleSaveFilter = async () => {
    if (!filterName.trim()) return;
    try {
      const d = {};
      if (suche) d.suche = suche; if (filterKategorie) d.kategorie_id = filterKategorie;
      if (filterStandort) d.standort_id = filterStandort; if (filterHersteller) d.hersteller_id = filterHersteller;
      if (filterStatus) d.status = filterStatus;
      await apiClient.post('/inventar/filter', { name: filterName, filter_data: d });
      toast.success('Filter gespeichert'); setShowSaveFilter(false); setFilterName('');
      setSavedFilters((await apiClient.get('/inventar/filter')).data || []);
    } catch { toast.error('Speichern fehlgeschlagen'); }
  };

  const handleLoadFilter = (f) => {
    const d = f.filter_data || {};
    setSuche(d.suche || ''); setFilterKategorie(d.kategorie_id || ''); setFilterStandort(d.standort_id || '');
    setFilterHersteller(d.hersteller_id || ''); setFilterStatus(d.status || '');
    if (d.kategorie_id || d.standort_id || d.hersteller_id || d.status) setShowFilter(true);
  };

  const handleDeleteFilter = async (id) => {
    try { await apiClient.delete(`/inventar/filter/${id}`); setSavedFilters(f => f.filter(x => x.id !== id)); }
    catch { toast.error('Löschen fehlgeschlagen'); }
  };

  const toggleSelect = (id) => setSelectedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => setSelectedIds(selectedIds.size === items.length ? new Set() : new Set(items.map(i => i.id)));

  const handleBulkStatusChange = async (s) => {
    try { await apiClient.post('/inventar/items/bulk/status', { item_ids: [...selectedIds], status: s });
      toast.success(`${selectedIds.size} Items aktualisiert`); setSelectedIds(new Set()); setShowBulkStatus(false); fetchItems();
    } catch (e) { toast.error(e.response?.data?.error || 'Fehler'); }
  };
  const handleBulkKategorieChange = async (kid) => {
    try { await apiClient.post('/inventar/items/bulk/kategorie', { item_ids: [...selectedIds], kategorie_id: parseInt(kid) });
      toast.success(`Kategorie aktualisiert`); setSelectedIds(new Set()); setShowBulkKategorie(false); fetchItems();
    } catch (e) { toast.error(e.response?.data?.error || 'Fehler'); }
  };
  const handleBulkDelete = async () => {
    if (!window.confirm(`${selectedIds.size} Items löschen?`)) return;
    try { await apiClient.post('/inventar/items/bulk/delete', { item_ids: [...selectedIds] });
      toast.success(`${selectedIds.size} Items gelöscht`); setSelectedIds(new Set()); setBulkMode(false); fetchItems();
    } catch (e) { toast.error(e.response?.data?.error || 'Fehler'); }
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append('datei', file);
      const r = await apiClient.post('/inventar/import/items', fd);
      toast.success(`${r.data.importiert || 0} importiert`); setShowImportModal(false); fetchItems();
    } catch (err) { toast.error(err.response?.data?.error || 'Import fehlgeschlagen'); }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // ═══ Ausleihen ═══

  const handleSendMahnung = async (id) => {
    try { const r = await apiClient.post(`/inventar/ausleihlisten/${id}/mahnung`);
      r.data.success ? toast.success('Mahnung gesendet') : toast.error(r.data.message);
    } catch { toast.error('Senden fehlgeschlagen'); }
  };

  const ausleihenSections = [
    { key: 'ueberfaellig', title: 'Überfällig', items: ausleihen.filter(a => a.ist_ueberfaellig && a.status === 'aktiv'), defaultOpen: true },
    { key: 'aktiv', title: 'Aktiv', items: ausleihen.filter(a => a.status === 'aktiv' && !a.ist_ueberfaellig), defaultOpen: true },
    { key: 'offen', title: 'Offen', items: ausleihen.filter(a => a.status === 'offen'), defaultOpen: true },
    { key: 'teilrueckgabe', title: 'Teilrückgabe', items: ausleihen.filter(a => a.status === 'teilrueckgabe'), defaultOpen: true },
    { key: 'abgeschlossen', title: 'Abgeschlossen', items: ausleihen.filter(a => a.status === 'abgeschlossen'), defaultOpen: false },
  ].filter(s => s.items.length > 0);

  const filteredSections = ausleihenSections.map(s => ({
    ...s,
    items: ausleihenSuche ? s.items.filter(a => {
      const q = ausleihenSuche.toLowerCase();
      return (a.titel||'').toLowerCase().includes(q) || (a.ausleiher_name||'').toLowerCase().includes(q) || (a.zweck||'').toLowerCase().includes(q);
    }) : s.items,
  })).filter(s => s.items.length > 0);

  // ═══ Statistik ═══

  const monatsDaten = (erweitert?.ausleihen_pro_monat ?? []).map(m => ({ name: m.monat, anzahl: m.anzahl }));
  const statusDaten = Object.entries(erweitert?.items_nach_status ?? {}).map(([s, v]) => ({
    name: STATUS_LABELS[s] || s, value: v, color: STATUS_COLORS_CHART[s] || '#6B7280',
  }));

  // ═══ Render ═══

  return (
    <div className="space-y-4">
      {/* Header: compact */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">Inventar</h1>
          {stats && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-gray-400">
              <span>{stats.total_items} Items</span>
              <span className="text-green-400">{stats.status_counts?.verfuegbar || 0} frei</span>
              <span className="text-blue-400">{stats.status_counts?.ausgeliehen || 0} verliehen</span>
              {stats.ueberfaellige_ausleihen > 0 && (
                <span className="text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{stats.ueberfaellige_ausleihen} überfällig
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {activeTab === 'items' && (
            <>
              <button onClick={() => { setScanMode('find'); setShowQRScanner(true); }}
                className="p-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg" title="QR-Scan">
                <ScanLine className="w-4 h-4" />
              </button>
              <button onClick={() => setShowImportModal(true)}
                className="p-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg" title="CSV Import">
                <Upload className="w-4 h-4" />
              </button>
              <Link to="/inventar/sets" className="p-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg" title="Item-Sets">
                <Layers className="w-4 h-4" />
              </Link>
              <Link to="/inventar/neu"
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
                <Plus className="w-4 h-4" /> Neu
              </Link>
            </>
          )}
          {activeTab === 'ausleihen' && (
            <>
              <button onClick={() => { setScanMode('rueckgabe'); setShowQRScanner(true); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-gray-300 hover:text-white rounded-lg text-sm">
                <ScanLine className="w-4 h-4" /> Rückgabe
              </button>
              <Link to="/ausleihen"
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
                <Plus className="w-4 h-4" /> Neue Ausleihe
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Tabs: compact pill style */}
      <div className="flex gap-0.5 bg-gray-900/50 border border-gray-800 rounded-lg p-0.5">
        {[
          { key: 'items', label: 'Items', icon: Package },
          { key: 'ausleihen', label: 'Ausleihen', icon: RefreshCw },
          { key: 'statistik', label: 'Statistik', icon: BarChart3 },
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                active ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.key === 'ausleihen' && stats?.ueberfaellige_ausleihen > 0 && (
                <span className="w-4 h-4 text-[10px] bg-red-600 text-white rounded-full flex items-center justify-center">{stats.ueberfaellige_ausleihen}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══ ITEMS TAB ═══ */}
      {activeTab === 'items' && (
        <>
          {/* Search + Filter row */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="text" value={suche} onChange={e => setSuche(e.target.value)}
                placeholder="Suche..." className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-600" />
            </div>
            <button onClick={() => setShowFilter(!showFilter)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg ${hasActiveFilters ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              <Filter className="w-3.5 h-3.5" /> Filter
            </button>
            <button onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
              className={`p-1.5 rounded-lg ${bulkMode ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              <CheckSquare className="w-4 h-4" />
            </button>
            <div className="flex bg-gray-800 rounded-lg p-0.5">
              <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}>
                <Grid className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilter && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Filter</span>
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <>
                      <button onClick={() => setShowSaveFilter(true)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                        <BookmarkPlus className="w-3 h-3" /> Speichern
                      </button>
                      <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-white">Reset</button>
                    </>
                  )}
                </div>
              </div>
              {savedFilters.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {savedFilters.map(sf => (
                    <div key={sf.id} className="flex items-center bg-gray-800 rounded overflow-hidden">
                      <button onClick={() => handleLoadFilter(sf)} className="px-2 py-1 text-xs text-gray-300 hover:text-white">{sf.name}</button>
                      <button onClick={() => handleDeleteFilter(sf.id)} className="px-1.5 py-1 text-gray-600 hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: 'Kategorie', value: filterKategorie, set: setFilterKategorie, opts: kategorien.map(k => ({ v: k.id, l: k.name })) },
                  { label: 'Standort', value: filterStandort, set: setFilterStandort, opts: standorte.map(s => ({ v: s.id, l: s.name })) },
                  { label: 'Hersteller', value: filterHersteller, set: setFilterHersteller, opts: hersteller.map(h => ({ v: h.id, l: h.name })) },
                  { label: 'Status', value: filterStatus, set: setFilterStatus, opts: Object.entries(STATUS_LABELS).map(([v, l]) => ({ v, l })) },
                ].map(f => (
                  <select key={f.label} value={f.value} onChange={e => f.set(e.target.value)}
                    className="px-2 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-white">
                    <option value="">Alle {f.label}</option>
                    {f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                ))}
              </div>
            </div>
          )}

          {/* Bulk Bar */}
          {bulkMode && selectedIds.size > 0 && (
            <div className="bg-purple-900/20 border border-purple-800 rounded-lg px-3 py-2 flex items-center gap-2 text-sm">
              <span className="text-white font-medium">{selectedIds.size} ausgewählt</span>
              <div className="flex-1" />
              <div className="relative">
                <button onClick={() => setShowBulkStatus(!showBulkStatus)} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Status
                </button>
                {showBulkStatus && (
                  <div className="absolute top-full mt-1 left-0 bg-gray-800 border border-gray-700 rounded shadow-lg z-20 py-0.5 min-w-[140px]">
                    {Object.entries(STATUS_LABELS).map(([k, l]) => (
                      <button key={k} onClick={() => handleBulkStatusChange(k)} className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-gray-700 flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_FARBEN[k]}`} />{l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <button onClick={() => setShowBulkKategorie(!showBulkKategorie)} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Kategorie
                </button>
                {showBulkKategorie && (
                  <div className="absolute top-full mt-1 left-0 bg-gray-800 border border-gray-700 rounded shadow-lg z-20 py-0.5 min-w-[140px] max-h-40 overflow-y-auto">
                    {kategorien.map(k => (
                      <button key={k.id} onClick={() => handleBulkKategorieChange(k.id)} className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-gray-700">{k.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={handleBulkDelete} className="px-2 py-1 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Löschen
              </button>
              <button onClick={() => { setSelectedIds(new Set()); setBulkMode(false); }} className="px-2 py-1 text-xs text-gray-400 hover:text-white">Abbrechen</button>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>
          ) : items.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-10 text-center">
              <Package className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Keine Items gefunden</p>
              <Link to="/inventar/neu" className="mt-2 inline-block text-sm text-blue-400 hover:text-blue-300">Item erstellen</Link>
            </div>
          ) : viewMode === 'list' ? (
            /* ─── LIST VIEW ─── */
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
                    {bulkMode && (
                      <th className="p-2 w-8"><button onClick={toggleSelectAll}>
                        {selectedIds.size === items.length ? <CheckSquare className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4 text-gray-600" />}
                      </button></th>
                    )}
                    <th className="text-left p-2 font-medium">Item</th>
                    <th className="text-left p-2 font-medium hidden md:table-cell">Kategorie</th>
                    <th className="text-left p-2 font-medium hidden lg:table-cell">Standort</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium hidden lg:table-cell">Menge</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} onClick={() => !bulkMode && navigate(`/inventar/${item.id}`)}
                      className={`border-b border-gray-800/50 hover:bg-gray-800/40 cursor-pointer transition-colors ${selectedIds.has(item.id) ? 'bg-purple-900/10' : ''}`}>
                      {bulkMode && (
                        <td className="p-2 w-8" onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}>
                          {selectedIds.has(item.id) ? <CheckSquare className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4 text-gray-600" />}
                        </td>
                      )}
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center shrink-0">
                            {item.bild_url ? <img src={item.bild_url} alt="" className="w-full h-full object-cover rounded" /> : <Package className="w-3.5 h-3.5 text-gray-600" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-white font-medium truncate text-sm">{item.name}</div>
                            {item.seriennummer && <div className="text-[11px] text-gray-500 truncate">{item.seriennummer}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="p-2 hidden md:table-cell">
                        {item.kategorie_name ? (
                          <span className="px-1.5 py-0.5 text-[11px] rounded" style={{ backgroundColor: (item.kategorie_farbe || '#6B7280') + '15', color: item.kategorie_farbe || '#6B7280' }}>
                            {item.kategorie_name}
                          </span>
                        ) : <span className="text-gray-600">-</span>}
                      </td>
                      <td className="p-2 text-xs text-gray-400 hidden lg:table-cell">{item.standort_name || '-'}</td>
                      <td className="p-2">
                        <span className="flex items-center gap-1.5 text-xs">
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_FARBEN[item.status] || 'bg-gray-500'}`} />
                          {item.status_display || STATUS_LABELS[item.status] || item.status}
                        </span>
                      </td>
                      <td className="p-2 text-xs text-gray-400 hidden lg:table-cell">
                        {item.menge_gesamt > 1 ? `${item.menge_verfuegbar}/${item.menge_gesamt}` : ''}
                      </td>
                      <td className="p-2"><ChevronRight className="w-4 h-4 text-gray-700" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* ─── GRID VIEW ─── */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {items.map(item => (
                <div key={item.id} className="relative group">
                  {bulkMode && (
                    <button onClick={e => { e.preventDefault(); toggleSelect(item.id); }} className="absolute top-2 left-2 z-10">
                      {selectedIds.has(item.id) ? <CheckSquare className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4 text-gray-500" />}
                    </button>
                  )}
                  <Link to={`/inventar/${item.id}`}
                    className={`block bg-gray-900 border rounded-lg overflow-hidden hover:border-gray-700 transition-colors ${selectedIds.has(item.id) ? 'border-purple-600' : 'border-gray-800'}`}>
                    <div className="aspect-[4/3] bg-gray-800 relative">
                      {item.bild_url ? <img src={item.bild_url} alt={item.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-gray-700" /></div>}
                      <span className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${STATUS_FARBEN[item.status] || 'bg-gray-500'}`} />
                    </div>
                    <div className="p-2.5">
                      <h3 className="text-sm font-medium text-white truncate group-hover:text-blue-400">{item.name}</h3>
                      <div className="flex items-center justify-between mt-1.5">
                        {item.kategorie_name ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: (item.kategorie_farbe || '#6B7280') + '15', color: item.kategorie_farbe || '#6B7280' }}>
                            {item.kategorie_name}
                          </span>
                        ) : <span />}
                        {item.standort_name && <span className="text-[10px] text-gray-500 flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{item.standort_name}</span>}
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ AUSLEIHEN TAB ═══ */}
      {activeTab === 'ausleihen' && (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={ausleihenSuche} onChange={e => setAusleihenSuche(e.target.value)}
              placeholder="Suche..." className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-600" />
          </div>
          {ausleihenLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>
          ) : filteredSections.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-10 text-center">
              <Package className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Keine Ausleihen</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredSections.map(section => (
                <SectionHeader key={section.key} title={section.title} count={section.items.length} defaultOpen={section.defaultOpen}>
                  {section.items.map(a => (
                    <Link key={a.id} to={`/ausleihen/${a.id}`}
                      className={`flex items-center gap-3 p-3 bg-gray-900 border rounded-lg hover:border-gray-700 transition-colors ${a.ist_ueberfaellig ? 'border-red-900/60' : 'border-gray-800'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white truncate">{a.titel || `#${a.id}`}</span>
                          {a.ausleiher_name && <span className="text-xs text-gray-500 truncate hidden sm:inline">{a.ausleiher_name}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          {a.frist && <span className={a.ist_ueberfaellig ? 'text-red-400' : ''}>{new Date(a.frist).toLocaleDateString('de-DE')}</span>}
                          <span>{a.anzahl_items} Artikel</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {a.ist_ueberfaellig && (
                          <button onClick={e => { e.preventDefault(); e.stopPropagation(); handleSendMahnung(a.id); }}
                            className="p-1.5 text-orange-400 hover:bg-orange-900/20 rounded" title="Mahnung senden">
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span className={`px-2 py-0.5 text-[11px] rounded ${AUSLEIHE_STATUS_COLORS[a.status] || 'bg-gray-700 text-gray-400'}`}>
                          {a.status_display || a.status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-700" />
                      </div>
                    </Link>
                  ))}
                </SectionHeader>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ STATISTIK TAB ═══ */}
      {activeTab === 'statistik' && (
        <>
          {statistikLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>
          ) : (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Aktive Ausleihen', value: stats?.aktive_ausleihen ?? 0, icon: Package, color: 'text-blue-400', bg: 'bg-blue-900/20' },
                  { label: 'Überfällig', value: stats?.ueberfaellige_ausleihen ?? 0, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-900/20', border: stats?.ueberfaellige_ausleihen > 0 ? 'border-red-900/50' : '' },
                  { label: 'Heute fällig', value: erweitert?.heute_faellig ?? 0, icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-900/20' },
                  { label: 'Items gesamt', value: stats?.total_items ?? 0, icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-900/20' },
                ].map((kpi, i) => {
                  const Icon = kpi.icon;
                  return (
                    <div key={i} className={`bg-gray-900 border rounded-lg p-4 ${kpi.border || 'border-gray-800'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`p-1.5 rounded ${kpi.bg}`}><Icon className={`w-4 h-4 ${kpi.color}`} /></div>
                        <span className="text-xs text-gray-400">{kpi.label}</span>
                      </div>
                      <p className={`text-2xl font-bold ${kpi.value > 0 && kpi.color === 'text-red-400' ? 'text-red-400' : 'text-white'}`}>{kpi.value}</p>
                    </div>
                  );
                })}
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Ausleihen pro Monat</h3>
                  {monatsDaten.length > 0 ? (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monatsDaten}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                          <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={{ stroke: '#1E293B' }} />
                          <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={{ stroke: '#1E293B' }} allowDecimals={false} />
                          <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '6px', color: '#F9FAFB', fontSize: '12px' }} />
                          <Bar dataKey="anzahl" fill="#3B82F6" radius={[3, 3, 0, 0]} name="Ausleihen" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <div className="h-56 flex items-center justify-center text-gray-600 text-sm">Keine Daten</div>}
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Items nach Status</h3>
                  {statusDaten.length > 0 ? (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={statusDaten} cx="50%" cy="50%" innerRadius={40} outerRadius={75} dataKey="value" stroke="#111827" strokeWidth={2}>
                            {statusDaten.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '6px', color: '#F9FAFB', fontSize: '12px' }} />
                          <Legend wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <div className="h-56 flex items-center justify-center text-gray-600 text-sm">Keine Daten</div>}
                </div>
              </div>

              {/* Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Top Items</h3>
                  {(erweitert?.top_items ?? []).length > 0 ? (
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-gray-800 text-gray-500">
                        <th className="text-left py-1.5 font-medium">#</th><th className="text-left py-1.5 font-medium">Item</th><th className="text-right py-1.5 font-medium">Ausleihen</th>
                      </tr></thead>
                      <tbody>
                        {(erweitert?.top_items ?? []).slice(0, 8).map((it, i) => (
                          <tr key={i} className="border-b border-gray-800/30"><td className="py-1.5 text-gray-500">{i+1}</td><td className="py-1.5 text-white">{it.name}</td><td className="py-1.5 text-right text-gray-400">{it.ausleihen_count}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-center py-6 text-gray-600 text-xs">Keine Daten</p>}
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Überfällig
                  </h3>
                  {(stats?.ueberfaellige_liste ?? []).length > 0 ? (
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-gray-800 text-gray-500">
                        <th className="text-left py-1.5 font-medium">Ausleiher</th><th className="text-left py-1.5 font-medium">Frist</th><th className="text-right py-1.5 font-medium"></th>
                      </tr></thead>
                      <tbody>
                        {(stats?.ueberfaellige_liste ?? []).map(a => (
                          <tr key={a.id} className="border-b border-gray-800/30">
                            <td className="py-1.5 text-white">{a.ausleiher_name}</td>
                            <td className="py-1.5 text-red-400">{a.frist ? new Date(a.frist).toLocaleDateString('de-DE') : '-'}</td>
                            <td className="py-1.5 text-right"><Link to={`/ausleihen/${a.id}`} className="text-blue-400 hover:text-blue-300">Details</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-center py-6 text-green-500/60 text-xs">Alles im Grünen</p>}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══ MODALS ═══ */}
      {showQRScanner && (
        <QRScanner onScan={handleQRScan} onClose={() => { setShowQRScanner(false); setScanMode('find'); }}
          label={scanMode === 'rueckgabe' ? 'Schnellrückgabe per QR' : 'Item per QR-Code finden'} />
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">CSV Import</h2>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-400 mb-3">Spalten: Name, Seriennummer, Kategorie, Standort, Hersteller, Menge, Notizen</p>
            <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center">
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportCSV} className="hidden" id="csv-import" />
              <label htmlFor="csv-import" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? 'Importiere...' : 'Datei wählen'}
              </label>
            </div>
          </div>
        </div>
      )}

      {showSaveFilter && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-xs p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Filter speichern</h2>
            <input type="text" value={filterName} onChange={e => setFilterName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveFilter()}
              placeholder="Name..." className="w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white mb-3" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => { setShowSaveFilter(false); setFilterName(''); }} className="flex-1 py-1.5 text-sm text-gray-400 hover:text-white">Abbrechen</button>
              <button onClick={handleSaveFilter} disabled={!filterName.trim()} className="flex-1 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg">Speichern</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
