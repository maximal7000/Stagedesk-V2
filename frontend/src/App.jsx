/**
 * Main App Component mit Routing
 */
import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { setAuthContext } from './lib/api';
import { UserProvider } from './contexts/UserContext';
import ProtectedRoute from './components/ProtectedRoute';
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
                  <Route path="/haushalte" element={<HaushaltePage />} />
                  <Route path="/haushalte/:id" element={<HaushaltDetailPage />} />
                  <Route path="/kalender" element={<KalenderPage />} />
                  <Route path="/ressourcen" element={<RessourcenPage />} />
                  <Route path="/kategorien" element={<KategorienPage />} />
                  <Route path="/inventar" element={<InventarPage />} />
                  <Route path="/inventar/neu" element={<ItemDetailPage />} />
                  <Route path="/inventar/sets" element={<ItemSetsPage />} />
                  <Route path="/inventar/:id" element={<ItemDetailPage />} />
                  <Route path="/ausleihen" element={<AusleihePage />} />
                  <Route path="/ausleihen/dashboard" element={<AusleiheDashboardPage />} />
                  <Route path="/ausleihen/kalender" element={<AusleiheKalenderPage />} />
                  <Route path="/ausleihen/:id" element={<AusleihePage />} />
                  <Route path="/anwesenheit" element={<AnwesenheitPage />} />
                  <Route path="/anwesenheit/:id" element={<AnwesenheitPage />} />
                  <Route path="/veranstaltung" element={<VeranstaltungenPage />} />
                  <Route path="/veranstaltung/neu" element={<VeranstaltungDetailPage />} />
                  <Route path="/veranstaltung/:id" element={<VeranstaltungDetailPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/monitor-admin" element={<MonitorAdminPage />} />
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
