import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Shield, Key, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/axios';

const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[!@#$%^&*(),.?":{}|<>]/;

const passwordSchema = z.object({
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(12, 'Password must be at least 12 characters')
    .refine((val) => HAS_UPPER.test(val), 'Must contain an uppercase letter')
    .refine((val) => HAS_LOWER.test(val), 'Must contain a lowercase letter')
    .refine((val) => HAS_DIGIT.test(val), 'Must contain a number')
    .refine((val) => HAS_SPECIAL.test(val), 'Must contain a special character'),
  confirm_new_password: z.string()
}).refine((data) => data.newPassword === data.confirm_new_password, {
  message: "Passwords don't match",
  path: ["confirm_new_password"],
});

export default function Settings() {
  const [showPassword, setShowPassword] = useState({ current: false, new: false, confirm: false });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // --- Password Form ---
  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(passwordSchema),
  });

  const onPasswordChange = async (data) => {
    try {
      setIsChangingPassword(true);
      const res = await api.post('/auth/change-password', data);
      if (res.data?.success) {
        toast.success(res.data.message || 'Password changed successfully');
        reset();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const PasswordInput = ({ label, name, register, error, showKey }) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      <div className="relative">
        <input
          {...register(name)}
          type={showPassword[showKey] ? 'text' : 'password'}
          className={`w-full pl-4 pr-10 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
            error ? 'border-danger-500' : 'border-slate-200 dark:border-slate-700'
          }`}
        />
        <button
          type="button"
          onClick={() => setShowPassword(prev => ({ ...prev, [showKey]: !prev[showKey] }))}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        >
          {showPassword[showKey] ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p className="text-danger-500 text-xs mt-1">{error.message}</p>}
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl">
      <div className="mb-8 block">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Security Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your account protection and credentials</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 md:p-10">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 flex items-center justify-center">
            <Key size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Change Account Password</h2>
            <p className="text-sm text-slate-500">Unified password used for login and vault unlocking</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onPasswordChange)}>
          <PasswordInput label="Current Password" name="oldPassword" showKey="current" register={register} error={errors.oldPassword} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <PasswordInput label="New Password" name="newPassword" showKey="new" register={register} error={errors.newPassword} />
            <PasswordInput label="Confirm New Password" name="confirm_new_password" showKey="confirm" register={register} error={errors.confirm_new_password} />
          </div>
          
          <button
            type="submit"
            disabled={isChangingPassword}
            className="mt-4 w-full md:w-auto px-8 bg-slate-900 hover:bg-slate-800 dark:bg-primary-600 dark:hover:bg-primary-500 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg active:scale-95 flex justify-center items-center gap-2"
          >
            {isChangingPassword ? <Loader2 size={18} className="animate-spin" /> : 'Confirm Password Change'}
          </button>
        </form>
      </div>
    </div>
  );
}
