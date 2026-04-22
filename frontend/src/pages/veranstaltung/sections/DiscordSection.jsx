import { useState } from 'react';
import { Hash, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';

export default function DiscordSection({ data, refetch, canEdit, eventId }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    setSyncing(true); setResult(null);
    try {
      const res = await apiClient.post(`/veranstaltung/${eventId}/discord/sync`);
      setResult(res.data);
      if (res.data.success) { toast.success(`Discord synchronisiert (${res.data.synced_users} User)`); refetch(); }
      else toast.error(res.data.error || 'Discord-Sync fehlgeschlagen');
    } catch (err) { toast.error(err.response?.data?.detail || 'Discord-Sync fehlgeschlagen'); }
    finally { setSyncing(false); }
  };

  const handleCleanup = async () => {
    try { await apiClient.delete(`/veranstaltung/${eventId}/discord`); toast.success('Discord Event & Channel entfernt'); setResult(null); refetch(); }
    catch { toast.error('Discord-Cleanup fehlgeschlagen'); }
  };

  if (!canEdit && !data?.discord_event_id && !data?.discord_channel_id) return null;

  return (
    <CollapsibleSection icon={Hash} title="Discord" defaultOpen={false}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {data?.discord_event_id ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">Event aktiv</span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-500/20 text-gray-400 rounded text-xs">Kein Event</span>
          )}
          {data?.discord_channel_id ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">Channel aktiv</span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-500/20 text-gray-400 rounded text-xs">Kein Channel</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleSync} disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4" />}
            {data?.discord_event_id ? 'Discord aktualisieren' : 'Discord erstellen'}
          </button>
          {(data?.discord_event_id || data?.discord_channel_id) && (
            <button type="button" onClick={handleCleanup}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm">
              <Trash2 className="w-4 h-4" /> Discord entfernen
            </button>
          )}
        </div>
        {result?.errors?.length > 0 && (
          <div className="mt-2 p-3 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
            <p className="flex items-center gap-1.5 text-yellow-400 text-sm font-medium mb-1">
              <AlertTriangle className="w-4 h-4" /> Fehlende Discord-IDs:
            </p>
            <ul className="text-sm text-yellow-300/80 space-y-0.5">
              {result.errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
