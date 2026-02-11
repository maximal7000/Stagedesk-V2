/**
 * Inventar-Übersicht mit Filter, Suche, Bulk-Ops, QR-Scanner, CSV-Import
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Filter, Package, Grid, List,
  Loader2, QrCode, MapPin, Building, Layers,
  X, ChevronRight, Upload, CheckSquare, Square,
  Trash2, Tag, ScanLine, Save, BookmarkPlus,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../lib/api';
import QRScanner from '../components/QRScanner';

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

export default function InventarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [kategorien, setKategorien] = useState([]);
  const [standorte, setStandorte] = useState([]);
  const [hersteller, setHersteller] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filter (von URL-Params initialisiert)
  const [suche, setSuche] = useState(searchParams.get('suche') || '');
  const [filterKategorie, setFilterKategorie] = useState(searchParams.get('kategorie') || '');
  const [filterStandort, setFilterStandort] = useState(searchParams.get('standort') || '');
  const [filterHersteller, setFilterHersteller] = useState(searchParams.get('hersteller') || '');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
  const [showFilter, setShowFilter] = useState(
    !!(searchParams.get('kategorie') || searchParams.get('standort') || searchParams.get('hersteller') || searchParams.get('status'))
  );

  // View Mode
  const [viewMode, setViewMode] = useState('grid');

  // QR Scanner
  const [showQRScanner, setShowQRScanner] = useState(false);

  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkKategorie, setShowBulkKategorie] = useState(false);

  // CSV Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);

  // Gespeicherte Filter
  const [savedFilters, setSavedFilters] = useState([]);
  const [showSaveFilter, setShowSaveFilter] = useState(false);
  const [filterName, setFilterName] = useState('');

  // URL-Params synchronisieren
  useEffect(() => {
    const params = new URLSearchParams();
    if (suche) params.set('suche', suche);
    if (filterKategorie) params.set('kategorie', filterKategorie);
    if (filterStandort) params.set('standort', filterStandort);
    if (filterHersteller) params.set('hersteller', filterHersteller);
    if (filterStatus) params.set('status', filterStatus);
    setSearchParams(params, { replace: true });
  }, [suche, filterKategorie, filterStandort, filterHersteller, filterStatus, setSearchParams]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (suche) params.append('suche', suche);
      if (filterKategorie) params.append('kategorie_id', filterKategorie);
      if (filterStandort) params.append('standort_id', filterStandort);
      if (filterHersteller) params.append('hersteller_id', filterHersteller);
      if (filterStatus) params.append('status', filterStatus);

      const [itemsRes, kategorienRes, standorteRes, herstellerRes, statsRes] = await Promise.all([
        apiClient.get(`/inventar/items?${params}`),
        apiClient.get('/inventar/kategorien'),
        apiClient.get('/inventar/standorte'),
        apiClient.get('/inventar/hersteller'),
        apiClient.get('/inventar/stats'),
      ]);

      setItems(itemsRes.data);
      setKategorien(kategorienRes.data);
      setStandorte(standorteRes.data);
      setHersteller(herstellerRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Fehler beim Laden:', err);
    } finally {
      setLoading(false);
    }
  }, [suche, filterKategorie, filterStandort, filterHersteller, filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Gespeicherte Filter laden
  useEffect(() => {
    apiClient.get('/inventar/filter')
      .then(res => setSavedFilters(res.data || []))
      .catch(() => {});
  }, []);

  // QR-Scanner Callback
  const handleQRScan = async (code) => {
    try {
      const res = await apiClient.get(`/inventar/items/qr/${encodeURIComponent(code)}`);
      setShowQRScanner(false);
      navigate(`/inventar/${res.data.id}`);
    } catch {
      toast.error('Item nicht gefunden');
    }
  };

  const clearFilters = () => {
    setSuche('');
    setFilterKategorie('');
    setFilterStandort('');
    setFilterHersteller('');
    setFilterStatus('');
  };

  const hasActiveFilters = suche || filterKategorie || filterStandort || filterHersteller || filterStatus;

  // Gespeicherte Filter
  const handleSaveFilter = async () => {
    if (!filterName.trim()) return;
    try {
      const filterData = {};
      if (suche) filterData.suche = suche;
      if (filterKategorie) filterData.kategorie_id = filterKategorie;
      if (filterStandort) filterData.standort_id = filterStandort;
      if (filterHersteller) filterData.hersteller_id = filterHersteller;
      if (filterStatus) filterData.status = filterStatus;

      await apiClient.post('/inventar/filter', { name: filterName, filter_data: filterData });
      toast.success('Filter gespeichert');
      setShowSaveFilter(false);
      setFilterName('');
      const res = await apiClient.get('/inventar/filter');
      setSavedFilters(res.data || []);
    } catch {
      toast.error('Filter konnte nicht gespeichert werden');
    }
  };

  const handleLoadFilter = (filter) => {
    const data = filter.filter_data || {};
    setSuche(data.suche || '');
    setFilterKategorie(data.kategorie_id || '');
    setFilterStandort(data.standort_id || '');
    setFilterHersteller(data.hersteller_id || '');
    setFilterStatus(data.status || '');
    if (data.kategorie_id || data.standort_id || data.hersteller_id || data.status) {
      setShowFilter(true);
    }
    toast.success(`Filter "${filter.name}" geladen`);
  };

  const handleDeleteFilter = async (filterId) => {
    try {
      await apiClient.delete(`/inventar/filter/${filterId}`);
      setSavedFilters(f => f.filter(sf => sf.id !== filterId));
      toast.success('Filter gelöscht');
    } catch {
      toast.error('Löschen fehlgeschlagen');
    }
  };

  // Bulk-Operationen
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  const handleBulkStatusChange = async (status) => {
    if (selectedIds.size === 0) return;
    try {
      await apiClient.post('/inventar/items/bulk/status', {
        item_ids: Array.from(selectedIds),
        status,
      });
      toast.success(`${selectedIds.size} Items auf "${STATUS_LABELS[status]}" gesetzt`);
      setSelectedIds(new Set());
      setShowBulkStatus(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Fehler beim Status-Update');
    }
  };

  const handleBulkKategorieChange = async (kategorieId) => {
    if (selectedIds.size === 0) return;
    try {
      await apiClient.post('/inventar/items/bulk/kategorie', {
        item_ids: Array.from(selectedIds),
        kategorie_id: parseInt(kategorieId),
      });
      toast.success(`Kategorie für ${selectedIds.size} Items geändert`);
      setSelectedIds(new Set());
      setShowBulkKategorie(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Fehler bei Kategorie-Update');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`${selectedIds.size} Items wirklich löschen?`)) return;
    try {
      await apiClient.post('/inventar/items/bulk/delete', {
        item_ids: Array.from(selectedIds),
      });
      toast.success(`${selectedIds.size} Items gelöscht`);
      setSelectedIds(new Set());
      setBulkMode(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Löschen fehlgeschlagen');
    }
  };

  // CSV-Import
  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('datei', file);
      const res = await apiClient.post('/inventar/import/items', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data;
      toast.success(`${data.importiert || 0} Items importiert`);
      if (data.fehler?.length > 0) {
        toast.error(`${data.fehler.length} Fehler beim Import`);
      }
      setShowImportModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import fehlgeschlagen');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventar</h1>
          <p className="text-gray-400 mt-1">
            {stats && `${stats.total_items} Items`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/ausleihen"
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 hover:text-white rounded-lg"
          >
            <Package className="w-5 h-5" />
            <span className="hidden sm:inline">Ausleihen</span>
          </Link>
          <Link
            to="/inventar/sets"
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 hover:text-white rounded-lg"
          >
            <Layers className="w-5 h-5" />
            <span className="hidden sm:inline">Item-Sets</span>
          </Link>
          <button
            onClick={() => setShowQRScanner(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 hover:text-white rounded-lg"
          >
            <ScanLine className="w-5 h-5" />
            <span className="hidden sm:inline">QR-Scan</span>
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 hover:text-white rounded-lg"
          >
            <Upload className="w-5 h-5" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <Link
            to="/inventar/neu"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Neues Item</span>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-white">{stats.status_counts?.verfuegbar || 0}</div>
            <div className="text-sm text-gray-400">Verfügbar</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-blue-400">{stats.status_counts?.ausgeliehen || 0}</div>
            <div className="text-sm text-gray-400">Ausgeliehen</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-yellow-400">{stats.status_counts?.reserviert || 0}</div>
            <div className="text-sm text-gray-400">Reserviert</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-red-400">{stats.ueberfaellige_ausleihen || 0}</div>
            <div className="text-sm text-gray-400">Überfällig</div>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Suche nach Name, Seriennummer, QR-Code..."
            className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              hasActiveFilters ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <Filter className="w-5 h-5" />
            Filter
            {hasActiveFilters && (
              <span className="w-2 h-2 bg-white rounded-full" />
            )}
          </button>

          <button
            onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              bulkMode ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <CheckSquare className="w-5 h-5" />
            <span className="hidden sm:inline">Auswahl</span>
          </button>

          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilter && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-white">Filter</h3>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <>
                  <button
                    onClick={() => setShowSaveFilter(true)}
                    className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                  >
                    <BookmarkPlus className="w-4 h-4" /> Speichern
                  </button>
                  <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-white">
                    Zurücksetzen
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Gespeicherte Filter */}
          {savedFilters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {savedFilters.map(sf => (
                <div key={sf.id} className="flex items-center gap-1 bg-gray-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => handleLoadFilter(sf)}
                    className="px-3 py-1.5 text-sm text-gray-300 hover:text-white"
                  >
                    {sf.name}
                  </button>
                  <button
                    onClick={() => handleDeleteFilter(sf.id)}
                    className="px-2 py-1.5 text-gray-500 hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Kategorie</label>
              <select
                value={filterKategorie}
                onChange={(e) => setFilterKategorie(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              >
                <option value="">Alle Kategorien</option>
                {kategorien.map(k => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Standort</label>
              <select
                value={filterStandort}
                onChange={(e) => setFilterStandort(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              >
                <option value="">Alle Standorte</option>
                {standorte.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Hersteller</label>
              <select
                value={filterHersteller}
                onChange={(e) => setFilterHersteller(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              >
                <option value="">Alle Hersteller</option>
                {hersteller.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              >
                <option value="">Alle Status</option>
                <option value="verfuegbar">Verfügbar</option>
                <option value="ausgeliehen">Ausgeliehen</option>
                <option value="reserviert">Reserviert</option>
                <option value="defekt">Defekt</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="bg-purple-900/20 border border-purple-800 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <span className="text-white font-medium">{selectedIds.size} ausgewählt</span>
          <div className="flex-1" />

          <div className="relative">
            <button
              onClick={() => setShowBulkStatus(!showBulkStatus)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
            >
              <Tag className="w-4 h-4" /> Status ändern
            </button>
            {showBulkStatus && (
              <div className="absolute top-full mt-1 left-0 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => handleBulkStatusChange(key)}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                  >
                    <span className={`w-2 h-2 rounded-full ${STATUS_FARBEN[key]}`} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowBulkKategorie(!showBulkKategorie)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
            >
              <Layers className="w-4 h-4" /> Kategorie
            </button>
            {showBulkKategorie && (
              <div className="absolute top-full mt-1 left-0 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-20 py-1 min-w-[160px] max-h-48 overflow-y-auto">
                {kategorien.map(k => (
                  <button
                    key={k.id}
                    onClick={() => handleBulkKategorieChange(k.id)}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700"
                  >
                    {k.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg"
          >
            <Trash2 className="w-4 h-4" /> Löschen
          </button>

          <button
            onClick={() => { setSelectedIds(new Set()); setBulkMode(false); }}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
          >
            Abbrechen
          </button>
        </div>
      )}

      {/* Items Grid/List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Keine Items gefunden</p>
          <Link to="/inventar/neu" className="mt-4 inline-block text-blue-400 hover:text-blue-300">
            Erstes Item erstellen
          </Link>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map(item => (
            <div key={item.id} className="relative group">
              {bulkMode && (
                <button
                  onClick={(e) => { e.preventDefault(); toggleSelect(item.id); }}
                  className="absolute top-3 left-3 z-10"
                >
                  {selectedIds.has(item.id) ? (
                    <CheckSquare className="w-5 h-5 text-purple-400" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              )}
              <Link
                to={`/inventar/${item.id}`}
                className={`block bg-gray-900 border rounded-xl overflow-hidden hover:border-gray-700 transition-colors ${
                  selectedIds.has(item.id) ? 'border-purple-600' : 'border-gray-800'
                }`}
              >
                {/* Image/Placeholder */}
                <div className="aspect-video bg-gray-800 relative">
                  {item.bild_url ? (
                    <img src={item.bild_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-12 h-12 text-gray-600" />
                    </div>
                  )}
                  <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${STATUS_FARBEN[item.status] || 'bg-gray-500'}`} />
                  {item.menge_gesamt > 1 && (
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-xs bg-black/70 text-white rounded">
                      {item.menge_verfuegbar}/{item.menge_gesamt}
                    </span>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium text-white truncate group-hover:text-blue-400 transition-colors">
                        {item.name}
                      </h3>
                      {item.seriennummer && (
                        <p className="text-xs text-gray-500">{item.seriennummer}</p>
                      )}
                    </div>
                    {item.kategorie_name && (
                      <span
                        className="shrink-0 px-2 py-0.5 text-xs rounded"
                        style={{ backgroundColor: (item.kategorie_farbe || '#6B7280') + '20', color: item.kategorie_farbe || '#6B7280' }}
                      >
                        {item.kategorie_name}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_FARBEN[item.status]?.replace('bg-', 'bg-opacity-20 text-')}`}>
                      {item.status_display || STATUS_LABELS[item.status] || item.status}
                    </span>
                    {item.hersteller_name && (
                      <span className="text-gray-500 flex items-center gap-1">
                        <Building className="w-3 h-3" />
                        {item.hersteller_name}
                      </span>
                    )}
                  </div>

                  {item.standort_name && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="w-3 h-3" />
                      {item.standort_name}
                    </div>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                {bulkMode && (
                  <th className="p-4 w-10">
                    <button onClick={toggleSelectAll}>
                      {selectedIds.size === items.length ? (
                        <CheckSquare className="w-5 h-5 text-purple-400" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </th>
                )}
                <th className="text-left p-4 text-sm text-gray-400 font-medium">Item</th>
                <th className="text-left p-4 text-sm text-gray-400 font-medium hidden md:table-cell">Kategorie</th>
                <th className="text-left p-4 text-sm text-gray-400 font-medium hidden lg:table-cell">Hersteller</th>
                <th className="text-left p-4 text-sm text-gray-400 font-medium">Status</th>
                <th className="text-left p-4 text-sm text-gray-400 font-medium hidden lg:table-cell">Standort</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr
                  key={item.id}
                  onClick={() => !bulkMode && navigate(`/inventar/${item.id}`)}
                  className={`border-b border-gray-800 last:border-b-0 hover:bg-gray-800/50 cursor-pointer ${
                    selectedIds.has(item.id) ? 'bg-purple-900/10' : ''
                  }`}
                >
                  {bulkMode && (
                    <td className="p-4 w-10" onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}>
                      {selectedIds.has(item.id) ? (
                        <CheckSquare className="w-5 h-5 text-purple-400" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </td>
                  )}
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-800 rounded flex items-center justify-center shrink-0">
                        {item.bild_url ? (
                          <img src={item.bild_url} alt="" className="w-full h-full object-cover rounded" />
                        ) : (
                          <Package className="w-5 h-5 text-gray-600" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-white">{item.name}</div>
                        {item.seriennummer && (
                          <div className="text-xs text-gray-500">{item.seriennummer}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 hidden md:table-cell">
                    {item.kategorie_name && (
                      <span
                        className="px-2 py-1 text-xs rounded"
                        style={{ backgroundColor: (item.kategorie_farbe || '#6B7280') + '20', color: item.kategorie_farbe || '#6B7280' }}
                      >
                        {item.kategorie_name}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-sm text-gray-400 hidden lg:table-cell">
                    {item.hersteller_name || '-'}
                  </td>
                  <td className="p-4">
                    <span className="flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full ${STATUS_FARBEN[item.status] || 'bg-gray-500'}`} />
                      {item.status_display || STATUS_LABELS[item.status] || item.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-400 hidden lg:table-cell">
                    {item.standort_name || '-'}
                  </td>
                  <td className="p-4">
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* QR Scanner */}
      {showQRScanner && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
          label="Item per QR-Code finden"
        />
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">CSV Import</h2>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Importiere Items aus einer CSV-Datei. Erwartete Spalten:<br />
              <code className="text-xs text-gray-500">Name, Seriennummer, Kategorie, Standort, Hersteller, Menge, Notizen</code>
            </p>
            <div className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center mb-4">
              <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-sm text-gray-400 mb-3">CSV-Datei auswählen</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                className="hidden"
                id="csv-import"
              />
              <label
                htmlFor="csv-import"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg cursor-pointer"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? 'Importiere...' : 'Datei auswählen'}
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Filter speichern Dialog */}
      {showSaveFilter && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Filter speichern</h2>
            <input
              type="text"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveFilter()}
              placeholder="Filter-Name..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowSaveFilter(false); setFilterName(''); }}
                className="flex-1 py-2 text-gray-400 hover:text-white"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveFilter}
                disabled={!filterName.trim()}
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
