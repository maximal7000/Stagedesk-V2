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
import { Button, StatusBadge, EmptyState } from '../components/ui';

// Abschnittskopf innerhalb eines Einstellungs-Panels
function SectionHead({ title, description, children }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
      <div className="min-w-0">
        <h3 className="font-display text-lg font-semibold tracking-tight text-fg leading-tight">{title}</h3>
        {description && <p className="text-sm text-fg-muted mt-1 max-w-prose">{description}</p>}
      </div>
      {children && <div className="flex gap-2 flex-wrap">{children}</div>}
    </div>
  );
}

// Hinweiszeile (Info/Warnung) im Panel
function Notice({ tone = 'neutral', children }) {
  const cls = {
    neutral: 'bg-raised text-fg-muted',
    warning: 'bg-raised text-fg',
    danger: 'bg-raised text-fg',
  }[tone];
  const iconCls = {
    neutral: 'text-fg-subtle',
    warning: 'text-warn',
    danger: 'text-bad',
  }[tone];
  return (
    <div className={`mb-4 p-3 rounded-lg flex items-start gap-2.5 text-sm ${cls}`}>
      <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${iconCls}`} />
      <div>{children}</div>
    </div>
  );
}

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
    <div className="w-full">
      {/* Kopf: mobil mit Zurück-Pfeil im Detail */}
      <div className="mb-6 flex items-center gap-2">
        {mobileDetail && (
          <button onClick={() => setMobileDetail(false)} aria-label="Zurück zur Übersicht"
            className="md:hidden p-2 -ml-2 text-fg-muted hover:text-fg rounded-md">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-[1.6rem] leading-none font-bold tracking-tight text-fg truncate">
            <span className="md:hidden">{mobileDetail ? activeTabName : 'Einstellungen'}</span>
            <span className="hidden md:inline">Einstellungen</span>
          </h1>
        </div>
      </div>

      <div className="md:flex md:gap-6 md:items-start">
        {/* Nav-Liste (wie System-Einstellungen) */}
        <aside className={`md:w-60 md:shrink-0 md:sticky md:top-4 ${mobileDetail ? 'hidden md:block' : 'block'}`}>
          <nav className="space-y-0.5 md:bg-surface md:rounded-lg md:p-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setMobileDetail(true); }}
                  aria-current={active ? 'page' : undefined}
                  className={`relative w-full flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-md text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                    active
                      ? 'md:bg-raised md:text-fg text-fg-muted bg-raised'
                      : 'text-fg-muted hover:bg-raised hover:text-fg'
                  }`}
                >
                  {active && <span className="hidden md:block absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-sm bg-accent" aria-hidden="true" />}
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'md:text-accent-fg' : 'text-fg-subtle'}`} />
                  <span className="flex-1 font-medium">{tab.name}</span>
                  <ChevronRight className="w-4 h-4 text-fg-subtle md:hidden" />
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Detail-Inhalt */}
        <main className={`flex-1 min-w-0 ${mobileDetail ? 'block' : 'hidden md:block'}`}>
      <div>
        {/* Profile Tab */}
        {activeTab === 'profile' && <ProfileTab />}

        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <div className="space-y-6">
            <div>
              <SectionHead title="Farbschema" description="Gilt für dieses Konto auf allen Geräten." />

              {forcedTheme && (
                <Notice tone="warning">Das Farbschema wurde von einem Administrator festgelegt.</Notice>
              )}

              {!hasPermission('theme.light_mode') && !forcedTheme && (
                <Notice>Der helle Modus ist für dein Konto nicht freigeschaltet.</Notice>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Dark Mode */}
                <button
                  onClick={() => handleThemeChange('dark')}
                  disabled={!!forcedTheme || saving}
                  className={`relative p-4 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                    effectiveTheme === 'dark'
                      ? 'bg-raised'
                      : 'bg-surface hover:bg-raised'
                  } ${forcedTheme ? 'cursor-not-allowed [&_span]:!text-fg-disabled [&_svg:not([data-check])]:!text-fg-disabled' : ''}`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <Moon className="w-6 h-6 text-fg-subtle" />
                    <span className="text-sm font-medium text-fg">Dunkel</span>
                  </div>
                  {effectiveTheme === 'dark' && (
                    <CheckCircle data-check className="absolute top-2.5 right-2.5 w-4 h-4 text-accent-fg" />
                  )}
                </button>

                {/* Light Mode */}
                <button
                  onClick={() => handleThemeChange('light')}
                  disabled={!!forcedTheme || !hasPermission('theme.light_mode') || saving}
                  className={`relative p-4 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                    effectiveTheme === 'light'
                      ? 'bg-raised'
                      : 'bg-surface hover:bg-raised'
                  } ${(forcedTheme || !hasPermission('theme.light_mode')) ? 'cursor-not-allowed [&_span]:!text-fg-disabled [&_svg:not([data-check])]:!text-fg-disabled' : ''}`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <Sun className="w-6 h-6 text-fg-subtle" />
                    <span className="text-sm font-medium text-fg">Hell</span>
                  </div>
                  {effectiveTheme === 'light' && (
                    <CheckCircle data-check className="absolute top-2.5 right-2.5 w-4 h-4 text-accent-fg" />
                  )}
                </button>

                {/* System */}
                <button
                  onClick={() => handleThemeChange('system')}
                  disabled={!!forcedTheme || saving}
                  className={`relative p-4 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                    effectiveTheme === 'system'
                      ? 'bg-raised'
                      : 'bg-surface hover:bg-raised'
                  } ${forcedTheme ? 'cursor-not-allowed [&_span]:!text-fg-disabled [&_svg:not([data-check])]:!text-fg-disabled' : ''}`}
                >
                  <div className="flex flex-col items-center gap-3">
                    <Monitor className="w-6 h-6 text-fg-subtle" />
                    <span className="text-sm font-medium text-fg">System</span>
                  </div>
                  {effectiveTheme === 'system' && (
                    <CheckCircle data-check className="absolute top-2.5 right-2.5 w-4 h-4 text-accent-fg" />
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
              <SectionHead title="Aktive Sitzungen" description="Geräte, auf denen du gerade angemeldet bist.">
                {sessions.length > 0 && (
                  <>
                    <Button size="sm" variant="secondary"
                      onClick={async () => {
                        if (!confirm('Alle anderen Sitzungen abmelden? Auf diesen Geräten ist eine neue Anmeldung nötig.')) return;
                        const r = await revokeAllSessions({ includeCurrent: false });
                        if (r) toast.success(`${r.revoked} Sitzung(en) abgemeldet`);
                        else toast.error('Fehler');
                      }}
                    >
                      Alle anderen abmelden
                    </Button>
                    <Button size="sm" variant="danger"
                      onClick={async () => {
                        if (!confirm('ALLE Sitzungen inkl. diese abmelden? Du musst dich danach neu anmelden.')) return;
                        await revokeAllSessions({ includeCurrent: true });
                      }}
                    >
                      Überall abmelden
                    </Button>
                  </>
                )}
              </SectionHead>

              {sessions.length === 0 ? (
                <EmptyState icon={Globe} title="Keine Sitzungen gefunden"
                  description="Sitzungen erscheinen hier, sobald du dich auf einem Gerät anmeldest." />
              ) : (
                <div className="divide-y divide-line-subtle bg-surface rounded-lg overflow-hidden">
                  {sessions.map((session) => {
                    const DeviceIcon = getDeviceIcon(session.device_info);
                    return (
                      <div
                        key={session.id}
                        className="p-3.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="shrink-0">
                              <DeviceIcon className={`w-5 h-5 ${
                                session.is_current ? 'text-ok' : 'text-fg-subtle'
                              }`} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-fg truncate">
                                  {session.device_info}
                                </span>
                                {session.is_current && <StatusBadge tone="positive" dot label="Dieses Gerät" />}
                              </div>
                              <div className="text-xs text-fg-subtle tabular-nums mt-0.5">
                                {session.ip_address || 'IP unbekannt'} · zuletzt aktiv {new Date(session.last_activity).toLocaleString('de-DE')}
                              </div>
                            </div>
                          </div>
                          {!session.is_current && (
                            <button
                              onClick={() => handleRevokeSession(session.id)}
                              className="p-2 text-fg-muted hover:text-bad hover:bg-raised rounded-sm transition-colors shrink-0"
                              title="Sitzung beenden" aria-label="Sitzung beenden"
                            >
                              <LogOut className="w-4 h-4" />
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
              <SectionHead title="Zwei-Faktor-Anmeldung"
                description="Schützt dein Konto zusätzlich mit einem Code aus einer Authenticator-App." />

              <div className="p-4 rounded-lg bg-surface">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">
                      <Key className={`w-5 h-5 ${
                        profile?.two_factor_enabled ? 'text-ok' : 'text-fg-subtle'
                      }`} />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-fg">Status</span>
                      <div className="mt-1">
                        {profile?.two_factor_enabled
                          ? <StatusBadge tone="positive" dot label="Aktiviert" />
                          : <StatusBadge tone="warning" dot label="Nicht aktiviert" />}
                      </div>
                    </div>
                  </div>
                  <a
                    href={`${import.meta.env.VITE_KEYCLOAK_URL || 'https://auth.t410.de'}/realms/${import.meta.env.VITE_KEYCLOAK_REALM || 'technik-ag'}/account/#/security/signingin`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-sm bg-accent hover:bg-accent-hover text-white font-medium rounded-md transition-colors"
                  >
                    {profile?.two_factor_enabled ? 'Verwalten' : 'Aktivieren'}
                  </a>
                </div>
              </div>

              <p className="text-xs text-fg-subtle mt-2">
                Die Einrichtung läuft über dein Keycloak-Konto und öffnet sich in einem neuen Tab.
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
        <SectionHead title="Push-Benachrichtigungen"
          description="Hinweise zu Zuweisungen, Erinnerungen und Mahnungen, auch wenn Stagedesk nicht geöffnet ist." />
        {!status.supported ? (
          <Notice>Dieser Browser unterstützt keine Push-Benachrichtigungen.</Notice>
        ) : status.permission === 'denied' ? (
          <Notice tone="danger">
            <p className="font-medium">Im Browser blockiert.</p>
            <p className="mt-0.5">Über das Schloss-Symbol neben der Adresszeile kannst du Benachrichtigungen wieder erlauben.</p>
          </Notice>
        ) : (
          <div className="p-4 rounded-lg bg-surface flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <Bell className={`w-5 h-5 ${status.subscribed ? 'text-ok' : 'text-fg-subtle'}`} />
              </div>
              <div>
                <span className="text-sm font-medium text-fg">{status.subscribed ? 'Auf diesem Gerät aktiv' : 'Auf diesem Gerät aus'}</span>
                <p className="text-xs text-fg-subtle mt-0.5">Gilt pro Browser. Jedes Gerät einzeln aktivieren.</p>
              </div>
            </div>
            <div className="flex gap-2">
              {status.subscribed && (
                <Button size="sm" variant="ghost" onClick={onTest} disabled={busy}>Test senden</Button>
              )}
              {status.subscribed ? (
                <Button size="sm" variant="secondary" onClick={onUnsubscribe} disabled={busy}>Deaktivieren</Button>
              ) : (
                <Button size="sm" variant="primary" onClick={onSubscribe} disabled={busy}
                  icon={busy ? Loader2 : undefined} className={busy ? '[&>svg]:animate-spin' : ''}>
                  Aktivieren
                </Button>
              )}
            </div>
          </div>
        )}
        <p className="text-xs text-fg-subtle mt-2">
          Auf iPhone und iPad klappt Push nur, wenn Stagedesk über „Zum Home-Bildschirm" installiert ist.
        </p>
      </div>

      <NotificationCategories />
    </div>
  );
}

function NotifSwitch({ on, onClick, disabled, offColor = 'bg-hover' }) {
  return (
    <button onClick={onClick} disabled={disabled}
      role="switch" aria-checked={on}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${on ? 'bg-accent' : offColor} disabled:cursor-not-allowed disabled:bg-raised`}>
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
        <SectionHead title="Kategorien" description="Wähle, worüber du informiert werden willst." />
        <div className="divide-y divide-line-subtle bg-surface rounded-lg overflow-hidden">
          {cfg.kinds.map(k => {
            const globalOff = cfg.global_disabled.includes(k.value);
            const on = !cfg.my_disabled.includes(k.value) && !globalOff;
            return (
              <div key={k.value} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-fg">{k.label}</span>
                  {globalOff && <StatusBadge tone="warning" label="Systemweit aus" />}
                </div>
                <NotifSwitch on={on} disabled={globalOff} onClick={() => toggleMine(k.value)} />
              </div>
            );
          })}
        </div>
      </div>

      {cfg.is_admin && (
        <div className="pt-6 border-t border-line-subtle">
          <SectionHead title="Systemweit (Admin)"
            description="Abgeschaltete Kategorien werden an niemanden mehr verschickt, unabhängig von den persönlichen Einstellungen." />
          <div className="divide-y divide-line-subtle bg-surface rounded-lg overflow-hidden">
            {cfg.kinds.map(k => {
              const on = !cfg.global_disabled.includes(k.value);
              return (
                <div key={k.value} className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <span className="text-sm text-fg">{k.label}</span>
                  <NotifSwitch on={on} offColor="bg-bad" onClick={() => toggleGlobal(k.value)} />
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
        <SectionHead title="Profilbild" description="Erscheint in der Seitenleiste, bei Zuweisungen und in der Anwesenheit." />
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-raised flex items-center justify-center shrink-0">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              : <User className="w-9 h-9 text-fg-subtle" />
            }
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 bg-raised hover:bg-hover text-fg text-sm font-medium rounded-md cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-canvas">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {profile?.avatar_url ? 'Bild ersetzen' : 'Bild hochladen'}
              <input type="file" className="hidden" accept="image/*"
                onChange={(e) => uploadAvatar(e.target.files?.[0])} />
            </label>
            {profile?.avatar_url && (
              <button onClick={removeAvatar}
                className="inline-flex items-center gap-1.5 self-start text-sm text-fg-muted hover:text-bad">
                <Trash2 className="w-3.5 h-3.5" /> Entfernen
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-fg-subtle mt-3">Max. 5 MB · JPG, PNG, GIF oder WebP</p>
      </div>

      {/* Landing Page */}
      <div className="pt-6 border-t border-line-subtle">
        <SectionHead title="Startseite" description="Diese Seite öffnet sich direkt nach dem Anmelden." />
        <select value={landing} onChange={(e) => saveLanding(e.target.value)}
          disabled={saving}
          className="w-full md:w-80 bg-raised border border-line rounded-md px-3 py-2 text-sm text-fg hover:border-line-strong focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:text-fg-disabled">
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
      <SectionHead title="Kalender-Abo"
        description="Alle Stagedesk-Termine in Apple Kalender, Google Kalender, Thunderbird oder Outlook. Änderungen kommen dort automatisch an." />

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-fg-subtle" /></div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-1.5">Persönliche Abo-Adresse</label>
            <div className="flex gap-2 flex-wrap">
              <input type="text" readOnly value={url}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-[260px] bg-raised border border-line rounded-md px-3 py-2 text-fg-muted text-xs font-mono hover:border-line-strong focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
              <Button variant="primary" icon={Copy} onClick={copy}>Kopieren</Button>
            </div>
            <p className="text-xs text-fg-subtle mt-2">
              Für Apple Kalender als <code className="text-fg-muted">webcal://</code>-Link:{' '}
              <a href={webcalUrl} className="text-fg-muted underline decoration-accent underline-offset-2 hover:text-fg">direkt abonnieren</a>.
            </p>
          </div>

          <div className="pt-4 border-t border-line-subtle">
            <p className="text-sm text-fg-muted mb-3">
              Adresse versehentlich geteilt? Erzeuge eine neue.
              <span className="text-warn"> Bestehende Abos funktionieren danach nicht mehr.</span>
            </p>
            <Button variant="secondary" onClick={regenerate} disabled={regenerating}
              icon={regenerating ? Loader2 : RefreshCw} className={regenerating ? '[&>svg]:animate-spin' : ''}>
              Neue Adresse erzeugen
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
