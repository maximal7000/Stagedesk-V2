/**
 * Einstellungen-Seite mit Tabs
 */
import { useState, useEffect } from 'react';
import {
  Sun, Moon, Monitor, Smartphone, Laptop, Globe,
  Shield, Key, Loader2, LogOut, CheckCircle, XCircle, AlertCircle, Bell, User, Upload, Trash2,
  Calendar, Copy, RefreshCw, ChevronRight, ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useUser } from '../contexts/UserContext';
import { getPushStatus, subscribePush, unsubscribePush, testPush } from '../lib/push';
import apiClient from '../lib/api';

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
    revokeAllSessions,
    initializeSystem 
  } = useUser();
  
  const [activeTab, setActiveTab] = useState('appearance');
  const [mobileDetail, setMobileDetail] = useState(false); // mobil: Liste vs. Detail
  const [saving, setSaving] = useState(false);
  const [initResult, setInitResult] = useState(null);

  useEffect(() => {
    if (activeTab === 'sessions') {
      fetchSessions();
    }
  }, [activeTab, fetchSessions]);

  const tabs = [
    { id: 'profile', name: 'Profil', icon: User },
    { id: 'appearance', name: 'Darstellung', icon: Sun },
    { id: 'notifications', name: 'Benachrichtigungen', icon: Bell },
    { id: 'kalender', name: 'Kalender-Abo', icon: Calendar },
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

  const activeTabName = tabs.find(t => t.id === activeTab)?.name || 'Einstellungen';

  return (
    <div className="max-w-6xl mx-auto">
      {/* Kopf — mobil mit Zurück-Pfeil im Detail */}
      <div className="mb-6 flex items-center gap-2">
        {mobileDetail && (
          <button onClick={() => setMobileDetail(false)}
            className="md:hidden p-2 -ml-2 text-gray-400 hover:text-white rounded-lg">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">
            <span className="md:hidden">{mobileDetail ? activeTabName : 'Einstellungen'}</span>
            <span className="hidden md:inline">Einstellungen</span>
          </h1>
          <p className="text-gray-400 mt-1 hidden md:block">Verwalte deine persönlichen Einstellungen</p>
        </div>
      </div>

      <div className="md:flex md:gap-6 md:items-start">
        {/* Nav-Liste (wie System-Einstellungen) */}
        <aside className={`md:w-60 md:shrink-0 md:sticky md:top-4 ${mobileDetail ? 'hidden md:block' : 'block'}`}>
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setMobileDetail(true); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    active
                      ? 'md:bg-blue-600/15 md:text-blue-400 text-gray-200 bg-gray-800/60'
                      : 'text-gray-300 hover:bg-gray-800/70'
                  }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${active ? 'md:text-blue-400' : 'text-gray-400'}`} />
                  <span className="flex-1 font-medium">{tab.name}</span>
                  <ChevronRight className="w-4 h-4 text-gray-500 md:hidden" />
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Detail-Inhalt */}
        <main className={`flex-1 min-w-0 ${mobileDetail ? 'block' : 'hidden md:block'}`}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        {/* Profile Tab */}
        {activeTab === 'profile' && <ProfileTab />}

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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

        {/* Notifications Tab */}
        {activeTab === 'notifications' && <NotificationsTab />}

        {/* Kalender-Abo Tab */}
        {activeTab === 'kalender' && <KalenderAboTab />}

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                <div>
                  <h3 className="text-lg font-semibold text-white">Aktive Sitzungen</h3>
                  <p className="text-sm text-gray-400">
                    Hier siehst du alle Geräte, auf denen du angemeldet bist.
                  </p>
                </div>
                {sessions.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={async () => {
                        if (!confirm('Alle anderen Sitzungen abmelden? Auf diesen Geräten ist eine neue Anmeldung nötig.')) return;
                        const r = await revokeAllSessions({ includeCurrent: false });
                        if (r) toast.success(`${r.revoked} Sitzung(en) abgemeldet`);
                        else toast.error('Fehler');
                      }}
                      className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg">
                      Alle anderen abmelden
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('ALLE Sitzungen inkl. diese abmelden? Du musst dich danach neu anmelden.')) return;
                        await revokeAllSessions({ includeCurrent: true });
                      }}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg">
                      Auch hier abmelden
                    </button>
                  </div>
                )}
              </div>

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
                    href={`${import.meta.env.VITE_KEYCLOAK_URL || 'https://auth.t410.de'}/realms/${import.meta.env.VITE_KEYCLOAK_REALM || 'technik-ag'}/account/#/security/signingin`}
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

          </div>
        )}
      </div>
        </main>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [status, setStatus] = useState({ supported: true, permission: 'default', subscribed: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => { getPushStatus().then(setStatus).catch(() => {}); }, []);

  const refresh = () => getPushStatus().then(setStatus).catch(() => {});

  const onSubscribe = async () => {
    setBusy(true);
    try { await subscribePush(); toast.success('Benachrichtigungen aktiviert'); }
    catch (e) { toast.error(e.message || 'Aktivierung fehlgeschlagen'); }
    finally { setBusy(false); refresh(); }
  };

  const onUnsubscribe = async () => {
    setBusy(true);
    try { await unsubscribePush(); toast.success('Benachrichtigungen deaktiviert'); }
    catch { toast.error('Fehler beim Abbestellen'); }
    finally { setBusy(false); refresh(); }
  };

  const onTest = async () => {
    try { await testPush(); toast.success('Test-Push gesendet'); }
    catch { toast.error('Test fehlgeschlagen'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Push-Benachrichtigungen</h3>
        <p className="text-sm text-gray-400 mb-4">
          Bekomme Browser-Hinweise auf Zuweisungen, Erinnerungen und Mahnungen — auch wenn die App nicht offen ist.
        </p>
        {!status.supported ? (
          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-gray-400 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> Dein Browser unterstützt keine Web-Push-Notifications.
          </div>
        ) : status.permission === 'denied' ? (
          <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">
            <p className="font-medium">Permission verweigert.</p>
            <p className="mt-1">Du hast die Berechtigung im Browser blockiert. Bitte über das Schloss-Symbol neben der URL wieder freigeben.</p>
          </div>
        ) : (
          <div className="p-4 rounded-lg border border-gray-700 bg-gray-800/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className={`w-5 h-5 ${status.subscribed ? 'text-green-400' : 'text-gray-400'}`} />
              <div>
                <span className="font-medium text-white">{status.subscribed ? 'Aktiviert' : 'Nicht aktiviert'}</span>
                <p className="text-xs text-gray-500">Pro Browser/Gerät — auf jedem Endgerät separat aktivieren.</p>
              </div>
            </div>
            <div className="flex gap-2">
              {status.subscribed && (
                <button onClick={onTest} disabled={busy}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                  Test
                </button>
              )}
              {status.subscribed ? (
                <button onClick={onUnsubscribe} disabled={busy}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                  Deaktivieren
                </button>
              ) : (
                <button onClick={onSubscribe} disabled={busy}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Aktivieren'}
                </button>
              )}
            </div>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">
          Hinweis: Auf iOS funktionieren Push-Notifications nur, wenn Stagedesk als PWA über „Zum Home-Bildschirm" installiert ist.
        </p>
      </div>

      <NotificationCategories />
    </div>
  );
}

function NotifSwitch({ on, onClick, disabled, offColor = 'bg-gray-600' }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-blue-600' : offColor} disabled:opacity-40`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function NotificationCategories() {
  const [cfg, setCfg] = useState(null);

  useEffect(() => { apiClient.get('/users/notification-config').then(r => setCfg(r.data)).catch(() => {}); }, []);
  if (!cfg) return null;

  const toggleMine = async (kind) => {
    const disabled = cfg.my_disabled.includes(kind)
      ? cfg.my_disabled.filter(k => k !== kind)
      : [...cfg.my_disabled, kind];
    setCfg({ ...cfg, my_disabled: disabled });
    try { await apiClient.put('/users/me', { notify_disabled: disabled }); }
    catch { toast.error('Speichern fehlgeschlagen'); }
  };
  const toggleGlobal = async (kind) => {
    const disabled = cfg.global_disabled.includes(kind)
      ? cfg.global_disabled.filter(k => k !== kind)
      : [...cfg.global_disabled, kind];
    setCfg({ ...cfg, global_disabled: disabled });
    try { await apiClient.put('/users/notification-config/global', { disabled }); toast.success('Global gespeichert'); }
    catch { toast.error('Speichern fehlgeschlagen'); }
  };

  return (
    <>
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Kategorien</h3>
        <p className="text-sm text-gray-400 mb-4">Welche Benachrichtigungen möchtest du bekommen?</p>
        <div className="space-y-2">
          {cfg.kinds.map(k => {
            const globalOff = cfg.global_disabled.includes(k.value);
            const on = !cfg.my_disabled.includes(k.value) && !globalOff;
            return (
              <div key={k.value} className="flex items-center justify-between p-3 rounded-lg border border-gray-700 bg-gray-800/50">
                <div>
                  <span className="text-white">{k.label}</span>
                  {globalOff && <span className="ml-2 text-xs text-amber-400">systemweit deaktiviert</span>}
                </div>
                <NotifSwitch on={on} disabled={globalOff} onClick={() => toggleMine(k.value)} />
              </div>
            );
          })}
        </div>
      </div>

      {cfg.is_admin && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Global (Admin)</h3>
          <p className="text-sm text-gray-400 mb-4">
            Kategorien hier systemweit abschalten — diese Benachrichtigungen werden dann für <strong>alle</strong> Nutzer nicht mehr verschickt.
          </p>
          <div className="space-y-2">
            {cfg.kinds.map(k => {
              const on = !cfg.global_disabled.includes(k.value);
              return (
                <div key={k.value} className="flex items-center justify-between p-3 rounded-lg border border-gray-700 bg-gray-800/50">
                  <span className="text-white">{k.label}</span>
                  <NotifSwitch on={on} offColor="bg-red-600" onClick={() => toggleGlobal(k.value)} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function ProfileTab() {
  const { profile, fetchProfile } = useUser();
  const [landing, setLanding] = useState(profile?.default_landing || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { setLanding(profile?.default_landing || ''); }, [profile?.default_landing]);

  const LANDING_OPTIONS = [
    { v: '',                l: 'Dashboard (Standard)' },
    { v: '/veranstaltung',  l: 'Veranstaltungen' },
    { v: '/kalender',       l: 'Kalender' },
    { v: '/inventar',       l: 'Inventar' },
    { v: '/anwesenheit',    l: 'Anwesenheit' },
    { v: '/kompetenzen',    l: 'Kompetenzen' },
    { v: '/aufgaben',       l: 'Aufgaben' },
    { v: '/haushalte',      l: 'Haushalte' },
    { v: '/notifications',  l: 'Benachrichtigungen' },
  ];

  const saveLanding = async (v) => {
    setSaving(true);
    setLanding(v);
    try { await apiClient.put('/users/me', { default_landing: v }); fetchProfile(); toast.success('Gespeichert'); }
    catch { toast.error('Speichern fehlgeschlagen'); }
    finally { setSaving(false); }
  };

  const uploadAvatar = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('datei', file);
      await apiClient.post('/users/me/avatar', fd);
      fetchProfile(); toast.success('Profilbild aktualisiert');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Upload fehlgeschlagen'); }
    finally { setUploading(false); }
  };

  const removeAvatar = async () => {
    if (!confirm('Profilbild entfernen?')) return;
    try { await apiClient.delete('/users/me/avatar'); fetchProfile(); toast.success('Entfernt'); }
    catch { toast.error('Fehler'); }
  };

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Profilbild</h3>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              : <User className="w-9 h-9 text-white" />
            }
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg cursor-pointer">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {profile?.avatar_url ? 'Bild ersetzen' : 'Bild hochladen'}
              <input type="file" className="hidden" accept="image/*"
                onChange={(e) => uploadAvatar(e.target.files?.[0])} />
            </label>
            {profile?.avatar_url && (
              <button onClick={removeAvatar}
                className="inline-flex items-center gap-1 text-sm text-red-400 hover:text-red-300">
                <Trash2 className="w-3.5 h-3.5" /> Entfernen
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">Max. 5 MB · JPG/PNG/GIF/WebP</p>
      </div>

      {/* Landing Page */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-2">Startseite nach Login</h3>
        <p className="text-sm text-gray-400 mb-3">
          Welche Seite soll direkt nach dem Anmelden geöffnet werden?
        </p>
        <select value={landing} onChange={(e) => saveLanding(e.target.value)}
          disabled={saving}
          className="w-full md:w-80 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
          {LANDING_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </div>
    </div>
  );
}

function KalenderAboTab() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiClient.get('/kalender/ical-token');
        setToken(r.data.token || '');
      } catch { toast.error('Token konnte nicht geladen werden'); }
      finally { setLoading(false); }
    })();
  }, []);

  const url = token ? `${window.location.origin}/kalender/feed.ics?token=${token}` : '';
  const webcalUrl = url ? url.replace(/^https?:/, 'webcal:') : '';

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('URL kopiert'); }
    catch { toast.error('Kopieren fehlgeschlagen'); }
  };

  const regenerate = async () => {
    if (!confirm('Aktuelle Abonnements werden ungültig. Fortfahren?')) return;
    setRegenerating(true);
    try {
      const r = await apiClient.post('/kalender/ical-token/regenerate');
      setToken(r.data.token);
      toast.success('Neuer Token erzeugt');
    } catch { toast.error('Fehler beim Neuerzeugen'); }
    finally { setRegenerating(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-400" /> Kalender-Abo
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Abonniere alle Stagedesk-Events in deinem Lieblings-Kalender
          (Apple Calendar, Google Calendar, Thunderbird, Outlook).
          Änderungen in Stagedesk erscheinen dort automatisch.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
      ) : (
        <>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Deine persönliche Abo-URL</label>
            <div className="flex gap-2 flex-wrap">
              <input type="text" readOnly value={url}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-[260px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono" />
              <button onClick={copy}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
                <Copy className="w-4 h-4" /> Kopieren
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Tipp: In Apple Calendar als <code className="text-gray-400">webcal://</code>-Link öffnen —{' '}
              <a href={webcalUrl} className="text-blue-400 underline">direkt abonnieren</a>.
            </p>
          </div>

          <div className="pt-4 border-t border-gray-800">
            <p className="text-sm text-gray-400 mb-2">
              Falls du den Link versehentlich geteilt hast: Token neu erzeugen.
              <span className="text-yellow-500"> Bestehende Abos werden ungültig.</span>
            </p>
            <button onClick={regenerate} disabled={regenerating}
              className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm rounded-lg">
              {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Token neu erzeugen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
