import { Menu, Moon, Sun, Bell, Search, User } from 'lucide-react';
import { useThemeStore } from '../../store/useThemeStore';
import { useAuthStore } from '../../store/useAuthStore';

export default function Topbar({ setMobileOpen }) {
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const { user } = useAuthStore();

  return (
    <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20 shadow-sm">
      <div className="flex items-center gap-4">
        {/* Mobile menu button */}
        <button 
          onClick={() => setMobileOpen(true)}
          className="md:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg flex-shrink-0"
        >
          <Menu size={24} />
        </button>

        {/* Global Search Bar (placeholder for now) */}
        <div className="hidden sm:flex items-center relative w-64 md:w-96">
          <Search size={18} className="absolute left-3 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search vault..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-900 border-none rounded-full text-sm focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Theme Toggle */}
        <button 
          onClick={toggleDarkMode}
          className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors flex-shrink-0"
          aria-label="Toggle dark mode"
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Notifications */}
        <button className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors relative flex-shrink-0">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger-500 rounded-full border-2 border-white dark:border-slate-800"></span>
        </button>

        {/* User Avatar */}
        <div className="flex items-center gap-3 pl-2 sm:pl-4 border-l border-slate-200 dark:border-slate-700 ml-1 sm:ml-2">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{user?.name || 'User'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 break-all w-[100px] overflow-hidden text-ellipsis">{user?.email || ''}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold shadow-sm flex-shrink-0">
            {user?.name ? user.name.charAt(0).toUpperCase() : <User size={20} />}
          </div>
        </div>
      </div>
    </header>
  );
}
