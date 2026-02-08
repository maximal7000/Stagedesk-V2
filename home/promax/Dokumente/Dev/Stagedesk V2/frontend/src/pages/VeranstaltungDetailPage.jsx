/**
 * Veranstaltung Detail oder Neu anlegen
 * /veranstaltung/neu → Formular erstellen
 * /veranstaltung/:id → Detail mit Zuweisungen, Checkliste, Notizen, Anhänge, Erinnerungen
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Calendar,
  MapPin,
  User,
  CheckSquare,
  MessageSquare,
  Paperclip,
  Bell,
  Plus,
  Trash2,
  Save,
  Pen,
  X,
} from 'lucide-react';
import apiClient from '../lib/api';

const STATUS_LABELS = {
  planung: 'Planung',
  bestaetigt: 'Bestätigt',
  laufend: 'Laufend',
  abgeschlossen: 'Abgeschlossen',
  abgesagt: 'Abgesagt',
};

const ROLLEN_LABELS = {
  verantwortlich: 'Verantwortlich',
  team: 'Team',
  technik: 'Technik',
  sonstiges: 'Sonstiges',
};

const EINHEIT_LABELS = { minuten: 'Min.', stunden: 'Std.', tage: 'Tage', wochen: 'Wochen' };

function formatDatum(d) {
  if (!d) return '–';
  return new Date(d).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function VeranstaltungDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'neu';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(isNew);
  const [benutzer, setBenutzer] = useState([]);

  // Form (create + edit)
  const [form, setForm] = useState({
    titel: '',
    beschreibung: '',
    datum_von: '',
    datum_bis: '',
    ort: '',
    adresse: '',
    status: 'planung',
  });

  // Inline-Add state
  const [newZuweisung, setNewZuweisung] = useState('');
  const [newCheckItem, setNewCheckItem] = useState('');
  const [newNotiz, setNewNotiz] = useState('');
  const [newErinnerung, setNewErinnerung] = useState({ zeit_vorher: 1, einheit: 'tage' });

  const fetchDetail = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/veranstaltung/${id}`);
      setData(res.data);
      setForm({
        titel: res.data.titel,
        beschreibung: res.data.beschreibung || '',
        datum_von: res.data.datum_von?.slice(0, 16) || '',
        datum_bis: res.data.datum_bis?.slice(0, 16) || '',
        ort: res.data.ort || '',
        adresse: res.data.adresse || '',
        status: res.data.status || 'planung',
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
      const res = await apiClient.get('/veranstaltung/benutzer');
      setBenutzer(res.data || []);
    } catch {
      setBenutzer([]);
    }
  }, []);

  useEffect(() => {
    fetchDetail();
    if (isNew || id) fetchBenutzer();
  }, [fetchDetail, fetchBenutzer, isNew, id]);

  const refetch = useCallback(() => {
    if (!isNew) fetchDetail();
  }, [isNew, fetchDetail]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        datum_von: form.datum_von || new Date().toISOString().slice(0, 16),
        datum_bis: form.datum_bis || new Date().toISOString().slice(0, 16),
      };
      const res = await apiClient.post('/veranstaltung', payload);
      navigate(`/veranstaltung/${res.data.id}`, { replace: true });
    } catch (err) {
      console.error('Fehler:', err);
      alert(err.response?.data?.detail || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.put(`/veranstaltung/${id}`, form);
      setEditMode(false);
      fetchDetail();
    } catch (err) {
      console.error('Fehler:', err);
      alert(err.response?.data?.detail || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const addZuweisung = async () => {
    const u = benutzer.find((b) => b.keycloak_id === newZuweisung || String(b.id) === newZuweisung);
    if (!u) return;
    try {
      await apiClient.post(`/veranstaltung/${id}/zuweisungen`, {
        user_keycloak_id: u.keycloak_id,
        user_username: u.username || '',
        user_email: u.email || '',
        rolle: 'team',
      });
      setNewZuweisung('');
      refetch();
    } catch (err) {
      console.error('Zuweisung:', err);
    }
  };

  const removeZuweisung = async (userKeycloakId) => {
    try {
      await apiClient.delete(`/veranstaltung/${id}/zuweisungen/${userKeycloakId}`);
      refetch();
    } catch (err) {
      console.error('Entfernen:', err);
    }
  };

  const addCheckItem = async () => {
    if (!newCheckItem.trim()) return;
    try {
      await apiClient.post(`/veranstaltung/${id}/checkliste`, {
        titel: newCheckItem.trim(),
        sortierung: (data?.checkliste?.length ?? 0),
      });
      setNewCheckItem('');
      refetch();
    } catch (err) {
      console.error('Checkliste:', err);
    }
  };

  const toggleCheckItem = async (itemId, erledigt) => {
    try {
      await apiClient.put(`/veranstaltung/${id}/checkliste/${itemId}`, { erledigt });
      refetch();
    } catch (err) {
      console.error('Toggle:', err);
    }
  };

  const deleteCheckItem = async (itemId) => {
    try {
      await apiClient.delete(`/veranstaltung/${id}/checkliste/${itemId}`);
      refetch();
    } catch (err) {
      console.error('Löschen:', err);
    }
  };

  const addNotiz = async () => {
    if (!newNotiz.trim()) return;
    try {
      await apiClient.post(`/veranstaltung/${id}/notizen`, { text: newNotiz.trim() });
      setNewNotiz('');
      refetch();
    } catch (err) {
      console.error('Notiz:', err);
    }
  };

  const addErinnerung = async () => {
    try {
      await apiClient.post(`/veranstaltung/${id}/erinnerungen`, newErinnerung);
      setNewErinnerung({ zeit_vorher: 1, einheit: 'tage' });
      refetch();
    } catch (err) {
      console.error('Erinnerung:', err);
    }
  };

  const deleteErinnerung = async (erinnerungId) => {
    try {
      await apiClient.delete(`/veranstaltung/${id}/erinnerungen/${erinnerungId}`);
      refetch();
    } catch (err) {
      console.error('Erinnerung löschen:', err);
    }
  };

  const deleteAnhang = async (anhangId) => {
    try {
      await apiClient.delete(`/veranstaltung/${id}/anhaenge/${anhangId}`);
      refetch();
    } catch (err) {
      console.error('Anhang löschen:', err);
    }
  };

  const [newAnhangName, setNewAnhangName] = useState('');
  const [newAnhangUrl, setNewAnhangUrl] = useState('');
  const [newAnhangFile, setNewAnhangFile] = useState(null);
  const [addingAnhang, setAddingAnhang] = useState(false);

  const addAnhang = async (e) => {
    e.preventDefault();
    const name = newAnhangName.trim() || (newAnhangFile?.name ?? 'Anhang');
    if (!name) return;
    setAddingAnhang(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('url', newAnhangUrl.trim());
      if (newAnhangFile) formData.append('datei', newAnhangFile);
      await apiClient.post(`/veranstaltung/${id}/anhaenge`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setNewAnhangName('');
      setNewAnhangUrl('');
      setNewAnhangFile(null);
      refetch();
    } catch (err) {
      console.error('Anhang:', err);
      alert('Anhang konnte nicht hinzugefügt werden.');
    } finally {
      setAddingAnhang(false);
    }
  };

  if (loading && !isNew) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (isNew) {
    return (
      <div className="space-y-6">
        <Link
          to="/veranstaltung"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </Link>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-2xl">
          <h1 className="text-xl font-bold text-white mb-6">Neue Veranstaltung</h1>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Titel *</label>
              <input
                type="text"
                required
                value={form.titel}
                onChange={(e) => setForm((f) => ({ ...f, titel: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Beschreibung</label>
              <textarea
                value={form.beschreibung}
                onChange={(e) => setForm((f) => ({ ...f, beschreibung: e.target.value }))}
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Von *</label>
                <input
                  type="datetime-local"
                  required
                  value={form.datum_von}
                  onChange={(e) => setForm((f) => ({ ...f, datum_von: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Bis *</label>
                <input
                  type="datetime-local"
                  required
                  value={form.datum_bis}
                  onChange={(e) => setForm((f) => ({ ...f, datum_bis: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Ort</label>
              <input
                type="text"
                value={form.ort}
                onChange={(e) => setForm((f) => ({ ...f, ort: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Adresse</label>
              <textarea
                value={form.adresse}
                onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))}
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"
              >
                {saving ? '…' : 'Anlegen'}
              </button>
              <Link
                to="/veranstaltung"
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Abbrechen
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Veranstaltung nicht gefunden.</p>
        <Link to="/veranstaltung" className="text-blue-400 hover:underline mt-2 inline-block">
          Zur Liste
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/veranstaltung"
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" />
        Zurück
      </Link>

      {/* Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {editMode ? (
              <input
                type="text"
                value={form.titel}
                onChange={(e) => setForm((f) => ({ ...f, titel: e.target.value }))}
                className="text-xl font-bold bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white w-full max-w-md"
              />
            ) : (
              <h1 className="text-2xl font-bold text-white">{data.titel}</h1>
            )}
            <div className="flex flex-wrap items-center gap-4 mt-2 text-gray-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDatum(data.datum_von)} – {formatDatum(data.datum_bis)}
              </span>
              {data.ort && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {data.ort}
                </span>
              )}
              {data.zammad_ticket_number && (
                <span className="text-blue-400">Zammad #{data.zammad_ticket_number}</span>
              )}
            </div>
            {editMode && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Von</label>
                  <input
                    type="datetime-local"
                    value={form.datum_von}
                    onChange={(e) => setForm((f) => ({ ...f, datum_von: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Bis</label>
                  <input
                    type="datetime-local"
                    value={form.datum_bis}
                    onChange={(e) => setForm((f) => ({ ...f, datum_bis: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Ort</label>
                  <input
                    type="text"
                    value={form.ort}
                    onChange={(e) => setForm((f) => ({ ...f, ort: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex px-2 py-1 rounded text-sm font-medium ${
                data.status === 'planung'
                  ? 'bg-gray-500/20 text-gray-400'
                  : data.status === 'abgesagt'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {STATUS_LABELS[data.status] || data.status}
            </span>
            {!editMode ? (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
              >
                <Pen className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm"
                >
                  <Save className="w-4 h-4" />
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={() => { setEditMode(false); setForm({ ...form, ...data }); }}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
        {data.beschreibung && (
          <p className="mt-4 text-gray-300 whitespace-pre-wrap">{data.beschreibung}</p>
        )}
      </div>

      {/* Zuweisungen */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <User className="w-5 h-5" />
          Zuweisungen
        </h2>
        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={newZuweisung}
            onChange={(e) => setNewZuweisung(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white min-w-[200px]"
          >
            <option value="">Benutzer wählen…</option>
            {benutzer.map((u) => (
              <option key={u.id} value={u.keycloak_id}>
                {u.username || u.email || u.keycloak_id}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addZuweisung}
            disabled={!newZuweisung}
            className="inline-flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Hinzufügen
          </button>
        </div>
        <ul className="space-y-2">
          {(data.zuweisungen || []).map((z) => (
            <li
              key={z.id}
              className="flex items-center justify-between py-2 px-3 bg-gray-800 rounded-lg"
            >
              <span className="text-white">
                {z.user_username || z.user_email || z.user_keycloak_id}
                <span className="text-gray-500 text-sm ml-2">
                  {ROLLEN_LABELS[z.rolle] || z.rolle}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeZuweisung(z.user_keycloak_id)}
                className="text-gray-400 hover:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {(!data.zuweisungen || data.zuweisungen.length === 0) && (
            <li className="text-gray-500 text-sm">Keine Zuweisungen</li>
          )}
        </ul>
      </section>

      {/* Checkliste */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <CheckSquare className="w-5 h-5" />
          Checkliste
        </h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Punkt hinzufügen…"
            value={newCheckItem}
            onChange={(e) => setNewCheckItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCheckItem())}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500"
          />
          <button
            type="button"
            onClick={addCheckItem}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <ul className="space-y-2">
          {(data.checkliste || []).map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 py-2 px-3 bg-gray-800 rounded-lg"
            >
              <button
                type="button"
                onClick={() => toggleCheckItem(item.id, !item.erledigt)}
                className="flex-shrink-0"
              >
                <CheckSquare
                  className={`w-5 h-5 ${item.erledigt ? 'text-green-500' : 'text-gray-500'}`}
                />
              </button>
              <span
                className={`flex-1 ${item.erledigt ? 'text-gray-500 line-through' : 'text-white'}`}
              >
                {item.titel}
              </span>
              <button
                type="button"
                onClick={() => deleteCheckItem(item.id)}
                className="text-gray-400 hover:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {(!data.checkliste || data.checkliste.length === 0) && (
            <li className="text-gray-500 text-sm">Keine Punkte</li>
          )}
        </ul>
      </section>

      {/* Notizen */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <MessageSquare className="w-5 h-5" />
          Notizen
        </h2>
        <div className="flex gap-2 mb-4">
          <textarea
            placeholder="Notiz hinzufügen…"
            value={newNotiz}
            onChange={(e) => setNewNotiz(e.target.value)}
            rows={2}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500"
          />
          <button
            type="button"
            onClick={addNotiz}
            disabled={!newNotiz.trim()}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg self-end"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <ul className="space-y-3">
          {(data.notizen || []).map((n) => (
            <li key={n.id} className="py-2 px-3 bg-gray-800 rounded-lg">
              <p className="text-white whitespace-pre-wrap">{n.text}</p>
              <p className="text-xs text-gray-500 mt-1">
                {n.created_by_username || 'Unbekannt'} · {formatDatum(n.created_at)}
              </p>
            </li>
          ))}
          {(!data.notizen || data.notizen.length === 0) && (
            <li className="text-gray-500 text-sm">Keine Notizen</li>
          )}
        </ul>
      </section>

      {/* Anhänge */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <Paperclip className="w-5 h-5" />
          Anhänge
        </h2>
        <form onSubmit={addAnhang} className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            placeholder="Name"
            value={newAnhangName}
            onChange={(e) => setNewAnhangName(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 w-32"
          />
          <input
            type="url"
            placeholder="URL (optional)"
            value={newAnhangUrl}
            onChange={(e) => setNewAnhangUrl(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 flex-1 min-w-[120px]"
          />
          <input
            type="file"
            onChange={(e) => setNewAnhangFile(e.target.files?.[0] || null)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm max-w-[200px]"
          />
          <button
            type="submit"
            disabled={addingAnhang || (!newAnhangName.trim() && !newAnhangFile)}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg"
          >
            {addingAnhang ? '…' : (<><Plus className="w-4 h-4 inline mr-1" /><span>Hinzufügen</span></>)}
          </button>
        </form>
        <ul className="space-y-2">
          {(data.anhaenge || []).map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between py-2 px-3 bg-gray-800 rounded-lg"
            >
              <a
                href={a.datei_url || a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                {a.name}
              </a>
              <button
                type="button"
                onClick={() => deleteAnhang(a.id)}
                className="text-gray-400 hover:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {(!data.anhaenge || data.anhaenge.length === 0) && (
            <li className="text-gray-500 text-sm">Keine Anhänge</li>
          )}
        </ul>
      </section>

      {/* Erinnerungen */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <Bell className="w-5 h-5" />
          Erinnerungen
        </h2>
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="number"
            min={1}
            value={newErinnerung.zeit_vorher}
            onChange={(e) =>
              setNewErinnerung((prev) => ({ ...prev, zeit_vorher: parseInt(e.target.value, 10) || 1 }))
            }
            className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-center"
          />
          <select
            value={newErinnerung.einheit}
            onChange={(e) =>
              setNewErinnerung((prev) => ({ ...prev, einheit: e.target.value }))
            }
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
          >
            {Object.entries(EINHEIT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <span className="py-2 text-gray-400">vorher</span>
          <button
            type="button"
            onClick={addErinnerung}
            className="inline-flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Hinzufügen
          </button>
        </div>
        <ul className="space-y-2">
          {(data.erinnerungen || []).map((er) => (
            <li
              key={er.id}
              className="flex items-center justify-between py-2 px-3 bg-gray-800 rounded-lg"
            >
              <span className="text-white">
                {er.zeit_vorher} {EINHEIT_LABELS[er.einheit] || er.einheit} vorher
                {er.gesendet && <span className="text-gray-500 text-sm ml-2">(gesendet)</span>}
              </span>
              {!er.gesendet && (
                <button
                  type="button"
                  onClick={() => deleteErinnerung(er.id)}
                  className="text-gray-400 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
          {(!data.erinnerungen || data.erinnerungen.length === 0) && (
            <li className="text-gray-500 text-sm">Keine Erinnerungen</li>
          )}
        </ul>
      </section>
    </div>
  );
}
