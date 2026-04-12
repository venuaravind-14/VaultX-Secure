import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/axios';

const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[!@#$%^&*(),.?":{}|<>]/;

const schema = z.object({
  new_password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .refine((val) => HAS_UPPER.test(val), 'Must contain an uppercase letter')
    .refine((val) => HAS_LOWER.test(val), 'Must contain a lowercase letter')
    .refine((val) => HAS_DIGIT.test(val), 'Must contain a number')
    .refine((val) => HAS_SPECIAL.test(val), 'Must contain a special character'),
  confirm: z.string()
}).refine((data) => data.new_password === data.confirm, {
  message: "Passwords don't match",
  path: ["confirm"],
});

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data) => {
    try {
      setIsLoading(true);
      const res = await api.post(`/auth/reset-password/${token}`, {
        new_password: data.new_password,
      });
      
      if (res.data?.success) {
        toast.success('Password successfully reset. You can now sign in.');
        navigate('/login');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reset password. Link may be expired.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Create New Password</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">Your new password must be at least 12 characters and include uppercase, lowercase, numbers, and symbols.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">New Password</label>
          <div className="relative">
            <input
              {...register('new_password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              disabled={isLoading}
              className={`w-full pl-4 pr-10 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
                errors.new_password ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20' : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.new_password && <p className="text-danger-500 text-xs mt-1">{errors.new_password.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm New Password</label>
          <input
            {...register('confirm')}
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            disabled={isLoading}
            className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
              errors.confirm ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20' : 'border-slate-200 dark:border-slate-700'
            }`}
          />
          {errors.confirm && <p className="text-danger-500 text-xs mt-1">{errors.confirm.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 mt-6 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Reset Password'}
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
