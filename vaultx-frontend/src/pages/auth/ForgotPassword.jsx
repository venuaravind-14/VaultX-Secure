import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/axios';

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export default function ForgotPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data) => {
    try {
      setIsLoading(true);
      const res = await api.post('/auth/forgot-password', data);
      
      if (res.data?.success) {
        setIsSent(true);
        toast.success('Reset link sent if the email exists.');
      }
    } catch {
      // Always show success to prevent email enumeration, unless it's a network error
      setIsSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSent) {
    return (
      <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
        <div className="w-16 h-16 bg-success-100 text-success-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Send size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Check your email</h2>
        <p className="text-slate-600 dark:text-slate-300 mb-8 max-w-sm mx-auto">
          We've sent password reset instructions to your email address.
        </p>
        <Link to="/login" className="text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center justify-center gap-2">
          <ArrowLeft size={16} /> Back to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Reset Password</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">Enter your email and we'll send you a reset link</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
          <input
            {...register('email')}
            type="email"
            placeholder="you@example.com"
            disabled={isLoading}
            className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
              errors.email ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20' : 'border-slate-200 dark:border-slate-700'
            }`}
          />
          {errors.email && <p className="text-danger-500 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 mt-6 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Send Reset Link'}
        </button>
      </form>

      <div className="mt-8 text-center text-sm">
        <Link to="/login" className="text-slate-500 dark:text-slate-400 font-medium flex items-center justify-center gap-2 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
          <ArrowLeft size={16} /> Back to Sign In
        </Link>
      </div>
    </div>
  );
}
