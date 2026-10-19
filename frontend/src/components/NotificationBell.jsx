/**
 * Glocken-Icon mit Badge + Dropdown der letzten 8 Benachrichtigungen.
 * Pollt /users/me/notifications/count alle 60 s.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, ExternalLink, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/api';

const KIND_DOT = {
  zuweisung: 'bg-accent',
  mahnung: 'bg-bad',
  erinnerung: 'bg-warn',
  kompetenz: 'bg-info',
  deadline: 'bg-bad',
  konflikt: 'bg-bad',
  info: 'bg-fg-subtle',
  system: 'bg-fg-subtle',
};

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso); const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'jetzt';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const fetchCount = useCallback(async () => {
    try {
      const r = await apiClient.get('/users/me/notifications/count');
      setUnread(r.data?.unread || 0);
    } catch {}
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/users/me/notifications', { params: { limit: 8 } });
      setItems(r.data?.items || []);
      setUnread(r.data?.unread || 0);
    } catch { setItems([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchCount();
    const t = setInterval(fetchCount, 60000);
    return () => clearInterval(t);
  }, [fetchCount]);

  useEffect(() => {
    if (open) fetchItems();
  }, [open, fetchItems]);

  // Click-outside schließt
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const onItemClick = async (n) => {
    try { await apiClient.post(`/users/me/notifications/${n.id}/read`); } catch {}
    setOpen(false);
    if (n.link) navigate(n.link);
    fetchCount();
  };

  const markAllRead = async () => {
    try {
      await apiClient.post('/users/me/notifications/read-all');
      setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
      setUnread(0);
    } catch {}
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-fg-muted hover:text-fg hover:bg-raised rounded-md"
        title="Benachrichtigungen">
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-accent text-white text-[10px] font-bold rounded-full ring-2 ring-surface flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-overlay border border-line rounded-lg shadow-overlay z-50 max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line-subtle">
            <h3 className="font-semibold text-fg text-sm">Benachrichtigungen</h3>
            {unread > 0 && (
              <button onClick={markAllRead}
                className="text-xs text-fg-muted hover:text-fg inline-flex items-center gap-1 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <Check className="w-3 h-3" /> Alle gelesen
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-fg-subtle" /></div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center text-center py-8 px-6">
                <Bell className="w-5 h-5 text-fg-subtle mb-2" />
                <p className="text-sm text-fg-muted">Keine Benachrichtigungen</p>
              </div>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {items.map((n) => (
                  <li key={n.id}>
                    <button onClick={() => onItemClick(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-raised`}>
                      <div className="flex items-start gap-2">
                        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${KIND_DOT[n.kind] || 'bg-fg-subtle'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                            <span className={`text-sm truncate ${n.is_read ? 'text-fg-muted' : 'text-fg font-medium'}`}>
                              {n.title}
                            </span>
                            {n.link && <ExternalLink className="w-3 h-3 text-fg-subtle shrink-0" />}
                          </div>
                          {n.body && <p className="text-xs text-fg-subtle mt-0.5 line-clamp-2">{n.body}</p>}
                          <div className="text-[11px] text-fg-subtle mt-1 tabular-nums">{formatTime(n.created_at)}</div>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-line-subtle px-4 py-2">
            <button onClick={() => { setOpen(false); navigate('/notifications'); }}
              className="w-full text-center text-xs font-medium text-fg-muted hover:text-fg py-1 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Alle Benachrichtigungen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
