/**
 * Main App Component mit Routing
 */
import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { setAuthContext } from './lib/api';
import { UserProvider } from './contexts/UserContext';
import ProtectedRoute from './components/ProtectedRoute';
import PermissionRoute from './components/PermissionRoute';
import { MaintenanceBanner } from './components/MaintenanceBanner';
import UnsavedChangesProvider from './components/monitor-admin/shared/UnsavedChangesProvider';
import { Toaster } from 'sonner';
import './App.css';

// Seiten werden erst bei Bedarf geladen: die Anzeige /monitor (Raspberry Pi) lädt so kein Admin.
const DashboardLayout = lazy(() => import('./components/DashboardLayout'));
// Root pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const DesignTestPage = lazy(() => import('./pages/DesignTestPage'));
const MonitorPage = lazy(() => import('./pages/MonitorPage'));
// Inventar
const InventarPage = lazy(() => import('./pages/inventar/InventarPage'));
const ItemDetailPage = lazy(() => import('./pages/inventar/ItemDetailPage'));
const ItemSetsPage = lazy(() => import('./pages/inventar/ItemSetsPage'));
const AusleihePage = lazy(() => import('./pages/inventar/AusleihePage'));
const AusleiheDashboardPage = lazy(() => import('./pages/inventar/AusleiheDashboardPage'));
// Veranstaltung
const VeranstaltungenPage = lazy(() => import('./pages/veranstaltung/VeranstaltungenPage'));
const VeranstaltungDetailPage = lazy(() => import('./pages/veranstaltung/VeranstaltungDetailPage'));
const VorlagenPage = lazy(() => import('./pages/veranstaltung/VorlagenPage'));
// Haushalte
const HaushaltePage = lazy(() => import('./pages/haushalte/HaushaltePage'));
const HaushaltDetailPage = lazy(() => import('./pages/haushalte/HaushaltDetailPage'));
// Kalender
const KalenderPage = lazy(() => import('./pages/kalender/KalenderPage'));
const RessourcenPage = lazy(() => import('./pages/kalender/RessourcenPage'));
const KategorienPage = lazy(() => import('./pages/kalender/KategorienPage'));
// Admin
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'));
const SystemAdminPage = lazy(() => import('./pages/admin/SystemAdminPage'));
const AufgabenPage = lazy(() => import('./pages/admin/AufgabenPage'));
const AufgabenMonitorPage = lazy(() => import('./pages/AufgabenMonitorPage'));
// Monitor-Admin
const MonitorAdminLayout = lazy(() => import('./components/monitor-admin/MonitorAdminLayout'));
const MonitorOverview = lazy(() => import('./components/monitor-admin/pages/Overview'));
const MonitorScreens = lazy(() => import('./components/monitor-admin/pages/Screens'));
const MonitorScreenDetail = lazy(() => import('./components/monitor-admin/pages/ScreenDetail'));
const MonitorViews = lazy(() => import('./components/monitor-admin/pages/Views'));
const MonitorViewEdit = lazy(() => import('./components/monitor-admin/pages/ViewEdit'));
const MonitorExams = lazy(() => import('./components/monitor-admin/pages/Exams'));
const MonitorMedia = lazy(() => import('./components/monitor-admin/pages/Media'));
const MonitorSchedules = lazy(() => import('./components/monitor-admin/pages/Schedules'));
const MonitorSettings = lazy(() => import('./components/monitor-admin/pages/Settings'));
// Anwesenheit
const AnwesenheitPage = lazy(() => import('./pages/anwesenheit/AnwesenheitPage'));
// Kompetenzen
const KompetenzenPage = lazy(() => import('./pages/kompetenzen/KompetenzenPage'));
// Notifications
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));

