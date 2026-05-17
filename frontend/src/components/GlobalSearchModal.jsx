/**
 * Globale Suche (Ctrl+K / Cmd+K). Sucht in Veranstaltungen, Inventar, Anwesenheit,
 * User. Server filtert nach Permissions. Speichert die zuletzt geöffneten
 * Treffer + Favoriten in localStorage, damit man häufig genutzte Ziele bei
 * leerem Eingabefeld sofort sieht.
 */
import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, X, Clock, Star, StarOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/api';

const RECENT_KEY = 'stagedesk:search:recent';
const FAV_KEY    = 'stagedesk:search:favorites';
const MAX_RECENT = 8;

const TYPE_LABEL = {
  veranstaltungen: 'Veranstaltung',
  items: 'Inventar',
  anwesenheit: 'Anwesenheit',
  user: 'User',
};

function loadList(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function saveList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch {}
}

export default function GlobalSearchModal({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ veranstaltungen: [], items: [], anwesenheit: [], user: [] });
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState(() => loadList(RECENT_KEY));
  const [favorites, setFavorites] = useState(() => loadList(FAV_KEY));
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults({ veranstaltungen: [], items: [], anwesenheit: [], user: [] });
      // Bei jedem Öffnen aus localStorage neu laden, falls sich in einem
      // anderen Tab etwas geändert hat.
      setRecent(loadList(RECENT_KEY));
      setFavorites(loadList(FAV_KEY));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults({ veranstaltungen: [], items: [], anwesenheit: [], user: [] });
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiClient.get('/search', { params: { q: query.trim() } });
        setResults(res.data);
      } catch {
        setResults({ veranstaltungen: [], items: [], anwesenheit: [], user: [] });
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const itemKey = (entry) => `${entry.type}:${entry.id}`;

  const pushRecent = (entry) => {
    const key = itemKey(entry);
    const next = [{ ...entry, ts: Date.now() }, ...recent.filter((e) => itemKey(e) !== key)].slice(0, MAX_RECENT);
    setRecent(next);
    saveList(RECENT_KEY, next);
  };

  const toggleFavorite = (entry) => {
    const key = itemKey(entry);
    const exists = favorites.some((f) => itemKey(f) === key);
    const next = exists
      ? favorites.filter((f) => itemKey(f) !== key)
      : [{ ...entry, ts: Date.now() }, ...favorites];
    setFavorites(next);
    saveList(FAV_KEY, next);
  };

  const isFavorite = (entry) => favorites.some((f) => itemKey(f) === itemKey(entry));

  const go = (entry) => {
    pushRecent(entry);
    onClose();
    navigate(entry.path);
  };

  if (!open) return null;

  const hasResults = ['veranstaltungen', 'items', 'anwesenheit', 'user']
    .some((k) => (results[k] || []).length > 0);
  const showResults = query.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-20 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[70vh] overflow-hidden flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <Search className="w-5 h-5 text-gray-400" />
          <input ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen — Veranstaltungen, Items, Anwesenheit, User..."
            className="flex-1 bg-transparent text-white outline-none placeholder-gray-500" />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          {!showResults ? (
            <RecentFavorites recent={recent} favorites={favorites}
              onPick={go} onToggleFav={toggleFavorite} isFavorite={isFavorite} />
          ) : !hasResults && !loading ? (
            <div className="p-6 text-center text-gray-500 text-sm">Keine Treffer</div>
          ) : (
            <ResultGroups results={results} onPick={go} onToggleFav={toggleFavorite} isFavorite={isFavorite} />
          )}
        </div>
      </div>
    </div>
  );
}

