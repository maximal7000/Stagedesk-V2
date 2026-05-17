/**
 * Discord-Integration: Channel + Event + Info-Nachricht.
 * Modell: User wählt Soll-Zustand (Switches), klickt dann auf Synchronisieren.
 */
import { useState, useEffect } from 'react';
import { Hash, Loader2, RefreshCw, Megaphone, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';

function Toggle({ checked, onChange, disabled }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)} disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <span className={`inline-block h-3.5 w-3.5 bg-white rounded-full transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-1'
      }`} />
    </button>
  );
}

export default function DiscordSection({ data, refetch, canEdit, eventId }) {
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Lokale Soll-Werte (Toggles) — werden gegen den letzten gespeicherten
  // Soll-Wert geprüft, damit "Synchronisieren" erst klickbar ist wenn was geändert wurde.
  const [draftChannel, setDraftChannel] = useState(false);
  const [draftEvent, setDraftEvent] = useState(false);

  const loadStatus = async () => {
    try {
      const r = await apiClient.get(`/veranstaltung/${eventId}/discord-status`);
      setStatus(r.data);
      setDraftChannel(!!r.data.channel_aktiv);
      setDraftEvent(!!r.data.event_aktiv);
      setDirty(false);
    } catch {}
  };

  useEffect(() => { if (eventId) loadStatus(); /* eslint-disable-next-line */ }, [eventId]);

  const onToggleChannel = (v) => { setDraftChannel(v); setDirty(true); };
  const onToggleEvent = (v) => { setDraftEvent(v); setDirty(true); };

  const handleSync = async () => {
    if (!canEdit) return;
    setSyncing(true);
    try {
      // Erst Soll-Zustände speichern, dann sync triggern
      await apiClient.post(`/veranstaltung/${eventId}/discord-toggles`, {
        channel_aktiv: draftChannel,
        event_aktiv: draftEvent,
      });
      const r = await apiClient.post(`/veranstaltung/${eventId}/discord-sync`);
      setStatus(r.data);
      setDirty(false);
      const acts = r.data?.actions || [];
      if (acts.length) toast.success(`Discord: ${acts.join(', ')}`);
      else toast.success('Discord ist auf Stand');
      refetch?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Sync fehlgeschlagen');
    } finally { setSyncing(false); }
  };

  if (!canEdit && !status?.channel_aktiv && !status?.event_aktiv && !status?.info_aktiv) return null;

  return (
    <CollapsibleSection icon={Hash} title="Discord" defaultOpen={false}>
      <div className="space-y-4">
        {/* Toggles */}
        <ul className="divide-y divide-gray-800 bg-gray-800/40 rounded-lg overflow-hidden">
          <li className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-indigo-400" />
              <div>
                <div className="text-sm text-white">Text-Channel</div>
                <p className="text-xs text-gray-500">
                  Privater Channel für alle Zugewiesenen
                  {status?.channel_id && <span className="ml-1 text-green-400">· angelegt</span>}
                </p>
              </div>
            </div>
            <Toggle checked={draftChannel} onChange={onToggleChannel} disabled={!canEdit} />
          </li>
          <li className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <CalendarPlus className="w-4 h-4 text-indigo-400" />
              <div>
                <div className="text-sm text-white">Scheduled Event</div>
                <p className="text-xs text-gray-500">
                  Erscheint in der Server-Eventliste
                  {status?.event_id && <span className="ml-1 text-green-400">· angelegt</span>}
                </p>
              </div>
            </div>
            <Toggle checked={draftEvent} onChange={onToggleEvent} disabled={!canEdit} />
          </li>
          <li className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-indigo-400" />
              <div>
                <div className="text-sm text-white">Info-Nachricht</div>
                <p className="text-xs text-gray-500">
                  Wird im Info-Channel gepostet wenn Channel oder Event aktiv ist.
                  {status?.info_aktiv && <span className="ml-1 text-green-400">· gepostet</span>}
                  {!status?.info_konfiguriert && <span className="ml-1 text-yellow-500">· DISCORD_INFO_CHANNEL_ID fehlt</span>}
                </p>
              </div>
            </div>
            <Toggle checked={!!status?.info_aktiv} disabled />
          </li>
        </ul>

        <div className="flex items-center gap-2">
          <button type="button" onClick={handleSync} disabled={!canEdit || syncing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Synchronisieren
          </button>
          {dirty && <span className="text-xs text-amber-400">Änderungen werden erst beim Sync angewandt</span>}
        </div>
      </div>
    </CollapsibleSection>
  );
}
