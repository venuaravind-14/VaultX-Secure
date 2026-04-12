import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuthStore } from '../../store/useAuthStore';

export default function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isSessionExpired, logout } = useAuthStore();

  // Handle session expiration modal
  // This triggers when interceptors catch a 401 on refresh
  if (isSessionExpired) {
    return (
      <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl max-w-sm w-full text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-danger-500" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Session Expired</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            For your security, your session has expired. Please log in again to continue accessing your vault.
          </p>
          <button 
            onClick={() => logout(false)} // This explicitly redirects to /login since we reset `isSessionExpired`
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-xl transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex transition-colors duration-200">
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      
      <div className="flex-1 flex flex-col md:ml-64 min-w-0 transition-all duration-300">
        <Topbar setMobileOpen={setMobileOpen} />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
