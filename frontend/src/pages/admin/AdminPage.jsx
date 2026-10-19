/**
 * Admin-Seite für Permissions, Gruppen und User-Verwaltung
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Users, Key, Plus, Edit, Trash2, Eye,
  Save, X, Loader2, Sun, Moon, AlertCircle, AlertTriangle, Info, Shield, FolderOpen, Check,
  CheckCircle2, XCircle, Settings, RefreshCw, Trash, Activity, Bell, GitCommit, Archive,
} from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import apiClient from '../../lib/api';
import { PageHeader, Button, StatusBadge, StatTile, EmptyState } from '../../components/ui';

export default function AdminPage() {
  const { isAdmin, keycloakRoles, setImpersonate } = useUser();
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data
  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [bereiche, setBereiche] = useState([]);
  const [groups, setGroups] = useState([]);

  // Edit States
  const [editingUser, setEditingUser] = useState(null);
  const [savingId, setSavingId] = useState(null);

  // Group Edit
  const [editingGroup, setEditingGroup] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', description: '', permission_codes: [], is_default: false });

  // Bulk-Selection
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState('add_group');
  const [bulkTarget, setBulkTarget] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const runBulk = async () => {
    if (!bulkTarget || selectedUserIds.size === 0) return;
    setBulkBusy(true);
    try {
      const r = await apiClient.post('/users/users/bulk', {
        user_ids: Array.from(selectedUserIds),
        action: bulkAction,
        target_id: parseInt(bulkTarget, 10),
      });
      toast.success(`${r.data?.updated || 0} User aktualisiert`);
      setBulkOpen(false);
      setSelectedUserIds(new Set());
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Bulk-Aktion fehlgeschlagen');
    } finally { setBulkBusy(false); }
  };

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [usersRes, permsRes, bereicheRes, groupsRes] = await Promise.all([
        apiClient.get('/users/users'),
        apiClient.get('/users/permissions'),
        apiClient.get('/users/bereiche'),
        apiClient.get('/users/groups'),
      ]);
      setUsers(usersRes.data);
      setPermissions(permsRes.data);
      setBereiche(bereicheRes.data || []);
      setGroups(groupsRes.data);
    } catch (err) {
      setError('Daten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <EmptyState icon={AlertCircle} title="Kein Zugriff"
            description="Der Admin-Bereich ist nur mit der Keycloak-Rolle „admin“ erreichbar." />
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'users', name: 'Benutzer', icon: Users },
    { id: 'groups', name: 'Gruppen', icon: FolderOpen },
    { id: 'permissions', name: 'Berechtigungen', icon: Key },
    { id: 'system', name: 'System', icon: Settings },
  ];

  // ═══ User Management ═══
  const handleUpdateUser = async (userId, data) => {
    setSavingId(userId);
    try {
      await apiClient.put(`/users/users/${userId}`, data);
      await fetchData();
      setEditingUser(null);
      toast.success('Benutzer gespeichert');
    } catch { toast.error('Fehler beim Speichern'); }
    finally { setSavingId(null); }
  };

  // ═══ Permission Management ═══
  const handleCreatePermission = async () => {
    const code = prompt('Permission-Code (z.B. feature.name):');
    if (!code) return;
    const name = prompt('Anzeigename:');
    if (!name) return;
    try {
      await apiClient.post('/users/permissions', { code, name, description: '', category: code.split('.')[0] || 'general' });
      await fetchData();
      toast.success('Berechtigung erstellt');
    } catch { toast.error('Fehler beim Erstellen'); }
  };

  const handleDeletePermission = async (permId) => {
    if (!confirm('Permission wirklich löschen?')) return;
    try { await apiClient.delete(`/users/permissions/${permId}`); await fetchData(); toast.success('Gelöscht'); }
    catch { toast.error('Fehler beim Löschen'); }
  };

  // ═══ Group Management ═══
  const openGroupModal = (group = null) => {
    if (group) {
      setEditingGroup(group);
      setGroupForm({ name: group.name, description: group.description, permission_codes: group.permissions || [], is_default: group.is_default });
    } else {
      setEditingGroup(null);
      setGroupForm({ name: '', description: '', permission_codes: [], is_default: false });
    }
    setShowGroupModal(true);
  };

  const handleSaveGroup = async () => {
    if (!groupForm.name) { toast.error('Bitte Name angeben'); return; }
    try {
      if (editingGroup) {
        await apiClient.put(`/users/groups/${editingGroup.id}`, groupForm);
      } else {
        await apiClient.post('/users/groups', groupForm);
      }
      setShowGroupModal(false);
      await fetchData();
      toast.success(editingGroup ? 'Gruppe aktualisiert' : 'Gruppe erstellt');
    } catch { toast.error('Fehler beim Speichern'); }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm('Gruppe wirklich löschen?')) return;
    try { await apiClient.delete(`/users/groups/${groupId}`); await fetchData(); toast.success('Gruppe gelöscht'); }
    catch { toast.error('Fehler beim Löschen'); }
  };

  // Permission-Kategorien berechnen
  const permsByCategory = permissions.reduce((acc, perm) => {
    const cat = perm.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(perm);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader eyebrow="Admin" title="Benutzer & Rechte"
        meta={!loading && !error ? <span className="tabular-nums">{users.length} Benutzer · {groups.length} Gruppen</span> : undefined} />

      {/* Keycloak Info */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-gray-200 font-medium">Admin-Status kommt aus Keycloak</p>
          <p className="text-sm text-gray-400 mt-0.5">
            Wer die Keycloak-Rolle „admin“ hat, ist hier Admin. Alles andere regeln Gruppen und Einzelberechtigungen.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400">Deine Keycloak-Rollen:</span>
            {keycloakRoles.map((role) => (
              <span key={role} className={`inline-flex items-center px-2 py-[3px] rounded-md text-[11px] font-semibold leading-none tracking-wide ${
                role.toLowerCase() === 'admin'
                  ? 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/25'
                  : 'bg-gray-700/40 text-gray-300 ring-1 ring-inset ring-gray-600/30'
              }`}>{role}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <nav className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`flex items-center gap-2 px-4 py-3 -mb-px text-sm font-medium whitespace-nowrap border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset rounded-t-md ${
                  activeTab === tab.id ? 'border-accent text-white' : 'border-transparent text-gray-400 hover:text-white hover:border-gray-700'
                }`}>
                <Icon className="w-4 h-4" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-2.5 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      ) : (
        <>
          {/* ═══ Users Tab ═══ */}
          {activeTab === 'users' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
              <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap min-h-[52px]">
                <h3 className="font-display text-lg font-semibold tracking-tight text-white leading-none">Benutzer <span className="text-sm font-sans text-gray-500 font-normal tabular-nums">{users.length}</span></h3>
                {selectedUserIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400 tabular-nums">{selectedUserIds.size} ausgewählt</span>
                    <Button size="sm" variant="primary" onClick={() => setBulkOpen(true)}>Gemeinsam ändern</Button>
                    <Button size="sm" variant="ghost" icon={X} onClick={() => setSelectedUserIds(new Set())}>Auswahl</Button>
                  </div>
                )}
              </div>
              {users.length === 0 ? (
                <EmptyState icon={Users} title="Keine Benutzer gefunden" />
              ) : users.map((user) => (
                <div key={user.id} className={`px-4 py-3 flex items-start gap-3 transition-colors ${editingUser?.id === user.id ? 'bg-gray-800/30' : selectedUserIds.has(user.id) ? 'bg-accent/[0.05]' : 'hover:bg-gray-800/30'}`}>
                  {editingUser?.id !== user.id && (
                    <input type="checkbox"
                      aria-label="Benutzer auswählen"
                      className="mt-3 rounded border-gray-600 bg-gray-700 accent-accent"
                      checked={selectedUserIds.has(user.id)}
                      onChange={() => setSelectedUserIds((prev) => {
                        const next = new Set(prev);
                        next.has(user.id) ? next.delete(user.id) : next.add(user.id);
                        return next;
                      })} />
                  )}
                  <div className="flex-1 min-w-0">
                  {editingUser?.id === user.id ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-display text-lg font-semibold tracking-tight text-white">{user.first_name ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}` : user.username}</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="primary" title="Speichern" aria-label="Speichern"
                            icon={savingId === user.id ? Loader2 : Save}
                            className={savingId === user.id ? '[&>svg]:animate-spin' : ''}
                            onClick={() => handleUpdateUser(user.id, {
                              permission_codes: editingUser.permission_codes,
                              group_ids: editingUser.group_ids,
                              forced_theme: editingUser.forced_theme,
                              theme_locked: editingUser.theme_locked,
                              discord_id: editingUser.discord_id,
                              bereich_ids: editingUser.bereich_ids,
                            })} disabled={savingId === user.id} />
                          <Button size="sm" variant="ghost" icon={X} title="Abbrechen" aria-label="Abbrechen" onClick={() => setEditingUser(null)} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Discord-ID</label>
                        <input type="text" value={editingUser.discord_id || ''} onChange={(e) => setEditingUser({ ...editingUser, discord_id: e.target.value })}
                          placeholder="z.B. 123456789012345678" className="w-full max-w-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm font-mono focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Bereich</label>
                        <div className="flex flex-wrap gap-2">
                          {bereiche.map((b) => {
                            const isSelected = (editingUser.bereich_ids || []).includes(b.id);
                            return (
                              <button key={b.id} type="button" onClick={() => {
                                const ids = isSelected ? editingUser.bereich_ids.filter(id => id !== b.id) : [...(editingUser.bereich_ids || []), b.id];
                                setEditingUser({ ...editingUser, bereich_ids: ids });
                              }} className={`px-2.5 py-1 rounded-md text-sm transition-colors flex items-center gap-1 ${isSelected ? 'bg-accent/15 text-white ring-1 ring-inset ring-accent/50' : 'bg-gray-800 text-gray-300 ring-1 ring-inset ring-gray-700 hover:bg-gray-700 hover:text-white'}`}>
                                {isSelected && <Check className="w-3 h-3" />}
                                {b.name}
                              </button>
                            );
                          })}
                          {bereiche.length === 0 && <span className="text-gray-500 text-sm">Keine Bereiche konfiguriert</span>}
                        </div>
                      </div>
                      {/* Gruppen */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Berechtigungsgruppen</label>
                        <div className="flex flex-wrap gap-2">
                          {groups.map((g) => {
                            const isSelected = (editingUser.group_ids || []).includes(g.id);
                            return (
                              <button key={g.id} type="button" onClick={() => {
                                const ids = isSelected ? editingUser.group_ids.filter(id => id !== g.id) : [...(editingUser.group_ids || []), g.id];
                                setEditingUser({ ...editingUser, group_ids: ids });
                              }} className={`px-2.5 py-1 rounded-md text-sm transition-colors flex items-center gap-1 ${isSelected ? 'bg-accent/15 text-white ring-1 ring-inset ring-accent/50' : 'bg-gray-800 text-gray-300 ring-1 ring-inset ring-gray-700 hover:bg-gray-700 hover:text-white'}`}>
                                {isSelected ? <Check className="w-3 h-3" /> : <FolderOpen className="w-3.5 h-3.5 text-gray-500" />}
                                {g.name}
                                {g.is_default && <span className="text-[10px] opacity-60">(Standard)</span>}
                              </button>
                            );
                          })}
                          {groups.length === 0 && <span className="text-gray-500 text-sm">Keine Gruppen erstellt. Lege welche im Tab „Gruppen" an.</span>}
                        </div>
                      </div>
                      {/* Direkte Permissions */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Zusätzliche Einzelberechtigungen</label>
                        <div className="flex flex-wrap gap-2">
                          {permissions.map((perm) => (
                            <button key={perm.id} onClick={() => {
                              const codes = editingUser.permission_codes.includes(perm.code) ? editingUser.permission_codes.filter(c => c !== perm.code) : [...editingUser.permission_codes, perm.code];
                              setEditingUser({ ...editingUser, permission_codes: codes });
                            }} className={`px-2 py-1 rounded-md text-xs transition-colors flex items-center gap-1 ${editingUser.permission_codes.includes(perm.code) ? 'bg-accent/15 text-white ring-1 ring-inset ring-accent/50' : 'bg-gray-800 text-gray-300 ring-1 ring-inset ring-gray-700 hover:bg-gray-700 hover:text-white'}`}>
                              {editingUser.permission_codes.includes(perm.code) && <Check className="w-3 h-3" />}
                              {perm.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Farbschema festlegen</label>
                        <div className="flex gap-2">
                          {[{ v: 'none', l: 'Frei wählbar', i: null }, { v: 'dark', l: 'Dunkel', i: Moon }, { v: 'light', l: 'Hell', i: Sun }].map(o => (
                            <button key={o.v} onClick={() => setEditingUser({ ...editingUser, forced_theme: o.v })}
                              className={`px-2.5 py-1 rounded-md text-sm flex items-center gap-1.5 transition-colors ${(editingUser.forced_theme || 'none') === o.v ? 'bg-accent/15 text-white ring-1 ring-inset ring-accent/50' : 'bg-gray-800 text-gray-300 ring-1 ring-inset ring-gray-700 hover:bg-gray-700 hover:text-white'}`}>
                              {o.i && <o.i className="w-4 h-4" />} {o.l}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 bg-gray-800 ring-1 ring-gray-700 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-gray-200 text-sm font-semibold">{(user.first_name || user.username)?.charAt(0).toUpperCase() || '?'}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">
                              {user.first_name ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}` : user.username}
                            </span>
                            {user.is_admin && <StatusBadge tone="accent" label="Admin" />}
                          </div>
                          {user.discord_id && <div className="text-xs text-gray-500 font-mono mt-0.5">Discord {user.discord_id}</div>}
                          {(user.bereiche?.length > 0 || user.permission_groups?.length > 0) && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {user.bereiche?.map(b => <StatusBadge key={`b${b.id}`} tone="info" label={b.name} />)}
                              {user.permission_groups?.map(g => <StatusBadge key={`g${g.id}`} tone="neutral" label={g.name} />)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" icon={Eye} title="Als dieser User ansehen (UI-Filter)" aria-label="Als dieser User ansehen"
                          className="!text-gray-400 hover:!text-amber-400"
                          onClick={async () => {
                            try {
                              const res = await apiClient.get(`/users/users/${user.id}/effective-permissions`);
                              setImpersonate(res.data);
                              window.location.href = '/';
                            } catch {
                              toast.error('Konnte Berechtigungen nicht laden');
                            }
                          }} />
                        <Button variant="ghost" size="sm" icon={Edit} title="Bearbeiten" aria-label="Bearbeiten" onClick={() => setEditingUser({
                          id: user.id,
                          permission_codes: user.permissions || [],
                          forced_theme: user.forced_theme, theme_locked: false,
                          discord_id: user.discord_id || '',
                          bereich_ids: (user.bereiche || []).map(b => b.id),
                          group_ids: (user.permission_groups || []).map(g => g.id),
                        })} />
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ Groups Tab ═══ */}
          {activeTab === 'groups' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold tracking-tight text-white leading-none">Berechtigungsgruppen <span className="text-sm font-sans text-gray-500 font-normal tabular-nums">{groups.length}</span></h3>
                <Button size="sm" variant="primary" icon={Plus} onClick={() => openGroupModal()}>Neue Gruppe</Button>
              </div>

              {groups.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl">
                  <EmptyState icon={FolderOpen} title="Keine Gruppen vorhanden"
                    description={'Erstelle Gruppen wie „Techniker", „Leitung" oder „Gast", um Berechtigungen gebündelt zu vergeben.'}
                    action={<Button variant="primary" icon={Plus} onClick={() => openGroupModal()}>Neue Gruppe</Button>} />
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {groups.map(group => {
                    const memberCount = users.filter(u => u.permission_groups?.some(g => g.id === group.id)).length;
                    return (
                      <div key={group.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-9 h-9 bg-gray-800 ring-1 ring-gray-700 rounded-lg flex items-center justify-center shrink-0">
                              <FolderOpen className="w-4 h-4 text-gray-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-white">{group.name}</span>
                                {group.is_default && <StatusBadge tone="positive" label="Standard" />}
                              </div>
                              <p className="text-xs text-gray-500 tabular-nums mt-0.5">{memberCount} {memberCount === 1 ? 'Mitglied' : 'Mitglieder'}</p>
                              {group.description && <p className="text-sm text-gray-400 mt-1">{group.description}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button variant="ghost" size="sm" icon={Edit} title="Bearbeiten" aria-label="Bearbeiten" onClick={() => openGroupModal(group)} />
                            <Button variant="ghost" size="sm" icon={Trash2} title="Löschen" aria-label="Löschen"
                              className="hover:text-red-400" onClick={() => handleDeleteGroup(group.id)} />
                          </div>
                        </div>
                        {/* Permissions der Gruppe */}
                        <div className="flex flex-wrap gap-1.5">
                          {group.permissions?.length > 0 ? (
                            group.permissions.map(code => {
                              const perm = permissions.find(p => p.code === code);
                              return (
                                <span key={code} className="px-1.5 py-0.5 text-[11px] bg-gray-800 text-gray-300 ring-1 ring-inset ring-gray-700 rounded-md">
                                  {perm?.name || code}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-xs text-gray-500">Keine Berechtigungen zugewiesen</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ Permissions Tab ═══ */}
          {activeTab === 'permissions' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
              <div className="px-4 py-3 flex items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold tracking-tight text-white leading-none">Berechtigungen <span className="text-sm font-sans text-gray-500 font-normal tabular-nums">{permissions.length}</span></h3>
                <Button size="sm" variant="primary" icon={Plus} onClick={handleCreatePermission}>Neue Berechtigung</Button>
              </div>
              {Object.entries(permsByCategory).map(([category, perms]) => (
                <div key={category}>
                  <div className="px-4 py-1.5 bg-gray-950/40">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em]">{category}</span>
                  </div>
                  {perms.map((perm) => (
                    <div key={perm.id} className="group px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-gray-800/30">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{perm.name}</span>
                          <code className="text-[11px] px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded-md font-mono">{perm.code}</code>
                        </div>
                        {/* Welche Gruppen haben diese Permission? */}
                        {groups.filter(g => g.permissions?.includes(perm.code)).length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            <span className="text-[11px] text-gray-500 mr-0.5">in</span>
                            {groups.filter(g => g.permissions?.includes(perm.code)).map(g => (
                              <span key={g.id} className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-300 ring-1 ring-inset ring-gray-700 rounded-md">{g.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" icon={Trash2} title="Löschen" aria-label="Löschen"
                        className="hover:text-red-400" onClick={() => handleDeletePermission(perm.id)} />
                    </div>
                  ))}
                </div>
              ))}
              {permissions.length === 0 && (
                <EmptyState icon={Key} title="Keine lokalen Berechtigungen definiert" />
              )}
            </div>
          )}

          {/* ═══ System Tab ═══ */}
          {activeTab === 'system' && <SystemTab />}
        </>
      )}

      {/* ═══ Group Modal ═══ */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="font-display text-xl font-semibold tracking-tight text-white">{editingGroup ? 'Gruppe bearbeiten' : 'Neue Gruppe'}</h2>
              <Button variant="ghost" size="sm" icon={X} title="Schließen" aria-label="Schließen" onClick={() => setShowGroupModal(false)} />
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Name <span className="text-accent">*</span></label>
                <input type="text" value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                  placeholder="z.B. Techniker, Leitung, Gast" className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Beschreibung</label>
                <input type="text" value={groupForm.description} onChange={e => setGroupForm({ ...groupForm, description: e.target.value })}
                  placeholder="Wer gehört in diese Gruppe?" className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={groupForm.is_default} onChange={e => setGroupForm({ ...groupForm, is_default: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-accent" />
                <span className="text-sm text-gray-300">Standardgruppe <span className="text-gray-500">(neue Benutzer landen automatisch hier)</span></span>
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Berechtigungen <span className="text-gray-500 font-normal tabular-nums">{groupForm.permission_codes.length} gewählt</span></label>
                {Object.entries(permsByCategory).map(([category, perms]) => (
                  <div key={category} className="mb-3">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] mb-1.5">{category}</div>
                    <div className="flex flex-wrap gap-2">
                      {perms.map(perm => {
                        const isSelected = groupForm.permission_codes.includes(perm.code);
                        return (
                          <button key={perm.id} type="button" onClick={() => {
                            const codes = isSelected
                              ? groupForm.permission_codes.filter(c => c !== perm.code)
                              : [...groupForm.permission_codes, perm.code];
                            setGroupForm({ ...groupForm, permission_codes: codes });
                          }}
                            className={`px-2.5 py-1 rounded-md text-sm transition-colors flex items-center gap-1 ${
                              isSelected ? 'bg-accent/15 text-white ring-1 ring-inset ring-accent/50' : 'bg-gray-800 text-gray-300 ring-1 ring-inset ring-gray-700 hover:bg-gray-700 hover:text-white'
                            }`}>
                            {isSelected && <Check className="w-3 h-3" />}
                            {perm.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-800">
              <Button variant="ghost" onClick={() => setShowGroupModal(false)}>Abbrechen</Button>
              <Button variant="primary" icon={Save} disabled={!groupForm.name} onClick={handleSaveGroup}>
                {editingGroup ? 'Speichern' : 'Gruppe anlegen'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk-Aktion-Modal */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => setBulkOpen(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4"
               onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl font-semibold tracking-tight text-white">
              Gemeinsam ändern
              <span className="block text-sm font-sans font-normal text-gray-400 tabular-nums mt-0.5">{selectedUserIds.size} Benutzer ausgewählt</span>
            </h2>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Aktion</label>
              <select value={bulkAction} onChange={(e) => { setBulkAction(e.target.value); setBulkTarget(''); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent">
                <option value="add_group">Berechtigungsgruppe hinzufügen</option>
                <option value="remove_group">Berechtigungsgruppe entfernen</option>
                <option value="add_bereich">Bereich hinzufügen</option>
                <option value="remove_bereich">Bereich entfernen</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ziel</label>
              <select value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent">
                <option value="">Bitte wählen</option>
                {bulkAction.includes('group')
                  ? groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)
                  : bereiche.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
                }
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" disabled={bulkBusy} onClick={() => setBulkOpen(false)}>Abbrechen</Button>
              <Button variant="primary" className={`flex-1 ${bulkBusy ? '[&>svg]:animate-spin' : ''}`}
                disabled={!bulkTarget || bulkBusy} onClick={runBulk} icon={bulkBusy ? Loader2 : undefined}>
                {bulkBusy ? 'Wird angewendet…' : 'Anwenden'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function SystemTab() {
  const [staleLoading, setStaleLoading] = useState(false);
  const [stale, setStale] = useState(null);
  const [initRunning, setInitRunning] = useState(false);
  const [initResult, setInitResult] = useState(null);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  // Branding + Wartung + Banner
  const [global, setGlobal] = useState(null);
  const [globalDirty, setGlobalDirty] = useState(false);
  const [globalSaving, setGlobalSaving] = useState(false);
  // Tests + Stats + Version + Backups
  const [discordResult, setDiscordResult] = useState(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailResult, setEmailResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [version, setVersion] = useState(null);
  const [backups, setBackups] = useState(null);

  const loadGlobal = async () => {
    try { const r = await apiClient.get('/admin/global-settings'); setGlobal(r.data); setGlobalDirty(false); } catch {}
  };
  const loadStats = async () => { try { const r = await apiClient.get('/admin/stats'); setStats(r.data); } catch {} };
  const loadVersion = async () => { try { const r = await apiClient.get('/admin/version'); setVersion(r.data); } catch {} };
  const loadBackups = async () => { try { const r = await apiClient.get('/admin/backups'); setBackups(r.data); } catch {} };

  useEffect(() => { loadGlobal(); loadStats(); loadVersion(); loadBackups(); }, []);

  const saveGlobal = async () => {
    setGlobalSaving(true);
    try {
      await apiClient.put('/admin/global-settings', { values: global });
      toast.success('Einstellungen gespeichert');
      setGlobalDirty(false);
    } catch { toast.error('Fehler'); }
    finally { setGlobalSaving(false); }
  };

  const setKey = (k, v) => { setGlobal(g => ({ ...g, [k]: v })); setGlobalDirty(true); };

  const runDiscordTest = async () => {
    setDiscordResult(null);
    try { const r = await apiClient.post('/admin/test-discord'); setDiscordResult(r.data); }
    catch { setDiscordResult({ ok: false, reason: 'Request fehlgeschlagen' }); }
  };

  const runEmailTest = async () => {
    setEmailResult(null);
    try { const r = await apiClient.post('/admin/test-email', { to: emailTo }); setEmailResult(r.data); }
    catch { setEmailResult({ ok: false, reason: 'Request fehlgeschlagen' }); }
  };

  const runInit = async () => {
    setInitRunning(true);
    try {
      const r = await apiClient.post('/users/setup/init');
      setInitResult(r.data);
      toast.success(`${(r.data?.created_permissions || []).length} Permission(s) neu angelegt`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Init fehlgeschlagen');
    } finally { setInitRunning(false); }
  };

  const loadStale = async () => {
    setStaleLoading(true);
    try {
      const r = await apiClient.get('/users/setup/stale-permissions');
      setStale(r.data);
    } catch { toast.error('Konnte Stale-Liste nicht laden'); }
    finally { setStaleLoading(false); }
  };

  const cleanupStale = async () => {
    if (!stale?.stale?.length) return;
    if (!confirm(`${stale.stale.length} veraltete Permission(s) wirklich löschen?`)) return;
    setCleanupRunning(true);
    try {
      const r = await apiClient.post('/users/setup/cleanup-permissions', { all_stale: true });
      toast.success(`${r.data?.count || 0} gelöscht`);
      loadStale();
    } catch { toast.error('Cleanup fehlgeschlagen'); }
    finally { setCleanupRunning(false); }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 sm:p-6 space-y-6">
      {/* Permissions initialisieren */}
      <div>
        <h3 className="font-display text-lg font-semibold tracking-tight text-white mb-2">Berechtigungen anlegen</h3>
        <p className="text-sm text-gray-400 mb-3">
          Legt alle im Code definierten Berechtigungen in der Datenbank an. Vorhandene bleiben unverändert.
        </p>
        <Button variant="secondary" disabled={initRunning} onClick={runInit}
          icon={initRunning ? Loader2 : RefreshCw} className={initRunning ? '[&>svg]:animate-spin' : ''}>
          Berechtigungen anlegen
        </Button>
        {initResult && (
          <pre className="mt-3 p-3 bg-gray-950 border border-gray-800 font-mono text-xs text-gray-300 rounded-lg overflow-auto max-h-48">
{JSON.stringify(initResult, null, 2)}
          </pre>
        )}
      </div>

      {/* Stale-Permissions aufräumen */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="font-display text-lg font-semibold tracking-tight text-white mb-2">Veraltete Berechtigungen</h3>
        <p className="text-sm text-gray-400 mb-3">
          Codes, die im Code nicht mehr vorkommen, etwa nach Umbenennungen.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={staleLoading} onClick={loadStale}
            icon={staleLoading ? Loader2 : RefreshCw} className={staleLoading ? '[&>svg]:animate-spin' : ''}>
            Prüfen
          </Button>
          {stale?.stale?.length > 0 && (
            <Button variant="danger" size="sm" disabled={cleanupRunning} onClick={cleanupStale}
              icon={cleanupRunning ? Loader2 : Trash} className={cleanupRunning ? '[&>svg]:animate-spin' : ''}>
              Alle löschen ({stale.stale.length})
            </Button>
          )}
        </div>
        {stale && (
          stale.stale.length === 0 ? (
            <p className="mt-3 text-sm text-green-400 inline-flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Keine veralteten Einträge.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-800 bg-gray-800/40 rounded-lg">
              {stale.stale.map((p) => (
                <li key={p.id} className="p-3 flex items-center gap-3">
                  <code className="text-xs px-1.5 py-0.5 bg-gray-900 text-red-300 rounded-md font-mono">{p.code}</code>
                  <span className="text-sm text-gray-300">{p.name}</span>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      {/* Branding + Wartung + Login-Banner */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="font-display text-lg font-semibold tracking-tight text-white mb-3">Globale Einstellungen</h3>
        {!global ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-gray-300 font-medium mb-1.5">App-Name</span>
                <input type="text" value={global['branding.app_name'] || ''}
                  onChange={(e) => setKey('branding.app_name', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
              </label>
              <label className="text-sm">
                <span className="block text-gray-300 font-medium mb-1.5">Akzentfarbe</span>
                <input type="color" value={global['branding.accent_color'] || '#3b82f6'}
                  onChange={(e) => setKey('branding.accent_color', e.target.value)}
                  className="h-9 bg-gray-800 border border-gray-700 rounded-lg px-1" />
              </label>
            </div>
            <label className="text-sm block">
              <span className="block text-gray-300 font-medium mb-1.5">Login-Banner-Text (oben über dem Login)</span>
              <input type="text" value={global['login.banner'] || ''}
                onChange={(e) => setKey('login.banner', e.target.value)}
                placeholder="z.B. Bitte 2FA aktivieren ab 01.06."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
            </label>
            <div className="bg-amber-500/[0.06] border border-amber-500/30 rounded-lg p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-amber-200 font-medium cursor-pointer">
                <input type="checkbox" checked={(global['maintenance.enabled'] || 'false') === 'true'}
                  onChange={(e) => setKey('maintenance.enabled', e.target.checked ? 'true' : 'false')}
                  className="rounded border-gray-600 bg-gray-700 accent-amber-500" />
                Wartungsmodus <span className="font-normal text-amber-200/70">(Banner oben für alle)</span>
              </label>
              <input type="text" value={global['maintenance.message'] || ''}
                onChange={(e) => setKey('maintenance.message', e.target.value)}
                placeholder="z.B. Heute ab 18 Uhr kurz nicht erreichbar"
                className="w-full bg-gray-900 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-100 text-sm placeholder-amber-200/30 focus:outline-none focus:border-amber-400" />
            </div>
            {globalDirty && (
              <Button variant="primary" disabled={globalSaving} onClick={saveGlobal}
                icon={globalSaving ? Loader2 : Save} className={globalSaving ? '[&>svg]:animate-spin' : ''}>
                Speichern
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tests */}
      <div className="pt-6 border-t border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-display text-lg font-semibold tracking-tight text-white mb-2">Discord-Test</h3>
          <Button variant="secondary" size="sm" onClick={runDiscordTest}>Verbindung prüfen</Button>
          {discordResult && (
            <div className={`mt-2 text-xs p-2 rounded-lg flex items-start gap-1.5 ${discordResult.ok ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/25' : 'bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-500/25'}`}>
              {discordResult.ok
                ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              <span>
                {discordResult.ok
                  ? <>Guild: <strong>{discordResult.guild_name}</strong> {discordResult.info_channel_konfiguriert && (discordResult.info_channel_erreichbar ? '· Info-Channel ok' : '· Info-Channel nicht erreichbar')}</>
                  : discordResult.reason}
              </span>
            </div>
          )}
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold tracking-tight text-white mb-2">E-Mail-Test</h3>
          <div className="flex gap-2">
            <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)}
              placeholder="leer = an deine Adresse"
              className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
            <Button variant="secondary" size="sm" onClick={runEmailTest}>Senden</Button>
          </div>
          {emailResult && (
            <div className={`mt-2 text-xs p-2 rounded-lg flex items-center gap-1.5 ${emailResult.ok ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/25' : 'bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-500/25'}`}>
              {emailResult.ok
                ? <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Gesendet an {emailResult.to}</>
                : <><XCircle className="w-3.5 h-3.5 shrink-0" /> {emailResult.reason}</>}
            </div>
          )}
        </div>
      </div>

      {/* App-Statistik */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="font-display text-lg font-semibold tracking-tight text-white mb-3">App-Statistik</h3>
        {!stats ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              [Users, 'Benutzer', stats.user_count],
              [Shield, 'Admins', stats.admin_count],
              [Activity, 'Aktiv (30 Min.)', stats.active_sessions_30min],
              [Activity, 'Sitzungen gesamt', stats.total_sessions],
              [Key, 'Berechtigungen', stats.permissions],
              [FolderOpen, 'Gruppen', stats.groups],
              [Bell, 'Ungelesen (alle)', stats.notifications_unread],
            ].map(([Icon, label, value]) => (
              <StatTile key={label} icon={Icon} label={label} value={value} />
            ))}
          </div>
        )}
      </div>

      {/* Version + Updates */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="font-display text-lg font-semibold tracking-tight text-white mb-2">Version</h3>
        {!version ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : version.error ? (
          <p className="text-sm text-red-400">{version.error}</p>
        ) : (
          <div className="text-sm text-gray-300 space-y-1">
            <div className="flex items-center gap-2"><GitCommit className="w-3.5 h-3.5 text-gray-500 shrink-0" /> Commit <code className="bg-gray-800 px-1.5 py-0.5 rounded-md font-mono text-xs">{version.commit}</code></div>
            <div>vom {version.commit_date ? new Date(version.commit_date).toLocaleString('de-DE') : 'unbekannt'}</div>
            {version.behind > 0 && (
              <div className="text-amber-400 mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {version.behind} {version.behind === 1 ? 'Commit' : 'Commits'} hinter main, Update verfügbar
              </div>
            )}
            {version.behind === 0 && (
              <div className="text-green-400 mt-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Auf dem neuesten Stand
              </div>
            )}
          </div>
        )}
      </div>

      {/* Backups */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="font-display text-lg font-semibold tracking-tight text-white mb-2 flex items-center gap-2"><Archive className="w-4 h-4 text-gray-500" /> Backups</h3>
        {!backups ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['daily', 'weekly'].map((kind) => (
              <div key={kind}>
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] mb-1.5">{kind === 'daily' ? 'Täglich' : 'Wöchentlich'}</div>
                {(backups[kind] || []).length === 0
                  ? <p className="text-sm text-gray-500">Keine Backups vorhanden.</p>
                  : (
                    <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
                      {backups[kind].map((b) => (
                        <li key={b.name} className="flex items-center gap-2">
                          <code className="text-gray-300 truncate">{b.name}</code>
                          <span className="text-gray-500 shrink-0 ml-auto tabular-nums">{(b.size / 1024 / 1024).toFixed(2)} MB</span>
                        </li>
                      ))}
                    </ul>
                  )
                }
                {backups[`${kind}_error`] && (
                  <p className="text-xs text-red-400 mt-1">{backups[`${kind}_error`]}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
