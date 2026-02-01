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
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import HaushaltePage from './pages/HaushaltePage';
import HaushaltDetailPage from './pages/HaushaltDetailPage';
import KalenderPage from './pages/KalenderPage';
import RessourcenPage from './pages/RessourcenPage';
import KategorienPage from './pages/KategorienPage';
import InventarPage from './pages/InventarPage';
import ItemDetailPage from './pages/ItemDetailPage';
import AusleihePage from './pages/AusleihePage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import DesignTestPage from './pages/DesignTestPage';
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
                  <Route path="/inventar/:id" element={<ItemDetailPage />} />
                  <Route path="/ausleihen" element={<AusleihePage />} />
                  <Route path="/ausleihen/:id" element={<AusleihePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/admin" element={<AdminPage />} />
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
  return <AppContent />;
}

export default App;
