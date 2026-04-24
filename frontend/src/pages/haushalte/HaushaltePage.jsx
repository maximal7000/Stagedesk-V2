/**
 * Haushalte - Übersicht und Verwaltung
 * Mit Live-Aktualisierung (Polling alle 5 Sekunden)
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Wallet, TrendingUp, TrendingDown, Edit, Trash2, Loader2, Eye, RefreshCw } from 'lucide-react';
import CreateHaushaltModal from '../../components/CreateHaushaltModal';
import EditHaushaltModal from '../../components/EditHaushaltModal';
import ArtikelModal from '../../components/ArtikelModal';
import apiClient from '../../lib/api';

// Polling-Intervall in Millisekunden (5 Sekunden)
const POLL_INTERVAL = 5000;

export default function HaushaltePage() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArtikelModal, setShowArtikelModal] = useState(false);
  const [selectedHaushalt, setSelectedHaushalt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isPolling, setIsPolling] = useState(true);
  const pollIntervalRef = useRef(null);

  // State für Haushalte
  const [haushalte, setHaushalte] = useState([]);

  // Haushalte beim Laden abrufen + Live-Polling starten
  useEffect(() => {
    fetchHaushalte();
    
    // Polling starten
    if (isPolling) {
      pollIntervalRef.current = setInterval(() => {
        fetchHaushalte(true); // silent = true
      }, POLL_INTERVAL);
    }
    
    // Cleanup bei Unmount
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isPolling]);

  const fetchHaushalte = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const response = await apiClient.get('/haushalte/');
      setHaushalte(response.data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Fehler beim Laden der Haushalte:', err);
      if (!silent) {
        setError('Kassen konnten nicht geladen werden.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const handleEditHaushalt = (haushalt) => {
    setSelectedHaushalt(haushalt);
    setShowEditModal(true);
  };

  const handleDeleteHaushalt = async (haushaltId) => {
    if (!confirm('Möchtest du diese Kasse wirklich löschen?')) return;
    
    try {
      await apiClient.delete(`/haushalte/${haushaltId}`);
      setHaushalte(haushalte.filter(h => h.id !== haushaltId));
    } catch (err) {
      console.error('Fehler beim Löschen:', err);
      alert('Kasse konnte nicht gelöscht werden.');
    }
  };

  const handleAddArtikel = (haushalt) => {
    setSelectedHaushalt(haushalt);
    setShowArtikelModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Kassenbuch</h1>
          <div className="flex items-center gap-3">
            <p className="text-gray-400">Ausgaben der Technik-AG verwalten</p>
            {/* Live-Update Status */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPolling(!isPolling)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                  isPolling 
                    ? 'bg-green-900/50 text-green-400 hover:bg-green-900/70' 
                    : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                }`}
                title={isPolling ? 'Live-Updates aktiv (klicken zum Deaktivieren)' : 'Live-Updates pausiert (klicken zum Aktivieren)'}
              >
                <RefreshCw className={`w-3 h-3 ${isPolling ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
                {isPolling ? 'Live' : 'Pausiert'}
              </button>
              {lastUpdate && (
                <span className="text-xs text-gray-600">
                  {lastUpdate.toLocaleTimeString('de-DE')}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Neue Kasse
        </button>
      </div>

      {/* Haushalte Grid */}
      {loading ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
          <p className="text-gray-400">Kassen werden geladen...</p>
        </div>
      ) : error ? (
        <div className="bg-gray-900 border border-red-800 rounded-xl p-12 text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchHaushalte}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
          >
            Erneut versuchen
          </button>
        </div>
      ) : haushalte.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Wallet className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Noch keine Kassen</h3>
          <p className="text-gray-400 mb-6">Erstelle deine erste Kasse, um loszulegen!</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Erste Kasse erstellen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {haushalte.map((haushalt) => {
            const budgetKonsumitiv = parseFloat(haushalt.budget_konsumitiv) || 0;
            const budgetInvestitiv = parseFloat(haushalt.budget_investiv) || 0;
            const gesamtKonsumitiv = parseFloat(haushalt.gesamt_konsumitiv) || 0;
            const gesamtInvestitiv = parseFloat(haushalt.gesamt_investiv) || 0;
            
            const gesamtBudget = budgetKonsumitiv + budgetInvestitiv;
            const gesamtAusgaben = gesamtKonsumitiv + gesamtInvestitiv;
            const verbleibendesBudget = gesamtBudget - gesamtAusgaben;
            const budgetProzent = gesamtBudget > 0 ? (gesamtAusgaben / gesamtBudget) * 100 : 0;

            return (
              <div
                key={haushalt.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">{haushalt.name}</h3>
                    <p className="text-sm text-gray-400">{haushalt.beschreibung}</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleEditHaushalt(haushalt)}
                      className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteHaushalt(haushalt.id)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Budget Bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-400">Gesamt Budget</span>
                    <span className="text-white font-semibold">
                      € {gesamtAusgaben.toFixed(2)} / € {gesamtBudget.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        budgetProzent > 90 ? 'bg-red-500' : budgetProzent > 75 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(budgetProzent, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Verbleibend: € {verbleibendesBudget.toFixed(2)}
                  </p>
                </div>

                {/* Konsumitiv / Investiv */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="w-4 h-4 text-orange-400" />
                      <span className="text-xs text-gray-400">Konsumitiv</span>
                    </div>
                    <p className="text-lg font-bold text-white">€ {gesamtKonsumitiv.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">von € {budgetKonsumitiv.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-gray-400">Investitiv</span>
                    </div>
                    <p className="text-lg font-bold text-white">€ {gesamtInvestitiv.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">von € {budgetInvestitiv.toFixed(2)}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleAddArtikel(haushalt)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Artikel hinzufügen
                  </button>
                  <button
                    onClick={() => navigate(`/haushalte/${haushalt.id}`)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Details anzeigen
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateHaushaltModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(newHaushalt) => {
            // Haushalt aus Backend-Antwort hinzufügen
            setHaushalte([...haushalte, newHaushalt]);
            setShowCreateModal(false);
          }}
        />
      )}

      {showEditModal && selectedHaushalt && (
        <EditHaushaltModal
          haushalt={selectedHaushalt}
          onClose={() => {
            setShowEditModal(false);
            setSelectedHaushalt(null);
          }}
          onUpdated={(updatedHaushalt) => {
            // Haushalt in der Liste aktualisieren
            setHaushalte(haushalte.map(h => 
              h.id === updatedHaushalt.id ? updatedHaushalt : h
            ));
            setShowEditModal(false);
            setSelectedHaushalt(null);
          }}
        />
      )}

      {showArtikelModal && selectedHaushalt && (
        <ArtikelModal
          haushalt={selectedHaushalt}
          onClose={() => {
            setShowArtikelModal(false);
            setSelectedHaushalt(null);
          }}
          onCreated={(artikel) => {
            // Haushalte neu laden um Ausgaben zu aktualisieren
            fetchHaushalte();
            setShowArtikelModal(false);
            setSelectedHaushalt(null);
          }}
        />
      )}
    </div>
  );
}
