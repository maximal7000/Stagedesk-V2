/**
 * Main App Component mit Routing
 */
import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { setAuthContext } from './lib/api';
import { UserProvider } from './contexts/UserContext';
import ProtectedRoute from './components/ProtectedRoute';
import PermissionRoute from './components/PermissionRoute';
import DashboardLayout from './components/DashboardLayout';
// Root pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import DesignTestPage from './pages/DesignTestPage';
import MonitorPage from './pages/MonitorPage';
// Inventar
import InventarPage from './pages/inventar/InventarPage';
import ItemDetailPage from './pages/inventar/ItemDetailPage';
import ItemSetsPage from './pages/inventar/ItemSetsPage';
import AusleihePage from './pages/inventar/AusleihePage';
import AusleiheDashboardPage from './pages/inventar/AusleiheDashboardPage';
import AusleiheKalenderPage from './pages/inventar/AusleiheKalenderPage';
// Veranstaltung
import VeranstaltungenPage from './pages/veranstaltung/VeranstaltungenPage';
import VeranstaltungDetailPage from './pages/veranstaltung/VeranstaltungDetailPage';
// Haushalte
import HaushaltePage from './pages/haushalte/HaushaltePage';
import HaushaltDetailPage from './pages/haushalte/HaushaltDetailPage';
// Kalender
import KalenderPage from './pages/kalender/KalenderPage';
import RessourcenPage from './pages/kalender/RessourcenPage';
import KategorienPage from './pages/kalender/KategorienPage';
// Admin
import AdminPage from './pages/admin/AdminPage';
import MonitorAdminPage from './pages/admin/MonitorAdminPage';
// Anwesenheit
import AnwesenheitPage from './pages/anwesenheit/AnwesenheitPage';
// Kompetenzen
import KompetenzenPage from './pages/kompetenzen/KompetenzenPage';
import { Toaster } from 'sonner';
import './App.css';

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
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/design-test" element={<DesignTestPage />} />
      <Route path="/monitor" element={<MonitorPage />} />

      {/* Protected Routes: Dashboard */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <UserProvider>
              <DashboardLayout>
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
                  <Route path="/ausleihen/kalender" element={<PermissionRoute permission="inventar.ausleihe"><AusleiheKalenderPage /></PermissionRoute>} />
                  <Route path="/ausleihen/:id" element={<PermissionRoute permission="inventar.ausleihe"><AusleihePage /></PermissionRoute>} />
                  <Route path="/anwesenheit" element={<PermissionRoute permission="anwesenheit.view"><AnwesenheitPage /></PermissionRoute>} />
                  <Route path="/anwesenheit/:id" element={<PermissionRoute permission="anwesenheit.view"><AnwesenheitPage /></PermissionRoute>} />
                  <Route path="/kompetenzen" element={<PermissionRoute permission="kompetenzen.view"><KompetenzenPage /></PermissionRoute>} />
                  <Route path="/kompetenzen/user/:userId" element={<PermissionRoute permission="kompetenzen.view_all"><KompetenzenPage /></PermissionRoute>} />
                  <Route path="/veranstaltung" element={<PermissionRoute permission="veranstaltung.view"><VeranstaltungenPage /></PermissionRoute>} />
                  <Route path="/veranstaltung/neu" element={<PermissionRoute permission="veranstaltung.create"><VeranstaltungDetailPage /></PermissionRoute>} />
                  <Route path="/veranstaltung/:id" element={<PermissionRoute permission="veranstaltung.view"><VeranstaltungDetailPage /></PermissionRoute>} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/admin" element={<PermissionRoute adminOnly><AdminPage /></PermissionRoute>} />
                  <Route path="/monitor-admin" element={<PermissionRoute permission="monitor.view"><MonitorAdminPage /></PermissionRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </DashboardLayout>
            </UserProvider>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <>
      <AppContent />
      <Toaster
        theme="dark"
        position="bottom-right"
        richColors
        toastOptions={{
          className: 'border border-gray-800',
        }}
      />
    </>
  );
}

export default App;
