/**
 * Dashboard Layout mit Sidebar-Navigation
 */
import { useState, useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import {
  Home,
  Wallet,
  LogOut,
  User,
  Menu,
  X,
  ChevronDown,
  Settings,
  Shield,
  Sun,
  Moon,
  Calendar,
  Ticket,
  Boxes,
  Monitor,
  ClipboardList,
  ListChecks,
  Award,
  Search,
  ScrollText,
  ScanLine,
  Activity,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../lib/api';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useUser } from '../contexts/UserContext';
import GlobalSearchModal from './GlobalSearchModal';
import NotificationBell from './NotificationBell';
import ShortcutsModal from './ShortcutsModal';
import { LogoMark } from './ui';
import { lazy, Suspense } from 'react';
const QRScanner = lazy(() => import('./QRScanner'));

export default function DashboardLayout({ children }) {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { isAdmin, hasPermission, impersonate, setImpersonate, profile } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const handleQRScan = async (code) => {
    setScanOpen(false);
    try {
      const r = await apiClient.get(`/inventar/items/qr/${encodeURIComponent(code)}`);
      navigate(`/inventar/${r.data.id}`);
    } catch { toast.error('Item nicht gefunden'); }
  };

  // Globale Keyboard-Shortcuts
  useEffect(() => {
    // gedrückte g-Sequenz: Zeitstempel, damit "g h" innerhalb von ~1s greift
    let lastG = 0;

    const isTyping = (target) => {
      if (!target) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
    };

    const onKey = (e) => {
      // Ctrl+K / Cmd+K → globale Suche (auch in Inputs)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      // Esc: schließt offene Modals (auch in Inputs)
      if (e.key === 'Escape') {
        if (shortcutsOpen) setShortcutsOpen(false);
        return;
      }
      // alles weitere nur, wenn nicht in einem Eingabefeld
      if (isTyping(e.target)) return;
      // Modifier-Kombis (außer Shift, die ist bei ? nötig) ignorieren
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // g-Sequenz für Navigation
      const now = Date.now();
      if (lastG && (now - lastG) < 1200) {
        lastG = 0;
        const target = ({
          h: '/', v: '/veranstaltung', k: '/kalender', i: '/inventar',
          a: '/anwesenheit', b: '/haushalte', t: '/aufgaben', c: '/kompetenzen',
        })[e.key.toLowerCase()];
        if (target) {
          e.preventDefault();
          navigate(target);
        }
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key === '/') {
        const el = document.querySelector('[data-shortcut="search"]');
        if (el) { e.preventDefault(); el.focus(); el.select?.(); }
      } else if (e.key === 'n') {
        const el = document.querySelector('[data-shortcut="new"]');
        if (el) { e.preventDefault(); el.click(); }
      } else if (e.key === 'g') {
        lastG = now;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, shortcutsOpen]);

  const user = auth.user?.profile;

  // Navigation mit Permission-Check
  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home, permission: null },
    { name: 'Veranstaltungen', href: '/veranstaltung', icon: Ticket, permission: 'veranstaltung.view' },
    { name: 'Kalender', href: '/kalender', icon: Calendar, permission: 'kalender.view' },
    { name: 'Inventar', href: '/inventar', icon: Boxes, permission: 'inventar.view' },
    { name: 'Anwesenheit', href: '/anwesenheit', icon: ClipboardList, permission: 'anwesenheit.view' },
    { name: 'Kompetenzen', href: '/kompetenzen', icon: Award, permission: 'kompetenzen.view' },
    { name: 'Aufgaben', href: '/aufgaben', icon: ListChecks, permission: 'aufgaben.view' },
    { name: 'Haushalte', href: '/haushalte', icon: Wallet, permission: 'haushalte.view' },
  ].filter(item => !item.permission || hasPermission(item.permission));

  // Inventar-Unternavigation (aktuell leer; bei Bedarf hier ergänzen)
  const inventarSubNav = [];

  // Admin-Navigation
  const adminNavigation = [
    ...(isAdmin ? [{ name: 'Admin', href: '/admin', icon: Shield }] : []),
    ...(isAdmin ? [{ name: 'System', href: '/admin/system', icon: Activity }] : []),
    ...(isAdmin ? [{ name: 'Audit-Log', href: '/admin/audit', icon: ScrollText }] : []),
    ...(isAdmin || hasPermission('monitor.view') ? [{ name: 'Monitor', href: '/monitor-admin', icon: Monitor }] : []),
  ];

  // Aktiven Nav-Eintrag über alle Sektionen ermitteln (longest-prefix-wins),
  // sodass z.B. /admin/audit nur den Audit-Log-Eintrag highlighted, nicht
  // gleichzeitig den darunterliegenden /admin-Eintrag.
  const allNavHrefs = [
    ...navigation.map(n => n.href),
    ...inventarSubNav.map(n => n.href),
    ...adminNavigation.map(n => n.href),
  ];
  const activeHref = (() => {
    if (location.pathname === '/') return '/';
    const matches = allNavHrefs.filter(h =>
      h !== '/' && (location.pathname === h || location.pathname.startsWith(h + '/'))
    );
    if (!matches.length) return null;
    return matches.reduce((a, b) => (b.length > a.length ? b : a));
  })();

  const handleLogout = () => {
    auth.signoutRedirect();
  };

  const getPageTitle = () => {
    const allNav = [
      ...navigation, 
      ...inventarSubNav,
      ...adminNavigation, 
      { name: 'Einstellungen', href: '/settings' }
    ];
    return allNav.find((item) => location.pathname.startsWith(item.href) && item.href !== '/')?.name 
      || (location.pathname === '/' ? 'Dashboard' : 'Dashboard');
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-surface transform transition-transform duration-200 ease-in-out lg:translate-x-0 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <LogoMark className="w-6 h-6 shrink-0" />
            <h1 className="font-display text-xl font-bold tracking-tight text-fg">Stagedesk</h1>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 -mr-2 text-fg-muted hover:text-fg hover:bg-raised rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Globale Suche */}
        <div className="px-4 pt-4">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-raised hover:border-line-strong border border-line rounded-md text-sm text-fg-subtle transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left">Suchen…</span>
            <kbd className="text-[10px] px-1.5 py-0.5 bg-surface rounded-sm font-medium text-fg-subtle">Strg+K</kbd>
          </button>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === activeHref;
            const isInventar = item.href === '/inventar';

            return (
              <div key={item.name} className="space-y-1">
                <Link
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                    isActive
                      ? 'bg-raised text-fg shadow-[inset_2px_0_0_0_var(--color-accent)]'
                      : 'text-fg-muted hover:text-fg hover:bg-raised'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-accent-fg' : ''}`} />
                  <span className="font-medium">{item.name}</span>
                </Link>
                {/* Inventar Sub-Navigation: direkt unter Inventar */}
                {isInventar && inventarSubNav.length > 0 && (
                  <div className="pl-4 space-y-1">
                    {inventarSubNav.map((sub) => {
                      const SubIcon = sub.icon;
                      const subActive = sub.href === activeHref;
                      return (
                        <Link
                          key={sub.name}
                          to={sub.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center gap-3 px-4 py-2 rounded-md text-sm transition-colors ${
                            subActive ? 'bg-raised text-fg shadow-[inset_2px_0_0_0_var(--color-accent)]' : 'text-fg-subtle hover:text-fg hover:bg-raised'
                          }`}
                        >
                          <SubIcon className={`w-4 h-4 ${subActive ? 'text-accent-fg' : ''}`} />
                          <span className="flex-1">{sub.name}</span>
                          {sub.badge && (
                            <span className="px-1.5 py-0.5 text-xs bg-accent text-white rounded-full min-w-[20px] text-center">
                              {sub.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Admin Section */}
          {adminNavigation.length > 0 && (
            <>
              <div className="pt-4 mt-2 pb-2 border-t border-line-subtle">
                <p className="px-4 pt-2 text-xs font-semibold text-fg-subtle uppercase tracking-wider">
                  Administration
                </p>
              </div>
              {adminNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === activeHref;
                
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                      isActive
                        ? 'bg-raised text-fg shadow-[inset_2px_0_0_0_var(--color-accent)]'
                        : 'text-fg-muted hover:text-fg hover:bg-raised'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-accent-fg' : ''}`} />
                    <span className="font-medium">{item.name}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* Bottom Section: Settings & User */}
        <div className="border-t border-line-subtle">
          {/* Settings Link */}
          <Link
            to="/settings"
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-4 py-3 mx-4 mt-4 rounded-md transition-colors ${
              location.pathname === '/settings'
                ? 'bg-raised text-fg shadow-[inset_2px_0_0_0_var(--color-accent)]'
                : 'text-fg-muted hover:text-fg hover:bg-raised'
            }`}
          >
            <Settings className={`w-5 h-5 ${location.pathname === '/settings' ? 'text-accent-fg' : ''}`} />
            <span className="font-medium">Einstellungen</span>
          </Link>

          {/* User Menu */}
          <div className="p-4">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-md hover:bg-raised transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-accent flex items-center justify-center shrink-0">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg truncate">
                    {(user?.given_name || user?.family_name)
                      ? [user?.given_name, user?.family_name].filter(Boolean).join(' ')
                      : (user?.name || user?.preferred_username || 'Benutzer')}
                  </p>
                  <p className="text-xs text-fg-muted truncate">{user?.email}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-fg-muted transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* User Dropdown */}
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-overlay border border-line rounded-lg shadow-overlay overflow-hidden">
                  {/* Theme Indicator */}
                  <div className="px-4 py-2 border-b border-line-subtle flex items-center gap-2 text-sm text-fg-muted">
                    {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
                  </div>
                  
                  {/* Admin Badge */}
                  {isAdmin && (
                    <div className="px-4 py-2 border-b border-line-subtle">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-raised text-accent-fg rounded-sm">
                        <Shield className="w-3 h-3" />
                        Admin
                      </span>
                    </div>
                  )}
                  
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-bad hover:bg-hover transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Abmelden</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Impersonate-Banner */}
        {impersonate && (
          <div className="bg-warn text-canvas text-sm font-medium flex items-center justify-between gap-4 px-4 lg:px-8 py-2">
            <span className="flex items-center gap-2 min-w-0">
              <Eye className="w-4 h-4 shrink-0" />
              <span className="truncate">
                Sicht: <strong>
                  {[impersonate.first_name, impersonate.last_name].filter(Boolean).join(' ')
                    || impersonate.username}
                </strong>{' '}
                <span className="font-normal">
                  (nur UI-Filter, API-Antworten kommen weiterhin aus deinem Admin-Account)
                </span>
              </span>
            </span>
            <button onClick={() => { setImpersonate(null); window.location.href = '/'; }}
              className="shrink-0 px-3 py-1 bg-black/20 hover:bg-black/40 rounded-md text-canvas transition-colors">
              Beenden
            </button>
          </div>
        )}
        {/* Top Bar */}
        <header className="h-16 bg-surface flex items-center justify-between px-4 lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 text-fg-muted hover:text-fg hover:bg-raised rounded-md transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden lg:flex items-center gap-1.5 text-sm">
            <span className="text-fg-subtle">Stagedesk</span>
            <span className="text-fg-disabled">/</span>
            <span className="font-medium text-fg-muted">{getPageTitle()}</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {hasPermission('inventar.view') && (
              <button onClick={() => setScanOpen(true)}
                className="p-2 text-fg-muted hover:text-fg hover:bg-raised rounded-md transition-colors"
                title="QR-Code scannen">
                <ScanLine className="w-5 h-5" />
              </button>
            )}
            <NotificationBell />
            {/* Mobile User Icon */}
            <div className="lg:hidden">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-accent flex items-center justify-center">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>

      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {scanOpen && (
        <Suspense fallback={null}>
          <QRScanner onScan={handleQRScan} onClose={() => setScanOpen(false)}
            label="Item-QR scannen" />
        </Suspense>
      )}
    </div>
  );
}
