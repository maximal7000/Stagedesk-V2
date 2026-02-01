import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Wallet, Eye, Edit, Trash2, Loader2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import apiClient from '../lib/api';
import CreateHaushaltModal from '../components/CreateHaushaltModal';
import EditHaushaltModal from '../components/EditHaushaltModal';

const POLL_INTERVAL = 5000;

export default function HaushaltePage() {
  const navigate = useNavigate();
  const [haushalte, setHaushalte] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingHaushalt, setEditingHaushalt] = useState(null);
  const [isPolling, setIsPolling] = useState(true);
  const pollRef = useRef(null);

  const fetchHaushalte = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await apiClient.get('/haushalte/');
      setHaushalte(response.data);
      setError(null);
    } catch (err) {
      if (!silent) setError('Fehler beim Laden');
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchHaushalte();
  }, []);

  useEffect(() => {
    if (isPolling) {
      pollRef.current = setInterval(() => fetchHaushalte(true), POLL_INTERVAL);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isPolling]);

  const handleDelete = async (id) => {
    if (!confirm('Haushalt wirklich loeschen?')) return;
    try {
      await apiClient.delete('/haushalte/' + id);
      fetchHaushalte();
    } catch (err) {
      alert('Fehler beim Loeschen');
    }
  };

  const handleEdit = (h) => {
    setEditingHaushalt(h);
    setShowEditModal(true);
  };

  const formatPreis = (v) => parseFloat(v || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' EUR';

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-12 h-12 text-blue-500 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Haushalte</h1>
          <p className="text-gray-400 mt-1">Verwalte deine Budgets</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsPolling(!isPolling)}
            className={`p-2 rounded-lg flex items-center gap-1 text-xs ${isPolling ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
            <RefreshCw className={`w-3 h-3 ${isPolling ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
            {isPolling ? 'Live' : 'Pause'}
          </button>
          <button onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">
            <Plus className="w-5 h-5" />Neuer Haushalt
          </button>
        </div>
      </div>

      {error && <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-400">{error}</div>}

      {haushalte.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Wallet className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Keine Haushalte</h3>
          <p className="text-gray-400 mb-6">Erstelle deinen ersten Haushalt</p>
          <button onClick={() => setShowCreateModal(true)} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl">
            <Plus className="w-5 h-5 inline mr-2" />Neuer Haushalt
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {haushalte.map((h) => {
            const budgetK = parseFloat(h.budget_konsumitiv) || 0;
            const budgetI = parseFloat(h.budget_investiv) || 0;
            const gesamtK = parseFloat(h.gesamt_konsumitiv) || 0;
            const gesamtI = parseFloat(h.gesamt_investiv) || 0;
            return (
              <div key={h.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{h.name}</h3>
                    {h.beschreibung && <p className="text-sm text-gray-400 mt-1">{h.beschreibung}</p>}
                  </div>
                  <Wallet className="w-8 h-8 text-blue-400" />
                </div>
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-orange-400 flex items-center gap-1"><TrendingDown className="w-4 h-4" />Konsumitiv</span>
                    <span className="text-gray-300">{formatPreis(gesamtK)} / {formatPreis(budgetK)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-green-400 flex items-center gap-1"><TrendingUp className="w-4 h-4" />Investitiv</span>
                    <span className="text-gray-300">{formatPreis(gesamtI)} / {formatPreis(budgetI)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => navigate('/haushalte/' + h.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                    <Eye className="w-4 h-4" />Details
                  </button>
                  <button onClick={() => handleEdit(h)} className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(h.id)} className="p-2 bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-400 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateHaushaltModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onCreated={() => fetchHaushalte()} />
      <EditHaushaltModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} haushalt={editingHaushalt} onUpdated={() => fetchHaushalte()} />
    </div>
  );
}
