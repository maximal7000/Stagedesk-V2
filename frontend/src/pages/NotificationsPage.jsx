/**
 * Vollständige Liste aller Benachrichtigungen mit Filter (alle/ungelesen).
 */
import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/api';

const KIND_LABEL = {
  zuweisung: 'Zuweisung', mahnung: 'Mahnung', erinnerung: 'Erinnerung',
  kompetenz: 'Kompetenz', deadline: 'Deadline', konflikt: 'Konflikt',
  info: 'Info', system: 'System',
};

const KIND_CLASS = {
  zuweisung: 'bg-blue-500/20 text-blue-400',
  mahnung: 'bg-orange-500/20 text-orange-400',
  erinnerung: 'bg-amber-500/20 text-amber-400',
  kompetenz: 'bg-purple-500/20 text-purple-400',
  deadline: 'bg-red-500/20 text-red-400',
  konflikt: 'bg-red-500/20 text-red-400',
  info: 'bg-gray-500/20 text-gray-400',
  system: 'bg-gray-500/20 text-gray-400',
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
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-400" />
          <h1 className="text-2xl font-bold text-white">Benachrichtigungen</h1>
          {unread > 0 && <span className="text-sm text-blue-400">{unread} ungelesen</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setOnlyUnread((v) => !v)}
            className={`px-3 py-1.5 text-sm rounded-lg ${
              onlyUnread ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}>
            {onlyUnread ? 'Nur ungelesen' : 'Alle'}
          </button>
          {unread > 0 && (
            <button onClick={markAllRead}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-white rounded-lg inline-flex items-center gap-1">
              <Check className="w-4 h-4" /> Alle gelesen
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : items.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center text-gray-500">
          Keine Benachrichtigungen
        </div>
      ) : (
        <ul className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800 overflow-hidden">
          {items.map((n) => (
            <li key={n.id}
              className={`flex items-start gap-3 p-4 hover:bg-gray-800/40 ${n.is_read ? '' : 'bg-blue-500/5'}`}>
              <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${KIND_CLASS[n.kind] || 'bg-gray-500/20 text-gray-400'}`}>
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
                <div className="text-xs text-gray-600 mt-1">
                  {n.created_at ? new Date(n.created_at).toLocaleString('de-DE') : ''}
                </div>
              </button>
              <button onClick={() => remove(n)}
                className="p-1 text-gray-500 hover:text-red-400" title="Löschen">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
