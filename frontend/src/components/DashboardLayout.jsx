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
  CalendarDays,
  Monitor,
  ClipboardList,
  Award,
  Search,
  ScrollText,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useUser } from '../contexts/UserContext';
import GlobalSearchModal from './GlobalSearchModal';
import NotificationBell from './NotificationBell';

export default function DashboardLayout({ children }) {
  const auth = useAuth();
  const location = useLocation();
  const { effectiveTheme, isDark } = useTheme();
  const { isAdmin, hasPermission, impersonate, setImpersonate } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl+K / Cmd+K öffnet die globale Suche
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const user = auth.user?.profile;

  // Navigation mit Permission-Check
  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home, permission: null },
    { name: 'Veranstaltungen', href: '/veranstaltung', icon: Ticket, permission: 'veranstaltung.view' },
    { name: 'Kalender', href: '/kalender', icon: Calendar, permission: 'kalender.view' },
    { name: 'Inventar', href: '/inventar', icon: Boxes, permission: 'inventar.view' },
    { name: 'Anwesenheit', href: '/anwesenheit', icon: ClipboardList, permission: 'anwesenheit.view' },
    { name: 'Kompetenzen', href: '/kompetenzen', icon: Award, permission: 'kompetenzen.view' },
    { name: 'Haushalte', href: '/haushalte', icon: Wallet, permission: 'haushalte.view' },
  ].filter(item => !item.permission || hasPermission(item.permission));

  // Inventar-Unternavigation
  const inventarSubNav = hasPermission('inventar.view') ? [
    { name: 'Ausleihe-Kalender', href: '/ausleihen/kalender', icon: CalendarDays },
  ] : [];

  // Admin-Navigation
  const adminNavigation = [
    ...(isAdmin ? [{ name: 'Admin', href: '/admin', icon: Shield }] : []),
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
    <div className="min-h-screen bg-gray-950">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-gray-900 border-r border-gray-800 transform transition-transform duration-200 ease-in-out lg:translate-x-0 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white">Stagedesk</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Globale Suche */}
        <div className="px-4 pt-4">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-400"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left">Suchen…</span>
            <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-900 border border-gray-700 rounded">Ctrl K</kbd>
          </button>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === activeHref;
            const isKalender = item.href === '/kalender';
            const isInventar = item.href === '/inventar';
            const isVeranstaltung = item.href === '/veranstaltung';
            
            return (
              <div key={item.name} className="space-y-1">
                <Link
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
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
                          className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors ${
                            subActive ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white hover:bg-gray-800'
                          }`}
                        >
                          <SubIcon className="w-4 h-4" />
                          <span className="flex-1">{sub.name}</span>
                          {sub.badge && (
                            <span className="px-1.5 py-0.5 text-xs bg-red-600 text-white rounded-full min-w-[20px] text-center">
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
              <div className="pt-4 pb-2">
                <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
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
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.name}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* Bottom Section: Settings & User */}
        <div className="border-t border-gray-800">
          {/* Settings Link */}
          <Link
            to="/settings"
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-4 py-3 mx-4 mt-4 rounded-lg transition-colors ${
              location.pathname === '/settings'
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Einstellungen</span>
          </Link>

          {/* User Menu */}
          <div className="p-4">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {(user?.given_name || user?.family_name)
                      ? [user?.given_name, user?.family_name].filter(Boolean).join(' ')
                      : (user?.name || user?.preferred_username || 'Benutzer')}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* User Dropdown */}
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
                  {/* Theme Indicator */}
                  <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-2 text-sm text-gray-400">
                    {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
                  </div>
                  
                  {/* Admin Badge */}
                  {isAdmin && (
                    <div className="px-4 py-2 border-b border-gray-700">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-purple-600/20 text-purple-400 rounded">
                        <Shield className="w-3 h-3" />
                        Admin
                      </span>
                    </div>
                  )}
                  
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-gray-700 transition-colors"
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
          <div className="bg-amber-600 text-black text-sm font-medium flex items-center justify-between px-4 lg:px-8 py-2">
            <span>
              👁️ Sicht: <strong>
                {[impersonate.first_name, impersonate.last_name].filter(Boolean).join(' ')
                  || impersonate.username}
              </strong> (UI-Filter — API-Antworten kommen weiter aus deinem Admin-Account)
            </span>
            <button onClick={() => { setImpersonate(null); window.location.href = '/'; }}
              className="px-3 py-1 bg-black/20 hover:bg-black/40 rounded text-white">
              Beenden
            </button>
          </div>
        )}
        {/* Top Bar */}
        <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="hidden lg:block">
            <h2 className="text-lg font-semibold text-white">
              {getPageTitle()}
            </h2>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <NotificationBell />
            {/* Mobile User Icon */}
            <div className="lg:hidden">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
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
    </div>
  );
}
