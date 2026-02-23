/**
 * Anwesenheits-Modul: Listen-Übersicht + Detail-Ansicht mit Termin-Tracking
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Plus, Search, ArrowLeft, Loader2, X, Check,
  ChevronDown, ChevronRight, MapPin, Calendar,
  Users, UserPlus, CalendarPlus, Download,
  Copy, CheckCircle, Clock, Trash2, BarChart3,
  AlertTriangle, Pencil, RefreshCw, Filter,
  MessageSquare,
} from 'lucide-react';
import apiClient from '../../lib/api';
import { useUser } from '../../contexts/UserContext';

// ─── Status-Farben ────────────────────────────────────────────────

const STATUS_COLORS = {
  anwesend: { bg: 'bg-green-500/20', text: 'text-green-400', dot: 'bg-green-500' },
  teilweise: { bg: 'bg-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-500' },
  abwesend: { bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-500' },
  krank: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  ausstehend: { bg: 'bg-gray-500/20', text: 'text-gray-400', dot: 'bg-gray-500' },
};

const STATUS_LABELS = {
  anwesend: 'Anwesend',
  teilweise: 'Teilweise',
  abwesend: 'Abwesend',
  krank: 'Krank',
  ausstehend: 'Ausstehend',
};

// ─── Hilfs-Komponenten ────────────────────────────────────────────

function SectionHeader({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full py-2 text-left group">
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <span className="font-semibold text-white">{title}</span>
        <span className="text-sm text-gray-500">({count})</span>
      </button>
      {open && <div className="space-y-3 pb-4">{children}</div>}
    </div>
  );
}

function ProgressBar({ statistik }) {
  if (!statistik || statistik.gesamt === 0) return null;
  const { anwesend, teilweise = 0, abwesend, krank, ausstehend, gesamt } = statistik;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden flex">
        {anwesend > 0 && <div className="bg-green-500 h-full" style={{ width: `${(anwesend / gesamt) * 100}%` }} />}
        {teilweise > 0 && <div className="bg-blue-500 h-full" style={{ width: `${(teilweise / gesamt) * 100}%` }} />}
        {abwesend > 0 && <div className="bg-red-500 h-full" style={{ width: `${(abwesend / gesamt) * 100}%` }} />}
        {krank > 0 && <div className="bg-yellow-500 h-full" style={{ width: `${(krank / gesamt) * 100}%` }} />}
        {ausstehend > 0 && <div className="bg-gray-600 h-full" style={{ width: `${(ausstehend / gesamt) * 100}%` }} />}
      </div>
      <span className="text-xs text-gray-400 whitespace-nowrap">{statistik.quote}%</span>
    </div>
  );
}

function StatusSelect({ value, onChange, compact = false }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`${compact ? 'text-xs px-1.5 py-1' : 'text-sm px-2 py-1.5'} rounded border border-gray-700 bg-gray-800 ${STATUS_COLORS[value]?.text || 'text-gray-400'}`}>
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
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
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
          <button onClick={() => navigate('/anwesenheit')} className="flex items-center gap-2 text-gray-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" /> Zurück
          </button>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
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
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/anwesenheit')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white truncate">{detailListe.titel}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
              {detailListe.ort && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {detailListe.ort}</span>}
              <span className={`px-2 py-0.5 text-xs rounded ${isAktiv ? 'bg-blue-900/30 text-blue-400' : 'bg-green-900/30 text-green-400'}`}>
                {isAktiv ? 'Aktiv' : 'Abgeschlossen'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAktiv && hasPermission('anwesenheit.edit') && (
              <>
                <button onClick={openTeilnehmerModal}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                  <UserPlus className="w-4 h-4" /> Teilnehmer
                </button>
                <button onClick={openTermineModal}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                  <CalendarPlus className="w-4 h-4" /> Termine
                </button>
              </>
            )}
            {hasPermission('anwesenheit.statistik') && (
              <button onClick={openStats}
                className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                <BarChart3 className="w-4 h-4" /> Statistik
              </button>
            )}
            {hasPermission('anwesenheit.export') && (
              <button onClick={() => setShowExportModal(true)}
                className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                <Download className="w-4 h-4" /> Export
              </button>
            )}
          </div>
        </div>

        {/* Beschreibung */}
        {detailListe.beschreibung && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-sm">{detailListe.beschreibung}</p>
          </div>
        )}

        {/* Statistik-Leiste */}
        {teilnehmer.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-400"><Users className="w-4 h-4 inline mr-1" />{detailListe.statistik.gesamt} Teilnehmer</span>
              {Object.entries(STATUS_COLORS).map(([key, colors]) => (
                <span key={key} className={`flex items-center gap-1.5 ${colors.text}`}>
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  {detailListe.statistik[key] || 0} {STATUS_LABELS[key]}
                </span>
              ))}
              <span className="text-blue-400 font-medium ml-auto">{detailListe.statistik.quote}% Anwesenheit</span>
            </div>
            <div className="mt-2">
              <ProgressBar statistik={detailListe.statistik} />
            </div>
          </div>
        )}

        {/* Termine-Tabs */}
        {hatTermine && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setActiveTerminId(null)}
              className={`shrink-0 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                activeTerminId === null ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}>
              Gesamt
            </button>
            {termine.map(t => (
              <button key={t.id} onClick={() => setActiveTerminId(t.id)}
                className={`shrink-0 px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTerminId === t.id ? 'bg-blue-600 text-white' : t.ist_vergangen ? 'bg-gray-800/50 text-gray-500 hover:text-gray-300' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}>
                <Calendar className="w-3.5 h-3.5" />
                {t.titel || new Date(t.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                {t.beginn && <span className="text-xs opacity-70">{t.beginn.slice(0, 5)}</span>}
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
                  <h3 className="font-medium text-white">Teilnehmer ({teilnehmer.length})</h3>
                  {isAktiv && hasPermission('anwesenheit.edit') && teilnehmer.length > 0 && (
                    <div className="flex gap-1">
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
                          className={`px-2 py-1 text-xs rounded ${STATUS_COLORS[key].bg} ${STATUS_COLORS[key].text} hover:opacity-80`}>
                          {selectedTeilnehmer.size > 0 ? `${selectedTeilnehmer.size}×` : 'Alle'} {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inline-Filter */}
                {teilnehmer.length > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-xs">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="text" value={teilnehmerSearch} onChange={e => setTeilnehmerSearch(e.target.value)}
                        placeholder="Teilnehmer suchen..." className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white" />
                    </div>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                      className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white">
                      <option value="">Alle Status</option>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    {(teilnehmerSearch || statusFilter) && (
                      <span className="text-xs text-gray-500">{filteredTeilnehmer.length} von {teilnehmer.length}</span>
                    )}
                  </div>
                )}
              </div>

              {teilnehmer.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Noch keine Teilnehmer hinzugefügt
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {/* Batch-Checkbox */}
                        {isAktiv && hasPermission('anwesenheit.edit') && (
                          <th className="w-10 p-3">
                            <input type="checkbox"
                              checked={selectedTeilnehmer.size === filteredTeilnehmer.length && filteredTeilnehmer.length > 0}
                              onChange={e => {
                                if (e.target.checked) setSelectedTeilnehmer(new Set(filteredTeilnehmer.map(t => t.id)));
                                else setSelectedTeilnehmer(new Set());
                              }}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600" />
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
                                {t.ist_vergangen && <span className="text-[10px] px-1 py-0.5 rounded bg-gray-700 text-gray-400">Verg.</span>}
                                <div className="flex justify-center gap-0.5 mt-1">
                                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" title={`${ts.anwesend} Anwesend`} />
                                  <span className="text-[10px] text-gray-400 mx-0.5">{ts.quote}%</span>
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
                          <tr key={tn.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${isSelected ? 'bg-blue-900/10' : ''} ${isSelf ? 'bg-blue-900/5' : ''}`}>
                            {/* Batch-Checkbox */}
                            {isAktiv && hasPermission('anwesenheit.edit') && (
                              <td className="p-3">
                                <input type="checkbox" checked={isSelected}
                                  onChange={e => {
                                    const s = new Set(selectedTeilnehmer);
                                    if (e.target.checked) s.add(tn.id); else s.delete(tn.id);
                                    setSelectedTeilnehmer(s);
                                  }}
                                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600" />
                              </td>
                            )}
                            <td className="p-3 sticky left-0 bg-gray-900 z-10">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-white">{tn.name}</span>
                                {isSelf && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400">Du</span>}
                              </div>
                              {tn.aufgabe && (
                                <div className="text-xs text-purple-400 mt-0.5">{tn.aufgabe}</div>
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
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${STATUS_COLORS[s]?.bg} ${STATUS_COLORS[s]?.text}`}>
                                          {STATUS_LABELS[s]}
                                        </span>
                                      )}
                                      {(canEdit || canSelfEdit) && (
                                        <button onClick={() => {
                                          setEditingNote({ teilnehmerId: tn.id, terminId: t.id, name: tn.name, isSelf: isSelf && !hasPermission('anwesenheit.edit') });
                                          setNoteForm({ status: s, notizen: ta?.notizen || '' });
                                          setShowNotesModal(true);
                                        }}
                                          title={hasNote ? ta.notizen : 'Notiz hinzufügen'}
                                          className={`flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded hover:bg-gray-700 ${
                                            hasNote ? 'text-blue-400' : 'text-gray-600 hover:text-gray-400'
                                          }`}>
                                          <MessageSquare className="w-3 h-3" />
                                          {hasNote && <span>Notiz</span>}
                                        </button>
                                      )}
                                      {!canEdit && !canSelfEdit && hasNote && (
                                        <span className="text-[10px] text-blue-400 flex items-center gap-0.5" title={ta?.notizen}>
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
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${STATUS_COLORS[s]?.bg} ${STATUS_COLORS[s]?.text}`}>
                                          {STATUS_LABELS[s]}
                                        </span>
                                      )}
                                      {(canEdit || canSelfEdit) && (
                                        <button onClick={() => {
                                          setEditingNote({ teilnehmerId: tn.id, terminId: activeTerminId, name: tn.name, isSelf: isSelf && !hasPermission('anwesenheit.edit') });
                                          setNoteForm({ status: s, notizen: ta?.notizen || '' });
                                          setShowNotesModal(true);
                                        }}
                                          className={`p-1 rounded hover:bg-gray-700 ${hasNote ? 'text-blue-400' : 'text-gray-600 hover:text-gray-400'}`}
                                          title={hasNote ? ta.notizen : 'Notiz hinzufügen'}>
                                          <MessageSquare className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      {!canEdit && !canSelfEdit && hasNote && (
                                        <span className="text-blue-400" title={ta?.notizen}><MessageSquare className="w-3.5 h-3.5" /></span>
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
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${STATUS_COLORS[tn.status]?.bg} ${STATUS_COLORS[tn.status]?.text}`}>
                                    {STATUS_LABELS[tn.status]}
                                  </span>
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
                                    className={`p-1 rounded hover:bg-gray-700 ${tn.aufgabe ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
                                    title="Aufgabe zuweisen">
                                    <Users className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {canEdit && (
                                  <button onClick={() => handleRemoveTeilnehmer(tn.id)}
                                    className="p-1 text-red-400/50 hover:text-red-400 hover:bg-red-900/20 rounded">
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
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-600 rounded-xl px-5 py-3 shadow-2xl z-40 flex items-center gap-4">
            <span className="text-white font-medium text-sm">{selectedTeilnehmer.size} ausgewählt</span>
            <button onClick={() => setSelectedTeilnehmer(new Set())} className="text-gray-400 hover:text-white">
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
                className={`px-3 py-1.5 text-xs font-medium rounded-lg ${STATUS_COLORS[key].bg} ${STATUS_COLORS[key].text} hover:opacity-80`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Aktionen */}
        {isAktiv && hasPermission('anwesenheit.edit') && (
          <div className="flex items-center gap-3">
            <button onClick={handleAbschliessen}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg">
              <CheckCircle className="w-4 h-4" /> Abschließen
            </button>
            <button onClick={() => { setKlonForm({ titel: '', termine_uebernehmen: true }); setShowKlonModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
              <Copy className="w-4 h-4" /> Klonen
            </button>
            {hasPermission('anwesenheit.delete') && (
              <button onClick={() => handleDelete(listId)}
                className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-900/20 rounded-lg ml-auto">
                <Trash2 className="w-4 h-4" /> Löschen
              </button>
            )}
          </div>
        )}

        {/* ─── Erstellen/Bearbeiten Modal ──────────────────── */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Neue Anwesenheitsliste</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Titel *</label>
                  <input type="text" value={createForm.titel} onChange={e => setCreateForm({ ...createForm, titel: e.target.value })}
                    placeholder="z.B. Probe Montag, Workshop 2026..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Beschreibung</label>
                  <textarea value={createForm.beschreibung} onChange={e => setCreateForm({ ...createForm, beschreibung: e.target.value })}
                    rows={2} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Ort</label>
                  <input type="text" value={createForm.ort} onChange={e => setCreateForm({ ...createForm, ort: e.target.value })}
                    placeholder="z.B. Aula, Studio A..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={() => setShowCreateModal(false)} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
                <button onClick={handleCreate} disabled={saving || !createForm.titel}
                  className="flex items-center justify-center gap-2 flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Erstellen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Termine Modal ──────────────────────────────── */}
        {showTermineModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-800">
                <h2 className="text-lg font-semibold text-white">Termine verwalten</h2>
                <button onClick={() => setShowTermineModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {termineForm.map((t, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <input type="text" value={t.titel} onChange={e => { const f = [...termineForm]; f[i].titel = e.target.value; setTermineForm(f); }}
                        placeholder="Titel (optional)" className="col-span-2 px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white" />
                      <input type="date" value={t.datum} onChange={e => { const f = [...termineForm]; f[i].datum = e.target.value; setTermineForm(f); }}
                        className="px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white" />
                      <div className="flex gap-1">
                        <input type="time" value={t.beginn} onChange={e => { const f = [...termineForm]; f[i].beginn = e.target.value; setTermineForm(f); }}
                          placeholder="Beginn" className="flex-1 px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white" />
                        <input type="time" value={t.ende} onChange={e => { const f = [...termineForm]; f[i].ende = e.target.value; setTermineForm(f); }}
                          placeholder="Ende" className="flex-1 px-2 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded text-white" />
                      </div>
                    </div>
                    <button onClick={() => setTermineForm(termineForm.filter((_, j) => j !== i))}
                      className="p-1.5 text-red-400 hover:bg-red-900/20 rounded mt-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setTermineForm([...termineForm, { id: null, titel: '', datum: '', beginn: '', ende: '', notizen: '' }])}
                  className="flex items-center gap-2 w-full p-3 text-sm text-blue-400 hover:text-blue-300 hover:bg-gray-800 rounded-lg border border-dashed border-gray-700">
                  <Plus className="w-4 h-4" /> Termin hinzufügen
                </button>
              </div>
              <div className="flex gap-2 p-6 pt-4 border-t border-gray-800">
                <button onClick={() => setShowTermineModal(false)} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
                <button onClick={handleSaveTermine} disabled={saving}
                  className="flex items-center justify-center gap-2 flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Speichern
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Teilnehmer Modal ──────────────────────────── */}
        {showTeilnehmerModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-800">
                <h2 className="text-lg font-semibold text-white">Teilnehmer hinzufügen</h2>
                <button onClick={() => setShowTeilnehmerModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={benutzerSearch} onChange={e => setBenutzerSearch(e.target.value)}
                    placeholder="Benutzer suchen..." className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                {selectedBenutzer.length > 0 && (
                  <div className="mt-2 text-sm text-blue-400">{selectedBenutzer.length} ausgewählt</div>
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
                              isSelected ? 'bg-blue-900/30 border border-blue-700' : 'hover:bg-gray-800'
                            }`}>
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-600'
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
                <button onClick={() => setShowTeilnehmerModal(false)} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
                <button onClick={handleAddTeilnehmer} disabled={selectedBenutzer.length === 0 || saving}
                  className="flex items-center justify-center gap-2 flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Hinzufügen ({selectedBenutzer.length})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Klon Modal ────────────────────────────────── */}
        {showKlonModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Liste klonen</h2>
                <button onClick={() => setShowKlonModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Neuer Titel</label>
                  <input type="text" value={klonForm.titel} onChange={e => setKlonForm({ ...klonForm, titel: e.target.value })}
                    placeholder={`${detailListe.titel} (Kopie)`} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
                </div>
                {termine.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={klonForm.termine_uebernehmen}
                      onChange={e => setKlonForm({ ...klonForm, termine_uebernehmen: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600" />
                    <span className="text-sm text-gray-300">Termine übernehmen ({termine.length} Termine)</span>
                  </label>
                )}
                <div className="p-3 bg-gray-800/50 rounded-lg text-xs text-gray-400 space-y-1">
                  <p className="font-medium text-gray-300">Was wird kopiert:</p>
                  <p>• Titel, Beschreibung, Ort</p>
                  <p>• Teilnehmer ({teilnehmer.length}) — Status wird auf "Ausstehend" zurückgesetzt</p>
                  {klonForm.termine_uebernehmen && termine.length > 0 && <p>• Termine ({termine.length})</p>}
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={() => setShowKlonModal(false)} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
                <button onClick={handleKlonen} disabled={saving}
                  className="flex items-center justify-center gap-2 flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                  Klonen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Export Modal ──────────────────────────────── */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Export</h2>
                <button onClick={() => setShowExportModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <button onClick={() => handleExport('csv')}
                  className="w-full text-left p-4 rounded-lg border border-gray-700 hover:border-blue-500 hover:bg-blue-900/20 transition-colors">
                  <div className="font-medium text-white">CSV</div>
                  <div className="text-sm text-gray-400">Tabellenformat für Excel</div>
                </button>
                <button onClick={() => handleExport('json')}
                  className="w-full text-left p-4 rounded-lg border border-gray-700 hover:border-blue-500 hover:bg-blue-900/20 transition-colors">
                  <div className="font-medium text-white">JSON</div>
                  <div className="text-sm text-gray-400">Vollständige Datenstruktur</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Statistik Modal ──────────────────────────── */}
        {showStatsModal && stats && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Statistik</h2>
                <button onClick={() => setShowStatsModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              {/* Gesamt */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
                {[
                  { label: 'Gesamt', value: stats.gesamt.gesamt, color: 'text-white' },
                  { label: 'Anwesend', value: stats.gesamt.anwesend, color: 'text-green-400' },
                  { label: 'Teilweise', value: stats.gesamt.teilweise, color: 'text-blue-400' },
                  { label: 'Abwesend', value: stats.gesamt.abwesend, color: 'text-red-400' },
                  { label: 'Krank', value: stats.gesamt.krank, color: 'text-yellow-400' },
                  { label: 'Ausstehend', value: stats.gesamt.ausstehend, color: 'text-gray-400' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-800 rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="text-center text-lg font-bold text-blue-400 mb-6">{stats.gesamt.quote}% Anwesenheitsquote</div>

              {/* Pro Termin */}
              {stats.termine.length > 0 && (
                <>
                  <h3 className="font-medium text-white mb-3">Pro Termin</h3>
                  <div className="space-y-2">
                    {stats.termine.map(t => {
                      const total = (t.anwesend || 0) + (t.teilweise || 0) + (t.abwesend || 0) + (t.krank || 0) + (t.ausstehend || 0);
                      return (
                        <div key={t.termin_id} className="p-3 bg-gray-800 rounded-lg space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <span className="text-white text-sm">{t.titel}</span>
                              <span className="text-gray-500 text-xs ml-2">{new Date(t.datum).toLocaleDateString('de-DE')}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="flex items-center gap-1 text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{t.anwesend}</span>
                              {(t.teilweise || 0) > 0 && <span className="flex items-center gap-1 text-blue-400"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{t.teilweise}</span>}
                              <span className="flex items-center gap-1 text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{t.abwesend}</span>
                              <span className="flex items-center gap-1 text-yellow-400"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />{t.krank}</span>
                            </div>
                            <span className="text-blue-400 text-sm font-medium w-12 text-right">{t.quote}%</span>
                          </div>
                          {total > 0 && (
                            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden flex">
                              {t.anwesend > 0 && <div className="bg-green-500 h-full" style={{ width: `${(t.anwesend / total) * 100}%` }} />}
                              {(t.teilweise || 0) > 0 && <div className="bg-blue-500 h-full" style={{ width: `${(t.teilweise / total) * 100}%` }} />}
                              {t.abwesend > 0 && <div className="bg-red-500 h-full" style={{ width: `${(t.abwesend / total) * 100}%` }} />}
                              {t.krank > 0 && <div className="bg-yellow-500 h-full" style={{ width: `${(t.krank / total) * 100}%` }} />}
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
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  {editingNote.name} — Status & Notiz
                </h2>
                <button onClick={() => setShowNotesModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Status</label>
                  <select value={noteForm.status} onChange={e => setNoteForm({ ...noteForm, status: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Notizen</label>
                  <textarea value={noteForm.notizen} onChange={e => setNoteForm({ ...noteForm, notizen: e.target.value })}
                    placeholder="Bemerkungen..." rows={3}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none" />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={() => setShowNotesModal(false)} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
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
                  className="flex items-center justify-center gap-2 flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">
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
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Anwesenheit</h1>
          <p className="text-gray-400">Anwesenheitslisten verwalten und Status erfassen</p>
        </div>
        {hasPermission('anwesenheit.create') && (
          <button onClick={() => { setCreateForm({ titel: '', beschreibung: '', ort: '' }); setShowCreateModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">
            <Plus className="w-5 h-5" /> Neue Liste
          </button>
        )}
      </div>

      {/* Suche */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Listen durchsuchen..." className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white" />
      </div>

      {/* Listen */}
      {filteredListen.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Users className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">{searchQuery ? 'Keine Listen gefunden' : 'Keine Anwesenheitslisten vorhanden'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {listenOhneTermine.length > 0 && (
            <SectionHeader title="Listen ohne Termine" count={listenOhneTermine.length} defaultOpen={true}>
              <div className="mb-3 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-sm text-yellow-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Diese Listen haben noch keine Termine. Öffne die Liste und klicke auf "Termine".
              </div>
              {listenOhneTermine.map(l => (
                <ListCard key={l.id} liste={l} onOpen={() => navigate(`/anwesenheit/${l.id}`)}
                  onDelete={() => handleDelete(l.id)} canDelete={hasPermission('anwesenheit.delete')} />
              ))}
            </SectionHeader>
          )}
          {kommendeVeranstaltungen.length > 0 && (
            <SectionHeader title="Kommende Veranstaltungen" count={kommendeVeranstaltungen.length} defaultOpen={true}>
              {kommendeVeranstaltungen.map(l => (
                <ListCard key={l.id} liste={l} onOpen={() => navigate(`/anwesenheit/${l.id}`)}
                  onDelete={() => handleDelete(l.id)} canDelete={hasPermission('anwesenheit.delete')} />
              ))}
            </SectionHeader>
          )}
          {vergangeneAktive.length > 0 && (
            <SectionHeader title="Vergangene aktive Veranstaltungen" count={vergangeneAktive.length} defaultOpen={false}>
              {vergangeneAktive.map(l => (
                <ListCard key={l.id} liste={l} onOpen={() => navigate(`/anwesenheit/${l.id}`)}
                  onDelete={() => handleDelete(l.id)} canDelete={hasPermission('anwesenheit.delete')} />
              ))}
            </SectionHeader>
          )}
          {abgeschlosseneListen.length > 0 && (
            <SectionHeader title="Abgeschlossene Veranstaltungen" count={abgeschlosseneListen.length} defaultOpen={false}>
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Neue Anwesenheitsliste</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Titel *</label>
                <input type="text" value={createForm.titel} onChange={e => setCreateForm({ ...createForm, titel: e.target.value })}
                  placeholder="z.B. Probe Montag, Workshop 2026..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Beschreibung</label>
                <textarea value={createForm.beschreibung} onChange={e => setCreateForm({ ...createForm, beschreibung: e.target.value })}
                  rows={2} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white resize-none" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Ort</label>
                <input type="text" value={createForm.ort} onChange={e => setCreateForm({ ...createForm, ort: e.target.value })}
                  placeholder="z.B. Aula, Studio A..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
              <button onClick={handleCreate} disabled={saving || !createForm.titel}
                className="flex items-center justify-center gap-2 flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Erstellen
              </button>
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
            <span className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">{liste.titel}</span>
            <span className={`shrink-0 px-2 py-0.5 text-[10px] font-medium rounded ${
              liste.status === 'aktiv' ? 'bg-blue-900/30 text-blue-400' : 'bg-green-900/30 text-green-400'
            }`}>
              {liste.status === 'aktiv' ? 'Aktiv' : 'Abgeschlossen'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500 mb-2.5">
            {liste.ort && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{liste.ort}</span>}
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{liste.anzahl_teilnehmer}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{liste.anzahl_termine} Termine</span>
            {liste.naechster_termin && (
              <span className="flex items-center gap-1 text-blue-400">
                <Clock className="w-3 h-3" />
                {new Date(liste.naechster_termin.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                {liste.naechster_termin.beginn && ` ${liste.naechster_termin.beginn.slice(0, 5)}`}
              </span>
            )}
          </div>

          {liste.anzahl_teilnehmer > 0 && stat && (
            <div className="space-y-1.5">
              <ProgressBar statistik={stat} />
              <div className="flex items-center gap-3 text-[11px]">
                {stat.anwesend > 0 && <span className="flex items-center gap-1 text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{stat.anwesend}</span>}
                {(stat.teilweise || 0) > 0 && <span className="flex items-center gap-1 text-blue-400"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{stat.teilweise}</span>}
                {stat.abwesend > 0 && <span className="flex items-center gap-1 text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{stat.abwesend}</span>}
                {stat.krank > 0 && <span className="flex items-center gap-1 text-yellow-400"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />{stat.krank}</span>}
                {stat.ausstehend > 0 && <span className="flex items-center gap-1 text-gray-500"><span className="w-1.5 h-1.5 rounded-full bg-gray-600" />{stat.ausstehend}</span>}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canDelete && (
            <span onClick={e => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <Trash2 className="w-4 h-4" />
            </span>
          )}
          <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors" />
        </div>
      </div>
    </button>
  );
}
