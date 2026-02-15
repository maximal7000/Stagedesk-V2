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
} from 'lucide-react';
import apiClient from '../lib/api';
import { useUser } from '../contexts/UserContext';

// ─── Status-Farben ────────────────────────────────────────────────

const STATUS_COLORS = {
  anwesend: { bg: 'bg-green-500/20', text: 'text-green-400', dot: 'bg-green-500' },
  abwesend: { bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-500' },
  krank: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  ausstehend: { bg: 'bg-gray-500/20', text: 'text-gray-400', dot: 'bg-gray-500' },
};

const STATUS_LABELS = {
  anwesend: 'Anwesend',
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
  const { anwesend, abwesend, krank, ausstehend, gesamt } = statistik;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden flex">
        {anwesend > 0 && <div className="bg-green-500 h-full" style={{ width: `${(anwesend / gesamt) * 100}%` }} />}
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
  const { hasPermission } = useUser();

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

  // ═══ Daten laden ═══

  const fetchListen = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/anwesenheit');
      setListen(res.data);
    } catch (err) {
      console.error('Fehler:', err);
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
    } catch { toast.error('Liste konnte nicht erstellt werden'); }
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
    } catch { toast.error('Speichern fehlgeschlagen'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Liste wirklich löschen?')) return;
    try {
      await apiClient.delete(`/anwesenheit/${id}`);
      if (listId) navigate('/anwesenheit'); else fetchListen();
      toast.success('Liste gelöscht');
    } catch { toast.error('Löschen fehlgeschlagen'); }
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
    } catch { toast.error('Termine konnten nicht gespeichert werden'); }
    finally { setSaving(false); }
  };

  // ═══ Teilnehmer ═══

  const openTeilnehmerModal = async () => {
    setSelectedBenutzer([]);
    setBenutzerSearch('');
    try {
      const res = await apiClient.get('/anwesenheit/verfuegbare-benutzer');
      setVerfuegbareBenutzer(res.data);
    } catch { toast.error('Benutzer konnten nicht geladen werden'); }
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
    } catch { toast.error('Hinzufügen fehlgeschlagen'); }
    finally { setSaving(false); }
  };

  const handleRemoveTeilnehmer = async (teilnehmerId) => {
    try {
      await apiClient.delete(`/anwesenheit/${listId}/teilnehmer/${teilnehmerId}`);
      fetchDetail();
    } catch { toast.error('Entfernen fehlgeschlagen'); }
  };

  // ═══ Status Updates ═══

  const handleStatusChange = async (teilnehmerId, status) => {
    try {
      const res = await apiClient.post(`/anwesenheit/${listId}/status`, {
        teilnehmer_id: teilnehmerId, status, notizen: '',
      });
      setDetailListe(res.data);
    } catch { toast.error('Status-Update fehlgeschlagen'); }
  };

  const handleTerminStatusChange = async (teilnehmerId, terminId, status) => {
    try {
      const res = await apiClient.post(`/anwesenheit/${listId}/termin-status`, {
        teilnehmer_id: teilnehmerId, termin_id: terminId, status, notizen: '',
      });
      setDetailListe(res.data);
    } catch { toast.error('Status-Update fehlgeschlagen'); }
  };

  // ═══ Abschliessen / Klonen ═══

  const handleAbschliessen = async () => {
    if (!confirm('Liste wirklich abschließen?')) return;
    try {
      const res = await apiClient.post(`/anwesenheit/${listId}/abschliessen`);
      setDetailListe(res.data);
      toast.success('Liste abgeschlossen');
    } catch { toast.error('Abschließen fehlgeschlagen'); }
  };

  const handleKlonen = async () => {
    setSaving(true);
    try {
      const res = await apiClient.post(`/anwesenheit/${listId}/klonen`, klonForm);
      setShowKlonModal(false);
      navigate(`/anwesenheit/${res.data.id}`);
      toast.success('Liste geklont');
    } catch { toast.error('Klonen fehlgeschlagen'); }
    finally { setSaving(false); }
  };

  // ═══ Statistik ═══

  const openStats = async () => {
    try {
      const res = await apiClient.get(`/anwesenheit/${listId}/statistik`);
      setStats(res.data);
      setShowStatsModal(true);
    } catch { toast.error('Statistik konnte nicht geladen werden'); }
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
    } catch { toast.error('Export fehlgeschlagen'); }
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
            <button onClick={openStats}
              className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
              <BarChart3 className="w-4 h-4" /> Statistik
            </button>
            <button onClick={() => setShowExportModal(true)}
              className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
              <Download className="w-4 h-4" /> Export
            </button>
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
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="font-medium text-white">Teilnehmer ({teilnehmer.length})</h3>
            {isAktiv && teilnehmer.length > 0 && activeTerminId === null && !hatTermine && (
              <div className="flex gap-1">
                {Object.entries(STATUS_LABELS).filter(([k]) => k !== 'ausstehend').map(([key, label]) => (
                  <button key={key} onClick={async () => {
                    try {
                      await apiClient.post(`/anwesenheit/${listId}/bulk-status`, {
                        updates: teilnehmer.map(t => ({ teilnehmer_id: t.id, status: key, notizen: '' })),
                      });
                      fetchDetail();
                      toast.success(`Alle als "${label}" markiert`);
                    } catch { toast.error('Fehler'); }
                  }}
                    className={`px-2 py-1 text-xs rounded ${STATUS_COLORS[key].bg} ${STATUS_COLORS[key].text} hover:opacity-80`}>
                    Alle {label}
                  </button>
                ))}
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
                    <th className="text-left p-3 text-gray-400 font-medium sticky left-0 bg-gray-900 z-10">Name</th>
                    {hatTermine && activeTerminId === null ? (
                      termine.map(t => (
                        <th key={t.id} className={`text-center p-3 font-medium min-w-[80px] ${t.ist_vergangen ? 'text-gray-500' : 'text-gray-400'}`}>
                          <div className="text-xs">{t.titel || new Date(t.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</div>
                          {t.beginn && <div className="text-xs opacity-60">{t.beginn.slice(0, 5)}</div>}
                        </th>
                      ))
                    ) : (
                      <th className="text-center p-3 text-gray-400 font-medium">Status</th>
                    )}
                    {isAktiv && <th className="w-10 p-3" />}
                  </tr>
                </thead>
                <tbody>
                  {teilnehmer.map(tn => (
                    <tr key={tn.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="p-3 sticky left-0 bg-gray-900 z-10">
                        <div className="font-medium text-white">{tn.name}</div>
                        {tn.email && <div className="text-xs text-gray-500">{tn.email}</div>}
                      </td>
                      {hatTermine && activeTerminId === null ? (
                        // Multi-Termin-Ansicht: Eine Zelle pro Termin
                        termine.map(t => {
                          const ta = tn.termin_anwesenheiten?.find(a => a.termin_id === t.id);
                          const s = ta?.status || 'ausstehend';
                          return (
                            <td key={t.id} className="p-2 text-center">
                              {isAktiv ? (
                                <StatusSelect value={s} onChange={v => handleTerminStatusChange(tn.id, t.id, v)} compact />
                              ) : (
                                <span className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_COLORS[s]?.dot || 'bg-gray-500'}`}
                                  title={STATUS_LABELS[s]} />
                              )}
                            </td>
                          );
                        })
                      ) : activeTerminId !== null ? (
                        // Einzeltermin-Ansicht
                        (() => {
                          const ta = tn.termin_anwesenheiten?.find(a => a.termin_id === activeTerminId);
                          const s = ta?.status || 'ausstehend';
                          return (
                            <td className="p-2 text-center">
                              {isAktiv ? (
                                <StatusSelect value={s} onChange={v => handleTerminStatusChange(tn.id, activeTerminId, v)} />
                              ) : (
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${STATUS_COLORS[s]?.bg} ${STATUS_COLORS[s]?.text}`}>
                                  {STATUS_LABELS[s]}
                                </span>
                              )}
                            </td>
                          );
                        })()
                      ) : (
                        // Ohne Termine: Gesamt-Status
                        <td className="p-2 text-center">
                          {isAktiv ? (
                            <StatusSelect value={tn.status} onChange={v => handleStatusChange(tn.id, v)} />
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${STATUS_COLORS[tn.status]?.bg} ${STATUS_COLORS[tn.status]?.text}`}>
                              {STATUS_LABELS[tn.status]}
                            </span>
                          )}
                        </td>
                      )}
                      {isAktiv && (
                        <td className="p-2">
                          <button onClick={() => handleRemoveTeilnehmer(tn.id)}
                            className="p-1 text-red-400/50 hover:text-red-400 hover:bg-red-900/20 rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={klonForm.termine_uebernehmen}
                    onChange={e => setKlonForm({ ...klonForm, termine_uebernehmen: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600" />
                  <span className="text-sm text-gray-300">Termine übernehmen</span>
                </label>
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
              <div className="grid grid-cols-5 gap-3 mb-6">
                {[
                  { label: 'Gesamt', value: stats.gesamt.gesamt, color: 'text-white' },
                  { label: 'Anwesend', value: stats.gesamt.anwesend, color: 'text-green-400' },
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
                    {stats.termine.map(t => (
                      <div key={t.termin_id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <span className="text-white text-sm">{t.titel}</span>
                          <span className="text-gray-500 text-xs ml-2">{new Date(t.datum).toLocaleDateString('de-DE')}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-green-400">{t.anwesend}A</span>
                          <span className="text-red-400">{t.abwesend}F</span>
                          <span className="text-yellow-400">{t.krank}K</span>
                        </div>
                        <span className="text-blue-400 text-sm font-medium w-12 text-right">{t.quote}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
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
          {aktiveListen.length > 0 && (
            <SectionHeader title="Aktive Listen" count={aktiveListen.length} defaultOpen={true}>
              {aktiveListen.map(l => (
                <ListCard key={l.id} liste={l} onOpen={() => navigate(`/anwesenheit/${l.id}`)}
                  onDelete={() => handleDelete(l.id)} canDelete={hasPermission('anwesenheit.delete')} />
              ))}
            </SectionHeader>
          )}
          {abgeschlosseneListen.length > 0 && (
            <SectionHeader title="Abgeschlossene Listen" count={abgeschlosseneListen.length} defaultOpen={false}>
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
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <span className="font-medium text-white">{liste.titel}</span>
            {liste.ort && (
              <span className="text-sm text-gray-400 ml-2">
                <MapPin className="w-3 h-3 inline mr-1" />{liste.ort}
              </span>
            )}
          </div>
        </div>
        <span className={`px-2 py-0.5 text-xs rounded ${
          liste.status === 'aktiv' ? 'bg-blue-900/30 text-blue-400' : 'bg-green-900/30 text-green-400'
        }`}>
          {liste.status === 'aktiv' ? 'Aktiv' : 'Abgeschlossen'}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {liste.anzahl_teilnehmer} Teilnehmer</span>
        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {liste.anzahl_termine} Termine</span>
        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {new Date(liste.erstellt_am).toLocaleDateString('de-DE')}</span>
        {liste.naechster_termin && (
          <span className="text-blue-400 text-xs">
            Nächster: {new Date(liste.naechster_termin.datum).toLocaleDateString('de-DE')}
          </span>
        )}
      </div>

      {liste.anzahl_teilnehmer > 0 && <ProgressBar statistik={liste.statistik} />}

      <div className="flex justify-end gap-2 mt-3">
        {canDelete && (
          <button onClick={onDelete}
            className="px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/20 rounded-lg">
            Löschen
          </button>
        )}
        <button onClick={onOpen}
          className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
          Öffnen
        </button>
      </div>
    </div>
  );
}
