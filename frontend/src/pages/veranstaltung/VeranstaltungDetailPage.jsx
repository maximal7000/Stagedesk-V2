/**
 * Veranstaltung Detail oder Neu anlegen
 * /veranstaltung/neu → Formular erstellen
 * /veranstaltung/:id → Detail mit Sidebar + Grid Layout
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Calendar, MapPin, Save, Pen, X,
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../lib/api';
import { useUser } from '../../contexts/UserContext';
import Markdown, { MarkdownHint } from '../../components/Markdown';
import { Button, StatusBadge } from '../../components/ui';

// Sections
import QuickInfoCard from './sections/QuickInfoCard';
import TermineSection from './sections/TermineSection';
import MeldungSection from './sections/MeldungSection';
import MitteilungSection from './sections/MitteilungSection';
import ZuweisungenSection from './sections/ZuweisungenSection';
import AusleihllistenSection from './sections/AusleihllistenSection';
import AnwesenheitSection from './sections/AnwesenheitSection';
import ChecklisteSection from './sections/ChecklisteSection';
import NotizenSection from './sections/NotizenSection';
import AnhangSection from './sections/AnhangSection';
import ErinnerungenSection from './sections/ErinnerungenSection';
import DiscordSection from './sections/DiscordSection';
import KompetenzenSection from './sections/KompetenzenSection';

// Anzeige-Labels für effektiv_status. Manuell setzbar sind nur 'geplant' und
// 'abgesagt' (über Absagen-Button); 'laufend' und 'abgeschlossen' leitet das
// Backend aus datum_von/datum_bis ab.
const EFFEKTIV_LABELS = {
  geplant: 'Geplant',
  laufend: 'Laufend',
  abgeschlossen: 'Abgeschlossen',
  abgesagt: 'Abgesagt',
};

const EFFEKTIV_TONE = {
  geplant: 'info',
  laufend: 'positive',
  abgeschlossen: 'neutral',
  abgesagt: 'danger',
};

function formatDatum(d) {
  if (!d) return '–';
  return new Date(d).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Backend liefert ISO-Strings mit Timezone (UTC oder +02:00). Das
 * <input type="datetime-local"> erwartet aber LOKALE Zeit ohne Timezone.
 * Hier konvertieren wir den ISO-String in einen "YYYY-MM-DDTHH:MM"-String
 * in Browser-Zeitzone, sodass der User in der Anzeige und im Edit-Feld
 * dieselbe Uhrzeit sieht.
 */
