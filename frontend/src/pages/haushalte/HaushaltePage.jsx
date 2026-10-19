/**
 * Haushalte - Übersicht und Verwaltung
 * Mit Live-Aktualisierung (Polling alle 5 Sekunden)
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Wallet, TrendingUp, TrendingDown, Edit, Trash2, Loader2, Eye, RefreshCw, AlertTriangle } from 'lucide-react';
import { PageHeader, Button, EmptyState } from '../../components/ui';
import CreateHaushaltModal from '../../components/CreateHaushaltModal';
import EditHaushaltModal from '../../components/EditHaushaltModal';
import ArtikelModal from '../../components/ArtikelModal';
import apiClient from '../../lib/api';

// Polling-Intervall in Millisekunden (5 Sekunden)
const POLL_INTERVAL = 5000;

// Euro-Betrag im deutschen Format (1.234,56 €)
const formatEuro = (value) => {
  const num = parseFloat(value) || 0;
  return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
};

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
        setError('Haushalte konnten nicht geladen werden.');
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
    if (!confirm('Möchtest du diesen Haushalt wirklich löschen?')) return;
    
    try {
      await apiClient.delete(`/haushalte/${haushaltId}`);
      setHaushalte(haushalte.filter(h => h.id !== haushaltId));
    } catch (err) {
      console.error('Fehler beim Löschen:', err);
      alert('Haushalt konnte nicht gelöscht werden.');
    }
  };

  const handleAddArtikel = (haushalt) => {
    setSelectedHaushalt(haushalt);
    setShowArtikelModal(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finanzen"
        title="Haushalte"
        meta={
          <span className="inline-flex items-center gap-2">
            <button
              onClick={() => setIsPolling(!isPolling)}
              className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                isPolling
                  ? 'text-ok hover:bg-raised'
                  : 'text-fg-subtle hover:bg-raised'
              }`}
              title={isPolling ? 'Live-Updates aktiv (klicken zum Pausieren)' : 'Live-Updates pausiert (klicken zum Fortsetzen)'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isPolling ? 'bg-ok animate-pulse' : 'bg-fg-disabled'}`} />
              {isPolling ? 'Live' : 'Pausiert'}
            </button>
            {lastUpdate && (
              <span className="text-xs text-fg-subtle tabular-nums">Stand {lastUpdate.toLocaleTimeString('de-DE')}</span>
            )}
          </span>
        }
        actions={<Button variant="primary" icon={Plus} onClick={() => setShowCreateModal(true)}>Neuer Haushalt</Button>}
      />

      {/* Haushalte Grid */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-fg-subtle" /></div>
      ) : error ? (
        <div className="bg-surface rounded-lg">
          <EmptyState icon={AlertTriangle} title="Haushalte konnten nicht geladen werden" description={error}
            action={<Button variant="secondary" icon={RefreshCw} onClick={fetchHaushalte}>Erneut versuchen</Button>} />
        </div>
      ) : haushalte.length === 0 ? (
        <div className="bg-surface rounded-lg">
          <EmptyState icon={Wallet} title="Noch keine Haushalte"
            description="Lege einen Haushalt mit Budget an, um Anschaffungen und Ausgaben zu erfassen."
            action={<Button variant="primary" icon={Plus} onClick={() => setShowCreateModal(true)}>Haushalt anlegen</Button>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {haushalte.map((haushalt) => {
            const budgetKonsumitiv = parseFloat(haushalt.budget_konsumitiv) || 0;
            const budgetInvestitiv = parseFloat(haushalt.budget_investiv) || 0;
            const gesamtKonsumitiv = parseFloat(haushalt.gesamt_konsumitiv) || 0;
            const gesamtInvestitiv = parseFloat(haushalt.gesamt_investiv) || 0;
            
            const gesamtBudget = budgetKonsumitiv + budgetInvestitiv;
            const gesamtAusgaben = gesamtKonsumitiv + gesamtInvestitiv;
            const verbleibendesBudget = gesamtBudget - gesamtAusgaben;
            const budgetProzent = gesamtBudget > 0 ? (gesamtAusgaben / gesamtBudget) * 100 : 0;
            const barColor = budgetProzent > 90 ? 'bg-bad' : budgetProzent > 75 ? 'bg-warn' : 'bg-ok';

            return (
              <div
                key={haushalt.id}
                className="group bg-surface rounded-lg p-5 hover:bg-raised transition-colors flex flex-col"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-5">
                  <button onClick={() => navigate(`/haushalte/${haushalt.id}`)} className="min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-sm">
                    <h3 className="font-display text-xl font-semibold tracking-tight text-fg group-hover:text-accent-fg transition-colors truncate">{haushalt.name}</h3>
                    {haushalt.beschreibung && (
                      <p className="text-sm text-fg-muted mt-0.5 line-clamp-2">{haushalt.beschreibung}</p>
                    )}
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <button 
                      onClick={() => handleEditHaushalt(haushalt)}
                      className="p-2 text-fg-subtle hover:text-fg hover:bg-hover rounded-sm transition-colors"
                      title="Bearbeiten" aria-label="Haushalt bearbeiten"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteHaushalt(haushalt.id)}
                      className="p-2 text-fg-subtle hover:text-bad hover:bg-hover rounded-sm transition-colors"
                      title="Löschen" aria-label="Haushalt löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Budget Bar */}
                <div className="mb-5">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <div>
                      <div className="text-xs text-fg-subtle">Verbleibend</div>
                      <div className={`text-2xl font-bold tabular-nums leading-tight tracking-tight ${verbleibendesBudget < 0 ? 'text-bad' : 'text-fg'}`}>
                        {formatEuro(verbleibendesBudget)}
                      </div>
                    </div>
                    <span className="text-sm tabular-nums text-fg-muted">
                      {formatEuro(gesamtAusgaben)} <span className="text-fg-subtle">/</span> {formatEuro(gesamtBudget)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-hover rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${barColor}`}
                      style={{ width: `${Math.min(budgetProzent, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Konsumtiv / Investiv */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-line-subtle mb-5">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1 text-fg-muted">
                      <TrendingDown className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-xs font-medium">Konsumtiv</span>
                    </div>
                    <p className="text-base font-semibold tabular-nums text-fg">{formatEuro(gesamtKonsumitiv)}</p>
                    <p className="text-xs tabular-nums text-fg-subtle">von {formatEuro(budgetKonsumitiv)}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1 text-fg-muted">
                      <TrendingUp className="w-3.5 h-3.5 text-ok" />
                      <span className="text-xs font-medium">Investiv</span>
                    </div>
                    <p className="text-base font-semibold tabular-nums text-fg">{formatEuro(gesamtInvestitiv)}</p>
                    <p className="text-xs tabular-nums text-fg-subtle">von {formatEuro(budgetInvestitiv)}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  <Button size="sm" variant="secondary" icon={Plus} onClick={() => handleAddArtikel(haushalt)} className="flex-1">
                    Artikel erfassen
                  </Button>
                  <Button size="sm" variant="ghost" icon={Eye} onClick={() => navigate(`/haushalte/${haushalt.id}`)} className="flex-1">
                    Details
                  </Button>
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
