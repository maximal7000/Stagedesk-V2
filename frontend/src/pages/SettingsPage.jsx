/**
 * Einstellungen-Seite mit Tabs
 */
import { useState, useEffect } from 'react';
import { 
  Sun, Moon, Monitor, Smartphone, Laptop, Globe, 
  Shield, Key, Loader2, LogOut, CheckCircle, XCircle, AlertCircle
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useUser } from '../contexts/UserContext';

export default function SettingsPage() {
  const { theme, effectiveTheme, forcedTheme, canChangTheme, setTheme } = useTheme();
  const { 
    profile, 
    hasPermission, 
    isAdmin, 
    updateTheme, 
    sessions, 
    fetchSessions, 
    revokeSession,
    initializeSystem 
  } = useUser();
  
  const [activeTab, setActiveTab] = useState('appearance');
  const [saving, setSaving] = useState(false);
  const [initResult, setInitResult] = useState(null);

  useEffect(() => {
    if (activeTab === 'sessions') {
      fetchSessions();
    }
  }, [activeTab, fetchSessions]);

  const tabs = [
    { id: 'appearance', name: 'Darstellung', icon: Sun },
    { id: 'sessions', name: 'Sitzungen', icon: Globe },
    { id: 'security', name: 'Sicherheit', icon: Shield },
  ];

  const handleThemeChange = async (newTheme) => {
    if (!canChangTheme || forcedTheme) return;
    if (!hasPermission('theme.light_mode') && newTheme === 'light') {
      alert('Du hast keine Berechtigung für den Light Mode.');
      return;
    }
    
    setSaving(true);
    await updateTheme(newTheme);
    setSaving(false);
  };

  const handleRevokeSession = async (sessionId) => {
    if (!confirm('Möchtest du diese Sitzung wirklich beenden?')) return;
    await revokeSession(sessionId);
  };

  const handleInitialize = async () => {
    const result = await initializeSystem();
    setInitResult(result);
  };

  const getDeviceIcon = (deviceInfo) => {
    if (deviceInfo.includes('Mobil')) return Smartphone;
    if (deviceInfo.includes('Windows') || deviceInfo.includes('macOS') || deviceInfo.includes('Linux')) return Laptop;
    return Globe;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Einstellungen</h1>
        <p className="text-gray-400 mt-1">Verwalte deine persönlichen Einstellungen</p>
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
                    ? 'border-blue-500 text-blue-500'
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

      {/* Tab Content */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Theme</h3>
              <p className="text-sm text-gray-400 mb-4">
                Wähle das Farbschema für die Anwendung
              </p>
              
              {forcedTheme && (
                <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg flex items-center gap-2 text-yellow-400">
                  <AlertCircle className="w-5 h-5" />
                  <span>Das Theme wurde von einem Administrator festgelegt.</span>
                </div>
              )}

              {!hasPermission('theme.light_mode') && !forcedTheme && (
                <div className="mb-4 p-3 bg-gray-800 border border-gray-700 rounded-lg flex items-center gap-2 text-gray-400">
                  <AlertCircle className="w-5 h-5" />
                  <span>Light Mode ist für dein Konto nicht verfügbar.</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                {/* Dark Mode */}
                <button
                  onClick={() => handleThemeChange('dark')}
                  disabled={!!forcedTheme || saving}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    effectiveTheme === 'dark'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  } ${forcedTheme ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
                      <Moon className="w-6 h-6 text-blue-400" />
                    </div>
                    <span className="font-medium text-white">Dark</span>
                  </div>
                  {effectiveTheme === 'dark' && (
                    <CheckCircle className="absolute top-2 right-2 w-5 h-5 text-blue-500" />
                  )}
                </button>

                {/* Light Mode */}
                <button
                  onClick={() => handleThemeChange('light')}
                  disabled={!!forcedTheme || !hasPermission('theme.light_mode') || saving}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    effectiveTheme === 'light'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  } ${(forcedTheme || !hasPermission('theme.light_mode')) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
                      <Sun className="w-6 h-6 text-yellow-400" />
                    </div>
                    <span className="font-medium text-white">Light</span>
                  </div>
                  {effectiveTheme === 'light' && (
                    <CheckCircle className="absolute top-2 right-2 w-5 h-5 text-blue-500" />
                  )}
                </button>

                {/* System */}
                <button
                  onClick={() => handleThemeChange('system')}
                  disabled={!!forcedTheme || saving}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    effectiveTheme === 'system'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  } ${forcedTheme ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
                      <Monitor className="w-6 h-6 text-gray-400" />
                    </div>
                    <span className="font-medium text-white">System</span>
                  </div>
                  {effectiveTheme === 'system' && (
                    <CheckCircle className="absolute top-2 right-2 w-5 h-5 text-blue-500" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Aktive Sitzungen</h3>
              <p className="text-sm text-gray-400 mb-4">
                Hier siehst du alle Geräte, auf denen du angemeldet bist
              </p>

              {sessions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Keine Sitzungen gefunden</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session) => {
                    const DeviceIcon = getDeviceIcon(session.device_info);
                    return (
                      <div
                        key={session.id}
                        className={`p-4 rounded-lg border ${
                          session.is_current
                            ? 'border-green-600 bg-green-950/20'
                            : 'border-gray-700 bg-gray-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              session.is_current ? 'bg-green-600/20' : 'bg-gray-700'
                            }`}>
                              <DeviceIcon className={`w-5 h-5 ${
                                session.is_current ? 'text-green-400' : 'text-gray-400'
                              }`} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">
                                  {session.device_info}
                                </span>
                                {session.is_current && (
                                  <span className="text-xs px-2 py-0.5 bg-green-600/20 text-green-400 rounded">
                                    Aktuell
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-400">
                                IP: {session.ip_address || 'Unbekannt'} • Letzte Aktivität: {new Date(session.last_activity).toLocaleString('de-DE')}
                              </div>
                            </div>
                          </div>
                          {!session.is_current && (
                            <button
                              onClick={() => handleRevokeSession(session.id)}
                              className="p-2 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Sitzung beenden"
                            >
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
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Zwei-Faktor-Authentifizierung</h3>
              <p className="text-sm text-gray-400 mb-4">
                Erhöhe die Sicherheit deines Kontos mit 2FA
              </p>

              <div className="p-4 rounded-lg border border-gray-700 bg-gray-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      profile?.two_factor_enabled ? 'bg-green-600/20' : 'bg-gray-700'
                    }`}>
                      <Key className={`w-5 h-5 ${
                        profile?.two_factor_enabled ? 'text-green-400' : 'text-gray-400'
                      }`} />
                    </div>
                    <div>
                      <span className="font-medium text-white">2FA Status</span>
                      <p className="text-sm text-gray-400">
                        {profile?.two_factor_enabled ? 'Aktiviert' : 'Nicht aktiviert'}
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://auth.t410.de/realms/master/account/#/security/signingin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                  >
                    {profile?.two_factor_enabled ? 'Verwalten' : 'Aktivieren'}
                  </a>
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                2FA wird über Keycloak verwaltet. Klicke auf den Button, um die Einstellungen zu öffnen.
              </p>
            </div>

            {/* System Initialize (nur für Admins) */}
            {isAdmin && (
              <div className="pt-6 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-2">System initialisieren</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Erstellt die Standard-Permissions für die Anwendung.
                </p>

                <button
                  onClick={handleInitialize}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
                >
                  Permissions initialisieren
                </button>

                {initResult && (
                  <div className="mt-4 p-3 bg-gray-800 rounded-lg text-sm">
                    <pre className="text-gray-300 overflow-auto">
                      {JSON.stringify(initResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
