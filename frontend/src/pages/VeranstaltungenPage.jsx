/**
 * Veranstaltungsplaner – Liste mit Filter, Zammad-Anbindung, Export
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Loader2,
  Calendar,
  MapPin,
  User,
  FileDown,
  Ticket,
  Filter,
  ChevronRight,
} from 'lucide-react';
import apiClient from '../lib/api';

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

function formatDatum(d) {
  if (!d) return '–';
  const dt = new Date(d);
  return dt.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function VeranstaltungenPage() {
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

  useEffect(() => {
    fetchList();
  }, [fetchList]);

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
      setList((prev) => [res.data, ...prev]);
      window.location.href = `/veranstaltung/${res.data.id}`;
    } catch (err) {
      console.error('Erstellen aus Ticket:', err);
      alert(err.response?.data?.error || 'Fehler beim Erstellen');
    } finally {
      setCreatingFromTicket(null);
    }
  };

  const exportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (nurMeine) params.append('nur_meine', 'true');
      const res = await apiClient.get(`/veranstaltung/export/csv?${params}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'veranstaltungen.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export:', err);
      alert('Export fehlgeschlagen');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Veranstaltungen</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/veranstaltung/neu"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Neue Veranstaltung
          </Link>
          <button
            type="button"
            onClick={loadZammadTickets}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <Ticket className="w-4 h-4" />
            Aus Zammad-Ticket
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <FileDown className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Suchen (Titel, Ort…)"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 w-full max-w-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
          >
            <option value="">Alle Status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={nurMeine}
            onChange={(e) => setNurMeine(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800 text-blue-600"
          />
          Nur meine
        </label>
      </div>

      {/* Tabelle */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <p>Keine Veranstaltungen gefunden.</p>
            <Link to="/veranstaltung/neu" className="text-blue-400 hover:underline mt-2 inline-block">
              Erste Veranstaltung anlegen
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 text-left text-sm text-gray-400">
                  <th className="p-4 font-medium">Titel</th>
                  <th className="p-4 font-medium">Von</th>
                  <th className="p-4 font-medium">Bis</th>
                  <th className="p-4 font-medium">Ort</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Zammad</th>
                  <th className="p-4 font-medium">Zuweisungen</th>
                  <th className="p-4 w-10" />
                </tr>
              </thead>
              <tbody>
                {list.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-gray-800/80 hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="p-4">
                      <span className="font-medium text-white">{v.titel}</span>
                    </td>
                    <td className="p-4 text-gray-300">{formatDatum(v.datum_von)}</td>
                    <td className="p-4 text-gray-300">{formatDatum(v.datum_bis)}</td>
                    <td className="p-4 text-gray-300 flex items-center gap-1">
                      {v.ort ? <MapPin className="w-4 h-4 text-gray-500" /> : null}
                      {v.ort || '–'}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                          STATUS_CLASS[v.status] || 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {v.status_display || STATUS_LABELS[v.status] || v.status}
                      </span>
                    </td>
                    <td className="p-4 text-gray-400 text-sm">
                      {v.zammad_ticket_number ? `#${v.zammad_ticket_number}` : '–'}
                    </td>
                    <td className="p-4">
                      <span className="flex items-center gap-1 text-gray-400">
                        <User className="w-4 h-4" />
                        {v.anzahl_zuweisungen ?? 0}
                        {v.ist_zugewiesen && (
                          <span className="text-blue-400 text-xs">(dich)</span>
                        )}
                      </span>
                    </td>
                    <td className="p-4">
                      <Link
                        to={`/veranstaltung/${v.id}`}
                        className="text-blue-400 hover:text-blue-300 inline-flex items-center"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Zammad-Ticket-Modal */}
      {showZammad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Aus Zammad-Ticket erstellen</h2>
              <button
                type="button"
                onClick={() => setShowZammad(false)}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {zammadLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : zammadTickets.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  Keine Tickets gefunden oder Zammad nicht konfiguriert.
                </p>
              ) : (
                <ul className="space-y-2">
                  {zammadTickets.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
                    >
                      <div>
                        <span className="text-white font-medium">
                          #{t.number ?? t.id} – {t.title || '(ohne Titel)'}
                        </span>
                        {t.created_at && (
                          <p className="text-sm text-gray-500 mt-0.5">
                            {new Date(t.created_at).toLocaleDateString('de-DE')}
                          </p>
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
