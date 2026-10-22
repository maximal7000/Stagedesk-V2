/**
 * Main App Component mit Routing
 */
import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { setAuthContext } from './lib/api';
import { UserProvider } from './contexts/UserContext';
import ProtectedRoute from './components/ProtectedRoute';
import PermissionRoute from './components/PermissionRoute';
import { MaintenanceBanner } from './components/MaintenanceBanner';
import UnsavedChangesProvider from './components/signage/admin/shared/UnsavedChangesProvider';
import { Toaster } from 'sonner';
import './App.css';
// Kiosk-Seiten der Pis direkt laden: kein nachgeladener Chunk, der beim Start ausfallen kann
import SignagePage from './pages/SignagePage';
import AufgabenMonitorPage from './pages/AufgabenMonitorPage';

// Seiten werden erst bei Bedarf geladen: die Anzeige /signage (Raspberry Pi) lädt so kein Admin.
const DashboardLayout = lazy(() => import('./components/DashboardLayout'));
// Root pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const DesignTestPage = lazy(() => import('./pages/DesignTestPage'));
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
// Monitor-Admin
const SignageAdminLayout = lazy(() => import('./components/signage/admin/SignageAdminLayout'));
const SignageOverview = lazy(() => import('./components/signage/admin/pages/Overview'));
const SignageScreens = lazy(() => import('./components/signage/admin/pages/Screens'));
const SignageScreenDetail = lazy(() => import('./components/signage/admin/pages/ScreenDetail'));
const SignageViews = lazy(() => import('./components/signage/admin/pages/Views'));
const SignageViewEdit = lazy(() => import('./components/signage/admin/pages/ViewEdit'));
const SignageExams = lazy(() => import('./components/signage/admin/pages/Exams'));
const SignageMedia = lazy(() => import('./components/signage/admin/pages/Media'));
const SignageSchedules = lazy(() => import('./components/signage/admin/pages/Schedules'));
const SignageSettings = lazy(() => import('./components/signage/admin/pages/Settings'));
// Anwesenheit
const AnwesenheitPage = lazy(() => import('./pages/anwesenheit/AnwesenheitPage'));
// Kompetenzen
const KompetenzenPage = lazy(() => import('./pages/kompetenzen/KompetenzenPage'));
// Notifications
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));

// Old admin addresses (bookmarks, notification links) keep working: same rest of path and query.
function LegacyAdminRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`/signage-admin${pathname.slice('/monitor-admin'.length)}${search}${hash}`} replace />;
}

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
      <Route path="/signage" element={<SignagePage />} />
      {/* Old address of installed Pis and kiosk URLs, permanently the same page */}
      <Route path="/monitor" element={<SignagePage />} />
      <Route path="/monitor-admin/*" element={<LegacyAdminRedirect />} />
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
                    <Route path="/signage-admin" element={<PermissionRoute permission="signage.view"><SignageAdminLayout /></PermissionRoute>}>
                      <Route index element={<SignageOverview />} />
                      <Route path="screens" element={<PermissionRoute anyOf={['signage.setup', 'signage.power', 'signage.devices']}><SignageScreens /></PermissionRoute>} />
                      <Route path="screens/:id" element={<PermissionRoute anyOf={['signage.setup', 'signage.power', 'signage.devices']}><SignageScreenDetail /></PermissionRoute>} />
                      <Route path="views" element={<PermissionRoute permission="signage.setup"><SignageViews /></PermissionRoute>} />
                      <Route path="views/new" element={<PermissionRoute permission="signage.setup"><SignageViewEdit /></PermissionRoute>} />
                      <Route path="views/:id" element={<PermissionRoute permission="signage.setup"><SignageViewEdit /></PermissionRoute>} />
                      <Route path="exams" element={<PermissionRoute permission="signage.exams"><SignageExams /></PermissionRoute>} />
                      <Route path="media" element={<PermissionRoute permission="signage.media"><SignageMedia /></PermissionRoute>} />
                      <Route path="schedules" element={<PermissionRoute permission="signage.power"><SignageSchedules /></PermissionRoute>} />
                      <Route path="settings" element={<PermissionRoute anyOf={['signage.setup', 'signage.onair', 'signage.emergency']}><SignageSettings /></PermissionRoute>} />
                      <Route path="*" element={<Navigate to="/signage-admin" replace />} />
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
