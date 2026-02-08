/**
 * Inventar-Übersicht mit Filter und Suche (v2 - vereinfacht)
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Filter, Package, Grid, List, 
  Loader2, QrCode, MapPin, Building, Layers,
  X, ChevronRight
} from 'lucide-react';
import apiClient from '../lib/api';

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
  const [items, setItems] = useState([]);
  const [kategorien, setKategorien] = useState([]);
  const [standorte, setStandorte] = useState([]);
  const [hersteller, setHersteller] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Filter
  const [suche, setSuche] = useState('');
  const [filterKategorie, setFilterKategorie] = useState('');
  const [filterStandort, setFilterStandort] = useState('');
  const [filterHersteller, setFilterHersteller] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  
  // View Mode
  const [viewMode, setViewMode] = useState('grid');
  
  // QR Scanner Modal
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrInput, setQrInput] = useState('');

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

  const handleQrSearch = async () => {
    if (!qrInput) return;
    try {
      const res = await apiClient.get(`/inventar/items/qr/${qrInput}`);
      navigate(`/inventar/${res.data.id}`);
    } catch {
      alert('Item nicht gefunden');
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
            Ausleihen
          </Link>
          <Link
            to="/inventar/sets"
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 hover:text-white rounded-lg"
          >
            <Layers className="w-5 h-5" />
            Item-Sets
          </Link>
          <button
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 hover:text-white rounded-lg"
          >
            <QrCode className="w-5 h-5" />
            QR-Suche
          </button>
          <Link
            to="/inventar/neu"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
          >
            <Plus className="w-5 h-5" />
            Neues Item
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
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-white">Filter</h3>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-white">
                Filter zurücksetzen
              </button>
            )}
          </div>
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
            <Link
              key={item.id}
              to={`/inventar/${item.id}`}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors group"
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
                {/* Status Badge */}
                <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${STATUS_FARBEN[item.status] || 'bg-gray-500'}`} />
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
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left p-4 text-sm text-gray-400 font-medium">Item</th>
                <th className="text-left p-4 text-sm text-gray-400 font-medium">Kategorie</th>
                <th className="text-left p-4 text-sm text-gray-400 font-medium">Hersteller</th>
                <th className="text-left p-4 text-sm text-gray-400 font-medium">Status</th>
                <th className="text-left p-4 text-sm text-gray-400 font-medium">Standort</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr
                  key={item.id}
                  onClick={() => navigate(`/inventar/${item.id}`)}
                  className="border-b border-gray-800 last:border-b-0 hover:bg-gray-800/50 cursor-pointer"
                >
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
                  <td className="p-4">
                    {item.kategorie_name && (
                      <span
                        className="px-2 py-1 text-xs rounded"
                        style={{ backgroundColor: (item.kategorie_farbe || '#6B7280') + '20', color: item.kategorie_farbe || '#6B7280' }}
                      >
                        {item.kategorie_name}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-sm text-gray-400">
                    {item.hersteller_name || '-'}
                  </td>
                  <td className="p-4">
                    <span className="flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full ${STATUS_FARBEN[item.status] || 'bg-gray-500'}`} />
                      {item.status_display || STATUS_LABELS[item.status] || item.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-400">
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

      {/* QR Search Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">QR-Code Suche</h2>
              <button onClick={() => setShowQrModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Scanne einen QR-Code oder gib den Code manuell ein
            </p>
            <input
              type="text"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQrSearch()}
              placeholder="QR-Code eingeben..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white mb-4"
              autoFocus
            />
            <button
              onClick={handleQrSearch}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
            >
              Suchen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