function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local-String (Browser-Zeit) zurück in ISO-UTC für die API. */
function localInputToISO(local) {
  if (!local) return null;
  const d = new Date(local);  // Browser interpretiert ohne TZ-Suffix als lokal
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Sicherstellen, dass datum_bis >= datum_von ist. Wenn datum_bis leer oder
 * davor liegt: auf datum_von + 1 Stunde setzen. Beide Werte sind im
 * datetime-local-Format (lokal).
 */
function ensureEndAfterStart(vonLocal, bisLocal) {
  if (!vonLocal) return bisLocal || '';
  const vd = new Date(vonLocal);
  if (isNaN(vd.getTime())) return bisLocal || '';
  const bd = bisLocal ? new Date(bisLocal) : null;
  if (!bd || isNaN(bd.getTime()) || bd <= vd) {
    const end = new Date(vd.getTime() + 60 * 60 * 1000);  // +1 h
    const pad = (n) => String(n).padStart(2, '0');
    return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
  }
  return bisLocal;
}

export default function VeranstaltungDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { hasPermission, profile } = useUser();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(isNew);
  const [benutzer, setBenutzer] = useState([]);
  const [taetigkeitsrollen, setTaetigkeitsrollen] = useState([]);
  const [ausleihlisten, setAusleihlisten] = useState([]);

  const [form, setForm] = useState({
    titel: '', beschreibung: '', datum_von: '', datum_bis: '',
    ort: '', adresse: '', status: 'geplant',
  });

  const fetchDetail = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/veranstaltung/${id}`);
      setData(res.data);
      setForm({
        titel: res.data.titel, beschreibung: res.data.beschreibung || '',
        datum_von: isoToLocalInput(res.data.datum_von),
        datum_bis: isoToLocalInput(res.data.datum_bis),
        ort: res.data.ort || '', adresse: res.data.adresse || '', status: res.data.status || 'geplant',
      });
    } catch (err) {
      console.error('Fehler:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  const fetchBenutzer = useCallback(async () => {
    try {
      const [usersRes, rollenRes] = await Promise.all([
        apiClient.get('/veranstaltung/benutzer'),
        apiClient.get('/veranstaltung/taetigkeitsrollen'),
      ]);
      setBenutzer(usersRes.data || []);
      setTaetigkeitsrollen(rollenRes.data || []);
    } catch { setBenutzer([]); }
  }, []);

  const fetchAusleihlisten = useCallback(async () => {
    if (isNew || !id) return;
    try {
      const res = await apiClient.get(`/inventar/ausleihlisten/veranstaltung/${id}`);
      setAusleihlisten(res.data || []);
    } catch { setAusleihlisten([]); }
  }, [id, isNew]);

  useEffect(() => {
    fetchDetail();
    if (isNew || id) fetchBenutzer();
    fetchAusleihlisten();
  }, [fetchDetail, fetchBenutzer, fetchAusleihlisten, isNew, id]);

  const refetch = useCallback(() => {
    if (!isNew) { fetchDetail(); fetchAusleihlisten(); }
  }, [isNew, fetchDetail, fetchAusleihlisten]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const vonLocal = form.datum_von || isoToLocalInput(new Date().toISOString());
      const bisLocal = ensureEndAfterStart(vonLocal, form.datum_bis);
      const payload = {
        ...form,
        datum_von: localInputToISO(vonLocal),
        datum_bis: localInputToISO(bisLocal),
      };
      const res = await apiClient.post('/veranstaltung', payload);
      const newId = res.data?.id ?? res.data?.pk;
      if (newId != null && newId !== '') {
        navigate(`/veranstaltung/${newId}`, { replace: true });
      } else {
        toast.success('Veranstaltung wurde erstellt, aber die Antwort enthält keine ID.');
      }
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.response?.data?.error
        ?? (typeof err.response?.data === 'object' ? JSON.stringify(err.response.data) : null)
        ?? err.message ?? 'Speichern fehlgeschlagen';
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const vonLocal = form.datum_von;
      const bisLocal = ensureEndAfterStart(vonLocal, form.datum_bis);
      const payload = {
        ...form,
        datum_von: localInputToISO(vonLocal),
        datum_bis: localInputToISO(bisLocal),
      };
      await apiClient.put(`/veranstaltung/${id}`, payload);
      setEditMode(false);
      fetchDetail();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Speichern fehlgeschlagen');
    } finally { setSaving(false); }
  };

  const handleStatusToggle = async (newStatus) => {
    if (newStatus === 'abgesagt' && !confirm('Veranstaltung wirklich absagen?')) return;
    try {
      await apiClient.put(`/veranstaltung/${id}`, { status: newStatus });
      toast.success(newStatus === 'abgesagt' ? 'Veranstaltung abgesagt' : 'Veranstaltung wieder aktiv');
      fetchDetail();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Fehler');
    }
  };

  const canEdit = hasPermission('veranstaltung.edit');
  const canAssign = hasPermission('veranstaltung.zuweisungen');
  const canDiscord = hasPermission('veranstaltung.discord');
  const currentUserId = profile?.keycloak_id || '';

  // ─── Loading ─────────────────────────────────────────
  if (loading && !isNew) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  // ─── Neu anlegen ─────────────────────────────────────
  if (isNew) {
    return (
      <div className="space-y-6">
        <Link to="/veranstaltung" className="inline-flex items-center gap-2 text-gray-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Zurück
        </Link>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-2xl">
          <h1 className="text-xl font-bold text-white mb-6">Neue Veranstaltung</h1>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Titel *</label>
              <input type="text" required value={form.titel}
                onChange={(e) => setForm((f) => ({ ...f, titel: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Beschreibung</label>
              <textarea value={form.beschreibung} onChange={(e) => setForm((f) => ({ ...f, beschreibung: e.target.value }))}
                rows={4} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm" />
              <MarkdownHint />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Start *</label>
                <input type="datetime-local" required value={form.datum_von}
                  onChange={(e) => setForm((f) => ({ ...f, datum_von: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Ende <span className="text-gray-600 text-xs">(optional)</span></label>
                <input type="datetime-local" value={form.datum_bis}
                  onChange={(e) => setForm((f) => ({ ...f, datum_bis: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Ort</label>
              <input type="text" value={form.ort} onChange={(e) => setForm((f) => ({ ...f, ort: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Adresse</label>
              <textarea value={form.adresse} onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))}
                rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? '…' : 'Anlegen'}
              </Button>
              <Button as={Link} to="/veranstaltung" variant="secondary">Abbrechen</Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ─── Nicht gefunden ──────────────────────────────────
  if (!data) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Veranstaltung nicht gefunden.</p>
        <Link to="/veranstaltung" className="text-accent hover:underline mt-2 inline-block">Zur Liste</Link>
      </div>
    );
  }

  // ─── Detail View ─────────────────────────────────────
  return (
    <div className="space-y-6">
      <Link to="/veranstaltung" className="inline-flex items-center gap-2 text-gray-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Zurück
      </Link>

      {/* ─── Header ───────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {editMode ? (
              <input type="text" value={form.titel}
                onChange={(e) => setForm((f) => ({ ...f, titel: e.target.value }))}
                className="text-xl font-bold bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white w-full max-w-md" />
            ) : (
              <h1 className="text-2xl font-bold text-white">{data.titel}</h1>
            )}
            <div className="flex flex-wrap items-center gap-4 mt-2 text-gray-400">
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {formatDatum(data.datum_von)} – {formatDatum(data.datum_bis)}</span>
              {data.ort && <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {data.ort}</span>}
              {data.zammad_ticket_number && <span className="text-accent">Zammad #{data.zammad_ticket_number}</span>}
            </div>
            {editMode && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Von</label>
                  <input type="datetime-local" value={form.datum_von}
                    onChange={(e) => setForm((f) => ({ ...f, datum_von: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Bis</label>
                  <input type="datetime-local" value={form.datum_bis}
                    onChange={(e) => setForm((f) => ({ ...f, datum_bis: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Ort</label>
                  <input type="text" value={form.ort}
                    onChange={(e) => setForm((f) => ({ ...f, ort: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const eff = data.effektiv_status || data.status;
              return <StatusBadge tone={EFFEKTIV_TONE[eff] || 'neutral'} label={EFFEKTIV_LABELS[eff] || eff} />;
            })()}
            {canEdit && !editMode && (
              data.status === 'abgesagt' ? (
                <button type="button" onClick={() => handleStatusToggle('geplant')}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">
                  Wieder aktivieren
                </button>
              ) : (
                <Button variant="danger" size="sm" onClick={() => handleStatusToggle('abgesagt')}>
                  Absagen
                </Button>
              )
            )}
            {canEdit && !editMode ? (
              <Button variant="ghost" size="sm" icon={Pen} onClick={() => setEditMode(true)}
                title="Bearbeiten" aria-label="Bearbeiten" />
            ) : editMode ? (
              <>
                <Button variant="primary" size="sm" icon={Save} onClick={handleUpdate} disabled={saving}>
                  Speichern
                </Button>
                <Button variant="ghost" size="sm" icon={X} title="Abbrechen" aria-label="Abbrechen"
                  onClick={() => { setEditMode(false); setForm({ titel: data.titel, beschreibung: data.beschreibung || '', datum_von: isoToLocalInput(data.datum_von), datum_bis: isoToLocalInput(data.datum_bis), ort: data.ort || '', adresse: data.adresse || '', status: data.status || 'geplant' }); }} />
              </>
            ) : null}
          </div>
        </div>
        {data.beschreibung && <div className="mt-4"><Markdown>{data.beschreibung}</Markdown></div>}
      </div>

      {/* ─── Sidebar + Content Grid ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <QuickInfoCard data={data} isAdmin={canAssign} />
        </aside>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Planung */}
          <TermineSection data={data} refetch={refetch} canEdit={canEdit} eventId={id} />
          <KompetenzenSection data={data} refetch={refetch} canEdit={canEdit} eventId={id} />
          <MeldungSection data={data} refetch={refetch} eventId={id} currentUserId={currentUserId} isAdmin={canAssign} />
          <ZuweisungenSection data={data} refetch={refetch} canEdit={canAssign} eventId={id}
            benutzer={benutzer} taetigkeitsrollen={taetigkeitsrollen} />
          <MitteilungSection data={data} canEdit={canAssign} eventId={id} />

          {/* Verknüpfungen */}
          <AusleihllistenSection data={data} refetch={refetch} canEdit={canEdit} eventId={id} ausleihlisten={ausleihlisten} />
          <AnwesenheitSection data={data} refetch={refetch} canEdit={canEdit} eventId={id} />

          {/* Details: 2-Spalten Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChecklisteSection data={data} refetch={refetch} canEdit={canEdit} eventId={id} />
            <NotizenSection data={data} refetch={refetch} canEdit={canEdit} eventId={id} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnhangSection data={data} refetch={refetch} canEdit={canEdit} eventId={id} />
            <ErinnerungenSection data={data} refetch={refetch} canEdit={canEdit} eventId={id} />
          </div>

          {/* Discord */}
          <DiscordSection data={data} refetch={refetch} canEdit={canDiscord} eventId={id} />
        </div>
      </div>
    </div>
  );
}