function AppContent() {
  const auth = useAuth();

  // Auth-Context für API-Client setzen wenn User sich einloggt
  useEffect(() => {
    if (auth.user) {
      setAuthContext(auth);
    }
  }, [auth.user]);

  useEffect(() => {
    setAuthContext(auth);
  }, []);

  return (
    <Suspense fallback={null}>
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/design-test" element={<DesignTestPage />} />
      <Route path="/monitor" element={<MonitorPage />} />
      <Route path="/aufgaben-monitor" element={<AufgabenMonitorPage />} />

      {/* Protected Routes: Dashboard */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <UserProvider>
              <UnsavedChangesProvider>
                <DashboardLayout>
                  <Suspense fallback={<div className="p-6 text-sm text-fg-subtle">Wird geladen…</div>}>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/haushalte" element={<PermissionRoute permission="haushalte.view"><HaushaltePage /></PermissionRoute>} />
                    <Route path="/haushalte/:id" element={<PermissionRoute permission="haushalte.view"><HaushaltDetailPage /></PermissionRoute>} />
                    <Route path="/kalender" element={<PermissionRoute permission="kalender.view"><KalenderPage /></PermissionRoute>} />
                    <Route path="/ressourcen" element={<PermissionRoute permission="kalender.ressourcen"><RessourcenPage /></PermissionRoute>} />
                    <Route path="/kategorien" element={<PermissionRoute permission="kalender.view"><KategorienPage /></PermissionRoute>} />
                    <Route path="/inventar" element={<PermissionRoute permission="inventar.view"><InventarPage /></PermissionRoute>} />
                    <Route path="/inventar/neu" element={<PermissionRoute permission="inventar.create"><ItemDetailPage /></PermissionRoute>} />
                    <Route path="/inventar/sets" element={<PermissionRoute permission="inventar.view"><ItemSetsPage /></PermissionRoute>} />
                    <Route path="/inventar/:id" element={<PermissionRoute permission="inventar.view"><ItemDetailPage /></PermissionRoute>} />
                    <Route path="/ausleihen" element={<PermissionRoute permission="inventar.ausleihe"><AusleihePage /></PermissionRoute>} />
                    <Route path="/ausleihen/dashboard" element={<PermissionRoute permission="inventar.ausleihe"><AusleiheDashboardPage /></PermissionRoute>} />
                    <Route path="/ausleihen/:id" element={<PermissionRoute permission="inventar.ausleihe"><AusleihePage /></PermissionRoute>} />
                    <Route path="/anwesenheit" element={<PermissionRoute permission="anwesenheit.view"><AnwesenheitPage /></PermissionRoute>} />
                    <Route path="/anwesenheit/:id" element={<PermissionRoute permission="anwesenheit.view"><AnwesenheitPage /></PermissionRoute>} />
                    <Route path="/kompetenzen" element={<PermissionRoute permission="kompetenzen.view"><KompetenzenPage /></PermissionRoute>} />
                    <Route path="/kompetenzen/user/:userId" element={<PermissionRoute permission="kompetenzen.view_all"><KompetenzenPage /></PermissionRoute>} />
                    <Route path="/veranstaltung" element={<PermissionRoute permission="veranstaltung.view"><VeranstaltungenPage /></PermissionRoute>} />
                    <Route path="/veranstaltung/vorlagen" element={<PermissionRoute permission="veranstaltung.view"><VorlagenPage /></PermissionRoute>} />
                    <Route path="/veranstaltung/neu" element={<PermissionRoute permission="veranstaltung.create"><VeranstaltungDetailPage /></PermissionRoute>} />
                    <Route path="/veranstaltung/:id" element={<PermissionRoute permission="veranstaltung.view"><VeranstaltungDetailPage /></PermissionRoute>} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/admin" element={<PermissionRoute adminOnly><AdminPage /></PermissionRoute>} />
                    <Route path="/admin/audit" element={<PermissionRoute adminOnly><AuditLogPage /></PermissionRoute>} />
                    <Route path="/admin/system" element={<PermissionRoute adminOnly><SystemAdminPage /></PermissionRoute>} />
                    <Route path="/aufgaben" element={<PermissionRoute anyOf={['aufgaben.view', 'aufgaben.manage']} adminOnly><AufgabenPage /></PermissionRoute>} />
                    <Route path="/monitor-admin" element={<PermissionRoute permission="monitor.view"><MonitorAdminLayout /></PermissionRoute>}>
                      <Route index element={<MonitorOverview />} />
                      <Route path="screens" element={<PermissionRoute anyOf={['monitor.setup', 'monitor.power']}><MonitorScreens /></PermissionRoute>} />
                      <Route path="screens/:id" element={<PermissionRoute anyOf={['monitor.setup', 'monitor.power']}><MonitorScreenDetail /></PermissionRoute>} />
                      <Route path="views" element={<PermissionRoute permission="monitor.setup"><MonitorViews /></PermissionRoute>} />
                      <Route path="views/new" element={<PermissionRoute permission="monitor.setup"><MonitorViewEdit /></PermissionRoute>} />
                      <Route path="views/:id" element={<PermissionRoute permission="monitor.setup"><MonitorViewEdit /></PermissionRoute>} />
                      <Route path="exams" element={<PermissionRoute permission="monitor.exams"><MonitorExams /></PermissionRoute>} />
                      <Route path="media" element={<PermissionRoute permission="monitor.media"><MonitorMedia /></PermissionRoute>} />
                      <Route path="schedules" element={<PermissionRoute permission="monitor.power"><MonitorSchedules /></PermissionRoute>} />
                      <Route path="settings" element={<PermissionRoute anyOf={['monitor.setup', 'monitor.onair', 'monitor.emergency']}><MonitorSettings /></PermissionRoute>} />
                      <Route path="*" element={<Navigate to="/monitor-admin" replace />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                  </Suspense>
                </DashboardLayout>
              </UnsavedChangesProvider>
            </UserProvider>
          </ProtectedRoute>
        }
      />
    </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <>
      <MaintenanceBanner />
      <AppContent />
      <Toaster
        theme="dark"
        position="bottom-right"
        richColors
        toastOptions={{
          className: 'border border-line',
        }}
      />
    </>
  );
}

export default App;
