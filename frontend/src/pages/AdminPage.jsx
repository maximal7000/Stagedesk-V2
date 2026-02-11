/**
 * Admin-Seite für Permissions und User-Verwaltung
 * Admin-Status kommt aus Keycloak-Rollen
 */
import { useState, useEffect, useCallback } from 'react';
import { 
  Users, Key, Plus, Edit, Trash2, 
  Save, X, Loader2, Sun, Moon, AlertCircle, Info, Shield
} from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import apiClient from '../lib/api';

export default function AdminPage() {
  const { isAdmin, keycloakRoles } = useUser();
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Data
  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [bereiche, setBereiche] = useState([]);
  
  // Edit States
  const [editingUser, setEditingUser] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    
    setLoading(true);
    try {
      const [usersRes, permsRes, bereicheRes] = await Promise.all([
        apiClient.get('/users/users'),
        apiClient.get('/users/permissions'),
        apiClient.get('/users/bereiche'),
      ]);

      setUsers(usersRes.data);
      setPermissions(permsRes.data);
      setBereiche(bereicheRes.data || []);
    } catch (err) {
      setError('Daten konnten nicht geladen werden.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Zugriff verweigert</h2>
          <p className="text-gray-400 mb-4">Du hast keine Berechtigung für den Admin-Bereich.</p>
          <p className="text-sm text-gray-500">
            Admin-Rechte werden über die Keycloak-Rolle "admin" vergeben.
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'users', name: 'Benutzer', icon: Users },
    { id: 'permissions', name: 'Berechtigungen', icon: Key },
  ];

  // User Management
  const handleUpdateUser = async (userId, data) => {
    setSavingId(userId);
    try {
      await apiClient.put(`/users/users/${userId}`, data);
      await fetchData();
      setEditingUser(null);
    } catch (err) {
      alert('Fehler beim Speichern');
    } finally {
      setSavingId(null);
    }
  };

  // Permission Management
  const handleCreatePermission = async () => {
    const code = prompt('Permission-Code (z.B. feature.name):');
    if (!code) return;
    const name = prompt('Anzeigename:');
    if (!name) return;
    
    try {
      await apiClient.post('/users/permissions', { 
        code, 
        name, 
        description: '',
        category: code.split('.')[0] || 'general'
      });
      await fetchData();
    } catch (err) {
      alert('Fehler beim Erstellen');
    }
  };

  const handleDeletePermission = async (permId) => {
    if (!confirm('Permission wirklich löschen?')) return;
    try {
      await apiClient.delete(`/users/permissions/${permId}`);
      await fetchData();
    } catch (err) {
      alert('Fehler beim Löschen');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Administration</h1>
        <p className="text-gray-400 mt-1">Verwalte Benutzer und Berechtigungen</p>
      </div>

      {/* Keycloak Info */}
      <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 mt-0.5" />
        <div>
          <p className="text-blue-300 font-medium">Rollen kommen aus Keycloak</p>
          <p className="text-sm text-blue-400/80 mt-1">
            Der Admin-Status wird über die Keycloak-Rolle "admin" gesteuert. 
            Hier kannst du zusätzliche lokale Permissions verwalten.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-xs text-gray-400">Deine Keycloak-Rollen:</span>
            {keycloakRoles.map((role) => (
              <span key={role} className={`px-2 py-0.5 text-xs rounded ${
                role.toLowerCase() === 'admin' 
                  ? 'bg-purple-600/20 text-purple-400' 
                  : 'bg-gray-700 text-gray-300'
              }`}>
                {role}
              </span>
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
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-500'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
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
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="divide-y divide-gray-800">
              <div className="p-4 bg-gray-800/50">
                <h3 className="font-semibold text-white">Benutzer ({users.length})</h3>
              </div>
              
              {users.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  Keine Benutzer gefunden
                </div>
              ) : users.map((user) => (
                <div key={user.id} className="p-4">
                  {editingUser?.id === user.id ? (
                    // Edit Mode
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-white">{user.username}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateUser(user.id, {
                              permission_codes: editingUser.permission_codes,
                              forced_theme: editingUser.forced_theme,
                              theme_locked: editingUser.theme_locked,
                              discord_id: editingUser.discord_id,
                              bereich_ids: editingUser.bereich_ids,
                            })}
                            disabled={savingId === user.id}
                            className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                          >
                            {savingId === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => setEditingUser(null)}
                            className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      {/* Discord-ID */}
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Discord-ID</label>
                        <input
                          type="text"
                          value={editingUser.discord_id || ''}
                          onChange={(e) => setEditingUser({ ...editingUser, discord_id: e.target.value })}
                          placeholder="z.B. 123456789012345678"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm"
                        />
                      </div>

                      {/* Bereiche (Badge Multi-Select) */}
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Bereich</label>
                        <div className="flex flex-wrap gap-2">
                          {bereiche.map((b) => {
                            const isSelected = (editingUser.bereich_ids || []).includes(b.id);
                            return (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => {
                                  const ids = isSelected
                                    ? editingUser.bereich_ids.filter(id => id !== b.id)
                                    : [...(editingUser.bereich_ids || []), b.id];
                                  setEditingUser({ ...editingUser, bereich_ids: ids });
                                }}
                                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                  isSelected
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                              >
                                {b.name}
                              </button>
                            );
                          })}
                          {bereiche.length === 0 && (
                            <span className="text-gray-500 text-sm">Keine Bereiche konfiguriert (Django Admin)</span>
                          )}
                        </div>
                      </div>

                      {/* Lokale Permissions */}
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Lokale Permissions (zusätzlich zu Keycloak-Rollen)
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {permissions.map((perm) => (
                            <button
                              key={perm.id}
                              onClick={() => {
                                const codes = editingUser.permission_codes.includes(perm.code)
                                  ? editingUser.permission_codes.filter(c => c !== perm.code)
                                  : [...editingUser.permission_codes, perm.code];
                                setEditingUser({ ...editingUser, permission_codes: codes });
                              }}
                              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                editingUser.permission_codes.includes(perm.code)
                                  ? 'bg-green-600 text-white'
                                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              {perm.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Theme Erzwingen */}
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Theme erzwingen</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingUser({ ...editingUser, forced_theme: 'none' })}
                            className={`px-3 py-1.5 rounded-lg text-sm ${
                              !editingUser.forced_theme || editingUser.forced_theme === 'none' 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-700 text-gray-300'
                            }`}
                          >
                            Keine
                          </button>
                          <button
                            onClick={() => setEditingUser({ ...editingUser, forced_theme: 'dark' })}
                            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${
                              editingUser.forced_theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                            }`}
                          >
                            <Moon className="w-4 h-4" /> Dark
                          </button>
                          <button
                            onClick={() => setEditingUser({ ...editingUser, forced_theme: 'light' })}
                            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${
                              editingUser.forced_theme === 'light' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                            }`}
                          >
                            <Sun className="w-4 h-4" /> Light
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                          <span className="text-white font-medium">
                            {user.username?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{user.username}</span>
                            {user.is_admin && (
                              <span className="px-2 py-0.5 text-xs bg-purple-600/20 text-purple-400 rounded flex items-center gap-1">
                                <Shield className="w-3 h-3" />
                                Admin (Keycloak)
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-400">{user.email}</div>
                          {user.discord_id && (
                            <div className="text-xs text-indigo-400">Discord: {user.discord_id}</div>
                          )}
                          {user.bereiche?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {user.bereiche.map(b => (
                                <span key={b.id} className="px-1.5 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded">
                                  {b.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {user.discord_id && (
                          <span className="px-2 py-0.5 text-xs bg-indigo-600/20 text-indigo-400 rounded">
                            Discord
                          </span>
                        )}
                        {user.forced_theme && (
                          <span className="px-2 py-0.5 text-xs bg-yellow-600/20 text-yellow-400 rounded flex items-center gap-1">
                            {user.forced_theme === 'dark' ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                            Theme erzwungen
                          </span>
                        )}
                        <button
                          onClick={() => setEditingUser({
                            id: user.id,
                            permission_codes: [],
                            forced_theme: user.forced_theme,
                            theme_locked: false,
                            discord_id: user.discord_id || '',
                            bereich_ids: (user.bereiche || []).map(b => b.id),
                          })}
                          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Permissions Tab */}
          {activeTab === 'permissions' && (
            <div className="divide-y divide-gray-800">
              <div className="p-4 bg-gray-800/50 flex items-center justify-between">
                <h3 className="font-semibold text-white">Lokale Berechtigungen ({permissions.length})</h3>
                <button
                  onClick={handleCreatePermission}
                  className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                  Neue Berechtigung
                </button>
              </div>
              
              {/* Group by category */}
              {Object.entries(
                permissions.reduce((acc, perm) => {
                  const cat = perm.category || 'general';
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(perm);
                  return acc;
                }, {})
              ).map(([category, perms]) => (
                <div key={category}>
                  <div className="px-4 py-2 bg-gray-800/30">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {category}
                    </span>
                  </div>
                  {perms.map((perm) => (
                    <div key={perm.id} className="p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded">
                            {perm.code}
                          </code>
                          <span className="font-medium text-white">{perm.name}</span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">{perm.description}</p>
                      </div>
                      <button
                        onClick={() => handleDeletePermission(perm.id)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}

              {permissions.length === 0 && (
                <div className="p-8 text-center text-gray-400">
                  <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Keine lokalen Berechtigungen definiert</p>
                  <p className="text-sm mt-1">Erstelle Berechtigungen für feinere Zugriffssteuerung</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
