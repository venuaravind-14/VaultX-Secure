import { useState, useEffect, useRef } from 'react';
import { Lock, ShieldCheck, Loader2, AlertCircle, X, ArrowRight } from 'lucide-react';
import { api } from '../api/axios';
import { useAuthStore } from '../store/useAuthStore';
import toast from 'react-hot-toast';

export default function PinModal({ onSuccess, onClose }) {
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const setVaultToken = useAuthStore((state) => state.setVaultToken);
  const inputRef = useRef(null);

  // Auto-focus input on mount
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (pin.length < 4) return;

    setIsLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/verify-pin', { pin });
      if (res.data?.success && res.data?.data?.vault_token) {
        setVaultToken(res.data.data.vault_token);
        toast.success('Vault Unlocked');
        if (onSuccess) onSuccess();
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Incorrect PIN. please try again.';
      setError(msg);
      setPin('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDigitClick = (digit) => {
    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 6) {
        // Auto-submit on 6 digits
        setTimeout(() => submitPin(newPin), 100);
      }
    }
  };

  const submitPin = async (finalPin) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/verify-pin', { pin: finalPin });
      if (res.data?.success && res.data?.data?.vault_token) {
        setVaultToken(res.data.data.vault_token);
        toast.success('Vault Unlocked');
        if (onSuccess) onSuccess();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Incorrect PIN';
      setError(msg);
      setPin('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300 shadow-2xl">
      <div 
        className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-[2rem] shadow-2xl p-8 relative border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4 group">
            {isLoading ? (
              <Loader2 size={28} className="text-primary-600 animate-spin" />
            ) : (
              <Lock size={28} className="text-primary-600 group-hover:scale-110 transition-transform" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Vault Locked</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Enter your secure PIN to access this resource</p>
        </div>

        {/* PIN Display Dots */}
        <div className="flex justify-center gap-3 mb-8">
          {[...Array(6)].map((_, i) => (
            <div 
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                i < pin.length 
                  ? 'bg-primary-600 border-primary-600 scale-110 shadow-sm shadow-primary-500/50' 
                  : 'border-slate-300 dark:border-slate-600'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-medium animate-in shake duration-300">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Number Pad */}
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'del'].map((val, i) => (
            <button
              key={i}
              type="button"
              disabled={isLoading || val === ''}
              onClick={() => {
                if (val === 'del') setPin(pin.slice(0, -1));
                else if (typeof val === 'number') handleDigitClick(val);
              }}
              className={`h-14 rounded-2xl flex items-center justify-center text-xl font-bold transition-all ${
                val === '' 
                  ? 'bg-transparent cursor-default' 
                  : 'bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-90 text-slate-800 dark:text-white'
              } ${isLoading ? 'opacity-50' : ''}`}
            >
              {val === 'del' ? (
                <span className="text-xs font-semibold uppercase opacity-60">Del</span>
              ) : val}
            </button>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={isLoading || pin.length < 4}
          className="w-full mt-8 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold h-14 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-primary-600/20 transition-all hover:translate-y-[-2px] active:translate-y-0"
        >
          {isLoading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              <ShieldCheck size={20} />
              Unlock Vault
              <ArrowRight size={18} className="opacity-50 ml-1" />
            </>
          )}
        </button>

        <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 mt-6 uppercase tracking-wider font-semibold">
          Auto-locks after 5 minutes
        </p>
      </div>
    </div>
  );
}