function RecentFavorites({ recent, favorites, onPick, onToggleFav, isFavorite }) {
  if (recent.length === 0 && favorites.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500 text-sm">
        Mindestens 2 Zeichen eingeben — oder öffne ein Ergebnis, um es hier wiederzufinden.
      </div>
    );
  }
  return (
    <div className="py-2">
      {favorites.length > 0 && (
        <Group title="Favoriten" icon={Star}>
          {favorites.map((e) => (
            <Row key={`fav-${e.type}-${e.id}`} entry={e}
              onClick={() => onPick(e)} onToggleFav={onToggleFav} isFavorite={isFavorite(e)} />
          ))}
        </Group>
      )}
      {recent.length > 0 && (
        <Group title="Zuletzt" icon={Clock}>
          {recent.map((e) => (
            <Row key={`rec-${e.type}-${e.id}`} entry={e}
              onClick={() => onPick(e)} onToggleFav={onToggleFav} isFavorite={isFavorite(e)} />
          ))}
        </Group>
      )}
    </div>
  );
}

function ResultGroups({ results, onPick, onToggleFav, isFavorite }) {
  const mk = (type, fn) => (results[type] || []).map(fn);
  const v = mk('veranstaltungen', (x) => ({
    type: 'veranstaltungen', id: x.id, title: x.titel,
    sub: [x.ort, x.datum_von ? new Date(x.datum_von).toLocaleDateString('de-DE') : null].filter(Boolean).join(' · '),
    path: `/veranstaltung/${x.id}`,
  }));
  const i = mk('items', (x) => ({ type: 'items', id: x.id, title: x.name, sub: x.kategorie, path: `/inventar/${x.id}` }));
  const a = mk('anwesenheit', (x) => ({ type: 'anwesenheit', id: x.id, title: x.titel, sub: x.status, path: `/anwesenheit/${x.id}` }));
  const u = mk('user', (x) => ({ type: 'user', id: x.id, title: x.name, sub: x.email, path: '/admin' }));

  return (
    <div className="py-2">
      <Group title="Veranstaltungen">
        {v.map((e) => <Row key={`v-${e.id}`} entry={e} onClick={() => onPick(e)} onToggleFav={onToggleFav} isFavorite={isFavorite(e)} />)}
      </Group>
      <Group title="Inventar">
        {i.map((e) => <Row key={`i-${e.id}`} entry={e} onClick={() => onPick(e)} onToggleFav={onToggleFav} isFavorite={isFavorite(e)} />)}
      </Group>
      <Group title="Anwesenheit">
        {a.map((e) => <Row key={`a-${e.id}`} entry={e} onClick={() => onPick(e)} onToggleFav={onToggleFav} isFavorite={isFavorite(e)} />)}
      </Group>
      <Group title="User">
        {u.map((e) => <Row key={`u-${e.id}`} entry={e} onClick={() => onPick(e)} onToggleFav={onToggleFav} isFavorite={isFavorite(e)} />)}
      </Group>
    </div>
  );
}

function Group({ title, icon: Icon, children }) {
  const arr = Array.isArray(children) ? children : [children];
  const empty = arr.filter(Boolean).length === 0;
  if (empty) return null;
  return (
    <div className="py-2">
      <div className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />} {title}
      </div>
      {children}
    </div>
  );
}

function Row({ entry, onClick, onToggleFav, isFavorite }) {
  return (
    <div className="w-full px-4 py-2 hover:bg-gray-800 flex items-center justify-between gap-2 group">
      <button onClick={onClick} className="flex-1 text-left min-w-0">
        <div className="text-white truncate">{entry.title}</div>
        <div className="text-xs text-gray-500 truncate">
          <span className="text-gray-600">{TYPE_LABEL[entry.type] || ''}</span>
          {entry.sub && <span> · {entry.sub}</span>}
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFav(entry); }}
        title={isFavorite ? 'Favorit entfernen' : 'Als Favorit speichern'}
        className={`p-1 rounded ${
          isFavorite ? 'text-yellow-400' : 'text-gray-600 opacity-0 group-hover:opacity-100 hover:text-yellow-400'
        }`}>
        {isFavorite ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
      </button>
    </div>
  );
}
