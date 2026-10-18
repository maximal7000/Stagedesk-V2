/**
 * Vollständige Liste aller Benachrichtigungen mit Filter (alle/ungelesen).
 */
import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/api';
import { PageHeader, Button, EmptyState } from '../components/ui';

const KIND_LABEL = {
  zuweisung: 'Zuweisung', mahnung: 'Mahnung', erinnerung: 'Erinnerung',
  kompetenz: 'Kompetenz', deadline: 'Deadline', konflikt: 'Konflikt',
  info: 'Info', system: 'System',
};

const KIND_CLASS = {
  zuweisung: 'bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-500/25',
  mahnung: 'bg-orange-500/15 text-orange-300 ring-1 ring-inset ring-orange-500/25',
  erinnerung: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/25',
  kompetenz: 'bg-purple-500/15 text-purple-300 ring-1 ring-inset ring-purple-500/25',
  deadline: 'bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/25',
  konflikt: 'bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/25',
  info: 'bg-gray-500/15 text-gray-300 ring-1 ring-inset ring-gray-500/25',
  system: 'bg-gray-500/15 text-gray-300 ring-1 ring-inset ring-gray-500/25',
};

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
            <Button
              variant={onlyUnread ? 'primary' : 'secondary'}
              onClick={() => setOnlyUnread((v) => !v)}
            >
              {onlyUnread ? 'Nur ungelesen' : 'Alle'}
            </Button>
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
          <EmptyState icon={Bell} title="Keine Benachrichtigungen"
            description="Neue Zuweisungen, Erinnerungen und Hinweise erscheinen hier." />
        </div>
      ) : (
        <ul className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800 overflow-hidden">
          {items.map((n) => (
            <li key={n.id}
              className={`flex items-start gap-3 p-4 hover:bg-gray-800/40 ${n.is_read ? '' : 'bg-accent/5'}`}>
              <span className={`shrink-0 text-[11px] uppercase font-semibold leading-none tracking-wide px-2 py-[3px] rounded-md ${KIND_CLASS[n.kind] || KIND_CLASS.info}`}>
                {KIND_LABEL[n.kind] || n.kind}
              </span>
              <button onClick={() => open(n)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <span className={`truncate ${n.is_read ? 'text-gray-300' : 'text-white font-medium'}`}>
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
                className="p-1 text-gray-500 hover:text-red-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
