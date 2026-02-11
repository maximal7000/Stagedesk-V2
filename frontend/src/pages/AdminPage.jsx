/**
 * Admin-Seite für Permissions, User-Verwaltung und Monitor-Konfiguration
 */
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Users, Key, Plus, Edit, Trash2,
  Save, X, Loader2, Sun, Moon, AlertCircle, Info, Shield,
  Monitor, Radio, Megaphone, ExternalLink, RefreshCw, Copy, Eye, EyeOff
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

  // Monitor
  const [monitorConfig, setMonitorConfig] = useState(null);
  const [monitorAnkuendigungen, setMonitorAnkuendigungen] = useState([]);
  const [monitorSaving, setMonitorSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [newAnkuendigung, setNewAnkuendigung] = useState(null);

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
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const fetchMonitorData = useCallback(async () => {
    try {
      const [configRes, ankRes] = await Promise.all([
        apiClient.get('/monitor/config'),
        apiClient.get('/monitor/ankuendigungen'),
      ]);
      setMonitorConfig(configRes.data);
      setMonitorAnkuendigungen(ankRes.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === 'monitor' && !monitorConfig) fetchMonitorData();
  }, [activeTab, monitorConfig, fetchMonitorData]);

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
    { id: 'permissions', name: 'Berechtigungen', icon: Key },
    { id: 'monitor', name: 'Monitor', icon: Monitor },
  ];

  // ═══ User Management ═══
  const handleUpdateUser = async (userId, data) => {
    setSavingId(userId);
    try {
      await apiClient.put(`/users/users/${userId}`, data);
      await fetchData();
      setEditingUser(null);
    } catch { alert('Fehler beim Speichern'); }
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
    } catch { alert('Fehler beim Erstellen'); }
  };

  const handleDeletePermission = async (permId) => {
    if (!confirm('Permission wirklich löschen?')) return;
    try { await apiClient.delete(`/users/permissions/${permId}`); await fetchData(); }
    catch { alert('Fehler beim Löschen'); }
  };

  // ═══ Monitor Management ═══
  const handleSaveMonitorConfig = async () => {
    if (!monitorConfig) return;
    setMonitorSaving(true);
    try {
      const res = await apiClient.put('/monitor/config', monitorConfig);
      setMonitorConfig(res.data);
      toast.success('Monitor-Konfiguration gespeichert');
    } catch { toast.error('Speichern fehlgeschlagen'); }
    finally { setMonitorSaving(false); }
  };

  const handleToggleOnAir = async () => {
    try {
      await apiClient.post('/monitor/onair', { on_air: !monitorConfig.ist_on_air });
      setMonitorConfig(prev => ({ ...prev, ist_on_air: !prev.ist_on_air }));
      toast.success(monitorConfig.ist_on_air ? 'ON AIR deaktiviert' : 'ON AIR aktiviert');
    } catch { toast.error('Fehler'); }
  };

  const handleRegenerateToken = async () => {
    if (!confirm('Neues Token generieren? Das alte Token wird ungültig.')) return;
    try {
      const res = await apiClient.post('/monitor/config/regenerate-token');
      setMonitorConfig(prev => ({ ...prev, api_token: res.data.api_token }));
      toast.success('Neues Token generiert');
    } catch { toast.error('Fehler'); }
  };

  const handleCreateAnkuendigung = async () => {
    if (!newAnkuendigung?.titel) return;
    try {
      await apiClient.post('/monitor/ankuendigungen', newAnkuendigung);
      setNewAnkuendigung(null);
      fetchMonitorData();
      toast.success('Ankündigung erstellt');
    } catch { toast.error('Fehler'); }
  };

  const handleDeleteAnkuendigung = async (id) => {
    try {
      await apiClient.delete(`/monitor/ankuendigungen/${id}`);
      fetchMonitorData();
    } catch { toast.error('Fehler'); }
  };

  const updateConfig = (key, value) => setMonitorConfig(prev => ({ ...prev, [key]: value }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Administration</h1>
        <p className="text-gray-400 mt-1">Verwalte Benutzer, Berechtigungen und Monitor</p>
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

      {loading && activeTab !== 'monitor' ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        </div>
      ) : error && activeTab !== 'monitor' ? (
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
                        <span className="font-medium text-white">{user.username}</span>
                        <div className="flex gap-2">
                          <button onClick={() => handleUpdateUser(user.id, {
                            permission_codes: editingUser.permission_codes, forced_theme: editingUser.forced_theme,
                            theme_locked: editingUser.theme_locked, discord_id: editingUser.discord_id, bereich_ids: editingUser.bereich_ids,
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
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">Lokale Permissions</label>
                        <div className="flex flex-wrap gap-2">
                          {permissions.map((perm) => (
                            <button key={perm.id} onClick={() => {
                              const codes = editingUser.permission_codes.includes(perm.code) ? editingUser.permission_codes.filter(c => c !== perm.code) : [...editingUser.permission_codes, perm.code];
                              setEditingUser({ ...editingUser, permission_codes: codes });
                            }} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${editingUser.permission_codes.includes(perm.code) ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
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
                          <span className="text-white font-medium">{user.username?.charAt(0).toUpperCase() || '?'}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{user.username}</span>
                            {user.is_admin && <span className="px-2 py-0.5 text-xs bg-purple-600/20 text-purple-400 rounded flex items-center gap-1"><Shield className="w-3 h-3" /> Admin</span>}
                          </div>
                          <div className="text-sm text-gray-400">{user.email}</div>
                          {user.discord_id && <div className="text-xs text-indigo-400">Discord: {user.discord_id}</div>}
                          {user.bereiche?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {user.bereiche.map(b => <span key={b.id} className="px-1.5 py-0.5 text-xs bg-blue-600/20 text-blue-400 rounded">{b.name}</span>)}
                            </div>
                          )}
                        </div>
                      </div>
                      <button onClick={() => setEditingUser({
                        id: user.id, permission_codes: [], forced_theme: user.forced_theme, theme_locked: false,
                        discord_id: user.discord_id || '', bereich_ids: (user.bereiche || []).map(b => b.id),
                      })} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
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
              {Object.entries(permissions.reduce((acc, perm) => { const cat = perm.category || 'general'; if (!acc[cat]) acc[cat] = []; acc[cat].push(perm); return acc; }, {})).map(([category, perms]) => (
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

          {/* ═══ Monitor Tab ═══ */}
          {activeTab === 'monitor' && (
            <div className="space-y-6">
              {!monitorConfig ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                </div>
              ) : (
                <>
                  {/* ON AIR Quick Toggle */}
                  <div className={`rounded-xl p-6 border ${monitorConfig.ist_on_air ? 'bg-red-900/20 border-red-600' : 'bg-gray-900 border-gray-800'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Radio className={`w-8 h-8 ${monitorConfig.ist_on_air ? 'text-red-500 animate-pulse' : 'text-gray-600'}`} />
                        <div>
                          <h3 className="text-lg font-bold text-white">{monitorConfig.on_air_text || 'ON AIR'}</h3>
                          <p className="text-sm text-gray-400">
                            {monitorConfig.ist_on_air ? 'Live — wird auf dem Monitor angezeigt' : 'Inaktiv'}
                          </p>
                        </div>
                      </div>
                      <button onClick={handleToggleOnAir}
                        className={`px-6 py-3 rounded-xl font-bold text-lg transition-all ${
                          monitorConfig.ist_on_air
                            ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        }`}>
                        {monitorConfig.ist_on_air ? 'STOP' : 'GO LIVE'}
                      </button>
                    </div>
                  </div>

                  {/* Monitor URL */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                    <Monitor className="w-5 h-5 text-gray-400" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-400">Monitor-URL (ohne Login erreichbar):</p>
                      <code className="text-blue-400 text-sm">{window.location.origin}/monitor</code>
                    </div>
                    <a href="/monitor" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg">
                      <ExternalLink className="w-4 h-4" /> Öffnen
                    </a>
                  </div>

                  {/* Konfiguration */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="p-4 bg-gray-800/50 flex items-center justify-between">
                      <h3 className="font-semibold text-white">Konfiguration</h3>
                      <button onClick={handleSaveMonitorConfig} disabled={monitorSaving}
                        className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded-lg">
                        {monitorSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Speichern
                      </button>
                    </div>

                    <div className="p-6 space-y-6">
                      {/* Allgemein */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">Titel</label>
                          <input type="text" value={monitorConfig.titel} onChange={e => updateConfig('titel', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">Untertitel</label>
                          <input type="text" value={monitorConfig.untertitel} onChange={e => updateConfig('untertitel', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">Logo-URL</label>
                          <input type="url" value={monitorConfig.logo_url} onChange={e => updateConfig('logo_url', e.target.value)}
                            placeholder="https://..." className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500" />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">Hintergrundfarbe</label>
                          <div className="flex gap-2">
                            <input type="color" value={monitorConfig.hintergrund_farbe} onChange={e => updateConfig('hintergrund_farbe', e.target.value)}
                              className="w-10 h-10 rounded border border-gray-700 cursor-pointer" />
                            <input type="text" value={monitorConfig.hintergrund_farbe} onChange={e => updateConfig('hintergrund_farbe', e.target.value)}
                              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
                          </div>
                        </div>
                      </div>

                      {/* Widgets */}
                      <div>
                        <label className="block text-sm text-gray-400 mb-3">Sichtbare Bereiche</label>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { key: 'zeige_uhr', label: 'Uhrzeit & Datum' },
                            { key: 'zeige_veranstaltungen', label: 'Veranstaltungen' },
                            { key: 'zeige_ankuendigungen', label: 'Ankündigungen' },
                            { key: 'zeige_onair', label: 'ON AIR Indikator' },
                            { key: 'zeige_webuntis', label: 'WebUntis Stundenplan' },
                            { key: 'zeige_logo', label: 'Logo anzeigen' },
                          ].map(w => (
                            <button key={w.key} onClick={() => updateConfig(w.key, !monitorConfig[w.key])}
                              className={`p-3 rounded-lg text-sm text-left border transition-colors ${
                                monitorConfig[w.key] ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'bg-gray-800 border-gray-700 text-gray-400'
                              }`}>
                              {w.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* WebUntis */}
                      {monitorConfig.zeige_webuntis && (
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">WebUntis URL</label>
                          <input type="url" value={monitorConfig.webuntis_url} onChange={e => updateConfig('webuntis_url', e.target.value)}
                            placeholder="https://neilo.webuntis.com/..." className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500" />
                        </div>
                      )}

                      {/* ON AIR */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">ON AIR Text</label>
                          <input type="text" value={monitorConfig.on_air_text} onChange={e => updateConfig('on_air_text', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">Refresh-Intervall (Sekunden)</label>
                          <input type="number" value={monitorConfig.refresh_intervall} onChange={e => updateConfig('refresh_intervall', parseInt(e.target.value) || 30)}
                            min={5} max={300} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
                        </div>
                      </div>

                      {/* API Token für ATEM */}
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">API-Token (für ATEM / externe Steuerung)</label>
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <input type={showToken ? 'text' : 'password'} value={monitorConfig.api_token} readOnly
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono pr-10" />
                            <button onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <button onClick={() => { navigator.clipboard.writeText(monitorConfig.api_token); toast.success('Token kopiert'); }}
                            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"><Copy className="w-4 h-4" /></button>
                          <button onClick={handleRegenerateToken}
                            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"><RefreshCw className="w-4 h-4" /></button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          ATEM-Steuerung: <code className="text-gray-400">POST /api/monitor/onair</code> mit Header <code className="text-gray-400">X-Monitor-Token: {'<token>'}</code> und Body <code className="text-gray-400">{`{"on_air": true}`}</code>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Ankündigungen */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="p-4 bg-gray-800/50 flex items-center justify-between">
                      <h3 className="font-semibold text-white flex items-center gap-2">
                        <Megaphone className="w-5 h-5" /> Ankündigungen ({monitorAnkuendigungen.length})
                      </h3>
                      <button onClick={() => setNewAnkuendigung({ titel: '', text: '', prioritaet: 'normal', ist_aktiv: true })}
                        className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg">
                        <Plus className="w-4 h-4" /> Neue Ankündigung
                      </button>
                    </div>

                    {/* Neue Ankündigung Form */}
                    {newAnkuendigung && (
                      <div className="p-4 border-b border-gray-800 bg-gray-800/30 space-y-3">
                        <input type="text" value={newAnkuendigung.titel} onChange={e => setNewAnkuendigung({ ...newAnkuendigung, titel: e.target.value })}
                          placeholder="Titel *" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
                        <textarea value={newAnkuendigung.text} onChange={e => setNewAnkuendigung({ ...newAnkuendigung, text: e.target.value })}
                          placeholder="Text (optional)" rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-none" />
                        <div className="flex items-center gap-3">
                          <select value={newAnkuendigung.prioritaet} onChange={e => setNewAnkuendigung({ ...newAnkuendigung, prioritaet: e.target.value })}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
                            <option value="normal">Normal</option>
                            <option value="wichtig">Wichtig</option>
                            <option value="dringend">Dringend</option>
                          </select>
                          <div className="flex-1" />
                          <button onClick={() => setNewAnkuendigung(null)} className="px-3 py-1.5 text-gray-400 hover:text-white text-sm">Abbrechen</button>
                          <button onClick={handleCreateAnkuendigung} disabled={!newAnkuendigung.titel}
                            className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded-lg">Erstellen</button>
                        </div>
                      </div>
                    )}

                    <div className="divide-y divide-gray-800">
                      {monitorAnkuendigungen.map(a => (
                        <div key={a.id} className="p-4 flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">{a.titel}</span>
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                a.prioritaet === 'dringend' ? 'bg-red-900/30 text-red-400' :
                                a.prioritaet === 'wichtig' ? 'bg-amber-900/30 text-amber-400' :
                                'bg-gray-700 text-gray-400'
                              }`}>{a.prioritaet}</span>
                              {!a.ist_aktiv && <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-500 rounded">Inaktiv</span>}
                            </div>
                            {a.text && <p className="text-sm text-gray-400 mt-1">{a.text}</p>}
                          </div>
                          <button onClick={() => handleDeleteAnkuendigung(a.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {monitorAnkuendigungen.length === 0 && !newAnkuendigung && (
                        <div className="p-8 text-center text-gray-400">
                          <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>Keine Ankündigungen</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
