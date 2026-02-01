import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Wallet, TrendingUp, TrendingDown, Trash2, Edit, ExternalLink, Loader2, RefreshCw, Wand2, Save, X } from 'lucide-react';
import apiClient from '../lib/api';
import EditHaushaltModal from '../components/EditHaushaltModal';
import ArtikelModal from '../components/ArtikelModal';

const POLL_INTERVAL = 5000;
const formatPreis = (v) => parseFloat(v || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' EUR';

export default function HaushaltDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [haushalt, setHaushalt] = useState(null);
  const [artikel, setArtikel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArtikelModal, setShowArtikelModal] = useState(false);
  const [isPolling, setIsPolling] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editingData, setEditingData] = useState({});
  const [savingId, setSavingId] = useState(null);
  const pollRef = useRef(null);

  const fetchData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [hRes, aRes] = await Promise.all([
        apiClient.get('/haushalte/' + id),
        apiClient.get('/haushalte/' + id + '/artikel'),
      ]);
      setHaushalt(hRes.data);
      setArtikel(aRes.data);
      setError(null);
    } catch (err) {
      if (!silent) setError('Fehler beim Laden');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  useEffect(() => {
    if (isPolling && !editingId) {
      pollRef.current = setInterval(() => fetchData(true), POLL_INTERVAL);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id, isPolling, editingId]);

  const startEditing = (a) => {
    setEditingId(a.id);
    setEditingData({ name: a.name, preis: a.preis, anzahl: a.anzahl, link: a.link || '' });
  };

  const saveEditing = async () => {
    if (!editingId) return;
    setSavingId(editingId);
    try {
      await apiClient.put('/haushalte/' + id + '/artikel/' + editingId, {
        name: editingData.name,
        preis: parseFloat(editingData.preis) || 0,
        anzahl: parseInt(editingData.anzahl) || 1,
        link: editingData.link || '',
        beschreibung: '',
      });
      setEditingId(null);
      fetchData();
    } catch (err) {
      alert('Fehler beim Speichern');
    } finally {
      setSavingId(null);
    }
  };

  const cancelEditing = () => { setEditingId(null); setEditingData({}); };

  const handleDelete = async (artikelId) => {
    if (!confirm('Artikel loeschen?')) return;
    try {
      await apiClient.delete('/haushalte/' + id + '/artikel/' + artikelId);
      fetchData();
    } catch (err) {
      alert('Fehler');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEditing(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-12 h-12 text-blue-500 animate-spin" /></div>;
  if (error || !haushalt) return (
    <div className="bg-gray-900 border border-red-800 rounded-xl p-12 text-center">
      <p className="text-red-400 mb-4">{error || 'Nicht gefunden'}</p>
      <button onClick={() => navigate('/haushalte')} className="px-4 py-2 bg-gray-800 text-white rounded-lg">Zurueck</button>
    </div>
  );

  const budgetK = parseFloat(haushalt.budget_konsumitiv) || 0;
  const budgetI = parseFloat(haushalt.budget_investiv) || 0;
  const gesamtK = parseFloat(haushalt.gesamt_konsumitiv) || 0;
  const gesamtI = parseFloat(haushalt.gesamt_investiv) || 0;
  const artikelK = artikel.filter(a => a.kategorie === 'konsumitiv');
  const artikelI = artikel.filter(a => a.kategorie === 'investiv');

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
            {formatPreis(ausgaben)} <span className="text-gray-500 text-sm">/ {formatPreis(budget)}</span>
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase">
              <th className="p-3">Name</th><th className="p-3">Link</th><th className="p-3 text-right">Preis</th>
              <th className="p-3 text-center">Anz.</th><th className="p-3 text-right">Gesamt</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => editingId === a.id ? (
              <tr key={a.id} className="bg-blue-950/20 border-b border-gray-800">
                <td className="p-2"><input type="text" value={editingData.name} onChange={(e) => setEditingData({ ...editingData, name: e.target.value })} onKeyDown={handleKeyDown} className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm" /></td>
                <td className="p-2"><input type="text" value={editingData.link} onChange={(e) => setEditingData({ ...editingData, link: e.target.value })} onKeyDown={handleKeyDown} placeholder="https://..." className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm" /></td>
                <td className="p-2"><input type="number" value={editingData.preis} onChange={(e) => setEditingData({ ...editingData, preis: e.target.value })} onKeyDown={handleKeyDown} step="0.01" className="w-20 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm text-right" /></td>
                <td className="p-2"><input type="number" value={editingData.anzahl} onChange={(e) => setEditingData({ ...editingData, anzahl: e.target.value })} onKeyDown={handleKeyDown} min="1" className="w-16 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm text-center" /></td>
                <td className="p-2 text-right text-white">{formatPreis((parseFloat(editingData.preis) || 0) * (parseInt(editingData.anzahl) || 1))}</td>
                <td className="p-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={saveEditing} disabled={savingId === a.id} className="p-1.5 bg-green-600 text-white rounded">{savingId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}</button>
                    <button onClick={cancelEditing} className="p-1.5 bg-gray-700 text-white rounded"><X className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={a.id} className="border-b border-gray-800 hover:bg-gray-800/30 group">
                <td className="p-3 text-white cursor-pointer hover:text-blue-400" onClick={() => startEditing(a)}>{a.name}</td>
                <td className="p-3">{a.link ? <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-sm"><ExternalLink className="w-3 h-3" />Link</a> : <span className="text-gray-600">-</span>}</td>
                <td className="p-3 text-right text-gray-300 cursor-pointer hover:text-blue-400" onClick={() => startEditing(a)}>{formatPreis(a.preis)}</td>
                <td className="p-3 text-center text-gray-300">{a.anzahl}</td>
                <td className="p-3 text-right text-white font-medium">{formatPreis(a.gesamtpreis)}</td>
                <td className="p-3">
                  <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100">
                    <button onClick={() => startEditing(a)} className="p-1.5 text-gray-400 hover:text-blue-400 rounded"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(a.id)} className="p-1.5 text-gray-400 hover:text-red-400 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => setShowArtikelModal(true)} className={`w-full p-3 ${color === 'orange' ? 'text-orange-400 hover:bg-orange-950/20' : 'text-green-400 hover:bg-green-950/20'} flex items-center justify-center gap-2 border-t border-gray-800`}>
        <Plus className="w-4 h-4" />Neuer Artikel
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/haushalte')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{haushalt.name}</h1>
          {haushalt.beschreibung && <p className="text-gray-400">{haushalt.beschreibung}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsPolling(!isPolling)} className={`p-2 rounded-lg flex items-center gap-1 text-xs ${isPolling ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
            <RefreshCw className={`w-3 h-3 ${isPolling ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />{isPolling ? 'Live' : 'Pause'}
          </button>
          <button onClick={() => setShowEditModal(true)} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg"><Edit className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ArtikelTabelle items={artikelK} kategorie="konsumitiv" color="orange" icon={TrendingDown} budget={budgetK} ausgaben={gesamtK} />
        <ArtikelTabelle items={artikelI} kategorie="investiv" color="green" icon={TrendingUp} budget={budgetI} ausgaben={gesamtI} />
      </div>

      <EditHaushaltModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} haushalt={haushalt} onUpdated={() => fetchData()} />
      <ArtikelModal isOpen={showArtikelModal} onClose={() => setShowArtikelModal(false)} haushaltId={id} onCreated={() => fetchData()} />
    </div>
  );
}
