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
import { PageHeader, Button, StatusBadge, StatTile, EmptyState } from '../../components/ui';

const STATUS_FARBEN = {
  verfuegbar: 'bg-ok',
  ausgeliehen: 'bg-info',
  reserviert: 'bg-warn',
  defekt: 'bg-bad',
};
const STATUS_LABELS = {
  verfuegbar: 'Verfügbar',
  ausgeliehen: 'Ausgeliehen',
  reserviert: 'Reserviert',
  defekt: 'Defekt',
};
// Status → StatusBadge-Ton (semantische Zuordnung, kollisionsfrei zu defekt=danger)
const STATUS_TONES = { verfuegbar: 'positive', ausgeliehen: 'info', reserviert: 'warning', defekt: 'danger' };
const AUSLEIHE_STATUS_TONES = { offen: 'neutral', aktiv: 'info', teilrueckgabe: 'warning', abgeschlossen: 'positive', abgebrochen: 'danger' };
const STATUS_COLORS_CHART = { verfuegbar: '#5fca8b', ausgeliehen: '#6fa8dc', reserviert: '#e5b14a', defekt: '#ef5d5d' };

function SectionHeader({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full py-1.5 text-left">
        {open ? <ChevronDown className="w-3.5 h-3.5 text-fg-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-fg-muted" />}
        <span className="text-sm font-semibold text-fg">{title}</span>
        <span className="text-xs text-fg-subtle">({count})</span>
      </button>
      {open && <div className="bg-surface rounded-lg divide-y divide-line-subtle overflow-hidden mb-3">{children}</div>}
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
    name: STATUS_LABELS[s] || s, value: v, color: STATUS_COLORS_CHART[s] || '#8a847b',
  }));

  // ═══ Render ═══

  return (
    <div className="space-y-4">
      <PageHeader
        title={{ items: 'Items', ausleihen: 'Ausleihen', statistik: 'Statistik' }[activeTab] || 'Inventar'}
        meta={stats && (
          <span className="flex items-center gap-2 flex-wrap tabular-nums">
            <span>{stats.total_items} Items</span>
            <span className="text-ok">· {stats.status_counts?.verfuegbar || 0} frei</span>
            <span className="text-info">· {stats.status_counts?.ausgeliehen || 0} verliehen</span>
            {stats.ueberfaellige_ausleihen > 0 && (
              <span className="text-bad flex items-center gap-1">
                · <AlertTriangle className="w-3 h-3" />{stats.ueberfaellige_ausleihen} überfällig
              </span>
            )}
          </span>
        )}
        actions={
          <>
            {activeTab === 'items' && (
              <>
                <Button variant="secondary" size="sm" icon={ScanLine} title="QR-Scan" aria-label="QR-Scan"
                  onClick={() => { setScanMode('find'); setShowQRScanner(true); }} />
                <Button variant="secondary" size="sm" icon={Upload} title="CSV Import" aria-label="CSV Import"
                  onClick={() => setShowImportModal(true)} />
                <Button as={Link} to="/inventar/sets" variant="secondary" size="sm" icon={Layers} title="Item-Sets" aria-label="Item-Sets" />
                <Button as={Link} to="/inventar/neu" variant="primary" size="sm" icon={Plus}>Neu</Button>
              </>
            )}
            {activeTab === 'ausleihen' && (
              <>
                <Button variant="secondary" size="sm" icon={ScanLine}
                  onClick={() => { setScanMode('rueckgabe'); setShowQRScanner(true); }}>Rückgabe</Button>
                <Button as={Link} to="/ausleihen" variant="primary" size="sm" icon={Plus}>Neue Ausleihe</Button>
              </>
            )}
          </>
        }
      />

      {/* Tabs: compact pill style */}
      <div className="flex border-b border-line-subtle">
        {[
          { key: 'items', label: 'Items', icon: Package },
          { key: 'ausleihen', label: 'Ausleihen', icon: RefreshCw },
          { key: 'statistik', label: 'Statistik', icon: BarChart3 },
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active ? 'border-accent text-fg' : 'border-transparent text-fg-subtle hover:text-fg'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.key === 'ausleihen' && stats?.ueberfaellige_ausleihen > 0 && (
                <span className="w-4 h-4 text-[10px] bg-bad text-white rounded-sm flex items-center justify-center tabular-nums">{stats.ueberfaellige_ausleihen}</span>
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
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
              <input type="text" value={suche} onChange={e => setSuche(e.target.value)}
                placeholder="Suche..." className="w-full pl-8 pr-3 py-1.5 text-sm bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none" />
            </div>
            <button onClick={() => setShowFilter(!showFilter)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md ${hasActiveFilters ? 'bg-accent hover:bg-accent-hover text-white' : 'bg-raised text-fg-muted hover:text-fg'}`}>
              <Filter className="w-3.5 h-3.5" /> Filter
            </button>
            <button onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
              className={`p-1.5 rounded-md ${bulkMode ? 'bg-hover text-accent-fg' : 'bg-raised text-fg-muted hover:text-fg'}`}>
              <CheckSquare className="w-4 h-4" />
            </button>
            <div className="flex bg-raised rounded-md p-0.5">
              <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-sm ${viewMode === 'list' ? 'bg-hover text-fg' : 'text-fg-subtle'}`}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-sm ${viewMode === 'grid' ? 'bg-hover text-fg' : 'text-fg-subtle'}`}>
                <Grid className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilter && (
            <div className="bg-surface rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fg">Filter</span>
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <>
                      <button onClick={() => setShowSaveFilter(true)} className="text-xs text-accent-fg hover:opacity-80 flex items-center gap-1">
                        <BookmarkPlus className="w-3 h-3" /> Speichern
                      </button>
                      <button onClick={clearFilters} className="text-xs text-fg-muted hover:text-fg">Reset</button>
                    </>
                  )}
                </div>
              </div>
              {savedFilters.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {savedFilters.map(sf => (
                    <div key={sf.id} className="flex items-center bg-raised rounded-sm overflow-hidden">
                      <button onClick={() => handleLoadFilter(sf)} className="px-2 py-1 text-xs text-fg-muted hover:text-fg">{sf.name}</button>
                      <button onClick={() => handleDeleteFilter(sf.id)} className="px-1.5 py-1 text-fg-subtle hover:text-bad"><X className="w-2.5 h-2.5" /></button>
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
                    className="px-2 py-1.5 text-xs bg-raised border border-line rounded-md text-fg hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none">
                    <option value="">Alle {f.label}</option>
                    {f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                ))}
              </div>
            </div>
          )}

          {/* Bulk Bar */}
          {bulkMode && selectedIds.size > 0 && (
            <div className="bg-surface rounded-lg px-3 py-2 flex items-center gap-2 text-sm">
              <span className="text-fg font-medium tabular-nums">{selectedIds.size} ausgewählt</span>
              <div className="flex-1" />
              <div className="relative">
                <button onClick={() => setShowBulkStatus(!showBulkStatus)} className="px-2 py-1 text-xs bg-raised hover:bg-hover text-fg rounded-sm flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Status
                </button>
                {showBulkStatus && (
                  <div className="absolute top-full mt-1 left-0 bg-overlay border border-line rounded-md shadow-overlay z-20 py-0.5 min-w-[140px]">
                    {Object.entries(STATUS_LABELS).map(([k, l]) => (
                      <button key={k} onClick={() => handleBulkStatusChange(k)} className="w-full text-left px-3 py-1.5 text-xs text-fg hover:bg-hover flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_FARBEN[k]}`} />{l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <button onClick={() => setShowBulkKategorie(!showBulkKategorie)} className="px-2 py-1 text-xs bg-raised hover:bg-hover text-fg rounded-sm flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Kategorie
                </button>
                {showBulkKategorie && (
                  <div className="absolute top-full mt-1 left-0 bg-overlay border border-line rounded-md shadow-overlay z-20 py-0.5 min-w-[140px] max-h-40 overflow-y-auto">
                    {kategorien.map(k => (
                      <button key={k.id} onClick={() => handleBulkKategorieChange(k.id)} className="w-full text-left px-3 py-1.5 text-xs text-fg hover:bg-hover">{k.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={handleBulkDelete} className="px-2 py-1 text-xs bg-raised text-bad hover:bg-hover rounded-sm flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Löschen
              </button>
              <button onClick={() => { setSelectedIds(new Set()); setBulkMode(false); }} className="px-2 py-1 text-xs text-fg-muted hover:text-fg">Abbrechen</button>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-accent-fg animate-spin" /></div>
          ) : items.length === 0 ? (
            <div className="bg-surface rounded-lg">
              <EmptyState icon={Package} title="Keine Items gefunden"
                action={<Button as={Link} to="/inventar/neu" variant="primary" size="sm" icon={Plus}>Item erstellen</Button>} />
            </div>
          ) : viewMode === 'list' ? (
            /* ─── LIST VIEW ─── */
            <div className="bg-surface rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-xs text-fg-subtle uppercase tracking-wider">
                    {bulkMode && (
                      <th className="p-2 w-8"><button onClick={toggleSelectAll}>
                        {selectedIds.size === items.length ? <CheckSquare className="w-4 h-4 text-accent-fg" /> : <Square className="w-4 h-4 text-fg-subtle" />}
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
                      className={`border-b border-line-subtle hover:bg-raised cursor-pointer transition-colors ${selectedIds.has(item.id) ? 'bg-raised' : ''}`}>
                      {bulkMode && (
                        <td className="p-2 w-8" onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}>
                          {selectedIds.has(item.id) ? <CheckSquare className="w-4 h-4 text-accent-fg" /> : <Square className="w-4 h-4 text-fg-subtle" />}
                        </td>
                      )}
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-raised rounded-sm flex items-center justify-center shrink-0">
                            {item.bild_url ? <img src={item.bild_url} alt="" className="w-full h-full object-cover rounded-sm" /> : <Package className="w-3.5 h-3.5 text-fg-subtle" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-fg font-medium truncate text-sm">{item.name}</div>
                            {item.seriennummer && <div className="text-[11px] text-fg-subtle truncate">{item.seriennummer}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="p-2 hidden md:table-cell">
                        {item.kategorie_name ? (
                          <span className="px-1.5 py-0.5 text-[11px] rounded-sm" style={{ backgroundColor: (item.kategorie_farbe || '#8a847b') + '15', color: item.kategorie_farbe || '#8a847b' }}>
                            {item.kategorie_name}
                          </span>
                        ) : <span className="text-fg-subtle">-</span>}
                      </td>
                      <td className="p-2 text-xs text-fg-muted hidden lg:table-cell">{item.standort_name || '-'}</td>
                      <td className="p-2">
                        <StatusBadge tone={STATUS_TONES[item.status] || 'neutral'} dot
                          label={item.status_display || STATUS_LABELS[item.status] || item.status} />
                      </td>
                      <td className="p-2 text-xs text-fg-muted hidden lg:table-cell tabular-nums">
                        {item.menge_gesamt > 1 ? `${item.menge_verfuegbar}/${item.menge_gesamt}` : ''}
                      </td>
                      <td className="p-2"><ChevronRight className="w-4 h-4 text-fg-subtle" /></td>
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
                      {selectedIds.has(item.id) ? <CheckSquare className="w-4 h-4 text-accent-fg" /> : <Square className="w-4 h-4 text-fg-subtle" />}
                    </button>
                  )}
                  <Link to={`/inventar/${item.id}`}
                    className={`block bg-surface rounded-lg overflow-hidden hover:bg-raised transition-colors ${selectedIds.has(item.id) ? 'bg-raised' : ''}`}>
                    <div className="aspect-[4/3] bg-raised relative">
                      {item.bild_url ? <img src={item.bild_url} alt={item.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-fg-subtle" /></div>}
                      <span className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${STATUS_FARBEN[item.status] || 'bg-fg-subtle'}`} />
                    </div>
                    <div className="p-2.5">
                      <h3 className="text-sm font-medium text-fg truncate group-hover:text-accent-fg">{item.name}</h3>
                      <div className="flex items-center justify-between mt-1.5">
                        {item.kategorie_name ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: (item.kategorie_farbe || '#8a847b') + '15', color: item.kategorie_farbe || '#8a847b' }}>
                            {item.kategorie_name}
                          </span>
                        ) : <span />}
                        {item.standort_name && <span className="text-[10px] text-fg-subtle flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{item.standort_name}</span>}
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
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" />
            <input type="text" value={ausleihenSuche} onChange={e => setAusleihenSuche(e.target.value)}
              placeholder="Suche..." className="w-full pl-8 pr-3 py-1.5 text-sm bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none" />
          </div>
          {ausleihenLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-accent-fg animate-spin" /></div>
          ) : filteredSections.length === 0 ? (
            <div className="bg-surface rounded-lg">
              <EmptyState icon={Package} title="Keine Ausleihen" />
            </div>
          ) : (
            <div className="space-y-1">
              {filteredSections.map(section => (
                <SectionHeader key={section.key} title={section.title} count={section.items.length} defaultOpen={section.defaultOpen}>
                  {section.items.map(a => (
                    <Link key={a.id} to={`/ausleihen/${a.id}`}
                      className={`flex items-center gap-3 p-3 hover:bg-raised transition-colors`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-fg truncate">{a.titel || `#${a.id}`}</span>
                          {a.ausleiher_name && <span className="text-xs text-fg-subtle truncate hidden sm:inline">{a.ausleiher_name}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-fg-subtle mt-0.5 tabular-nums">
                          {a.frist && <span className={a.ist_ueberfaellig ? 'text-bad' : ''}>{new Date(a.frist).toLocaleDateString('de-DE')}</span>}
                          <span>{a.anzahl_items} Artikel</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {a.ist_ueberfaellig && (
                          <button onClick={e => { e.preventDefault(); e.stopPropagation(); handleSendMahnung(a.id); }}
                            className="p-1.5 text-warn hover:bg-raised rounded-sm" title="Mahnung senden">
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <StatusBadge tone={AUSLEIHE_STATUS_TONES[a.status] || 'neutral'} label={a.status_display || a.status} />
                        <ChevronRight className="w-4 h-4 text-fg-subtle" />
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
            <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-accent-fg animate-spin" /></div>
          ) : (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile icon={Package} label="Aktive Ausleihen" value={stats?.aktive_ausleihen ?? 0} />
                <StatTile icon={AlertTriangle} label="Überfällig" value={stats?.ueberfaellige_ausleihen ?? 0}
                  tone={(stats?.ueberfaellige_ausleihen ?? 0) > 0 ? 'danger' : 'default'} />
                <StatTile icon={Clock} label="Heute fällig" value={erweitert?.heute_faellig ?? 0} tone="warning" />
                <StatTile icon={TrendingUp} label="Items gesamt" value={stats?.total_items ?? 0} tone="positive" />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border-t border-line-subtle pt-4">
                  <h3 className="text-sm font-semibold text-fg mb-3">Ausleihen pro Monat</h3>
                  {monatsDaten.length > 0 ? (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monatsDaten}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#24221f" />
                          <XAxis dataKey="name" tick={{ fill: '#8a847b', fontSize: 11 }} axisLine={{ stroke: '#24221f' }} />
                          <YAxis tick={{ fill: '#8a847b', fontSize: 11 }} axisLine={{ stroke: '#24221f' }} allowDecimals={false} />
                          <Tooltip contentStyle={{ backgroundColor: '#211f1c', border: '1px solid #35322e', borderRadius: '6px', color: '#f2efe9', fontSize: '12px' }} />
                          <Bar dataKey="anzahl" fill="#da1f3d" radius={[3, 3, 0, 0]} name="Ausleihen" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <div className="h-56 flex items-center justify-center text-fg-subtle text-sm">Keine Daten</div>}
                </div>
                <div className="border-t border-line-subtle pt-4">
                  <h3 className="text-sm font-semibold text-fg mb-3">Items nach Status</h3>
                  {statusDaten.length > 0 ? (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={statusDaten} cx="50%" cy="50%" innerRadius={40} outerRadius={75} dataKey="value" stroke="#211f1c" strokeWidth={2}>
                            {statusDaten.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: '#211f1c', border: '1px solid #35322e', borderRadius: '6px', color: '#f2efe9', fontSize: '12px' }} />
                          <Legend wrapperStyle={{ fontSize: '11px', color: '#8a847b' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <div className="h-56 flex items-center justify-center text-fg-subtle text-sm">Keine Daten</div>}
                </div>
              </div>

              {/* Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border-t border-line-subtle pt-4">
                  <h3 className="text-sm font-semibold text-fg mb-3">Top Items</h3>
                  {(erweitert?.top_items ?? []).length > 0 ? (
                    <table className="w-full text-xs tabular-nums">
                      <thead><tr className="border-b border-line-subtle text-fg-subtle">
                        <th className="text-left py-1.5 font-medium">#</th><th className="text-left py-1.5 font-medium">Item</th><th className="text-right py-1.5 font-medium">Ausleihen</th>
                      </tr></thead>
                      <tbody>
                        {(erweitert?.top_items ?? []).slice(0, 8).map((it, i) => (
                          <tr key={i} className="border-b border-line-subtle"><td className="py-1.5 text-fg-subtle">{i+1}</td><td className="py-1.5 text-fg">{it.name}</td><td className="py-1.5 text-right text-fg-muted">{it.ausleihen_count}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-center py-6 text-fg-subtle text-xs">Keine Daten</p>}
                </div>
                <div className="border-t border-line-subtle pt-4">
                  <h3 className="text-sm font-semibold text-fg mb-3 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-bad" /> Überfällig
                  </h3>
                  {(stats?.ueberfaellige_liste ?? []).length > 0 ? (
                    <table className="w-full text-xs tabular-nums">
                      <thead><tr className="border-b border-line-subtle text-fg-subtle">
                        <th className="text-left py-1.5 font-medium">Ausleiher</th><th className="text-left py-1.5 font-medium">Frist</th><th className="text-right py-1.5 font-medium"></th>
                      </tr></thead>
                      <tbody>
                        {(stats?.ueberfaellige_liste ?? []).map(a => (
                          <tr key={a.id} className="border-b border-line-subtle">
                            <td className="py-1.5 text-fg">{a.ausleiher_name}</td>
                            <td className="py-1.5 text-bad">{a.frist ? new Date(a.frist).toLocaleDateString('de-DE') : '-'}</td>
                            <td className="py-1.5 text-right"><Link to={`/ausleihen/${a.id}`} className="text-accent-fg hover:opacity-80">Details</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-center py-6 text-ok text-xs">Alles im Grünen</p>}
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
          <div className="bg-overlay border border-line rounded-lg shadow-overlay w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-fg">CSV Import</h2>
              <button onClick={() => setShowImportModal(false)} className="text-fg-muted hover:text-fg"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-fg-muted mb-3">Spalten: Name, Seriennummer, Kategorie, Standort, Hersteller, Menge, Notizen</p>
            <div className="border-2 border-dashed border-line rounded-lg p-6 text-center">
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImportCSV} className="hidden" id="csv-import" />
              <label htmlFor="csv-import" className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md cursor-pointer">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? 'Importiere...' : 'Datei wählen'}
              </label>
            </div>
          </div>
        </div>
      )}

      {showSaveFilter && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-overlay border border-line rounded-lg shadow-overlay w-full max-w-xs p-5">
            <h2 className="text-sm font-semibold text-fg mb-3">Filter speichern</h2>
            <input type="text" value={filterName} onChange={e => setFilterName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveFilter()}
              placeholder="Name..." className="w-full px-3 py-1.5 text-sm bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none mb-3" autoFocus />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setShowSaveFilter(false); setFilterName(''); }}>Abbrechen</Button>
              <Button variant="primary" size="sm" className="flex-1" onClick={handleSaveFilter} disabled={!filterName.trim()}>Speichern</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
