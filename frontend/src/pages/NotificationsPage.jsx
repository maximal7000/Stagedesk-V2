/**
 * Vollständige Liste aller Benachrichtigungen mit Filter (alle/ungelesen).
 */
import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/api';
import { PageHeader, Button, EmptyState, StatusBadge } from '../components/ui';

const KIND_LABEL = {
  zuweisung: 'Zuweisung', mahnung: 'Mahnung', erinnerung: 'Erinnerung',
  kompetenz: 'Kompetenz', deadline: 'Deadline', konflikt: 'Konflikt',
  info: 'Info', system: 'System',
};

// Töne für StatusBadge (semantisch: rot = dringend, gelb = Erinnerung)
const KIND_TONE = {
  zuweisung: 'accent', mahnung: 'danger', erinnerung: 'warning',
  kompetenz: 'info', deadline: 'danger', konflikt: 'danger',
  info: 'neutral', system: 'neutral',
};

function FilterTab({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'
      }`}>
      {children}
    </button>
  );
}

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/users/me/notifications', {
        params: { only_unread: onlyUnread, limit: 200 },
      });
      setItems(r.data?.items || []);
      setUnread(r.data?.unread || 0);
    } catch { setItems([]); } finally { setLoading(false); }
  }, [onlyUnread]);

  useEffect(() => { load(); }, [load]);

  const open = async (n) => {
    if (!n.is_read) {
      try { await apiClient.post(`/users/me/notifications/${n.id}/read`); } catch {}
    }
    if (n.link) navigate(n.link);
  };

  const remove = async (n) => {
    try {
      await apiClient.delete(`/users/me/notifications/${n.id}`);
      setItems((prev) => prev.filter((i) => i.id !== n.id));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await apiClient.post('/users/me/notifications/read-all');
      setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
      setUnread(0);
    } catch {}
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Benachrichtigungen"
        meta={<span className="tabular-nums">{unread > 0 ? `${unread} ungelesen` : 'Alles gelesen'}</span>}
        actions={
          <>
            <div className="flex items-center gap-0.5 p-0.5 bg-gray-800/60 border border-gray-700 rounded-lg">
              <FilterTab active={!onlyUnread} onClick={() => setOnlyUnread(false)}>Alle</FilterTab>
              <FilterTab active={onlyUnread} onClick={() => setOnlyUnread(true)}>Ungelesen</FilterTab>
            </div>
            {unread > 0 && (
              <Button variant="secondary" icon={Check} onClick={markAllRead}>
                Alle gelesen
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : items.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          {onlyUnread ? (
            <EmptyState icon={Check} title="Alles gelesen"
              description="Es gibt keine ungelesenen Benachrichtigungen."
              action={<Button variant="secondary" onClick={() => setOnlyUnread(false)}>Alle anzeigen</Button>} />
          ) : (
            <EmptyState icon={Bell} title="Keine Benachrichtigungen"
              description="Neue Zuweisungen, Erinnerungen und Hinweise erscheinen hier." />
          )}
        </div>
      ) : (
        <ul className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800 overflow-hidden">
          {items.map((n) => (
            <li key={n.id}
              className={`group relative flex items-start gap-3 p-4 transition-colors hover:bg-gray-800/40 ${n.is_read ? '' : 'bg-accent/[0.04]'}`}>
              <span className="shrink-0 w-24 pt-0.5">
                <StatusBadge tone={KIND_TONE[n.kind] || 'neutral'} label={KIND_LABEL[n.kind] || n.kind} />
              </span>
              <button onClick={() => open(n)} className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
                <div className="flex items-center gap-2">
                  {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-label="ungelesen" />}
                  <span className={`truncate ${n.is_read ? 'text-gray-300' : 'text-white font-semibold'}`}>
                    {n.title}
                  </span>
                  {n.link && <ExternalLink className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                </div>
                {n.body && <p className="text-sm text-gray-400 mt-1 whitespace-pre-wrap">{n.body}</p>}
                <div className="text-xs text-gray-500 tabular-nums mt-1">
                  {n.created_at ? new Date(n.created_at).toLocaleString('de-DE') : ''}
                </div>
              </button>
              <button onClick={() => remove(n)}
                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-md sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                title="Löschen" aria-label="Benachrichtigung löschen">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
