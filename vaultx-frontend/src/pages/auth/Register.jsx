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

      <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Already have an account?{' '}
        <Link to="/login" className="text-primary-600 dark:text-primary-400 font-semibold hover:text-primary-700">
          Sign in here
        </Link>
      </p>
    </div>
  );
}
