import { Outlet } from 'react-router-dom';
import { useThemeStore } from '../../store/useThemeStore';
import { Shield } from 'lucide-react';

export default function AuthLayout() {
  const { isDarkMode } = useThemeStore();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
      <div className="w-full max-w-md p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-xl relative overflow-hidden">
        {/* Decorative background blur */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary-500/20 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-accent-500/20 blur-3xl rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
            <Shield size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">VaultX Secure</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Enterprise Digital Vault</p>
        </div>

        <div className="relative z-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
