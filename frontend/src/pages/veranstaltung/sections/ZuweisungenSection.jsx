import { useState, useEffect } from 'react';
import { User, UserPlus, Plus, X, Hand, CheckCircle2, AlertTriangle, Award, MessageCircleOff } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';
import { Button } from '../../../components/ui';

export default function ZuweisungenSection({ data, refetch, canEdit, eventId, benutzer, taetigkeitsrollen }) {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [newTaetigkeitId, setNewTaetigkeitId] = useState('');
  const [showAddUsers, setShowAddUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [kandidaten, setKandidaten] = useState(null);
  // Verhindert dass Mehrfach-Klick auf "Hinzufügen" mehrere parallele POSTs
  // auslöst (führte zu doppelten Discord-DMs an die selbe Person).
  const [busy, setBusy] = useState(false);
  // Pro-User-Lock für die Quick-Buttons (gemeldete Personen).
  const [pendingIds, setPendingIds] = useState(new Set());

  const meldungen = data?.meldungen || [];

  // Kandidaten-Liste mit Match-Score und Konflikten laden, sobald Dialog
  // geöffnet wird oder Tätigkeit wechselt.
  useEffect(() => {
    if (!showAddUsers || !eventId) { setKandidaten(null); return; }
    const params = newTaetigkeitId ? { taetigkeit_id: newTaetigkeitId } : {};
    apiClient.get(`/veranstaltung/${eventId}/kandidaten`, { params })
      .then(r => setKandidaten(Array.isArray(r.data) ? r.data : []))
      .catch(() => setKandidaten(null));
  }, [showAddUsers, eventId, newTaetigkeitId]);

  const addZuweisungen = async (userIds = null) => {
    if (busy) return;
    const ids = userIds || selectedUsers;
    if (ids.length === 0) return;
    // Wenn schon irgendeine der IDs gerade läuft, abbrechen
    if (ids.some(id => pendingIds.has(id))) return;
    setBusy(true);
    setPendingIds((prev) => { const n = new Set(prev); ids.forEach(i => n.add(i)); return n; });
    try {
      for (const keycloakId of ids) {
        const u = benutzer.find((b) => b.keycloak_id === keycloakId);
        if (!u) continue;
        await apiClient.post(`/veranstaltung/${eventId}/zuweisungen`, {
          user_keycloak_id: u.keycloak_id, user_username: u.username || '',
          user_email: u.email || '', taetigkeit_id: newTaetigkeitId ? parseInt(newTaetigkeitId) : null,
        });
      }
      setSelectedUsers([]);
      setShowAddUsers(false);
      setUserSearch('');
      toast.success(`${ids.length} Person(en) hinzugefügt`);
      refetch();
    } catch {
      toast.error('Zuweisung fehlgeschlagen');
    } finally {
      setBusy(false);
      setPendingIds((prev) => { const n = new Set(prev); ids.forEach(i => n.delete(i)); return n; });
    }
  };

  const updateZuweisung = async (z, taetigkeitId) => {
    try {
      await apiClient.post(`/veranstaltung/${eventId}/zuweisungen`, {
        user_keycloak_id: z.user_keycloak_id, user_username: z.user_username || '',
        user_email: z.user_email || '', taetigkeit_id: taetigkeitId ? parseInt(taetigkeitId) : null,
      });
      refetch();
    } catch (err) { console.error('Update:', err); }
  };

  const removeZuweisung = async (userKeycloakId) => {
    try {
      await apiClient.delete(`/veranstaltung/${eventId}/zuweisungen/${userKeycloakId}`);
      refetch();
    } catch (err) { console.error('Entfernen:', err); }
  };

  const toggleUserSelection = (keycloakId) => {
    setSelectedUsers((prev) => prev.includes(keycloakId) ? prev.filter((id) => id !== keycloakId) : [...prev, keycloakId]);
  };

  // Gemeldete User die noch nicht zugewiesen sind
  const zugewieseneIds = new Set((data?.zuweisungen || []).map((z) => z.user_keycloak_id));
  const gemeldetNichtZugewiesen = meldungen.filter(m => !zugewieseneIds.has(m.user_keycloak_id));

  if (!canEdit && !(data?.zuweisungen?.length > 0)) return null;

  return (
    <CollapsibleSection
      icon={User}
      title="Zuweisungen"
      count={(data?.zuweisungen?.length || 0) > 0 ? data.zuweisungen.length : undefined}
      actions={canEdit && (
        <Button variant="secondary" size="sm" icon={UserPlus} onClick={() => setShowAddUsers(!showAddUsers)}>
          Hinzufügen
        </Button>
      )}
    >
      {/* Quick-Assign: Gemeldete direkt zuweisen */}
      {canEdit && gemeldetNichtZugewiesen.length > 0 && (
        <div className="mb-4 p-3 bg-surface rounded-lg space-y-2">
          <h4 className="text-sm font-medium text-ok flex items-center gap-1.5">
            <Hand className="w-4 h-4" /> Gemeldete Personen zuweisen
          </h4>
          <div className="flex flex-wrap gap-2">
            {gemeldetNichtZugewiesen.map((m) => {
              const name = [m.user_first_name, m.user_last_name].filter(Boolean).join(' ')
                || m.user_username || m.user_keycloak_id.slice(0, 8);
              const isPending = pendingIds.has(m.user_keycloak_id);
              return (
                <button key={m.id} type="button"
                  disabled={isPending || busy}
                  onClick={() => addZuweisungen([m.user_keycloak_id])}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-raised hover:bg-hover disabled:text-fg-disabled disabled:cursor-not-allowed text-ok rounded-md text-sm transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                  {name}
                </button>
              );
            })}
            {gemeldetNichtZugewiesen.length > 1 && (
              <button type="button"
                disabled={busy}
                onClick={() => addZuweisungen(gemeldetNichtZugewiesen.map(m => m.user_keycloak_id))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-hover hover:bg-line disabled:text-fg-disabled text-fg rounded-md text-sm font-medium transition-colors">
                <Plus className="w-3.5 h-3.5" />
                Alle zuweisen ({gemeldetNichtZugewiesen.length})
              </button>
            )}
          </div>
        </div>
      )}

      {showAddUsers && (() => {
        const gemeldeteIds = new Set(meldungen.map(m => m.user_keycloak_id));
        // Liste aus Kandidaten (mit Score) wenn geladen, sonst Fallback alle benutzer
        const liste = (kandidaten || benutzer.map(u => ({
          keycloak_id: u.keycloak_id,
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || u.keycloak_id,
          username: u.username, email: u.email, discord_id: u.discord_id,
          bereiche: u.bereiche, kompetenzen_match: 0, kompetenzen_total: 0,
          voll_qualifiziert: true, konflikte: [], bereits_zugewiesen: zugewieseneIds.has(u.keycloak_id),
        })))
          .filter(u => !u.bereits_zugewiesen)
          .filter(u => !userSearch || (u.name || '').toLowerCase().includes(userSearch.toLowerCase())
            || (u.email || '').toLowerCase().includes(userSearch.toLowerCase()));

        return (
          <div className="mb-4 p-4 bg-surface rounded-lg space-y-3">
            <input type="text" placeholder="Benutzer suchen..." value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-3 py-2 text-fg placeholder:text-fg-subtle text-sm" />
            <div className="max-h-72 overflow-y-auto space-y-1">
              {liste.map((u) => {
                const hasKonflikt = (u.konflikte || []).length > 0;
                const isGemeldet = gemeldeteIds.has(u.keycloak_id);
                return (
                  <label key={u.keycloak_id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-raised ${selectedUsers.includes(u.keycloak_id) ? 'bg-raised' : ''}`}>
                    <input type="checkbox" checked={selectedUsers.includes(u.keycloak_id)}
                      onChange={() => toggleUserSelection(u.keycloak_id)}
                      className="rounded-sm border-line bg-hover text-accent-fg" />
                    <span className="text-fg text-sm">{u.name}</span>
                    {u.kompetenzen_total > 0 && (
                      <span title="Erforderliche Kompetenzen erfüllt"
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs tabular-nums ${
                          u.voll_qualifiziert ? 'bg-raised text-ok' : 'bg-raised text-warn'
                        }`}>
                        {u.voll_qualifiziert ? <CheckCircle2 className="w-3 h-3" /> : <Award className="w-3 h-3" />}
                        {u.kompetenzen_match}/{u.kompetenzen_total}
                      </span>
                    )}
                    {isGemeldet && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-raised text-ok rounded-sm text-xs">
                        <Hand className="w-3 h-3" /> gemeldet
                      </span>
                    )}
                    {hasKonflikt && (
                      <span title={u.konflikte.map(k => k.titel).join(', ')}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-raised text-bad rounded-sm text-xs">
                        <AlertTriangle className="w-3 h-3" /> Konflikt
                      </span>
                    )}
                    {u.bereiche?.length > 0 && (
                      <span className="text-xs text-fg-subtle ml-auto">{u.bereiche.map(b => b.name).join(', ')}</span>
                    )}
                    {!u.discord_id && <MessageCircleOff className="w-3.5 h-3.5 text-warn shrink-0" title="Keine Discord-ID hinterlegt" />}
                  </label>
                );
              })}
              {liste.length === 0 && <p className="text-fg-subtle text-sm px-3 py-2">Keine weiteren Benutzer verfügbar</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line-subtle">
              <select value={newTaetigkeitId} onChange={(e) => setNewTaetigkeitId(e.target.value)}
                className="bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-2 py-1.5 text-fg text-sm">
                <option value="">Keine Tätigkeit</option>
                {taetigkeitsrollen.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <Button variant="primary" size="sm" icon={Plus} onClick={() => addZuweisungen()}
                disabled={selectedUsers.length === 0 || busy}>
                {busy ? '…' : (selectedUsers.length > 0 ? `${selectedUsers.length} hinzufügen` : 'Hinzufügen')}
              </Button>
              <Button variant="ghost" size="sm"
                onClick={() => { setShowAddUsers(false); setSelectedUsers([]); setUserSearch(''); }}>
                Abbrechen
              </Button>
            </div>
            <p className="text-xs text-fg-subtle">
              Sortierung: voll qualifiziert zuerst. Bei Tätigkeit wird zusätzlich nach Tätigkeits-Kompetenzen gefiltert.
            </p>
          </div>
        );
      })()}

      {(data?.zuweisungen || []).length > 0 ? (
        <div className="bg-surface rounded-lg divide-y divide-line-subtle">
          {data.zuweisungen.map((z) => {
            const name = [z.user_first_name, z.user_last_name].filter(Boolean).join(' ')
              || z.user_username || z.user_keycloak_id?.slice(0, 8) || '?';
            return (
            <div key={z.id} className="flex items-center justify-between py-2.5 px-4 group">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-medium">{name.charAt(0).toUpperCase()}</span>
                </div>
                <span className="text-fg font-medium truncate">{name}</span>
                {canEdit ? (
                  <select value={z.taetigkeit_id || ''} onChange={(e) => updateZuweisung(z, e.target.value)}
                    className="bg-raised border border-line rounded-md hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none px-2 py-1 text-sm text-fg-muted cursor-pointer">
                    <option value="">Keine Tätigkeit</option>
                    {taetigkeitsrollen.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : z.taetigkeit_name ? (
                  <span className="inline-flex px-2 py-0.5 rounded-sm text-xs font-medium bg-raised text-fg-muted">{z.taetigkeit_name}</span>
                ) : null}
              </div>
              {canEdit && (
                <button type="button" onClick={() => removeZuweisung(z.user_keycloak_id)} aria-label={`${name} entfernen`}
                  className="text-fg-subtle hover:text-bad opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity ml-2">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            );
          })}
        </div>
      ) : (
        <p className="text-fg-subtle text-sm">Keine Zuweisungen</p>
      )}
    </CollapsibleSection>
  );
}
