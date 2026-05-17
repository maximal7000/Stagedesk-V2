/**
 * Klappt sich unter einer Artikel-Zeile auf — zeigt Beschreibung,
 * Kommentare, Verlauf und Quittungs-Upload.
 */
import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, History, Receipt, Trash2, Upload, ExternalLink, Loader2, Camera } from 'lucide-react';
import apiClient from '../lib/api';
import Markdown from './Markdown';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const MEDIA_BASE = API_BASE.replace(/\/api\/?$/, '');

const AKTION_LABEL = {
  status_geaendert: 'Status',
  aktualisiert: 'Aktualisiert',
  erstellt: 'Erstellt',
  geloescht: 'Gelöscht',
};

export default function ArtikelDetailsPanel({ haushaltId, artikel, canEdit, onRefresh }) {
  const [tab, setTab] = useState('kommentare');
  const [kommentare, setKommentare] = useState([]);
  const [verlauf, setVerlauf] = useState([]);
  const [newKommentar, setNewKommentar] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadKomm = useCallback(async () => {
    try {
      const r = await apiClient.get(`/haushalte/${haushaltId}/artikel/${artikel.id}/kommentare`);
      setKommentare(r.data || []);
    } catch { setKommentare([]); }
  }, [haushaltId, artikel.id]);

  const loadVerlauf = useCallback(async () => {
    try {
      const r = await apiClient.get(`/haushalte/${haushaltId}/artikel/${artikel.id}/verlauf`);
      setVerlauf(r.data || []);
    } catch { setVerlauf([]); }
  }, [haushaltId, artikel.id]);

  useEffect(() => {
    if (tab === 'kommentare') loadKomm();
    if (tab === 'verlauf') loadVerlauf();
  }, [tab, loadKomm, loadVerlauf]);

  const addKomm = async () => {
    if (!newKommentar.trim()) return;
    try {
      await apiClient.post(`/haushalte/${haushaltId}/artikel/${artikel.id}/kommentare`, {
        text: newKommentar.trim(),
      });
      setNewKommentar(''); loadKomm();
    } catch {}
  };

  const removeKomm = async (id) => {
    try {
      await apiClient.delete(`/haushalte/${haushaltId}/artikel/${artikel.id}/kommentare/${id}`);
      loadKomm();
    } catch {}
  };

  const uploadQuittung = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('datei', file);
      await apiClient.post(`/haushalte/${haushaltId}/artikel/${artikel.id}/quittung`, fd);
      onRefresh?.();
    } catch {} finally { setUploading(false); }
  };

  const removeQuittung = async () => {
    if (!confirm('Quittung wirklich entfernen?')) return;
    try {
      await apiClient.delete(`/haushalte/${haushaltId}/artikel/${artikel.id}/quittung`);
      onRefresh?.();
    } catch {}
  };

  return (
    <div className="bg-gray-900/60 p-3 space-y-3">
      {artikel.beschreibung && (
        <div className="text-sm border-b border-gray-800 pb-2">
          <Markdown>{artikel.beschreibung}</Markdown>
        </div>
      )}

      {/* Tab-Buttons */}
      <div className="flex gap-1 text-xs">
        {[
          { v: 'kommentare', l: 'Kommentare', icon: MessageSquare },
          { v: 'verlauf',    l: 'Verlauf',    icon: History },
          { v: 'quittung',   l: 'Quittung',   icon: Receipt },
        ].map(({ v, l, icon: Icon }) => (
          <button key={v} onClick={() => setTab(v)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded ${
              tab === v ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}>
            <Icon className="w-3 h-3" /> {l}
          </button>
        ))}
      </div>

      {tab === 'kommentare' && (
        <div className="space-y-2">
          {kommentare.length === 0 ? (
            <p className="text-xs text-gray-500">Noch keine Kommentare.</p>
          ) : (
            <ul className="space-y-1.5">
              {kommentare.map((k) => (
                <li key={k.id} className="flex items-start gap-2 text-sm bg-gray-800/50 rounded px-2 py-1.5">
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">
                      {k.user_username} · {new Date(k.erstellt_am).toLocaleString('de-DE')}
                    </div>
                    <div className="text-gray-200 whitespace-pre-wrap">{k.text}</div>
                  </div>
                  <button onClick={() => removeKomm(k.id)}
                    className="text-gray-500 hover:text-red-400" title="Löschen">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-1.5">
            <input type="text" value={newKommentar}
              onChange={(e) => setNewKommentar(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addKomm()}
              placeholder="Kommentar schreiben…"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm" />
            <button onClick={addKomm} disabled={!newKommentar.trim()}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded">
              Senden
            </button>
          </div>
        </div>
      )}

      {tab === 'verlauf' && (
        <div>
          {verlauf.length === 0 ? (
            <p className="text-xs text-gray-500">Noch keine Änderungen protokolliert.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {verlauf.map((e) => (
                <li key={e.id} className="flex gap-2 items-start">
                  <span className="text-gray-500 shrink-0 tabular-nums">
                    {new Date(e.timestamp).toLocaleString('de-DE', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className="text-gray-400 shrink-0">{AKTION_LABEL[e.aktion] || e.aktion}</span>
                  <span className="text-white">{e.entity_name}</span>
                  <span className="text-gray-500 ml-auto">{e.user_username}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'quittung' && (
        <div className="space-y-2">
          {artikel.quittung_url ? (
            <div className="flex items-center gap-2">
              <a href={MEDIA_BASE + artikel.quittung_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm">
                <ExternalLink className="w-3 h-3" /> Quittung öffnen
              </a>
              {canEdit && (
                <button onClick={removeQuittung}
                  className="text-gray-500 hover:text-red-400 text-sm inline-flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> Entfernen
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500">Keine Quittung hochgeladen.</p>
          )}
          {canEdit && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded cursor-pointer">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                Foto aufnehmen
                <input type="file" className="hidden"
                  accept="image/*" capture="environment"
                  onChange={(e) => uploadQuittung(e.target.files?.[0])} />
              </label>
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded cursor-pointer">
                <Upload className="w-4 h-4" />
                {artikel.quittung_url ? 'Ersetzen' : 'Hochladen'}
                <input type="file" className="hidden"
                  accept="image/*,.pdf"
                  onChange={(e) => uploadQuittung(e.target.files?.[0])} />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
