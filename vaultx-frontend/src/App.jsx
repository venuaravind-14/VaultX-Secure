import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

// Layouts
import MainLayout from './components/layout/MainLayout';
import AuthLayout from './components/layout/AuthLayout';

// Stores & API
import { useAuthStore } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';
import { api } from './api/axios';

// Pages - Auth
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import OAuthCallback from './pages/auth/OAuthCallback';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

// Pages - Protected
import Dashboard from './pages/Dashboard';
import Files from './pages/Files';
import IDCards from './pages/IDCards';
import AddIDCard from './pages/AddIDCard';
import Settings from './pages/Settings';
import AuditLog from './pages/AuditLog';

// Pages - Public Shared
import PublicShareView from './pages/PublicShareView';
import PublicQRVerify from './pages/PublicQRVerify';

// React Query Client setup
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// Public Route Wrapper (prevent login/register access if already logged in)
const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return children;
};

function App() {
  const { setAuth, logout, lockVault, isVaultUnlocked } = useAuthStore();
  // Ensure the theme rehydrates fully on mount
  const { isDarkMode } = useThemeStore();

  useEffect(() => {
    // ── Auto-Lock Inactivity Listener ──────────────────────────────────────────
    let inactivityTimer;

    const resetTimer = () => {
      if (!useAuthStore.getState().isVaultUnlocked) return;
      
      if (inactivityTimer) clearTimeout(inactivityTimer);
      
      // Auto-lock after 5 minutes of no mouse/keyboard interaction
      inactivityTimer = setTimeout(() => {
        lockVault();
        // Don't toast here as it might be annoying, but good for debug
      }, 5 * 60 * 1000); 
    };

    if (isVaultUnlocked) {
      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('keydown', resetTimer);
      resetTimer();
    }

    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      if (inactivityTimer) clearTimeout(inactivityTimer);
    };
  }, [isVaultUnlocked, lockVault]);

  useEffect(() => {
    // Attempt to silently refresh token on app load to restore session
    const restoreSession = async () => {
      try {
        const refreshRes = await api.post('/auth/refresh');
        if (refreshRes.data?.success) {
          const newToken = refreshRes.data.data.access_token;
          useAuthStore.getState().setAccessToken(newToken);
          
          // Now fetch profile
          const meRes = await api.get('/auth/me');
          if (meRes.data?.success) {
            setAuth(meRes.data.data.user, newToken);
          }
        }
      } catch (err) {
        logout();
      }
    };
    
    // Only attempt if not already authenticated in state AND not currently handling an OAuth callback
    const isOAuthCallback = window.location.pathname === '/oauth-callback';
    if (!useAuthStore.getState().isAuthenticated && !isOAuthCallback) {
      restoreSession();
    }
  }, [setAuth, logout]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public Sharing & QR Verification (No Auth Needed) */}
          <Route path="/share/:token" element={<PublicShareView />} />
          <Route path="/qr/verify/:token" element={<PublicQRVerify />} />

          {/* Auth Routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/oauth-callback" element={<OAuthCallback />} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="/reset-password/:token" element={<PublicRoute><ResetPassword /></PublicRoute>} />
          </Route>

          {/* Protected Vault Routes */}
          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/files" element={<Files />} />
            <Route path="/idcards" element={<IDCards />} />
            <Route path="/idcards/new" element={<AddIDCard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/audit" element={<AuditLog />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: isDarkMode ? '#1e293b' : '#fff',
            color: isDarkMode ? '#f8fafc' : '#0f172a',
          }
        }} 
      />
    </QueryClientProvider>
  );
}

export default App;
