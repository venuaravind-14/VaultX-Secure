import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

// API & Store
import { api } from './api/axios';
import { useAuthStore } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';

// Layouts & Components
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/ErrorBoundary';

// Pages
import Dashboard from './pages/Dashboard';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Files from './pages/Files';
import IDCards from './pages/IDCards';
import AddIDCard from './pages/AddIDCard';
import AuditLog from './pages/AuditLog';
import Settings from './pages/Settings';
import PublicShareView from './pages/PublicShareView';
import PublicQRVerify from './pages/PublicQRVerify';
import OAuthCallback from './pages/auth/OAuthCallback';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

function App() {
  const { setAuth, isAuthenticated } = useAuthStore();
  const { isDarkMode } = useThemeStore();
  const [initializing, setInitializing] = useState(true);

  // Apply theme to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Unified Session Restoration
  useEffect(() => {
    const restoreSession = async () => {
      console.log('Establishing secure session with VaultX API Gateway:', api.defaults.baseURL);
      try {
        const refreshRes = await api.post('/auth/refresh');
        
        if (refreshRes.data?.success) {
          const newToken = refreshRes.data.data.access_token;
          
          const userRes = await api.get('/auth/me', {
            headers: { Authorization: `Bearer ${newToken}` }
          });
          
          if (userRes.data?.success) {
            setAuth(userRes.data.data.user, newToken);
          }
        }
      } catch (err) {
        console.warn('Session restoration failed:', err.message);
      } finally {
        setInitializing(false);
      }
    };

    restoreSession();
  }, [setAuth]);

  if (initializing) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
        <Loader2 className="w-12 h-12 animate-spin text-primary-500 mb-4" />
        <div className="flex flex-col items-center">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">VaultX Secure</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium animate-pulse">Establishing Secure Session...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <ErrorBoundary>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
          <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to="/" />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/oauth-callback" element={<OAuthCallback />} />
          <Route path="/share/:token" element={<PublicShareView />} />
          <Route path="/qr/verify/:token" element={<PublicQRVerify />} />

          {/* Protected Area */}
          <Route element={isAuthenticated ? <MainLayout /> : <Navigate to="/login" />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/files" element={<Files />} />
            <Route path="/idcards" element={<IDCards />} />
            <Route path="/idcards/add" element={<AddIDCard />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* Catch All */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </ErrorBoundary>
      <Toaster 
        position="top-right" 
        toastOptions={{
          duration: 4000,
          style: {
            background: isDarkMode ? '#1e293b' : '#ffffff',
            color: isDarkMode ? '#f1f5f9' : '#1e293b',
            border: isDarkMode ? '1px solid #334155' : '1px solid #e2e8f0',
            borderRadius: '12px',
          }
        }} 
      />
    </Router>
  );
}

export default App;
