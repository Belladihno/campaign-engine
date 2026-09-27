import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AuthPage } from './pages/AuthPage';
import { CampaignNewPage } from './pages/CampaignNewPage';
import { CampaignStatusPage } from './pages/CampaignStatusPage';
import { DashboardPage } from './pages/DashboardPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/campaign-new"
            element={
              <ProtectedRoute>
                <CampaignNewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/campaign-status"
            element={
              <ProtectedRoute>
                <CampaignStatusPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
