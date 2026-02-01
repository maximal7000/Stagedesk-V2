/**
 * Einstellungen-Seite
 */
import { useState, useEffect } from 'react';
import { Sun, Moon, Monitor, Globe, Shield, Key, Loader2, LogOut, CheckCircle, AlertCircle, Smartphone, Laptop } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useUser } from '../contexts/UserContext';

export default function SettingsPage() {
  const { effectiveTheme, forcedTheme, canChangTheme } = useTheme();
  const { profile, hasPermission, updateTheme, sessions, fetchSessions, revokeSession, initializeSystem } = useUser();
  
  const [activeTab, setActiveTab] = useState('appearance');
  const [saving, setSaving] = useState(false);
  const [initResult, setInitResult] = useState(null);

  useEffect(() => {
    if (activeTab === 'sessions') fetchSessions();
  }, [activeTab, fetchSessions]);

  const tabs = [
    { id: 'appearance', name: 'Darstellung', icon: Sun },
    { id: 'sessions', name: 'Sitzungen', icon: Globe },
    { id: 'security', name: 'Sicherheit', icon: Shield },
  ];

  const handleThemeChange = async (newTheme) => {
    if (!canChangTheme || forcedTheme) return;
    if (!hasPermission('theme.light_mode') && newTheme === 'light') return;
    setSaving(true);
    await updateTheme(newTheme);
    setSaving(false);
  };

  const handleRevokeSession = async (sessionId) => {
    if (!confirm('Sitzung beenden?')) return;
    await revokeSession(sessionId);
  };

  const handleInitialize = async () => {
    const result = await initializeSystem();
    setInitResult(result);
  };

  const getDeviceIcon = (info) => {
    if (info?.includes('Mobil')) return Smartphone;
    if (info?.includes('Windows') || info?.includes('macOS') || info?.includes('Linux')) return Laptop;
    return Globe;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Einstellungen</h1>
        <p className="text-gray-400 mt-1">Persönliche Einstellungen</p>
      </div>

      <div className="border-b border-gray-800">
        <nav className="flex gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-400 hover:text-white'}`}>
                <Icon className="w-5 h-5" />{tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        {activeTab === 'appearance' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white">Theme</h3>
            {forcedTheme && (
              <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg flex items-center gap-2 text-yellow-400">
                <AlertCircle className="w-5 h-5" /><span>Theme vom Admin festgelegt.</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4">
              {[{t:'dark',icon:Moon,color:'blue'},{t:'light',icon:Sun,color:'yellow'},{t:'system',icon:Monitor,color:'gray'}].map(({t,icon:Icon,color}) => (
                <button key={t} onClick={() => handleThemeChange(t)} disabled={!!forcedTheme || saving || (t==='light' && !hasPermission('theme.light_mode'))}
                  className={`relative p-4 rounded-xl border-2 transition-all ${effectiveTheme === t ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700'} ${forcedTheme || (t==='light' && !hasPermission('theme.light_mode')) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
                      <Icon className={`w-6 h-6 text-${color}-400`} />
                    </div>
                    <span className="font-medium text-white capitalize">{t}</span>
                  </div>
                  {effectiveTheme === t && <CheckCircle className="absolute top-2 right-2 w-5 h-5 text-blue-500" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white">Aktive Sitzungen</h3>
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-gray-400"><Globe className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Keine Sitzungen</p></div>
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => {
                  const Icon = getDeviceIcon(s.device_info);
                  return (
                    <div key={s.id} className={`p-4 rounded-lg border ${s.is_current ? 'border-green-600 bg-green-950/20' : 'border-gray-700'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.is_current ? 'bg-green-600/20' : 'bg-gray-700'}`}>
                            <Icon className={`w-5 h-5 ${s.is_current ? 'text-green-400' : 'text-gray-400'}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">{s.device_info}</span>
                              {s.is_current && <span className="text-xs px-2 py-0.5 bg-green-600/20 text-green-400 rounded">Aktuell</span>}
                            </div>
                            <div className="text-sm text-gray-400">IP: {s.ip_address || 'Unbekannt'}</div>
                          </div>
                        </div>
                        {!s.is_current && (
                          <button onClick={() => handleRevokeSession(s.id)} className="p-2 text-red-400 hover:bg-red-900/20 rounded-lg">
                            <LogOut className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">2FA</h3>
              <div className="p-4 rounded-lg border border-gray-700 bg-gray-800/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${profile?.two_factor_enabled ? 'bg-green-600/20' : 'bg-gray-700'}`}>
                    <Key className={`w-5 h-5 ${profile?.two_factor_enabled ? 'text-green-400' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <span className="font-medium text-white">2FA Status</span>
                    <p className="text-sm text-gray-400">{profile?.two_factor_enabled ? 'Aktiviert' : 'Nicht aktiviert'}</p>
                  </div>
                </div>
                <a href="https://auth.t410.de/realms/master/account/#/security/signingin" target="_blank" rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg">
                  {profile?.two_factor_enabled ? 'Verwalten' : 'Aktivieren'}
                </a>
              </div>
            </div>
            <div className="pt-6 border-t border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">System initialisieren</h3>
              <button onClick={handleInitialize} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg">
                Permissions initialisieren
              </button>
              {initResult && <div className="mt-4 p-3 bg-gray-800 rounded-lg text-sm"><pre className="text-gray-300 overflow-auto">{JSON.stringify(initResult, null, 2)}</pre></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
