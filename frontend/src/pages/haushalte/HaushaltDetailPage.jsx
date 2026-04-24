/**
 * Haushalt Detail - Zeigt alle Artikel eines Haushalts
 * Mit Live-Aktualisierung und Inline-Editing
 */
import { useState, useEffect, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Wallet, TrendingUp, TrendingDown, 
  Trash2, Edit, ExternalLink, Loader2, Package, RefreshCw,
  Wand2, Save, X, LayoutGrid, List, Columns
} from 'lucide-react';
import apiClient from '../../lib/api';
import EditHaushaltModal from '../../components/EditHaushaltModal';

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
  
  // Neue Zeile
  const [newRow, setNewRow] = useState(null);

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
        <p className="text-red-400 mb-4">{error || 'Kasse nicht gefunden'}</p>
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

  // Tabellen-Zeile Komponente (nicht im Editing-Modus)
  const ArtikelRow = ({ item, kategorie }) => {
    const isEditing = editingId === item.id;
    
    if (isEditing) {
      return (
        <EditingRow
          item={item}
          onSave={handleSaveEditing}
          onCancel={cancelEditing}
          onParse={handleParseLink}
          parsingId={parsingId}
          savingId={savingId}
        />
      );
    }
    
    return (
      <tr className="border-b border-gray-800 hover:bg-gray-800/30 group">
        <td className="p-3">
          <span 
            className="text-white cursor-pointer hover:text-blue-400"
            onClick={() => startEditing(item)}
          >
            {item.name}
          </span>
        </td>
        <td className="p-3">
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-sm"
            >
              <ExternalLink className="w-3 h-3" />
              Link
            </a>
          ) : (
            <span className="text-gray-600 text-sm">—</span>
          )}
        </td>
        <td className="p-3 text-right text-gray-300 cursor-pointer hover:text-blue-400" onClick={() => startEditing(item)}>
          {formatPreis(item.preis)}
        </td>
        <td className="p-3 text-center text-gray-300 cursor-pointer hover:text-blue-400" onClick={() => startEditing(item)}>
          {item.anzahl}
        </td>
        <td className="p-3 text-right text-white font-medium">
          {formatPreis(item.gesamtpreis)}
        </td>
        <td className="p-3">
          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => startEditing(item)}
              className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDeleteArtikel(item.id)}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
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
  const ArtikelTabelle = ({ items, kategorie, color, icon: Icon, budget, ausgaben }) => (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className={`p-4 border-b border-gray-800 ${color === 'orange' ? 'bg-orange-950/20' : 'bg-green-950/20'}`}>
        <div className="flex items-center justify-between">
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
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="p-3 w-[30%]">Name</th>
              <th className="p-3 w-[20%]">Link</th>
              <th className="p-3 w-[12%] text-right">Preis</th>
              <th className="p-3 w-[8%] text-center">Anz.</th>
              <th className="p-3 w-[14%] text-right">Gesamt</th>
              <th className="p-3 w-[16%]"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ArtikelRow key={item.id} item={item} kategorie={kategorie} />
            ))}
            <NewRow kategorie={kategorie} />
          </tbody>
        </table>
      </div>
      
      {(!newRow || newRow.kategorie !== kategorie) && (
        <button
          onClick={() => addNewRow(kategorie)}
          className={`w-full p-3 ${color === 'orange' ? 'text-orange-400 hover:bg-orange-950/20' : 'text-green-400 hover:bg-green-950/20'} flex items-center justify-center gap-2 transition-colors border-t border-gray-800`}
        >
          <Plus className="w-4 h-4" />
          Neuen Artikel hinzufügen
        </button>
      )}
    </div>
  );

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
              items={artikelKonsumitiv}
              kategorie="konsumitiv"
              color="orange"
              icon={TrendingDown}
              budget={budgetKonsumitiv}
              ausgaben={gesamtKonsumitiv}
            />
          )}
          {activeTab === 'investiv' && (
            <ArtikelTabelle
              items={artikelInvestitiv}
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
            items={artikelKonsumitiv}
            kategorie="konsumitiv"
            color="orange"
            icon={TrendingDown}
            budget={budgetKonsumitiv}
            ausgaben={gesamtKonsumitiv}
          />
          <ArtikelTabelle
            items={artikelInvestitiv}
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
            items={artikelKonsumitiv}
            kategorie="konsumitiv"
            color="orange"
            icon={TrendingDown}
            budget={budgetKonsumitiv}
            ausgaben={gesamtKonsumitiv}
          />
          <ArtikelTabelle
            items={artikelInvestitiv}
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
    </div>
  );
}
