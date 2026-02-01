/**
 * Admin-Seite für Permissions und User-Verwaltung
 */
import { useState, useEffect, useCallback } from 'react';
import { 
  Users, Key, Plus, Edit, Trash2, Save, X, Loader2, 
  Sun, Moon, AlertCircle, Info, Shield
} from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import apiClient from '../lib/api';

export default function AdminPage() {
  const { isAdmin, keycloakRoles } = useUser();
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [usersRes, permsRes] = await Promise.all([
        apiClient.get('/users/users'),
        apiClient.get('/users/permissions'),
      ]);
      setUsers(usersRes.data);
      setPermissions(permsRes.data);
    } catch (err) {
      setError('Daten konnten nicht geladen werden.');
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
          <p className="text-gray-400">Admin-Rechte über Keycloak-Rolle "admin" vergeben.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'users', name: 'Benutzer', icon: Users },
    { id: 'permissions', name: 'Berechtigungen', icon: Key },
  ];

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

  const handleCreatePermission = async () => {
    const code = prompt('Permission-Code (z.B. feature.name):');
    if (!code) return;
    const name = prompt('Anzeigename:');
    if (!name) return;
    
    try {
      await apiClient.post('/users/permissions', { 
        code, name, description: '', category: code.split('.')[0] || 'general'
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

      <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 mt-0.5" />
        <div>
          <p className="text-blue-300 font-medium">Rollen aus Keycloak</p>
          <p className="text-sm text-blue-400/80 mt-1">Admin-Status über Keycloak-Rolle "admin".</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-xs text-gray-400">Deine Rollen:</span>
            {keycloakRoles?.map((role) => (
              <span key={role} className={`px-2 py-0.5 text-xs rounded ${
                role.toLowerCase() === 'admin' ? 'bg-purple-600/20 text-purple-400' : 'bg-gray-700 text-gray-300'
              }`}>
                {role}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="border-b border-gray-800">
        <nav className="flex gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id ? 'border-purple-500 text-purple-500' : 'border-transparent text-gray-400 hover:text-white'
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
          {activeTab === 'users' && (
            <div className="divide-y divide-gray-800">
              <div className="p-4 bg-gray-800/50">
                <h3 className="font-semibold text-white">Benutzer ({users.length})</h3>
              </div>
              
              {users.map((user) => (
                <div key={user.id} className="p-4">
                  {editingUser?.id === user.id ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-white">{user.username}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateUser(user.id, {
                              permission_codes: editingUser.permission_codes,
                              forced_theme: editingUser.forced_theme,
                            })}
                            disabled={savingId === user.id}
                            className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                          >
                            {savingId === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </button>
                          <button onClick={() => setEditingUser(null)} className="p-2 bg-gray-700 text-white rounded-lg">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Lokale Permissions</label>
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
                              className={`px-3 py-1.5 rounded-lg text-sm ${
                                editingUser.permission_codes.includes(perm.code)
                                  ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
                              }`}
                            >
                              {perm.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Theme erzwingen</label>
                        <div className="flex gap-2">
                          {[null, 'dark', 'light'].map((t) => (
                            <button
                              key={t || 'none'}
                              onClick={() => setEditingUser({ ...editingUser, forced_theme: t })}
                              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${
                                editingUser.forced_theme === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                              }`}
                            >
                              {t === 'dark' && <Moon className="w-4 h-4" />}
                              {t === 'light' && <Sun className="w-4 h-4" />}
                              {t === null ? 'Keine' : t === 'dark' ? 'Dark' : 'Light'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                          <span className="text-white font-medium">{user.username?.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{user.username}</span>
                            {user.is_admin && (
                              <span className="px-2 py-0.5 text-xs bg-purple-600/20 text-purple-400 rounded flex items-center gap-1">
                                <Shield className="w-3 h-3" /> Admin
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-400">{user.email}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => setEditingUser({
                          id: user.id,
                          permission_codes: [],
                          forced_theme: user.forced_theme,
                        })}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="divide-y divide-gray-800">
              <div className="p-4 bg-gray-800/50 flex items-center justify-between">
                <h3 className="font-semibold text-white">Berechtigungen ({permissions.length})</h3>
                <button
                  onClick={handleCreatePermission}
                  className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg"
                >
                  <Plus className="w-4 h-4" /> Neue
                </button>
              </div>
              
              {permissions.map((perm) => (
                <div key={perm.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded">{perm.code}</code>
                      <span className="font-medium text-white">{perm.name}</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{perm.description}</p>
                  </div>
                  <button
                    onClick={() => handleDeletePermission(perm.id)}
                    className="p-2 text-gray-400 hover:text-red-400 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
