import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Copy, Check, Loader2, Key } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/axios';
import QRCode from 'react-qr-code';

const shareSchema = z.object({
  expiry_hours: z.number().min(1, 'Minimum 1 hour expiry'),
  download_limit: z.number().min(-1, 'Use -1 for unlimited, or specific positive number'),
  password: z.string().optional(),
});

export default function ShareModal({ file, onClose }) {
  const [createdLink, setCreatedLink] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(shareSchema),
    defaultValues: {
      expiry_hours: 24,
      download_limit: 1,
      password: '',
    }
  });

  const onSubmit = async (data) => {
    try {
      setIsLoading(true);
      const payload = { ...data, file_id: file._id };
      if (!payload.password) delete payload.password; // Don't send empty string
      
      const res = await api.post('/sharing', payload);
      if (res.data?.success) {
        setCreatedLink(res.data.data);
        toast.success('Share link generated successfully');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create share link');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!createdLink) return;
    navigator.clipboard.writeText(createdLink.access_url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="p-6 md:p-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white pb-1">Share File</h2>
          <p className="text-sm border-b border-slate-200 dark:border-slate-700 pb-4 mb-4 font-mono text-slate-500 truncate">
            {file.original_name}
          </p>

          {!createdLink ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Expiry (Hours)</label>
                  <input
                    {...register('expiry_hours', { valueAsNumber: true })}
                    type="number"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  {errors.expiry_hours && <p className="text-danger-500 text-xs mt-1">{errors.expiry_hours.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Max Downloads</label>
                  <input
                    {...register('download_limit', { valueAsNumber: true })}
                    type="number"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span>Optional Password</span>
                  <Key size={14} className="text-slate-400" />
                </label>
                <input
                  {...register('password')}
                  type="password"
                  placeholder="Leave blank for no password"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-xl transition-colors mt-6 flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Generate Secure Link'}
              </button>
            </form>
          ) : (
            <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4">
              <div className="bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-400 p-3 rounded-lg text-sm font-medium border border-success-200 dark:border-success-800/50">
                Link generated successfully!
              </div>

              <div className="flex justify-center bg-white p-4 rounded-xl border border-slate-200 mx-auto inline-block self-center">
                <QRCode 
                  value={createdLink.access_url} 
                  size={140}
                  level="M"
                />
              </div>

              <div className="flex gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={createdLink.access_url}
                  className="flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-600 dark:text-slate-300 font-mono outline-none"
                />
                <button 
                  onClick={copyToClipboard}
                  className="p-2 bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-400 rounded-xl hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
                >
                  {isCopied ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium py-2.5 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
