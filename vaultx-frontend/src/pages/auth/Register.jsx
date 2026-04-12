import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';

// Password requirement regexes matching backend policies
const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[!@#$%^&*(),.?":{}|<>]/;

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .refine((val) => HAS_UPPER.test(val), 'Must contain an uppercase letter')
    .refine((val) => HAS_LOWER.test(val), 'Must contain a lowercase letter')
    .refine((val) => HAS_DIGIT.test(val), 'Must contain a number')
    .refine((val) => HAS_SPECIAL.test(val), 'Must contain a special character'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function Register() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    mode: 'onChange', // Validate on change so the strength meter updates live
  });

  const passwordValue = watch('password', '');

  // Password Strength Indicators
  const criteria = [
    { label: '12+ characters', met: passwordValue.length >= 12 },
    { label: 'Uppercase', met: HAS_UPPER.test(passwordValue) },
    { label: 'Lowercase', met: HAS_LOWER.test(passwordValue) },
    { label: 'Number', met: HAS_DIGIT.test(passwordValue) },
    { label: 'Special char', met: HAS_SPECIAL.test(passwordValue) },
  ];

  const onSubmit = async (data) => {
    try {
      setIsLoading(true);
      const res = await api.post('/auth/register', {
        name: data.name,
        email: data.email,
        password: data.password,
      });
      
      if (res.data?.success) {
        setAuth(res.data.data.user, res.data.data.access_token);
        toast.success(`Welcome to VaultX, ${res.data.data.user.name.split(' ')[0]}!`);
        navigate('/');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Create an account</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">Set up your secure digital vault</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
          <input
            {...register('name')}
            type="text"
            placeholder="John Doe"
            disabled={isLoading}
            className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
              errors.name ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20' : 'border-slate-200 dark:border-slate-700'
            }`}
          />
          {errors.name && <p className="text-danger-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

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

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Master Password</label>
          <div className="relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              disabled={isLoading}
              className={`w-full pl-4 pr-10 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
                errors.password ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20' : 'border-slate-200 dark:border-slate-700'
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
          
          {/* Live Password Strength Meter */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {criteria.map((c, i) => (
              <div key={i} className={`flex items-center gap-1.5 ${c.met ? 'text-success-500' : 'text-slate-400'}`}>
                {c.met ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm Password</label>
          <input
            {...register('confirmPassword')}
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            disabled={isLoading}
            className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
              errors.confirmPassword ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/20' : 'border-slate-200 dark:border-slate-700'
            }`}
          />
          {errors.confirmPassword && <p className="text-danger-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isLoading || criteria.some(c => !c.met)}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 mt-6 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Create Account'}
        </button>
      </form>

      <div className="mt-6">
        <div className="flex items-center justify-center space-x-2 mb-6">
          <span className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></span>
          <span className="text-sm text-slate-500 dark:text-slate-400">or continue with</span>
          <span className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></span>
        </div>

        <a
          href={`${api.defaults.baseURL}/auth/google`}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors text-slate-700 dark:text-slate-300 font-medium"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              className="fill-google-blue"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              className="fill-google-green"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              className="fill-google-yellow"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              className="fill-google-red"
            />
          </svg>
          Google
        </a>
      </div>

      <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Already have an account?{' '}
        <Link to="/login" className="text-primary-600 dark:text-primary-400 font-semibold hover:text-primary-700">
          Sign in here
        </Link>
      </p>
    </div>
  );
}
