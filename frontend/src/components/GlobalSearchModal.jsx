/**
 * Globale Suche (Ctrl+K / Cmd+K). Sucht in Veranstaltungen, Inventar, Anwesenheit,
 * User. Server filtert nach Permissions.
 */
import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/api';

export default function GlobalSearchModal({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ veranstaltungen: [], items: [], anwesenheit: [], user: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults({ veranstaltungen: [], items: [], anwesenheit: [], user: [] });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced Search
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

  // Esc schließt
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const go = (path) => { onClose(); navigate(path); };

  if (!open) return null;

  const hasAny = ['veranstaltungen', 'items', 'anwesenheit', 'user']
    .some((k) => (results[k] || []).length > 0);

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
          {query.trim().length < 2 ? (
            <div className="p-6 text-center text-gray-500 text-sm">Mindestens 2 Zeichen eingeben</div>
          ) : !hasAny && !loading ? (
            <div className="p-6 text-center text-gray-500 text-sm">Keine Treffer</div>
          ) : (
            <div className="py-2">
              <Group title="Veranstaltungen">
                {results.veranstaltungen.map((v) => (
                  <Row key={`v-${v.id}`} onClick={() => go(`/veranstaltung/${v.id}`)}
                    title={v.titel}
                    sub={[v.ort, v.datum_von ? new Date(v.datum_von).toLocaleDateString('de-DE') : null].filter(Boolean).join(' · ')} />
                ))}
              </Group>
              <Group title="Inventar">
                {results.items.map((i) => (
                  <Row key={`i-${i.id}`} onClick={() => go(`/inventar/${i.id}`)}
                    title={i.name} sub={i.kategorie} />
                ))}
              </Group>
              <Group title="Anwesenheit">
                {results.anwesenheit.map((a) => (
                  <Row key={`a-${a.id}`} onClick={() => go(`/anwesenheit/${a.id}`)}
                    title={a.titel} sub={a.status} />
                ))}
              </Group>
              <Group title="User">
                {results.user.map((u) => (
                  <Row key={`u-${u.id}`} onClick={() => go('/admin')}
                    title={u.name} sub={u.email} />
                ))}
              </Group>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }) {
  const arr = Array.isArray(children) ? children : [children];
  const empty = arr.filter(Boolean).length === 0;
  if (empty) return null;
  return (
    <div className="py-2">
      <div className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{title}</div>
      {children}
    </div>
  );
}

function Row({ title, sub, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full text-left px-4 py-2 hover:bg-gray-800 flex items-center justify-between">
      <div className="min-w-0">
        <div className="text-white truncate">{title}</div>
        {sub && <div className="text-xs text-gray-500 truncate">{sub}</div>}
      </div>
    </button>
  );
}
