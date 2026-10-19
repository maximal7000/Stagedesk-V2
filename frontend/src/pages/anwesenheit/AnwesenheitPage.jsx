/**
 * Anwesenheits-Modul: Listen-Übersicht + Detail-Ansicht mit Termin-Tracking
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Plus, Search, ArrowLeft, Loader2, X, Check,
  ChevronRight, MapPin, Calendar,
  Users, UserPlus, CalendarPlus, Download,
  Copy, CheckCircle, Clock, Trash2, BarChart3,
  AlertTriangle, MessageSquare, ClipboardList, FileSpreadsheet, FileJson,
} from 'lucide-react';
import apiClient from '../../lib/api';
import { useUser } from '../../contexts/UserContext';
import { PageHeader, Button, StatusBadge, EmptyState } from '../../components/ui';

// ─── Status-Farben ────────────────────────────────────────────────

const STATUS_COLORS = {
  anwesend: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', dot: 'bg-emerald-500' },
  teilweise: { bg: 'bg-sky-500/15', text: 'text-sky-300', dot: 'bg-sky-500' },
  abwesend: { bg: 'bg-red-500/15', text: 'text-red-300', dot: 'bg-red-500' },
  krank: { bg: 'bg-amber-500/15', text: 'text-amber-300', dot: 'bg-amber-500' },
  ausstehend: { bg: 'bg-gray-500/20', text: 'text-gray-400', dot: 'bg-gray-500' },
};

const STATUS_LABELS = {
  anwesend: 'Anwesend',
  teilweise: 'Teilweise',
  abwesend: 'Abwesend',
  krank: 'Krank',
  ausstehend: 'Ausstehend',
};

// Anwesenheits-Status → StatusBadge-Ton (Farbbedeutung bleibt erhalten:
// anwesend=grün, teilweise=blau, abwesend=rot, krank=gelb, ausstehend=grau)
const STATUS_TONE = {
  anwesend: 'positive',
  teilweise: 'info',
  abwesend: 'danger',
  krank: 'warning',
  ausstehend: 'neutral',
};

// ─── Hilfs-Komponenten ────────────────────────────────────────────

function SectionHeader({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="group flex items-center gap-2 w-full py-2 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="font-semibold text-gray-300 group-hover:text-white text-sm">{title}</span>
        <span className="text-xs text-gray-500 tabular-nums">{count}</span>
        <span className="flex-1 h-px bg-gray-800 ml-2" aria-hidden="true" />
      </button>
      {open && <div className="space-y-2 pt-1 pb-4">{children}</div>}
    </div>
  );
}

function ProgressBar({ statistik }) {
  if (!statistik || statistik.gesamt === 0) return null;
  const { anwesend, teilweise = 0, abwesend, krank, ausstehend, gesamt } = statistik;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
        {anwesend > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${(anwesend / gesamt) * 100}%` }} />}
        {teilweise > 0 && <div className="bg-sky-500 h-full" style={{ width: `${(teilweise / gesamt) * 100}%` }} />}
        {abwesend > 0 && <div className="bg-red-500 h-full" style={{ width: `${(abwesend / gesamt) * 100}%` }} />}
        {krank > 0 && <div className="bg-amber-500 h-full" style={{ width: `${(krank / gesamt) * 100}%` }} />}
        {ausstehend > 0 && <div className="bg-gray-600 h-full" style={{ width: `${(ausstehend / gesamt) * 100}%` }} />}
      </div>
      <span className="text-xs font-medium text-gray-300 whitespace-nowrap tabular-nums w-9 text-right">{statistik.quote}%</span>
    </div>
  );
}

function StatusSelect({ value, onChange, compact = false }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`${compact ? 'text-xs px-1.5 py-1' : 'text-sm px-2 py-1.5'} rounded-lg border border-gray-700 bg-gray-800 font-medium cursor-pointer focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent ${STATUS_COLORS[value]?.text || 'text-gray-400'}`}>
      {Object.entries(STATUS_LABELS).map(([k, v]) => (
        <option key={k} value={k}>{compact ? v.charAt(0) : v}</option>
      ))}
    </select>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────

export default function AnwesenheitPage() {
  const navigate = useNavigate();
  const { id: listId } = useParams();
  const { hasPermission, profile } = useUser();

  const [listen, setListen] = useState([]);
  const [detailListe, setDetailListe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTermineModal, setShowTermineModal] = useState(false);
  const [showTeilnehmerModal, setShowTeilnehmerModal] = useState(false);
  const [showKlonModal, setShowKlonModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);

  // Create/Edit
  const [createForm, setCreateForm] = useState({ titel: '', beschreibung: '', ort: '' });
  const [editingListe, setEditingListe] = useState(null);
  const [saving, setSaving] = useState(false);

  // Termine
  const [termineForm, setTermineForm] = useState([]);

  // Teilnehmer
  const [verfuegbareBenutzer, setVerfuegbareBenutzer] = useState([]);
  const [selectedBenutzer, setSelectedBenutzer] = useState([]);
  const [benutzerSearch, setBenutzerSearch] = useState('');

  // Klon
  const [klonForm, setKlonForm] = useState({ titel: '', termine_uebernehmen: true });

  // Statistik
  const [stats, setStats] = useState(null);

  // Aktiver Termin-Tab
  const [activeTerminId, setActiveTerminId] = useState(null);

  // Detail-Filter
  const [teilnehmerSearch, setTeilnehmerSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Batch-Operations
  const [selectedTeilnehmer, setSelectedTeilnehmer] = useState(new Set());

  // Notizen-Modal
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [noteForm, setNoteForm] = useState({ status: '', notizen: '' });

  // ═══ Daten laden ═══

  // Hilfsfunktion für Fehlerbehandlung
  const handleApiError = (err, fallbackMsg) => {
    if (err?.response?.status === 403) {
      toast.error('Keine Berechtigung für diese Aktion');
    } else {
      toast.error(fallbackMsg);
    }
  };

  const fetchListen = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/anwesenheit');
      setListen(res.data);
    } catch (err) {
      if (err?.response?.status === 403) {
        toast.error('Keine Berechtigung für Anwesenheitslisten');
      } else {
        console.error('Fehler:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async () => {
    if (!listId) return;
    try {
      const res = await apiClient.get(`/anwesenheit/${listId}`);
      setDetailListe(res.data);
    } catch (err) {
      console.error('Fehler:', err);
      setDetailListe(null);
    }
  }, [listId]);

  useEffect(() => {
    if (listId) {
      setLoading(true);
      fetchDetail().finally(() => setLoading(false));
    } else {
      fetchListen();
    }
  }, [listId, fetchDetail, fetchListen]);

  // Live-Updates über WebSocket: bei jedem Update vom Server lädt der Client
  // die ganze Liste neu (idempotent, einfach). Reconnect mit Backoff.
  useEffect(() => {
    if (!listId) return;
    let ws = null;
    let closed = false;
    let backoff = 1000;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws/anwesenheit/${listId}/`;
    const connect = () => {
      if (closed) return;
      ws = new WebSocket(url);
      ws.onmessage = () => { fetchDetail(); };
      ws.onopen = () => { backoff = 1000; };
      ws.onclose = () => {
        if (closed) return;
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30000);
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    };
    connect();
    return () => { closed = true; try { ws && ws.close(); } catch {} };
  }, [listId, fetchDetail]);

  // ═══ CRUD ═══

  const handleCreate = async () => {
    if (!createForm.titel) { toast.error('Bitte Titel angeben'); return; }
    setSaving(true);
    try {
      const res = await apiClient.post('/anwesenheit', createForm);
      setShowCreateModal(false);
      setCreateForm({ titel: '', beschreibung: '', ort: '' });
      navigate(`/anwesenheit/${res.data.id}`);
    } catch (err) { handleApiError(err, 'Liste konnte nicht erstellt werden'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editingListe) return;
    setSaving(true);
    try {
      await apiClient.put(`/anwesenheit/${detailListe.id}`, editingListe);
      setEditingListe(null);
      fetchDetail();
      toast.success('Gespeichert');
    } catch (err) { handleApiError(err, 'Speichern fehlgeschlagen'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Liste wirklich löschen?')) return;
    try {
      await apiClient.delete(`/anwesenheit/${id}`);
      if (listId) navigate('/anwesenheit'); else fetchListen();
      toast.success('Liste gelöscht');
    } catch (err) { handleApiError(err, 'Löschen fehlgeschlagen'); }
  };

  // ═══ Termine ═══

  const openTermineModal = () => {
    setTermineForm((detailListe?.termine || []).map(t => ({
      id: t.id, titel: t.titel, datum: t.datum, beginn: t.beginn || '', ende: t.ende || '', notizen: t.notizen,
    })));
    setShowTermineModal(true);
  };

  const handleSaveTermine = async () => {
    setSaving(true);
    try {
      const termine = termineForm.filter(t => t.datum).map(t => ({
        id: t.id || undefined,
        titel: t.titel,
        datum: t.datum,
        beginn: t.beginn || null,
        ende: t.ende || null,
        notizen: t.notizen || '',
      }));
      await apiClient.post(`/anwesenheit/${listId}/termine`, { termine });
      setShowTermineModal(false);
      fetchDetail();
      toast.success('Termine gespeichert');
    } catch (err) { handleApiError(err, 'Termine konnten nicht gespeichert werden'); }
    finally { setSaving(false); }
  };

  // ═══ Teilnehmer ═══

  const openTeilnehmerModal = async () => {
    setSelectedBenutzer([]);
    setBenutzerSearch('');
    try {
      const res = await apiClient.get('/anwesenheit/verfuegbare-benutzer');
      setVerfuegbareBenutzer(res.data);
    } catch (err) { handleApiError(err, 'Benutzer konnten nicht geladen werden'); }
    setShowTeilnehmerModal(true);
  };

  const handleAddTeilnehmer = async () => {
    if (selectedBenutzer.length === 0) return;
    setSaving(true);
    try {
      await apiClient.post(`/anwesenheit/${listId}/teilnehmer`, {
        teilnehmer: selectedBenutzer.map(b => ({ keycloak_id: b.keycloak_id, name: b.name, email: b.email })),
      });
      setShowTeilnehmerModal(false);
      fetchDetail();
      toast.success(`${selectedBenutzer.length} Teilnehmer hinzugefügt`);
    } catch (err) { handleApiError(err, 'Hinzufügen fehlgeschlagen'); }
    finally { setSaving(false); }
  };

  const handleRemoveTeilnehmer = async (teilnehmerId) => {
    try {
      await apiClient.delete(`/anwesenheit/${listId}/teilnehmer/${teilnehmerId}`);
      fetchDetail();
    } catch (err) { handleApiError(err, 'Entfernen fehlgeschlagen'); }
  };

  // ═══ Status Updates ═══

  const handleStatusChange = async (teilnehmerId, status) => {
    try {
      const res = await apiClient.post(`/anwesenheit/${listId}/status`, {
        teilnehmer_id: teilnehmerId, status, notizen: '',
      });
      setDetailListe(res.data);
    } catch (err) { handleApiError(err, 'Status-Update fehlgeschlagen'); }
  };

  const handleTerminStatusChange = async (teilnehmerId, terminId, status) => {
    try {
      const res = await apiClient.post(`/anwesenheit/${listId}/termin-status`, {
        teilnehmer_id: teilnehmerId, termin_id: terminId, status, notizen: '',
      });
      setDetailListe(res.data);
    } catch (err) { handleApiError(err, 'Status-Update fehlgeschlagen'); }
  };

  // ═══ Self-Service Status ═══

  const handleSelfStatus = async (terminId, status, notizen = '') => {
    try {
      const res = await apiClient.post(`/anwesenheit/${listId}/self-status`, {
        termin_id: terminId, status, notizen,
      });
      setDetailListe(res.data);
    } catch (err) { handleApiError(err, 'Status-Update fehlgeschlagen'); }
  };

  // ═══ Aufgabe ═══

  const handleAufgabeUpdate = async (teilnehmerId, aufgabe) => {
    try {
      const res = await apiClient.post(`/anwesenheit/${listId}/aufgabe`, {
        teilnehmer_id: teilnehmerId, aufgabe,
      });
      setDetailListe(res.data);
      toast.success('Aufgabe gespeichert');
    } catch (err) { handleApiError(err, 'Aufgabe konnte nicht gespeichert werden'); }
  };

  // ═══ Abschliessen / Klonen ═══

  const handleAbschliessen = async () => {
    if (!confirm('Liste wirklich abschließen?')) return;
    try {
      const res = await apiClient.post(`/anwesenheit/${listId}/abschliessen`);
      setDetailListe(res.data);
      toast.success('Liste abgeschlossen');
    } catch (err) { handleApiError(err, 'Abschließen fehlgeschlagen'); }
  };

  const handleKlonen = async () => {
    setSaving(true);
    try {
      const res = await apiClient.post(`/anwesenheit/${listId}/klonen`, klonForm);
      setShowKlonModal(false);
      navigate(`/anwesenheit/${res.data.id}`);
      toast.success('Liste geklont');
    } catch (err) { handleApiError(err, 'Klonen fehlgeschlagen'); }
    finally { setSaving(false); }
  };

  // ═══ Statistik ═══

  const openStats = async () => {
    try {
      const res = await apiClient.get(`/anwesenheit/${listId}/statistik`);
      setStats(res.data);
      setShowStatsModal(true);
    } catch (err) { handleApiError(err, 'Statistik konnte nicht geladen werden'); }
  };

  // ═══ Export ═══

  const handleExport = async (format) => {
    try {
      const res = await apiClient.get(`/anwesenheit/${listId}/export`, {
        params: { format },
        responseType: format === 'csv' ? 'text' : 'json',
      });
      const blob = new Blob([typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2)],
        { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anwesenheit_${listId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setShowExportModal(false);
      toast.success('Export heruntergeladen');
    } catch (err) { handleApiError(err, 'Export fehlgeschlagen'); }
  };

  // ═══ Loading ═══

  if (loading && !listId) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-accent animate-spin" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // DETAIL-ANSICHT
  // ═══════════════════════════════════════════════════════════════

  if (listId) {
    if (!detailListe) {
      return (
        <div className="space-y-6">
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate('/anwesenheit')}>Zurück</Button>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        </div>
      );
    }

    const isAktiv = detailListe.status === 'aktiv';
    const termine = detailListe.termine || [];
    const teilnehmer = detailListe.teilnehmer || [];
    const hatTermine = termine.length > 0;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" icon={ArrowLeft} aria-label="Zurück" title="Zurück" className="mt-1"
            onClick={() => navigate('/anwesenheit')} />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[1.6rem] leading-none font-bold tracking-tight text-white truncate">{detailListe.titel}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-400 mt-2 flex-wrap">
              {detailListe.ort && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {detailListe.ort}</span>}
              <StatusBadge tone={isAktiv ? 'positive' : 'neutral'} dot={isAktiv} label={isAktiv ? 'Aktiv' : 'Abgeschlossen'} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {isAktiv && hasPermission('anwesenheit.edit') && (
              <>
                <Button variant="secondary" size="sm" icon={UserPlus} onClick={openTeilnehmerModal}>Teilnehmer</Button>
                <Button variant="secondary" size="sm" icon={CalendarPlus} onClick={openTermineModal}>Termine</Button>
              </>
            )}
            {hasPermission('anwesenheit.statistik') && (
              <Button variant="secondary" size="sm" icon={BarChart3} onClick={openStats}>Statistik</Button>
            )}
            {hasPermission('anwesenheit.export') && (
              <Button variant="secondary" size="sm" icon={Download} onClick={() => setShowExportModal(true)}>Export</Button>
            )}
          </div>
        </div>

        {/* Beschreibung */}
        {detailListe.beschreibung && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-sm">{detailListe.beschreibung}</p>
          </div>
        )}

        {/* Statistik-Leiste: wraps auf engen Bildschirmen, Quote rechts wenn Platz */}
        {teilnehmer.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm tabular-nums">
              <span className="text-gray-300 font-medium whitespace-nowrap inline-flex items-center gap-1.5">
                <Users className="w-4 h-4 text-gray-500" />{detailListe.statistik.gesamt} Teilnehmer
              </span>
              {Object.entries(STATUS_COLORS).map(([key, colors]) => (
                <span key={key} className={`flex items-center gap-1.5 whitespace-nowrap ${colors.text}`}>
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  {detailListe.statistik[key] || 0} {STATUS_LABELS[key]}
                </span>
              ))}
              <span className="whitespace-nowrap sm:ml-auto">
                <span className="text-white text-base font-bold">{detailListe.statistik.quote}%</span>
                <span className="text-gray-400"> Anwesenheit</span>
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar statistik={detailListe.statistik} />
            </div>
          </div>
        )}

        {/* Termine-Tabs */}
        {hatTermine && (
          <div className="flex gap-1 overflow-x-auto border-b border-gray-800">
            <button onClick={() => setActiveTerminId(null)}
              className={`shrink-0 px-3 py-2 -mb-px border-b-2 text-sm font-medium transition-colors ${
                activeTerminId === null ? 'border-accent text-white' : 'border-transparent text-gray-400 hover:text-white'
              }`}>
              Gesamt
            </button>
            {termine.map(t => (
              <button key={t.id} onClick={() => setActiveTerminId(t.id)}
                className={`shrink-0 px-3 py-2 -mb-px border-b-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeTerminId === t.id ? 'border-accent text-white' : t.ist_vergangen ? 'border-transparent text-gray-500 hover:text-gray-300' : 'border-transparent text-gray-400 hover:text-white'
                }`}>
                <Calendar className="w-3.5 h-3.5 opacity-70" />
                {t.titel || new Date(t.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                {t.beginn && <span className="text-xs text-gray-500 tabular-nums">{t.beginn.slice(0, 5)}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Teilnehmer-Tabelle */}
        {(() => {
          // ── Termin-Stats berechnen ──
          const getTerminStats = (termin) => {
            const s = { anwesend: 0, teilweise: 0, abwesend: 0, krank: 0, ausstehend: 0, gesamt: teilnehmer.length };
            teilnehmer.forEach(tn => {
              const ta = tn.termin_anwesenheiten?.find(a => a.termin_id === termin.id);
              s[ta?.status || 'ausstehend']++;
            });
            s.quote = s.gesamt > 0 ? Math.round(((s.anwesend + s.teilweise) / s.gesamt) * 100) : 0;
            return s;
          };

          // ── Filter-Logik ──
          const filteredTeilnehmer = teilnehmer.filter(tn => {
            if (teilnehmerSearch) {
              const q = teilnehmerSearch.toLowerCase();
              if (!tn.name.toLowerCase().includes(q) && !(tn.email || '').toLowerCase().includes(q)) return false;
            }
            if (statusFilter) {
              if (activeTerminId !== null) {
                const ta = tn.termin_anwesenheiten?.find(a => a.termin_id === activeTerminId);
                if ((ta?.status || 'ausstehend') !== statusFilter) return false;
              } else if (hatTermine) {
                const hasStatus = tn.termin_anwesenheiten?.some(a => a.status === statusFilter);
                if (!hasStatus && statusFilter !== 'ausstehend') return false;
              } else {
                if (tn.status !== statusFilter) return false;
              }
            }
            return true;
          });

          return (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* Header + Filter */}
              <div className="p-4 border-b border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold tracking-tight text-white leading-none">Teilnehmer <span className="text-sm font-sans font-normal tabular-nums text-gray-500">{teilnehmer.length}</span></h3>
                  {isAktiv && hasPermission('anwesenheit.edit') && teilnehmer.length > 0 && (
                    <div className="flex gap-1 flex-wrap justify-end">
                      {Object.entries(STATUS_LABELS).filter(([k]) => k !== 'ausstehend').map(([key, label]) => (
                        <button key={key} onClick={async () => {
                          const targets = selectedTeilnehmer.size > 0
                            ? teilnehmer.filter(t => selectedTeilnehmer.has(t.id))
                            : filteredTeilnehmer;
                          try {
                            await apiClient.post(`/anwesenheit/${listId}/bulk-status`, {
                              updates: targets.map(t => ({
                                teilnehmer_id: t.id,
                                termin_id: activeTerminId || undefined,
                                status: key, notizen: '',
                              })),
                            });
                            fetchDetail();
                            setSelectedTeilnehmer(new Set());
                            toast.success(`${targets.length}× als "${label}" markiert`);
                          } catch (err) { handleApiError(err, 'Bulk-Update fehlgeschlagen'); }
                        }}
                          title={`${selectedTeilnehmer.size > 0 ? 'Ausgewählte' : 'Alle angezeigten'} als ${label} markieren`}
                          className={`px-2 py-1 text-xs font-medium rounded-md tabular-nums ring-1 ring-inset ring-white/5 ${STATUS_COLORS[key].bg} ${STATUS_COLORS[key].text} hover:brightness-125 transition`}>
                          {selectedTeilnehmer.size > 0 ? `${selectedTeilnehmer.size}×` : 'Alle'} {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inline-Filter */}
                {teilnehmer.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[180px] max-w-xs">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="text" value={teilnehmerSearch} onChange={e => setTeilnehmerSearch(e.target.value)}
                        placeholder="Name oder E-Mail" aria-label="Teilnehmer suchen" className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
                    </div>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Nach Status filtern"
                      className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-accent">
                      <option value="">Alle Status</option>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    {(teilnehmerSearch || statusFilter) && (
                      <span className="text-xs text-gray-500 tabular-nums">{filteredTeilnehmer.length} von {teilnehmer.length}</span>
                    )}
                  </div>
                )}
              </div>

              {teilnehmer.length === 0 ? (
                <EmptyState icon={Users} title="Noch keine Teilnehmer"
                  description="Füge Teilnehmer hinzu, um die Anwesenheit zu erfassen."
                  action={isAktiv && hasPermission('anwesenheit.edit') && (
                    <Button variant="primary" icon={UserPlus} onClick={openTeilnehmerModal}>Teilnehmer hinzufügen</Button>
                  )} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-xs">
                        {/* Batch-Checkbox */}
                        {isAktiv && hasPermission('anwesenheit.edit') && (
                          <th className="w-10 p-3">
                            <input type="checkbox"
                              checked={selectedTeilnehmer.size === filteredTeilnehmer.length && filteredTeilnehmer.length > 0}
                              onChange={e => {
                                if (e.target.checked) setSelectedTeilnehmer(new Set(filteredTeilnehmer.map(t => t.id)));
                                else setSelectedTeilnehmer(new Set());
                              }}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-accent" />
                          </th>
                        )}
                        <th className="text-left p-3 text-gray-400 font-medium sticky left-0 bg-gray-900 z-10">Name</th>
                        {hatTermine && activeTerminId === null ? (
                          termine.map(t => {
                            const ts = getTerminStats(t);
                            return (
                              <th key={t.id} className={`text-center p-3 font-medium min-w-[130px] ${t.ist_vergangen ? 'opacity-50' : 'text-gray-400'}`}>
                                <div className="text-xs font-semibold">
                                  {t.titel || new Date(t.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                                </div>
                                {t.beginn && <div className="text-xs opacity-60">{t.beginn.slice(0, 5)}</div>}
                                <div className="flex justify-center items-center gap-1 mt-1">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" title={`${ts.anwesend} anwesend`} />
                                  <span className="text-[10px] text-gray-400 tabular-nums">{ts.quote}%</span>
                                  {t.ist_vergangen && <span className="text-[10px] text-gray-500">· vorbei</span>}
                                </div>
                              </th>
                            );
                          })
                        ) : (
                          <th className="text-center p-3 text-gray-400 font-medium">Status</th>
                        )}
                        <th className="w-20 p-3 text-gray-400 font-medium text-center">Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeilnehmer.map(tn => {
                        const isSelected = selectedTeilnehmer.has(tn.id);
                        const isSelf = profile?.keycloak_id === tn.keycloak_id;
                        const canEdit = isAktiv && hasPermission('anwesenheit.edit');
                        return (
                          <tr key={tn.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${isSelected ? 'bg-accent/[0.06]' : ''} ${isSelf && !isSelected ? 'bg-white/[0.02]' : ''}`}>
                            {/* Batch-Checkbox */}
                            {isAktiv && hasPermission('anwesenheit.edit') && (
                              <td className="p-3">
                                <input type="checkbox" checked={isSelected}
                                  onChange={e => {
                                    const s = new Set(selectedTeilnehmer);
                                    if (e.target.checked) s.add(tn.id); else s.delete(tn.id);
                                    setSelectedTeilnehmer(s);
                                  }}
                                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-accent" />
                              </td>
                            )}
                            <td className="p-3 sticky left-0 bg-gray-900 z-10">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-white">{tn.name}</span>
                                {isSelf && <StatusBadge tone="accent" label="Du" />}
                              </div>
                              {tn.aufgabe && (
                                <div className="text-xs text-gray-400 mt-0.5">{tn.aufgabe}</div>
                              )}
                            </td>
                            {hatTermine && activeTerminId === null ? (
                              termine.map(t => {
                                const ta = tn.termin_anwesenheiten?.find(a => a.termin_id === t.id);
                                const s = ta?.status || 'ausstehend';
                                const hasNote = !!ta?.notizen;
                                const canSelfEdit = isSelf && isAktiv && !t.ist_vergangen;
                                return (
                                  <td key={t.id} className={`p-1.5 text-center ${t.ist_vergangen ? 'opacity-50' : ''}`}>
                                    <div className="flex flex-col items-center gap-0.5">
                                      {canEdit ? (
                                        <StatusSelect value={s} onChange={v => handleTerminStatusChange(tn.id, t.id, v)} />
                                      ) : canSelfEdit ? (
                                        <StatusSelect value={s} onChange={v => handleSelfStatus(t.id, v)} />
                                      ) : (
                                        <StatusBadge tone={STATUS_TONE[s]} label={STATUS_LABELS[s]} />
                                      )}
                                      {(canEdit || canSelfEdit) && (
                                        <button onClick={() => {
                                          setEditingNote({ teilnehmerId: tn.id, terminId: t.id, name: tn.name, isSelf: isSelf && !hasPermission('anwesenheit.edit') });
                                          setNoteForm({ status: s, notizen: ta?.notizen || '' });
                                          setShowNotesModal(true);
                                        }}
                                          title={hasNote ? ta.notizen : 'Notiz hinzufügen'}
                                          className={`flex items-center gap-0.5 text-[11px] px-1.5 py-1 rounded-md hover:bg-gray-700 ${
                                            hasNote ? 'text-amber-300' : 'text-gray-600 hover:text-gray-400'
                                          }`}>
                                          <MessageSquare className="w-3 h-3" />
                                          {hasNote && <span>Notiz</span>}
                                        </button>
                                      )}
                                      {!canEdit && !canSelfEdit && hasNote && (
                                        <span className="text-[10px] text-amber-300 flex items-center gap-0.5" title={ta?.notizen}>
                                          <MessageSquare className="w-3 h-3" />
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })
                            ) : activeTerminId !== null ? (
                              (() => {
                                const ta = tn.termin_anwesenheiten?.find(a => a.termin_id === activeTerminId);
                                const s = ta?.status || 'ausstehend';
                                const hasNote = !!ta?.notizen;
                                const activeTermin = termine.find(t => t.id === activeTerminId);
                                const canSelfEdit = isSelf && isAktiv && activeTermin && !activeTermin.ist_vergangen;
                                return (
                                  <td className="p-2 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      {canEdit ? (
                                        <StatusSelect value={s} onChange={v => handleTerminStatusChange(tn.id, activeTerminId, v)} />
                                      ) : canSelfEdit ? (
                                        <StatusSelect value={s} onChange={v => handleSelfStatus(activeTerminId, v)} />
                                      ) : (
                                        <StatusBadge tone={STATUS_TONE[s]} label={STATUS_LABELS[s]} />
                                      )}
                                      {(canEdit || canSelfEdit) && (
                                        <button onClick={() => {
                                          setEditingNote({ teilnehmerId: tn.id, terminId: activeTerminId, name: tn.name, isSelf: isSelf && !hasPermission('anwesenheit.edit') });
                                          setNoteForm({ status: s, notizen: ta?.notizen || '' });
                                          setShowNotesModal(true);
                                        }}
                                          className={`p-1.5 rounded-md hover:bg-gray-700 ${hasNote ? 'text-amber-300' : 'text-gray-600 hover:text-gray-400'}`}
                                          title={hasNote ? ta.notizen : 'Notiz hinzufügen'}>
                                          <MessageSquare className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      {!canEdit && !canSelfEdit && hasNote && (
                                        <span className="text-amber-300" title={ta?.notizen}><MessageSquare className="w-3.5 h-3.5" /></span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })()
                            ) : (
                              <td className="p-2 text-center">
                                {canEdit ? (
                                  <StatusSelect value={tn.status} onChange={v => handleStatusChange(tn.id, v)} />
                                ) : (
                                  <StatusBadge tone={STATUS_TONE[tn.status]} label={STATUS_LABELS[tn.status]} />
                                )}
                              </td>
                            )}
                            {/* Aktionen: Aufgabe + Löschen */}
                            <td className="p-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {canEdit && (
                                  <button onClick={() => {
                                    const aufgabe = prompt('Aufgabe zuweisen:', tn.aufgabe || '');
                                    if (aufgabe !== null) handleAufgabeUpdate(tn.id, aufgabe);
                                  }}
                                    className={`p-1.5 rounded-md hover:bg-gray-700 ${tn.aufgabe ? 'text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
                                    title={tn.aufgabe ? `Aufgabe: ${tn.aufgabe}` : 'Aufgabe zuweisen'} aria-label="Aufgabe zuweisen">
                                    <ClipboardList className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {canEdit && (
                                  <button onClick={() => handleRemoveTeilnehmer(tn.id)}
                                    title="Aus Liste entfernen" aria-label={`${tn.name} entfernen`}
                                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-md">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* Floating Batch-Bar */}
        {selectedTeilnehmer.size > 0 && isAktiv && hasPermission('anwesenheit.edit') && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 shadow-2xl shadow-black/60 z-40 flex items-center gap-3 max-w-[calc(100vw-2rem)] overflow-x-auto">
            <span className="text-white font-medium text-sm tabular-nums">{selectedTeilnehmer.size} ausgewählt</span>
            <button onClick={() => setSelectedTeilnehmer(new Set())} aria-label="Auswahl aufheben" className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
            <div className="h-5 w-px bg-gray-600" />
            {Object.entries(STATUS_LABELS).filter(([k]) => k !== 'ausstehend').map(([key, label]) => (
              <button key={key} onClick={async () => {
                try {
                  await apiClient.post(`/anwesenheit/${listId}/bulk-status`, {
                    updates: Array.from(selectedTeilnehmer).map(id => ({
                      teilnehmer_id: id, termin_id: activeTerminId || undefined, status: key, notizen: '',
                    })),
                  });
                  fetchDetail();
                  setSelectedTeilnehmer(new Set());
                  toast.success(`${selectedTeilnehmer.size}× als "${label}" markiert`);
                } catch (err) { handleApiError(err, 'Batch-Update fehlgeschlagen'); }
              }}
                className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-md ring-1 ring-inset ring-white/5 ${STATUS_COLORS[key].bg} ${STATUS_COLORS[key].text} hover:brightness-125 transition`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Aktionen */}
        {isAktiv && hasPermission('anwesenheit.edit') && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
            <Button variant="primary" icon={CheckCircle} onClick={handleAbschliessen}>Liste abschließen</Button>
            <Button variant="secondary" icon={Copy}
              onClick={() => { setKlonForm({ titel: '', termine_uebernehmen: true }); setShowKlonModal(true); }}>
              Klonen
            </Button>
            {hasPermission('anwesenheit.delete') && (
              <Button variant="ghost" icon={Trash2} className="!text-gray-400 hover:!text-red-400 hover:!bg-red-500/10 ml-auto"
                onClick={() => handleDelete(listId)}>
                Liste löschen
              </Button>
            )}
          </div>
        )}

        {/* ─── Erstellen/Bearbeiten Modal ──────────────────── */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl font-semibold tracking-tight text-white">Neue Anwesenheitsliste</h2>
                <button onClick={() => setShowCreateModal(false)} aria-label="Schließen" className="p-1.5 -mr-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Titel <span className="text-accent">*</span></label>
                  <input type="text" value={createForm.titel} onChange={e => setCreateForm({ ...createForm, titel: e.target.value })}
                    placeholder="z.B. Probe Montag, Workshop 2026…" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Beschreibung</label>
                  <textarea value={createForm.beschreibung} onChange={e => setCreateForm({ ...createForm, beschreibung: e.target.value })}
                    rows={2} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Ort</label>
                  <input type="text" value={createForm.ort} onChange={e => setCreateForm({ ...createForm, ort: e.target.value })}
                    placeholder="z.B. Aula, Studio A…" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button variant="ghost" className="flex-1" onClick={() => setShowCreateModal(false)}>Abbrechen</Button>
                <Button variant="primary" className="flex-1" onClick={handleCreate} disabled={saving || !createForm.titel}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Erstellen
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Termine Modal ──────────────────────────────── */}
        {showTermineModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-800">
                <h2 className="font-display text-xl font-semibold tracking-tight text-white">Termine verwalten</h2>
                <button onClick={() => setShowTermineModal(false)} aria-label="Schließen" className="p-1.5 -mr-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {termineForm.map((t, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-800/50 border border-gray-800 rounded-lg">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <input type="text" value={t.titel} onChange={e => { const f = [...termineForm]; f[i].titel = e.target.value; setTermineForm(f); }}
                        placeholder="Titel (optional)" className="col-span-2 px-2 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-accent" />
                      <input type="date" value={t.datum} onChange={e => { const f = [...termineForm]; f[i].datum = e.target.value; setTermineForm(f); }}
                        className="px-2 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-accent" />
                      <div className="flex gap-1">
                        <input type="time" value={t.beginn} onChange={e => { const f = [...termineForm]; f[i].beginn = e.target.value; setTermineForm(f); }}
                          placeholder="Beginn" className="flex-1 px-2 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-accent" />
                        <input type="time" value={t.ende} onChange={e => { const f = [...termineForm]; f[i].ende = e.target.value; setTermineForm(f); }}
                          placeholder="Ende" className="flex-1 px-2 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-accent" />
                      </div>
                    </div>
                    <button onClick={() => setTermineForm(termineForm.filter((_, j) => j !== i))}
                      title="Termin entfernen" aria-label="Termin entfernen"
                      className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-md mt-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setTermineForm([...termineForm, { id: null, titel: '', datum: '', beginn: '', ende: '', notizen: '' }])}
                  className="flex items-center justify-center gap-2 w-full p-3 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800/60 hover:border-gray-500 rounded-lg border border-dashed border-gray-700 transition-colors">
                  <Plus className="w-4 h-4" /> Termin hinzufügen
                </button>
              </div>
              <div className="flex gap-2 p-6 pt-4 border-t border-gray-800">
                <Button variant="ghost" className="flex-1" onClick={() => setShowTermineModal(false)}>Abbrechen</Button>
                <Button variant="primary" className="flex-1" onClick={handleSaveTermine} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Speichern
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Teilnehmer Modal ──────────────────────────── */}
        {showTeilnehmerModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-800">
                <h2 className="font-display text-xl font-semibold tracking-tight text-white">Teilnehmer hinzufügen</h2>
                <button onClick={() => setShowTeilnehmerModal(false)} aria-label="Schließen" className="p-1.5 -mr-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={benutzerSearch} onChange={e => setBenutzerSearch(e.target.value)}
                    placeholder="Name oder E-Mail" aria-label="Benutzer suchen" className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
                </div>
                {selectedBenutzer.length > 0 && (
                  <div className="mt-2 text-sm text-gray-300 tabular-nums"><span className="text-white font-semibold">{selectedBenutzer.length}</span> ausgewählt</div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                <ul className="space-y-1">
                  {verfuegbareBenutzer
                    .filter(b => {
                      if (benutzerSearch) {
                        const q = benutzerSearch.toLowerCase();
                        return b.name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q);
                      }
                      return true;
                    })
                    .filter(b => !teilnehmer.some(t => t.keycloak_id === b.keycloak_id))
                    .map(b => {
                      const isSelected = selectedBenutzer.some(s => s.keycloak_id === b.keycloak_id);
                      return (
                        <li key={b.keycloak_id}>
                          <button type="button" onClick={() => {
                            setSelectedBenutzer(prev => isSelected
                              ? prev.filter(s => s.keycloak_id !== b.keycloak_id)
                              : [...prev, b]
                            );
                          }}
                            className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${
                              isSelected ? 'bg-accent/10 ring-1 ring-inset ring-accent/40' : 'hover:bg-gray-800'
                            }`}>
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'bg-accent border-accent' : 'border-gray-600'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-white font-medium">{b.name}</span>
                              {b.email && <span className="text-gray-500 text-xs ml-2">{b.email}</span>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
              <div className="flex gap-2 p-6 pt-4 border-t border-gray-800">
                <Button variant="ghost" className="flex-1" onClick={() => setShowTeilnehmerModal(false)}>Abbrechen</Button>
                <Button variant="primary" className="flex-1 tabular-nums" onClick={handleAddTeilnehmer} disabled={selectedBenutzer.length === 0 || saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Hinzufügen ({selectedBenutzer.length})
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Klon Modal ────────────────────────────────── */}
        {showKlonModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl font-semibold tracking-tight text-white">Liste klonen</h2>
                <button onClick={() => setShowKlonModal(false)} aria-label="Schließen" className="p-1.5 -mr-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Neuer Titel</label>
                  <input type="text" value={klonForm.titel} onChange={e => setKlonForm({ ...klonForm, titel: e.target.value })}
                    placeholder={`${detailListe.titel} (Kopie)`} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
                </div>
                {termine.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={klonForm.termine_uebernehmen}
                      onChange={e => setKlonForm({ ...klonForm, termine_uebernehmen: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-accent" />
                    <span className="text-sm text-gray-300 tabular-nums">Termine übernehmen ({termine.length} Termine)</span>
                  </label>
                )}
                <div className="p-3 bg-gray-800/50 rounded-lg text-xs text-gray-400 space-y-1">
                  <p className="font-medium text-gray-300">Übernommen werden</p>
                  <ul className="list-disc pl-4 space-y-0.5 marker:text-gray-600">
                    <li>Titel, Beschreibung, Ort</li>
                    <li>{teilnehmer.length} Teilnehmer, Status zurück auf „Ausstehend"</li>
                    {klonForm.termine_uebernehmen && termine.length > 0 && <li>{termine.length} Termine</li>}
                  </ul>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button variant="ghost" className="flex-1" onClick={() => setShowKlonModal(false)}>Abbrechen</Button>
                <Button variant="primary" className="flex-1" onClick={handleKlonen} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                  Klonen
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Export Modal ──────────────────────────────── */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl font-semibold tracking-tight text-white">Export</h2>
                <button onClick={() => setShowExportModal(false)} aria-label="Schließen" className="p-1.5 -mr-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <button onClick={() => handleExport('csv')}
                  className="w-full flex items-center gap-3 text-left p-3.5 rounded-lg border border-gray-700 hover:border-gray-500 hover:bg-gray-800/60 transition-colors">
                  <FileSpreadsheet className="w-5 h-5 text-gray-400 shrink-0" />
                  <div>
                    <div className="font-medium text-white">CSV</div>
                    <div className="text-sm text-gray-400">Zum Öffnen in Excel oder Numbers</div>
                  </div>
                </button>
                <button onClick={() => handleExport('json')}
                  className="w-full flex items-center gap-3 text-left p-3.5 rounded-lg border border-gray-700 hover:border-gray-500 hover:bg-gray-800/60 transition-colors">
                  <FileJson className="w-5 h-5 text-gray-400 shrink-0" />
                  <div>
                    <div className="font-medium text-white">JSON</div>
                    <div className="text-sm text-gray-400">Alle Daten, z.B. für Auswertungen</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Statistik Modal ──────────────────────────── */}
        {showStatsModal && stats && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-xl font-semibold tracking-tight text-white">Statistik</h2>
                <button onClick={() => setShowStatsModal(false)} aria-label="Schließen" className="p-1.5 -mr-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
              </div>

              {/* Gesamt */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
                {[
                  { label: 'Gesamt', value: stats.gesamt.gesamt, color: 'text-white' },
                  { label: 'Anwesend', value: stats.gesamt.anwesend, color: 'text-emerald-300' },
                  { label: 'Teilweise', value: stats.gesamt.teilweise, color: 'text-sky-300' },
                  { label: 'Abwesend', value: stats.gesamt.abwesend, color: 'text-red-400' },
                  { label: 'Krank', value: stats.gesamt.krank, color: 'text-amber-300' },
                  { label: 'Ausstehend', value: stats.gesamt.ausstehend, color: 'text-gray-400' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-800/50 border border-gray-800 rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold tabular-nums leading-none ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-400 mt-1.5">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="flex items-baseline justify-center gap-2 mb-6 tabular-nums">
                <span className="font-display text-4xl font-bold text-white leading-none">{stats.gesamt.quote}%</span>
                <span className="text-sm text-gray-400">Anwesenheitsquote</span>
              </div>

              {/* Pro Termin */}
              {stats.termine.length > 0 && (
                <>
                  <h3 className="text-sm font-medium text-gray-300 mb-3">Pro Termin</h3>
                  <div className="space-y-2">
                    {stats.termine.map(t => {
                      const total = (t.anwesend || 0) + (t.teilweise || 0) + (t.abwesend || 0) + (t.krank || 0) + (t.ausstehend || 0);
                      return (
                        <div key={t.termin_id} className="p-3 bg-gray-800/50 border border-gray-800 rounded-lg space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <span className="text-white text-sm">{t.titel}</span>
                              <span className="text-gray-500 text-xs ml-2">{new Date(t.datum).toLocaleDateString('de-DE')}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs tabular-nums">
                              <span className="flex items-center gap-1 text-emerald-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{t.anwesend}</span>
                              {(t.teilweise || 0) > 0 && <span className="flex items-center gap-1 text-sky-300"><span className="w-1.5 h-1.5 rounded-full bg-sky-500" />{t.teilweise}</span>}
                              <span className="flex items-center gap-1 text-red-300"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{t.abwesend}</span>
                              <span className="flex items-center gap-1 text-amber-300"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{t.krank}</span>
                            </div>
                            <span className="text-white text-sm font-semibold w-12 text-right tabular-nums">{t.quote}%</span>
                          </div>
                          {total > 0 && (
                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
                              {t.anwesend > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${(t.anwesend / total) * 100}%` }} />}
                              {(t.teilweise || 0) > 0 && <div className="bg-sky-500 h-full" style={{ width: `${(t.teilweise / total) * 100}%` }} />}
                              {t.abwesend > 0 && <div className="bg-red-500 h-full" style={{ width: `${(t.abwesend / total) * 100}%` }} />}
                              {t.krank > 0 && <div className="bg-amber-500 h-full" style={{ width: `${(t.krank / total) * 100}%` }} />}
                              {t.ausstehend > 0 && <div className="bg-gray-600 h-full" style={{ width: `${(t.ausstehend / total) * 100}%` }} />}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── Notizen Modal ──────────────────────────────── */}
        {showNotesModal && editingNote && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl font-semibold tracking-tight text-white">
                  Status und Notiz
                  <span className="block text-sm font-sans font-normal text-gray-400 mt-0.5">{editingNote.name}</span>
                </h2>
                <button onClick={() => setShowNotesModal(false)} aria-label="Schließen" className="p-1.5 -mr-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Status</label>
                  <select value={noteForm.status} onChange={e => setNoteForm({ ...noteForm, status: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Notizen</label>
                  <textarea value={noteForm.notizen} onChange={e => setNoteForm({ ...noteForm, notizen: e.target.value })}
                    placeholder="z.B. kommt 20 Minuten später" rows={3}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none" />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button variant="ghost" className="flex-1" onClick={() => setShowNotesModal(false)}>Abbrechen</Button>
                <button onClick={async () => {
                  try {
                    if (editingNote.isSelf && editingNote.terminId && !hasPermission('anwesenheit.edit')) {
                      // Self-service: eigenen Status updaten
                      await apiClient.post(`/anwesenheit/${listId}/self-status`, {
                        termin_id: editingNote.terminId,
                        status: noteForm.status,
                        notizen: noteForm.notizen,
                      });
                    } else if (editingNote.terminId) {
                      await apiClient.post(`/anwesenheit/${listId}/termin-status`, {
                        teilnehmer_id: editingNote.teilnehmerId,
                        termin_id: editingNote.terminId,
                        status: noteForm.status,
                        notizen: noteForm.notizen,
                      });
                    } else {
                      await apiClient.post(`/anwesenheit/${listId}/status`, {
                        teilnehmer_id: editingNote.teilnehmerId,
                        status: noteForm.status,
                        notizen: noteForm.notizen,
                      });
                    }
                    setShowNotesModal(false);
                    fetchDetail();
                    toast.success('Gespeichert');
                  } catch (err) { handleApiError(err, 'Speichern fehlgeschlagen'); }
                }}
                  className="flex items-center justify-center gap-2 flex-1 px-3.5 py-2 text-sm bg-accent hover:bg-accent-hover text-white font-medium rounded-lg shadow-sm transition-colors">
                  <Check className="w-4 h-4" /> Speichern
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // ÜBERSICHT
  // ═══════════════════════════════════════════════════════════════

  const filteredListen = listen.filter(l => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return l.titel.toLowerCase().includes(q) || l.ort.toLowerCase().includes(q);
  });

  const aktiveListen = filteredListen.filter(l => l.status === 'aktiv');
  const abgeschlosseneListen = filteredListen.filter(l => l.status === 'abgeschlossen');

  // Smart Categorization
  const today = new Date().toISOString().split('T')[0];
  const listenOhneTermine = aktiveListen.filter(l => l.anzahl_termine === 0);
  const kommendeVeranstaltungen = aktiveListen.filter(l => {
    if (l.anzahl_termine === 0) return false;
    return l.naechster_termin && l.naechster_termin.datum >= today;
  });
  const vergangeneAktive = aktiveListen.filter(l => {
    if (l.anzahl_termine === 0) return false;
    return !l.naechster_termin || l.naechster_termin.datum < today;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team"
        title="Anwesenheit"
        meta={listen.length > 0 ? <span className="tabular-nums">{listen.filter(l => l.status === 'aktiv').length} aktiv · {listen.filter(l => l.status === 'abgeschlossen').length} abgeschlossen</span> : undefined}
        actions={hasPermission('anwesenheit.create') && (
          <Button variant="primary" icon={Plus}
            onClick={() => { setCreateForm({ titel: '', beschreibung: '', ort: '' }); setShowCreateModal(true); }}>
            Neue Liste
          </Button>
        )}
      />

      {/* Suche */}
      {listen.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Titel oder Ort" aria-label="Listen suchen" className="w-full pl-9 pr-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
        </div>
      )}

      {/* Listen */}
      {filteredListen.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          {searchQuery ? (
            <EmptyState icon={Search} title="Keine passenden Listen"
              description={`Nichts gefunden für „${searchQuery}".`}
              action={<Button variant="secondary" onClick={() => setSearchQuery('')}>Suche zurücksetzen</Button>} />
          ) : (
            <EmptyState icon={Users} title="Noch keine Anwesenheitslisten"
              description="Lege eine Liste für Proben oder Veranstaltungen an und erfasse dort, wer da war."
              action={hasPermission('anwesenheit.create') && (
                <Button variant="primary" icon={Plus}
                  onClick={() => { setCreateForm({ titel: '', beschreibung: '', ort: '' }); setShowCreateModal(true); }}>
                  Erste Liste anlegen
                </Button>
              )} />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {listenOhneTermine.length > 0 && (
            <SectionHeader title="Listen ohne Termine" count={listenOhneTermine.length} defaultOpen={true}>
              <div className="mb-1 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                Ohne Termine lässt sich keine Anwesenheit pro Tag erfassen. In der Liste über „Termine" anlegen.
              </div>
              {listenOhneTermine.map(l => (
                <ListCard key={l.id} liste={l} onOpen={() => navigate(`/anwesenheit/${l.id}`)}
                  onDelete={() => handleDelete(l.id)} canDelete={hasPermission('anwesenheit.delete')} />
              ))}
            </SectionHeader>
          )}
          {kommendeVeranstaltungen.length > 0 && (
            <SectionHeader title="Kommend" count={kommendeVeranstaltungen.length} defaultOpen={true}>
              {kommendeVeranstaltungen.map(l => (
                <ListCard key={l.id} liste={l} onOpen={() => navigate(`/anwesenheit/${l.id}`)}
                  onDelete={() => handleDelete(l.id)} canDelete={hasPermission('anwesenheit.delete')} />
              ))}
            </SectionHeader>
          )}
          {vergangeneAktive.length > 0 && (
            <SectionHeader title="Vorbei, noch offen" count={vergangeneAktive.length} defaultOpen={false}>
              {vergangeneAktive.map(l => (
                <ListCard key={l.id} liste={l} onOpen={() => navigate(`/anwesenheit/${l.id}`)}
                  onDelete={() => handleDelete(l.id)} canDelete={hasPermission('anwesenheit.delete')} />
              ))}
            </SectionHeader>
          )}
          {abgeschlosseneListen.length > 0 && (
            <SectionHeader title="Abgeschlossen" count={abgeschlosseneListen.length} defaultOpen={false}>
              {abgeschlosseneListen.map(l => (
                <ListCard key={l.id} liste={l} onOpen={() => navigate(`/anwesenheit/${l.id}`)}
                  onDelete={() => handleDelete(l.id)} canDelete={hasPermission('anwesenheit.delete')} />
              ))}
            </SectionHeader>
          )}
        </div>
      )}

      {/* Create Modal (auch in Übersicht) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold tracking-tight text-white">Neue Anwesenheitsliste</h2>
              <button onClick={() => setShowCreateModal(false)} aria-label="Schließen" className="p-1.5 -mr-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Titel <span className="text-accent">*</span></label>
                <input type="text" value={createForm.titel} onChange={e => setCreateForm({ ...createForm, titel: e.target.value })}
                  placeholder="z.B. Probe Montag, Workshop 2026…" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Beschreibung</label>
                <textarea value={createForm.beschreibung} onChange={e => setCreateForm({ ...createForm, beschreibung: e.target.value })}
                  rows={2} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Ort</label>
                <input type="text" value={createForm.ort} onChange={e => setCreateForm({ ...createForm, ort: e.target.value })}
                  placeholder="z.B. Aula, Studio A…" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => setShowCreateModal(false)}>Abbrechen</Button>
              <Button variant="primary" className="flex-1" onClick={handleCreate} disabled={saving || !createForm.titel}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Erstellen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Listen-Card Komponente ─────────────────────────────────────

function ListCard({ liste, onOpen, onDelete, canDelete }) {
  const stat = liste.statistik;
  return (
    <button onClick={onOpen}
      className="w-full text-left bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-white group-hover:text-accent transition-colors truncate">{liste.titel}</span>
            {liste.status !== 'aktiv' && <StatusBadge tone="neutral" label="Abgeschlossen" />}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 tabular-nums mb-2.5">
            {liste.ort && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{liste.ort}</span>}
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{liste.anzahl_teilnehmer}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{liste.anzahl_termine} {liste.anzahl_termine === 1 ? 'Termin' : 'Termine'}</span>
            {liste.naechster_termin && (
              <span className="flex items-center gap-1 text-gray-200 font-medium">
                <Clock className="w-3 h-3 text-accent" />
                {new Date(liste.naechster_termin.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                {liste.naechster_termin.beginn && ` ${liste.naechster_termin.beginn.slice(0, 5)}`}
              </span>
            )}
          </div>

          {liste.anzahl_teilnehmer > 0 && stat && (
            <div className="space-y-1.5">
              <ProgressBar statistik={stat} />
              <div className="flex items-center gap-3 text-[11px] tabular-nums">
                {stat.anwesend > 0 && <span className="flex items-center gap-1 text-emerald-300" title="Anwesend"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{stat.anwesend}</span>}
                {(stat.teilweise || 0) > 0 && <span className="flex items-center gap-1 text-sky-300" title="Teilweise"><span className="w-1.5 h-1.5 rounded-full bg-sky-500" />{stat.teilweise}</span>}
                {stat.abwesend > 0 && <span className="flex items-center gap-1 text-red-300" title="Abwesend"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{stat.abwesend}</span>}
                {stat.krank > 0 && <span className="flex items-center gap-1 text-amber-300" title="Krank"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{stat.krank}</span>}
                {stat.ausstehend > 0 && <span className="flex items-center gap-1 text-gray-500"><span className="w-1.5 h-1.5 rounded-full bg-gray-600" />{stat.ausstehend}</span>}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canDelete && (
            <span onClick={e => { e.stopPropagation(); onDelete(); }}
              title="Liste löschen" aria-label="Liste löschen"
              className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <Trash2 className="w-4 h-4" />
            </span>
          )}
          <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors" />
        </div>
      </div>
    </button>
  );
}
