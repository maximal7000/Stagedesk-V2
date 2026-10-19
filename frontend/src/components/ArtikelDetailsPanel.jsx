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
    <div className="bg-canvas p-3 space-y-3">
      {artikel.beschreibung && (
        <div className="text-sm border-b border-line-subtle pb-2">
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
            className={`inline-flex items-center gap-1 px-2 py-1 border-b-2 ${
              tab === v ? 'bg-raised text-fg border-accent' : 'border-transparent text-fg-muted hover:text-fg'
            }`}>
            <Icon className="w-3 h-3" /> {l}
          </button>
        ))}
      </div>

      {tab === 'kommentare' && (
        <div className="space-y-2">
          {kommentare.length === 0 ? (
            <p className="text-xs text-fg-subtle">Noch keine Kommentare.</p>
          ) : (
            <ul className="space-y-1.5">
              {kommentare.map((k) => (
                <li key={k.id} className="flex items-start gap-2 text-sm bg-surface rounded-md px-2 py-1.5">
                  <div className="flex-1">
                    <div className="text-xs text-fg-subtle">
                      {k.user_username} · {new Date(k.erstellt_am).toLocaleString('de-DE')}
                    </div>
                    <div className="text-fg whitespace-pre-wrap">{k.text}</div>
                  </div>
                  <button onClick={() => removeKomm(k.id)}
                    className="text-fg-subtle hover:text-bad rounded-sm" title="Löschen" aria-label="Kommentar löschen">
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
              className="flex-1 px-2 py-1 text-sm bg-raised border border-line rounded-md text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none" />
            <button onClick={addKomm} disabled={!newKommentar.trim()}
              className="px-3 py-1 bg-accent hover:bg-accent-hover disabled:bg-raised disabled:text-fg-disabled disabled:pointer-events-none text-white text-sm rounded-md">
              Senden
            </button>
          </div>
        </div>
      )}

      {tab === 'verlauf' && (
        <div>
          {verlauf.length === 0 ? (
            <p className="text-xs text-fg-subtle">Noch keine Änderungen protokolliert.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {verlauf.map((e) => (
                <li key={e.id} className="flex gap-2 items-start">
                  <span className="text-fg-subtle shrink-0 tabular-nums">
                    {new Date(e.timestamp).toLocaleString('de-DE', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className="text-fg-muted shrink-0">{AKTION_LABEL[e.aktion] || e.aktion}</span>
                  <span className="text-fg">{e.entity_name}</span>
                  <span className="text-fg-subtle ml-auto">{e.user_username}</span>
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
                className="inline-flex items-center gap-1 text-info hover:text-fg text-sm">
                <ExternalLink className="w-3 h-3" /> Quittung öffnen
              </a>
              {canEdit && (
                <button onClick={removeQuittung}
                  className="text-fg-subtle hover:text-bad text-sm inline-flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" /> Entfernen
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-fg-subtle">Keine eigene Quittung hochgeladen.</p>
          )}

          {/* Sammel-Quittungen */}
          {(artikel.sammelquittungen || []).length > 0 && (
            <div className="pt-2 border-t border-line-subtle">
              <p className="text-[11px] text-fg-subtle mb-1">Geteilte Quittungen:</p>
              <ul className="space-y-1">
                {artikel.sammelquittungen.map(q => (
                  <li key={q.id}>
                    <a href={MEDIA_BASE + q.datei_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-info hover:text-fg text-sm">
                      <ExternalLink className="w-3 h-3" /> {q.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canEdit && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-raised hover:bg-hover text-fg text-sm rounded-md cursor-pointer">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                Foto aufnehmen
                <input type="file" className="hidden"
                  accept="image/*" capture="environment"
                  onChange={(e) => uploadQuittung(e.target.files?.[0])} />
              </label>
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-raised hover:bg-hover text-fg text-sm rounded-md cursor-pointer">
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
