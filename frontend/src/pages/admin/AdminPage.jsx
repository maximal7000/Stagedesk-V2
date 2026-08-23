/**
 * Admin-Seite für Permissions, Gruppen und User-Verwaltung
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Users, Key, Plus, Edit, Trash2, Eye,
  Save, X, Loader2, Sun, Moon, AlertCircle, Info, Shield, FolderOpen, Check, Settings,
  RefreshCw, Trash,
} from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import apiClient from '../../lib/api';

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
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Zugriff verweigert</h2>
          <p className="text-gray-400 mb-4">Du hast keine Berechtigung für den Admin-Bereich.</p>
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
      <div>
        <h1 className="text-2xl font-bold text-white">Administration</h1>
        <p className="text-gray-400 mt-1">Verwalte Benutzer, Gruppen und Berechtigungen</p>
      </div>

      {/* Keycloak Info */}
      <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 mt-0.5" />
        <div>
          <p className="text-blue-300 font-medium">Rollen kommen aus Keycloak</p>
          <p className="text-sm text-blue-400/80 mt-1">
            Der Admin-Status wird über die Keycloak-Rolle "admin" gesteuert.
            Gruppen bündeln Berechtigungen und können Nutzern zugewiesen werden.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-xs text-gray-400">Deine Keycloak-Rollen:</span>
            {keycloakRoles.map((role) => (
              <span key={role} className={`px-2 py-0.5 text-xs rounded ${
                role.toLowerCase() === 'admin'
                  ? 'bg-purple-600/20 text-purple-400'
                  : 'bg-gray-700 text-gray-300'
              }`}>{role}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <nav className="flex gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id ? 'border-purple-500 text-purple-500' : 'border-transparent text-gray-400 hover:text-white'
                }`}>
                <Icon className="w-5 h-5" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-6 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      ) : (
        <>
          {/* ═══ Users Tab ═══ */}
          {activeTab === 'users' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
              <div className="p-4 bg-gray-800/50 flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold text-white">Benutzer ({users.length})</h3>
                <div className="flex items-center gap-2">
                  {selectedUserIds.size > 0 && (
                    <>
                      <span className="text-sm text-gray-400">{selectedUserIds.size} ausgewählt</span>
                      <button onClick={() => setBulkOpen(true)}
                        className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg">
                        Bulk-Aktion…
                      </button>
                      <button onClick={() => setSelectedUserIds(new Set())}
                        className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg">
                        Auswahl aufheben
                      </button>
                    </>
                  )}
                </div>
              </div>
              {users.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Keine Benutzer gefunden</div>
              ) : users.map((user) => (
                <div key={user.id} className="p-4 flex items-start gap-3">
                  {editingUser?.id !== user.id && (
                    <input type="checkbox"
                      className="mt-3 rounded border-gray-600 bg-gray-700 text-accent"
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
                        <span className="font-medium text-white">{user.first_name ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}` : user.username}</span>
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdateUser(user.id, {
                            permission_codes: editingUser.permission_codes,
                            group_ids: editingUser.group_ids,
                            forced_theme: editingUser.forced_theme,
                            theme_locked: editingUser.theme_locked,
                            discord_id: editingUser.discord_id,
                            bereich_ids: editingUser.bereich_ids,
                          })} disabled={savingId === user.id} className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">
                            {savingId === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </button>
                          <button onClick={() => setEditingUser(null)} className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"><X className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Discord-ID</label>
                        <input type="text" value={editingUser.discord_id || ''} onChange={(e) => setEditingUser({ ...editingUser, discord_id: e.target.value })}
                          placeholder="z.B. 123456789012345678" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Bereich</label>
                        <div className="flex flex-wrap gap-2">
                          {bereiche.map((b) => {
                            const isSelected = (editingUser.bereich_ids || []).includes(b.id);
                            return (
                              <button key={b.id} type="button" onClick={() => {
                                const ids = isSelected ? editingUser.bereich_ids.filter(id => id !== b.id) : [...(editingUser.bereich_ids || []), b.id];
                                setEditingUser({ ...editingUser, bereich_ids: ids });
                              }} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${isSelected ? 'bg-accent text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                                {b.name}
                              </button>
                            );
                          })}
                          {bereiche.length === 0 && <span className="text-gray-500 text-sm">Keine Bereiche konfiguriert</span>}
                        </div>
                      </div>
                      {/* Gruppen */}
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Berechtigungsgruppen</label>
                        <div className="flex flex-wrap gap-2">
                          {groups.map((g) => {
                            const isSelected = (editingUser.group_ids || []).includes(g.id);
                            return (
                              <button key={g.id} type="button" onClick={() => {
                                const ids = isSelected ? editingUser.group_ids.filter(id => id !== g.id) : [...(editingUser.group_ids || []), g.id];
                                setEditingUser({ ...editingUser, group_ids: ids });
                              }} className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1 ${isSelected ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                                <FolderOpen className="w-3.5 h-3.5" />
                                {g.name}
                                {g.is_default && <span className="text-[10px] opacity-60">(Standard)</span>}
                              </button>
                            );
                          })}
                          {groups.length === 0 && <span className="text-gray-500 text-sm">Keine Gruppen erstellt — erstelle welche im "Gruppen" Tab</span>}
                        </div>
                      </div>
                      {/* Direkte Permissions */}
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Zusätzliche Einzelberechtigungen</label>
                        <div className="flex flex-wrap gap-2">
                          {permissions.map((perm) => (
                            <button key={perm.id} onClick={() => {
                              const codes = editingUser.permission_codes.includes(perm.code) ? editingUser.permission_codes.filter(c => c !== perm.code) : [...editingUser.permission_codes, perm.code];
                              setEditingUser({ ...editingUser, permission_codes: codes });
                            }} className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${editingUser.permission_codes.includes(perm.code) ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                              {perm.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Theme erzwingen</label>
                        <div className="flex gap-2">
                          {[{ v: 'none', l: 'Keine', i: null }, { v: 'dark', l: 'Dark', i: Moon }, { v: 'light', l: 'Light', i: Sun }].map(o => (
                            <button key={o.v} onClick={() => setEditingUser({ ...editingUser, forced_theme: o.v })}
                              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${(editingUser.forced_theme || 'none') === o.v ? 'bg-accent text-white' : 'bg-gray-700 text-gray-300'}`}>
                              {o.i && <o.i className="w-4 h-4" />} {o.l}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center">
                          <span className="text-white font-medium">{(user.first_name || user.username)?.charAt(0).toUpperCase() || '?'}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">
                              {user.first_name ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}` : user.username}
                            </span>
                            {user.is_admin && <span className="px-2 py-0.5 text-xs bg-purple-600/20 text-purple-400 rounded flex items-center gap-1"><Shield className="w-3 h-3" /> Admin</span>}
                          </div>
                          {user.discord_id && <div className="text-xs text-indigo-400">Discord: {user.discord_id}</div>}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {user.bereiche?.map(b => <span key={b.id} className="px-1.5 py-0.5 text-xs bg-accent/20 text-accent rounded">{b.name}</span>)}
                            {user.permission_groups?.map(g => <span key={g.id} className="px-1.5 py-0.5 text-xs bg-purple-600/20 text-purple-400 rounded">{g.name}</span>)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          title="Als dieser User ansehen (UI-Filter)"
                          onClick={async () => {
                            try {
                              const res = await apiClient.get(`/users/users/${user.id}/effective-permissions`);
                              setImpersonate(res.data);
                              window.location.href = '/';
                            } catch {
                              toast.error('Konnte Berechtigungen nicht laden');
                            }
                          }}
                          className="p-2 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded-lg">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingUser({
                          id: user.id,
                          permission_codes: user.permissions || [],
                          forced_theme: user.forced_theme, theme_locked: false,
                          discord_id: user.discord_id || '',
                          bereich_ids: (user.bereiche || []).map(b => b.id),
                          group_ids: (user.permission_groups || []).map(g => g.id),
                        })} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
                          <Edit className="w-4 h-4" />
                        </button>
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
                <h3 className="font-semibold text-white">Berechtigungsgruppen ({groups.length})</h3>
                <button onClick={() => openGroupModal()} className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg">
                  <Plus className="w-4 h-4" /> Neue Gruppe
                </button>
              </div>

              {groups.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                  <FolderOpen className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 mb-2">Keine Gruppen vorhanden</p>
                  <p className="text-gray-500 text-sm">Erstelle Gruppen wie "Techniker", "Leitung" oder "Gast" um Berechtigungen gebündelt zu vergeben.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {groups.map(group => {
                    const memberCount = users.filter(u => u.permission_groups?.some(g => g.id === group.id)).length;
                    return (
                      <div key={group.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
                              <FolderOpen className="w-5 h-5 text-purple-400" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">{group.name}</span>
                                {group.is_default && (
                                  <span className="px-2 py-0.5 text-[10px] bg-green-900/30 text-green-400 rounded">Standard</span>
                                )}
                              </div>
                              {group.description && <p className="text-sm text-gray-400">{group.description}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{memberCount} Mitglieder</span>
                            <button onClick={() => openGroupModal(group)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteGroup(group.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {/* Permissions der Gruppe */}
                        <div className="flex flex-wrap gap-1.5">
                          {group.permissions?.length > 0 ? (
                            group.permissions.map(code => {
                              const perm = permissions.find(p => p.code === code);
                              return (
                                <span key={code} className="px-2 py-0.5 text-xs bg-gray-800 text-gray-300 rounded">
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
              <div className="p-4 bg-gray-800/50 flex items-center justify-between">
                <h3 className="font-semibold text-white">Lokale Berechtigungen ({permissions.length})</h3>
                <button onClick={handleCreatePermission} className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg">
                  <Plus className="w-4 h-4" /> Neue Berechtigung
                </button>
              </div>
              {Object.entries(permsByCategory).map(([category, perms]) => (
                <div key={category}>
                  <div className="px-4 py-2 bg-gray-800/30">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{category}</span>
                  </div>
                  {perms.map((perm) => (
                    <div key={perm.id} className="p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded">{perm.code}</code>
                          <span className="font-medium text-white">{perm.name}</span>
                        </div>
                        {/* Welche Gruppen haben diese Permission? */}
                        {groups.filter(g => g.permissions?.includes(perm.code)).length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {groups.filter(g => g.permissions?.includes(perm.code)).map(g => (
                              <span key={g.id} className="text-[10px] px-1.5 py-0.5 bg-purple-600/20 text-purple-400 rounded">{g.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => handleDeletePermission(perm.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              ))}
              {permissions.length === 0 && (
                <div className="p-8 text-center text-gray-400">
                  <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Keine lokalen Berechtigungen definiert</p>
                </div>
              )}
            </div>
          )}

          {/* ═══ System Tab ═══ */}
          {activeTab === 'system' && <SystemTab />}
        </>
      )}

      {/* ═══ Group Modal ═══ */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">{editingGroup ? 'Gruppe bearbeiten' : 'Neue Gruppe'}</h2>
              <button onClick={() => setShowGroupModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name *</label>
                <input type="text" value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                  placeholder="z.B. Techniker, Leitung, Gast..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Beschreibung</label>
                <input type="text" value={groupForm.description} onChange={e => setGroupForm({ ...groupForm, description: e.target.value })}
                  placeholder="Kurze Beschreibung der Gruppe..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={groupForm.is_default} onChange={e => setGroupForm({ ...groupForm, is_default: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-purple-600" />
                <span className="text-sm text-gray-300">Standardgruppe (neue User bekommen diese automatisch)</span>
              </label>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Berechtigungen</label>
                {Object.entries(permsByCategory).map(([category, perms]) => (
                  <div key={category} className="mb-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{category}</div>
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
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1 ${
                              isSelected ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
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
            <div className="flex gap-2 p-6 pt-4 border-t border-gray-800">
              <button onClick={() => setShowGroupModal(false)} className="flex-1 py-2 text-gray-400 hover:text-white">Abbrechen</button>
              <button onClick={handleSaveGroup} disabled={!groupForm.name}
                className="flex items-center justify-center gap-2 flex-1 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-lg">
                <Save className="w-4 h-4" /> {editingGroup ? 'Aktualisieren' : 'Erstellen'}
              </button>
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
            <h2 className="text-lg font-bold text-white">Bulk-Aktion auf {selectedUserIds.size} User</h2>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Aktion</label>
              <select value={bulkAction} onChange={(e) => { setBulkAction(e.target.value); setBulkTarget(''); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
                <option value="add_group">Berechtigungsgruppe hinzufügen</option>
                <option value="remove_group">Berechtigungsgruppe entfernen</option>
                <option value="add_bereich">Bereich hinzufügen</option>
                <option value="remove_bereich">Bereich entfernen</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ziel</label>
              <select value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
                <option value="">— wählen —</option>
                {bulkAction.includes('group')
                  ? groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)
                  : bereiche.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
                }
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setBulkOpen(false)} disabled={bulkBusy}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg">Abbrechen</button>
              <button onClick={runBulk} disabled={!bulkTarget || bulkBusy}
                className="flex-1 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-semibold rounded-lg">
                {bulkBusy ? 'Läuft…' : 'Anwenden'}
              </button>
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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
      {/* Permissions initialisieren */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Permissions initialisieren</h3>
        <p className="text-sm text-gray-400 mb-3">
          Legt alle im Code definierten Standard-Berechtigungen in der Datenbank an
          (idempotent — bestehende werden nicht überschrieben).
        </p>
        <button onClick={runInit} disabled={initRunning}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium rounded-lg">
          {initRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Permissions initialisieren
        </button>
        {initResult && (
          <pre className="mt-3 p-3 bg-gray-800 text-xs text-gray-300 rounded-lg overflow-auto max-h-48">
{JSON.stringify(initResult, null, 2)}
          </pre>
        )}
      </div>

      {/* Stale-Permissions aufräumen */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-2">Veraltete Permissions aufräumen</h3>
        <p className="text-sm text-gray-400 mb-3">
          Listet Permission-Codes, die nicht (mehr) im Code-Katalog vorkommen — z.B. nach Umbenennungen.
        </p>
        <div className="flex gap-2">
          <button onClick={loadStale} disabled={staleLoading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg">
            {staleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Prüfen
          </button>
          {stale?.stale?.length > 0 && (
            <button onClick={cleanupStale} disabled={cleanupRunning}
              className="inline-flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm rounded-lg">
              {cleanupRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash className="w-4 h-4" />}
              Alle löschen ({stale.stale.length})
            </button>
          )}
        </div>
        {stale && (
          stale.stale.length === 0 ? (
            <p className="mt-3 text-sm text-green-400 inline-flex items-center gap-1">
              <Check className="w-4 h-4" /> Keine veralteten Einträge — sauber.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-800 bg-gray-800/40 rounded-lg">
              {stale.stale.map((p) => (
                <li key={p.id} className="p-3 flex items-center gap-3">
                  <code className="text-xs px-2 py-0.5 bg-gray-900 text-red-300 rounded">{p.code}</code>
                  <span className="text-sm text-gray-300">{p.name}</span>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      {/* Branding + Wartung + Login-Banner */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-3">Globale Einstellungen</h3>
        {!global ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-gray-400 mb-1">App-Name</span>
                <input type="text" value={global['branding.app_name'] || ''}
                  onChange={(e) => setKey('branding.app_name', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white" />
              </label>
              <label className="text-sm">
                <span className="block text-gray-400 mb-1">Akzentfarbe</span>
                <input type="color" value={global['branding.accent_color'] || '#3b82f6'}
                  onChange={(e) => setKey('branding.accent_color', e.target.value)}
                  className="h-9 bg-gray-800 border border-gray-700 rounded px-1" />
              </label>
            </div>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">Login-Banner-Text (oben über dem Login)</span>
              <input type="text" value={global['login.banner'] || ''}
                onChange={(e) => setKey('login.banner', e.target.value)}
                placeholder="z.B. Bitte 2FA aktivieren ab 01.06."
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white" />
            </label>
            <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-amber-300">
                <input type="checkbox" checked={(global['maintenance.enabled'] || 'false') === 'true'}
                  onChange={(e) => setKey('maintenance.enabled', e.target.checked ? 'true' : 'false')}
                  className="rounded border-gray-600 bg-gray-700 text-amber-500" />
                Wartungsmodus aktiv (großes Banner für alle User)
              </label>
              <input type="text" value={global['maintenance.message'] || ''}
                onChange={(e) => setKey('maintenance.message', e.target.value)}
                placeholder="Wartungs-Nachricht…"
                className="w-full bg-gray-900 border border-amber-800/40 rounded px-2 py-1.5 text-amber-100 text-sm" />
            </div>
            {globalDirty && (
              <button onClick={saveGlobal} disabled={globalSaving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg">
                {globalSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Speichern
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tests */}
      <div className="pt-6 border-t border-gray-800 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Discord-Test</h3>
          <button onClick={runDiscordTest}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg">
            Verbindung prüfen
          </button>
          {discordResult && (
            <div className={`mt-2 text-xs p-2 rounded ${discordResult.ok ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
              {discordResult.ok
                ? <>✓ Guild: <strong>{discordResult.guild_name}</strong> {discordResult.info_channel_konfiguriert && (discordResult.info_channel_erreichbar ? '· Info-Channel ok' : '· Info-Channel nicht erreichbar')}</>
                : <>✗ {discordResult.reason}</>
              }
            </div>
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Email-Test</h3>
          <div className="flex gap-2">
            <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)}
              placeholder="leer = an deine Adresse"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" />
            <button onClick={runEmailTest}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg">
              Senden
            </button>
          </div>
          {emailResult && (
            <div className={`mt-2 text-xs p-2 rounded ${emailResult.ok ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
              {emailResult.ok ? `✓ Gesendet an ${emailResult.to}` : `✗ ${emailResult.reason}`}
            </div>
          )}
        </div>
      </div>

      {/* App-Statistik */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-3">App-Statistik</h3>
        {!stats ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['User',                stats.user_count],
              ['Admins',              stats.admin_count],
              ['Aktive Sessions',     stats.active_sessions_30min],
              ['Sessions total',      stats.total_sessions],
              ['Permissions',         stats.permissions],
              ['Gruppen',             stats.groups],
              ['Ungelesen (alle)',    stats.notifications_unread],
            ].map(([label, value]) => (
              <div key={label} className="bg-gray-800/40 rounded-lg p-3">
                <div className="text-xs text-gray-500 uppercase">{label}</div>
                <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Version + Updates */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-2">Version</h3>
        {!version ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : version.error ? (
          <p className="text-sm text-red-400">{version.error}</p>
        ) : (
          <div className="text-sm text-gray-300 space-y-1">
            <div>Commit: <code className="bg-gray-800 px-2 py-0.5 rounded">{version.commit}</code></div>
            <div>vom {version.commit_date ? new Date(version.commit_date).toLocaleString('de-DE') : '—'}</div>
            {version.behind > 0 && (
              <div className="text-amber-400 mt-2">⚠ {version.behind} Commit(s) hinter main — Update verfügbar.</div>
            )}
            {version.behind === 0 && (
              <div className="text-green-400 mt-2">✓ Aktuell</div>
            )}
          </div>
        )}
      </div>

      {/* Backups */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-2">Backups</h3>
        {!backups ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['daily', 'weekly'].map((kind) => (
              <div key={kind}>
                <div className="text-xs text-gray-500 uppercase mb-1">{kind === 'daily' ? 'Daily' : 'Weekly'}</div>
                {(backups[kind] || []).length === 0
                  ? <p className="text-sm text-gray-500">— keine</p>
                  : (
                    <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
                      {backups[kind].map((b) => (
                        <li key={b.name} className="flex items-center gap-2">
                          <code className="text-gray-300 truncate">{b.name}</code>
                          <span className="text-gray-500 shrink-0 ml-auto">{(b.size / 1024 / 1024).toFixed(2)} MB</span>
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
