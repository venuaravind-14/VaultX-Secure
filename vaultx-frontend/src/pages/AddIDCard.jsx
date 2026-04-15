import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, ArrowLeft, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/axios';

const idCardSchema = z.object({
  card_type: z.enum(['employee', 'student', 'driver_license', 'passport', 'national_id', 'other']),
  card_holder_name: z.string().min(2, 'Name must be at least 2 characters'),
  card_number: z.string().min(4, 'Card number is too short').max(20, 'Card number is too long'),
  issuer: z.string().min(2, 'Issuer name is required'),
  expiry_date: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date' })
    .refine((val) => new Date(val) > new Date(), { message: 'Expiry date must be in the future' }),
});

export default function AddIDCard() {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(idCardSchema),
    defaultValues: {
      card_type: 'employee',
    }
  });

  const onSubmit = async (data) => {
    try {
      setIsLoading(true);
      const res = await api.post('/idcards', data);
      
      if (res.data?.success) {
        toast.success('ID card securely added to your wallet');
        navigate('/idcards');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add ID card');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Link to="/idcards" className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="text-primary-500" /> Add New ID
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Store your digital identity securely in the vault</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ID Type</label>
            <select
              {...register('card_type')}
              className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
                errors.card_type ? 'border-danger-500' : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <option value="employee">Employee ID</option>
              <option value="student">Student ID</option>
              <option value="driver_license">Driver's License</option>
              <option value="passport">Passport</option>
              <option value="national_id">National ID Card</option>
              <option value="other">Other Identity Card</option>
            </select>
            {errors.card_type && <p className="text-danger-500 text-xs mt-1">{errors.card_type.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cardholder Name</label>
            <input
              {...register('card_holder_name')}
              type="text"
              placeholder="e.g. John Doe"
              className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
                errors.card_holder_name ? 'border-danger-500' : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            {errors.card_holder_name && <p className="text-danger-500 text-xs mt-1">{errors.card_holder_name.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Card Number</label>
              <input
                {...register('card_number')}
                type="text"
                placeholder="e.g. EMP-12345"
                className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
                  errors.card_number ? 'border-danger-500' : 'border-slate-200 dark:border-slate-700'
                }`}
              />
              {errors.card_number && <p className="text-danger-500 text-xs mt-1">{errors.card_number.message}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Issuer / Organization</label>
              <input
                {...register('issuer')}
                type="text"
                placeholder="e.g. VaultX Corp"
                className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
                  errors.issuer ? 'border-danger-500' : 'border-slate-200 dark:border-slate-700'
                }`}
              />
              {errors.issuer && <p className="text-danger-500 text-xs mt-1">{errors.issuer.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Expiry Date</label>
            <input
              {...register('expiry_date')}
              type="date"
              className={`w-full px-4 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
                errors.expiry_date ? 'border-danger-500' : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            {errors.expiry_date && <p className="text-danger-500 text-xs mt-1">{errors.expiry_date.message}</p>}
          </div>

          <div className="pt-4 flex items-center justify-end gap-3">
            <Link 
              to="/idcards"
              className="px-6 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isLoading}
              className="bg-primary-600 hover:bg-primary-700 text-white font-medium px-8 py-2.5 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-70"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Save ID Card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
