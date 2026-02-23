/**
 * Veranstaltungsplaner – Übersicht als Card-Layout
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Loader2, Calendar, MapPin, User, FileDown,
  Ticket, Filter, ChevronRight, Clock, Users, X, CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../lib/api';
import { useUser } from '../../contexts/UserContext';

const STATUS_LABELS = {
  planung: 'Planung',
  bestaetigt: 'Bestätigt',
  laufend: 'Laufend',
  abgeschlossen: 'Abgeschlossen',
  abgesagt: 'Abgesagt',
};

const STATUS_CLASS = {
  planung: 'bg-gray-500/20 text-gray-400',
  bestaetigt: 'bg-blue-500/20 text-blue-400',
  laufend: 'bg-green-500/20 text-green-400',
  abgeschlossen: 'bg-slate-500/20 text-slate-400',
  abgesagt: 'bg-red-500/20 text-red-400',
};

// Aktive Stati (zukünftig/laufend)
const ACTIVE_STATUS = ['planung', 'bestaetigt', 'laufend'];
const DONE_STATUS = ['abgeschlossen', 'abgesagt'];

function formatDateShort(d) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function formatDateFull(d) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function VeranstaltungCard({ v }) {
  const navigate = useNavigate();
  const isActive = ACTIVE_STATUS.includes(v.status);
  const isSameDay = v.datum_von && v.datum_bis &&
    new Date(v.datum_von).toDateString() === new Date(v.datum_bis).toDateString();

  return (
    <button
      onClick={() => navigate(`/veranstaltung/${v.id}`)}
      className="w-full text-left bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Titel + Status */}
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
              {v.titel}
            </span>
            <span className={`shrink-0 px-2 py-0.5 text-[10px] font-medium rounded ${STATUS_CLASS[v.status] || 'bg-gray-500/20 text-gray-400'}`}>
              {STATUS_LABELS[v.status] || v.status}
            </span>
            {v.ist_zugewiesen && (
              <span className="shrink-0 px-2 py-0.5 text-[10px] font-medium rounded bg-blue-900/30 text-blue-400">
                Du
              </span>
            )}
          </div>

          {/* Datum */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              {isSameDay ? (
                <>
                  {formatDateFull(v.datum_von)}
                  {v.datum_von && (
                    <span className="text-gray-500">
                      {formatTime(v.datum_von)}{formatTime(v.datum_bis) ? `–${formatTime(v.datum_bis)}` : ''}
                    </span>
                  )}
                </>
              ) : (
                <>
                  {formatDateShort(v.datum_von)} – {formatDateShort(v.datum_bis)}
                </>
              )}
            </span>
            {v.ort && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-gray-500" />
                {v.ort}
              </span>
            )}
          </div>

          {/* Meta-Zeile */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {v.anzahl_zuweisungen ?? 0} Personen
            </span>
            {(v.anzahl_termine ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {v.anzahl_termine} Termine
              </span>
            )}
            {v.zammad_ticket_number && (
              <span className="flex items-center gap-1 text-blue-400/60">
                <Ticket className="w-3 h-3" />
                #{v.zammad_ticket_number}
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0 mt-1" />
      </div>
    </button>
  );
}

function SectionGroup({ title, items }) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full py-2 text-left mb-2"
      >
        <span className="font-semibold text-gray-300 text-sm uppercase tracking-wide">{title}</span>
        <span className="text-xs text-gray-600">({items.length})</span>
        <ChevronRight className={`w-4 h-4 text-gray-500 ml-auto transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((v) => <VeranstaltungCard key={v.id} v={v} />)}
        </div>
      )}
    </div>
  );
}

export default function VeranstaltungenPage() {
  const { hasPermission } = useUser();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suche, setSuche] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [nurMeine, setNurMeine] = useState(false);
  const [showZammad, setShowZammad] = useState(false);
  const [zammadTickets, setZammadTickets] = useState([]);
  const [zammadLoading, setZammadLoading] = useState(false);
  const [creatingFromTicket, setCreatingFromTicket] = useState(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (nurMeine) params.append('nur_meine', 'true');
      if (suche.trim()) params.append('suche', suche.trim());
      const res = await apiClient.get(`/veranstaltung?${params}`);
      setList(res.data);
    } catch (err) {
      console.error('Fehler:', err);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, nurMeine, suche]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const loadZammadTickets = async () => {
    setShowZammad(true);
    setZammadLoading(true);
    try {
      const res = await apiClient.get('/veranstaltung/zammad/tickets?per_page=30');
      setZammadTickets(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Zammad:', err);
      setZammadTickets([]);
    } finally {
      setZammadLoading(false);
    }
  };

  const createFromTicket = async (ticketId) => {
    setCreatingFromTicket(ticketId);
    try {
      const res = await apiClient.post('/veranstaltung/aus-zammad', null, {
        params: { ticket_id: ticketId },
      });
      setShowZammad(false);
      window.location.href = `/veranstaltung/${res.data.id}`;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Fehler beim Erstellen');
    } finally {
      setCreatingFromTicket(null);
    }
  };

  const exportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (nurMeine) params.append('nur_meine', 'true');
      const res = await apiClient.get(`/veranstaltung/export/csv?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'veranstaltungen.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Export fehlgeschlagen');
    }
  };

  // Kategorisierung
  const filtered = list.filter((v) => {
    if (filterStatus && v.status !== filterStatus) return false;
    if (nurMeine && !v.ist_zugewiesen) return false;
    if (suche.trim()) {
      const q = suche.toLowerCase();
      return v.titel?.toLowerCase().includes(q) || v.ort?.toLowerCase().includes(q);
    }
    return true;
  });

  const aktive = filtered.filter((v) => ACTIVE_STATUS.includes(v.status));
  const abgeschlossene = filtered.filter((v) => DONE_STATUS.includes(v.status));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Veranstaltungen</h1>
          <p className="text-gray-400 text-sm mt-0.5">{list.length} Veranstaltungen gesamt</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPermission('veranstaltung.create') && (
            <Link
              to="/veranstaltung/neu"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Neue Veranstaltung
            </Link>
          )}
          <button
            type="button"
            onClick={loadZammadTickets}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
          >
            <Ticket className="w-4 h-4" />
            Aus Ticket
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
          >
            <FileDown className="w-4 h-4" />
            CSV
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Suchen…"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
        >
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-gray-400 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={nurMeine}
            onChange={(e) => setNurMeine(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800 text-blue-600"
          />
          Nur meine
        </label>
        {(suche || filterStatus || nurMeine) && (
          <button
            onClick={() => { setSuche(''); setFilterStatus(''); setNurMeine(false); }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-white px-2 py-1 rounded hover:bg-gray-800"
          >
            <X className="w-3 h-3" /> Filter zurücksetzen
          </button>
        )}
      </div>

      {/* Inhalt */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">
            {suche || filterStatus || nurMeine ? 'Keine Veranstaltungen gefunden' : 'Noch keine Veranstaltungen'}
          </p>
          {hasPermission('veranstaltung.create') && !suche && !filterStatus && !nurMeine && (
            <Link to="/veranstaltung/neu" className="text-blue-400 hover:underline mt-2 inline-block text-sm">
              Erste Veranstaltung anlegen
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <SectionGroup title="Aktive Veranstaltungen" items={aktive} />
          <SectionGroup title="Abgeschlossene & Abgesagte" items={abgeschlossene} />
        </div>
      )}

      {/* Zammad-Modal */}
      {showZammad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Aus Zammad-Ticket erstellen</h2>
              <button type="button" onClick={() => setShowZammad(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {zammadLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
              ) : zammadTickets.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Keine Tickets gefunden oder Zammad nicht konfiguriert.</p>
              ) : (
                <ul className="space-y-2">
                  {zammadTickets.map((t) => (
                    <li key={t.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div>
                        <span className="text-white font-medium">#{t.number ?? t.id} – {t.title || '(ohne Titel)'}</span>
                        {t.created_at && (
                          <p className="text-sm text-gray-500 mt-0.5">{new Date(t.created_at).toLocaleDateString('de-DE')}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => createFromTicket(t.id)}
                        disabled={creatingFromTicket === t.id}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm"
                      >
                        {creatingFromTicket === t.id ? '…' : 'Erstellen'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
