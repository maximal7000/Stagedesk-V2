import { useState, useEffect } from 'react';
import { User, UserPlus, Plus, X, Hand, CheckCircle2, AlertTriangle, Award } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../../lib/api';
import CollapsibleSection from './CollapsibleSection';

export default function ZuweisungenSection({ data, refetch, canEdit, eventId, benutzer, taetigkeitsrollen }) {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [newTaetigkeitId, setNewTaetigkeitId] = useState('');
  const [showAddUsers, setShowAddUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [kandidaten, setKandidaten] = useState(null);

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
    const ids = userIds || selectedUsers;
    if (ids.length === 0) return;
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
        <button type="button" onClick={() => setShowAddUsers(!showAddUsers)}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
          <UserPlus className="w-4 h-4" /> Hinzufügen
        </button>
      )}
    >
      {/* Quick-Assign: Gemeldete direkt zuweisen */}
      {canEdit && gemeldetNichtZugewiesen.length > 0 && (
        <div className="mb-4 p-3 bg-green-900/10 border border-green-800/30 rounded-lg space-y-2">
          <h4 className="text-sm font-medium text-green-400 flex items-center gap-1.5">
            <Hand className="w-4 h-4" /> Gemeldete Personen zuweisen
          </h4>
          <div className="flex flex-wrap gap-2">
            {gemeldetNichtZugewiesen.map((m) => {
              const name = [m.user_first_name, m.user_last_name].filter(Boolean).join(' ')
                || m.user_username || m.user_keycloak_id.slice(0, 8);
              return (
                <button key={m.id} type="button"
                  onClick={() => addZuweisungen([m.user_keycloak_id])}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg text-sm transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                  {name}
                </button>
              );
            })}
            {gemeldetNichtZugewiesen.length > 1 && (
              <button type="button"
                onClick={() => addZuweisungen(gemeldetNichtZugewiesen.map(m => m.user_keycloak_id))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
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
          <div className="mb-4 p-4 bg-gray-800/50 rounded-lg space-y-3">
            <input type="text" placeholder="Benutzer suchen..." value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm" />
            <div className="max-h-72 overflow-y-auto space-y-1">
              {liste.map((u) => {
                const hasKonflikt = (u.konflikte || []).length > 0;
                const isGemeldet = gemeldeteIds.has(u.keycloak_id);
                return (
                  <label key={u.keycloak_id}
                    className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:bg-gray-700 ${selectedUsers.includes(u.keycloak_id) ? 'bg-blue-900/30' : ''}`}>
                    <input type="checkbox" checked={selectedUsers.includes(u.keycloak_id)}
                      onChange={() => toggleUserSelection(u.keycloak_id)}
                      className="rounded border-gray-600 bg-gray-700 text-blue-500" />
                    <span className="text-white text-sm">{u.name}</span>
                    {u.kompetenzen_total > 0 && (
                      <span title="Erforderliche Kompetenzen erfüllt"
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                          u.voll_qualifiziert ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                        {u.voll_qualifiziert ? <CheckCircle2 className="w-3 h-3" /> : <Award className="w-3 h-3" />}
                        {u.kompetenzen_match}/{u.kompetenzen_total}
                      </span>
                    )}
                    {isGemeldet && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                        <Hand className="w-3 h-3" /> gemeldet
                      </span>
                    )}
                    {hasKonflikt && (
                      <span title={u.konflikte.map(k => k.titel).join(', ')}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
                        <AlertTriangle className="w-3 h-3" /> Konflikt
                      </span>
                    )}
                    {u.bereiche?.length > 0 && (
                      <span className="text-xs text-gray-500 ml-auto">{u.bereiche.map(b => b.name).join(', ')}</span>
                    )}
                    {!u.discord_id && <span className="text-xs text-yellow-500" title="Keine Discord-ID">!</span>}
                  </label>
                );
              })}
              {liste.length === 0 && <p className="text-gray-500 text-sm px-3 py-2">Keine weiteren Benutzer verfügbar</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-700">
              <select value={newTaetigkeitId} onChange={(e) => setNewTaetigkeitId(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm">
                <option value="">Keine Tätigkeit</option>
                {taetigkeitsrollen.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" onClick={() => addZuweisungen()} disabled={selectedUsers.length === 0}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm">
                <Plus className="w-3.5 h-3.5" /> {selectedUsers.length > 0 ? `${selectedUsers.length} hinzufügen` : 'Hinzufügen'}
              </button>
              <button type="button" onClick={() => { setShowAddUsers(false); setSelectedUsers([]); setUserSearch(''); }}
                className="text-gray-400 hover:text-white text-sm px-2">Abbrechen</button>
            </div>
            <p className="text-xs text-gray-500">
              Sortierung: voll qualifiziert zuerst. Bei Tätigkeit wird zusätzlich nach Tätigkeits-Kompetenzen gefiltert.
            </p>
          </div>
        );
      })()}

      {(data?.zuweisungen || []).length > 0 ? (
        <div className="space-y-2">
          {data.zuweisungen.map((z) => {
            const name = [z.user_first_name, z.user_last_name].filter(Boolean).join(' ')
              || z.user_username || z.user_keycloak_id?.slice(0, 8) || '?';
            return (
            <div key={z.id} className="flex items-center justify-between py-2.5 px-4 bg-gray-800 rounded-lg group">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-medium">{name.charAt(0).toUpperCase()}</span>
                </div>
                <span className="text-white font-medium truncate">{name}</span>
                {canEdit ? (
                  <select value={z.taetigkeit_id || ''} onChange={(e) => updateZuweisung(z, e.target.value)}
                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 cursor-pointer">
                    <option value="">Keine Tätigkeit</option>
                    {taetigkeitsrollen.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : z.taetigkeit_name ? (
                  <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-purple-600/20 text-purple-400">{z.taetigkeit_name}</span>
                ) : null}
              </div>
              {canEdit && (
                <button type="button" onClick={() => removeZuweisung(z.user_keycloak_id)}
                  className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-500 text-sm">Keine Zuweisungen</p>
      )}
    </CollapsibleSection>
  );
}
