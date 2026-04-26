/**
 * Admin-Seite für Permissions, Gruppen und User-Verwaltung
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Users, Key, Plus, Edit, Trash2, Eye,
  Save, X, Loader2, Sun, Moon, AlertCircle, Info, Shield, FolderOpen, Check,
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
              <div className="p-4 bg-gray-800/50">
                <h3 className="font-semibold text-white">Benutzer ({users.length})</h3>
              </div>
              {users.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Keine Benutzer gefunden</div>
              ) : users.map((user) => (
                <div key={user.id} className="p-4">
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
                              }} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
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
                              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${(editingUser.forced_theme || 'none') === o.v ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                              {o.i && <o.i className="w-4 h-4" />} {o.l}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
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
                            {user.bereiche?.map(b => <span key={b.id} className="px-1.5 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded">{b.name}</span>)}
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
    </div>
  );
}
