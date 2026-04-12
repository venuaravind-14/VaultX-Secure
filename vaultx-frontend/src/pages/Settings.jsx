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
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .refine((val) => HAS_UPPER.test(val), 'Must contain an uppercase letter')
    .refine((val) => HAS_LOWER.test(val), 'Must contain a lowercase letter')
    .refine((val) => HAS_DIGIT.test(val), 'Must contain a number')
    .refine((val) => HAS_SPECIAL.test(val), 'Must contain a special character'),
  confirm_new_password: z.string()
}).refine((data) => data.new_password === data.confirm_new_password, {
  message: "Passwords don't match",
  path: ["confirm_new_password"],
});

const pinSchema = z.object({
  pin: z.string().length(6, 'PIN must be exactly 6 digits').regex(/^\d+$/, 'PIN must contain only numbers'),
});

export default function Settings() {
  const [showPassword, setShowPassword] = useState({ current: false, new: false, confirm: false, pin: false });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSettingPin, setIsSettingPin] = useState(false);

  // --- Password Form ---
  const { register: registerPwd, handleSubmit: handlePwdSubmit, formState: { errors: pwdErrors }, reset: resetPwd } = useForm({
    resolver: zodResolver(passwordSchema),
  });

  const onPasswordChange = async (data) => {
    try {
      setIsChangingPassword(true);
      const res = await api.post('/auth/change-password', data);
      if (res.data?.success) {
        toast.success(res.data.message);
        resetPwd();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // --- PIN Form ---
  const { register: registerPin, handleSubmit: handlePinSubmit, formState: { errors: pinErrors }, reset: resetPin } = useForm({
    resolver: zodResolver(pinSchema),
  });

  const onPinSet = async (data) => {
    try {
      setIsSettingPin(true);
      const res = await api.post('/auth/set-pin', data);
      if (res.data?.success) {
        toast.success(res.data.message);
        resetPin();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to set PIN');
    } finally {
      setIsSettingPin(false);
    }
  };

  const PasswordInput = ({ label, name, register, options, error, type, showKey }) => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      <div className="relative">
        <input
          {...register(name, options)}
          type={showPassword[showKey] ? 'text' : type}
          className={`w-full pl-4 pr-10 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
            error ? 'border-danger-500' : 'border-slate-200 dark:border-slate-700'
          }`}
        />
        {(type === 'password' || name === 'pin') && (
          <button
            type="button"
            onClick={() => setShowPassword(prev => ({ ...prev, [showKey]: !prev[showKey] }))}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          >
            {showPassword[showKey] ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error && <p className="text-danger-500 text-xs mt-1">{error.message}</p>}
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 block">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Security Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your account protection and credentials</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Change Password Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 flex items-center justify-center">
              <Key size={20} />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Change Password</h2>
          </div>

          <form onSubmit={handlePwdSubmit(onPasswordChange)}>
            <PasswordInput label="Current Password" name="current_password" type="password" showKey="current" register={registerPwd} error={pwdErrors.current_password} />
            <PasswordInput label="New Password" name="new_password" type="password" showKey="new" register={registerPwd} error={pwdErrors.new_password} />
            <PasswordInput label="Confirm New Password" name="confirm_new_password" type="password" showKey="confirm" register={registerPwd} error={pwdErrors.confirm_new_password} />
            
            <button
              type="submit"
              disabled={isChangingPassword}
              className="mt-2 w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-medium py-2.5 rounded-xl transition-colors flex justify-center items-center gap-2"
            >
              {isChangingPassword ? <Loader2 size={18} className="animate-spin" /> : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Set PIN Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-accent-100 dark:bg-accent-900/50 text-accent-600 dark:text-accent-400 flex items-center justify-center">
              <Shield size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Vault PIN</h2>
              <p className="text-xs text-slate-500">Adds an extra layer of 6-digit PIN protection</p>
            </div>
          </div>

          <form onSubmit={handlePinSubmit(onPinSet)}>
            <PasswordInput 
              label="6-Digit PIN" 
              name="pin" 
              type="password" 
              showKey="pin" 
              register={registerPin} 
              options={{ maxLength: 6 }}
              error={pinErrors.pin} 
            />
            
            <button
              type="submit"
              disabled={isSettingPin}
              className="mt-2 w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-medium py-2.5 rounded-xl transition-colors flex justify-center items-center gap-2"
            >
              {isSettingPin ? <Loader2 size={18} className="animate-spin" /> : 'Set Vault PIN'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
