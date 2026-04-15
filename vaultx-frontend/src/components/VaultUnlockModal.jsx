import { useState, useEffect, useRef } from 'react';
import { Lock, ShieldCheck, Loader2, AlertCircle, X, Eye, EyeOff } from 'lucide-react';
import { api } from '../api/axios';
import { useAuthStore } from '../store/useAuthStore';
import toast from 'react-hot-toast';

export default function VaultUnlockModal({ onSuccess, onClose }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const setVaultToken = useAuthStore((state) => state.setVaultToken);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/unlock-vault', { password });
      if (res.data?.success && res.data?.data?.vault_token) {
        setVaultToken(res.data.data.vault_token);
        toast.success('Vault Access Granted');
        if (onSuccess) onSuccess();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Verification failed. Please check your password.';
      setError(msg);
      setPassword('');
      inputRef.current?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 relative border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-8 right-8 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all"
        >
          <X size={24} />
        </button>

        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-primary-100 dark:bg-primary-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6 group">
            {isLoading ? (
              <Loader2 size={32} className="text-primary-600 animate-spin" />
            ) : (
              <Lock size={32} className="text-primary-600 group-hover:scale-110 transition-transform" />
            )}
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">Unlock Vault</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">Verify your account password to access sensitive data</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Password</label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your login password"
                className={`w-full pl-5 pr-12 py-4 rounded-2xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-4 focus:ring-primary-500/20 outline-none transition-all ${
                  error ? 'border-danger-500' : 'border-slate-200 dark:border-slate-700'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {error && (
              <div className="mt-3 flex items-center gap-2 text-danger-600 text-xs font-bold animate-pulse">
                <AlertCircle size={14} />
                {error}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-primary-600 dark:hover:bg-primary-500 disabled:opacity-50 text-white font-bold h-16 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-primary-500/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <>
                <ShieldCheck size={24} />
                Confirm Unlock
              </>
            )}
          </button>
        </form>

        <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 mt-8 uppercase tracking-[0.2em] font-bold">
          High Security Zone
        </p>
      </div>
    </div>
  );
}

const AlertCircle = ({ size, className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);
