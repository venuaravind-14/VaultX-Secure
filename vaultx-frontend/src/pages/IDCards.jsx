import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/axios';
import { Plus, CreditCard, Trash2, ShieldCheck, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import QRCode from 'react-qr-code';
import { useAuthStore } from '../store/useAuthStore';

export default function IDCards() {
  const queryClient = useQueryClient();
  const [flippedCards, setFlippedCards] = useState({});
  const { isAuthenticated } = useAuthStore();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['idcards'],
    queryFn: async () => {
      const res = await api.get('/idcards?limit=50');
      return res.data?.data?.cards || [];
    },
    enabled: !!isAuthenticated,
    retry: 2,
  });

  const generateQRMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.post('/qr/generate', { type: 'idcard', resource_id: id });
      return { id, token: res.data.data.token, accessUrl: `${window.location.origin}/qr/verify/${res.data.data.token}` };
    },
    onSuccess: ({ id, accessUrl }) => {
      setFlippedCards(prev => ({
        ...prev,
        [id]: { isFlipped: true, url: accessUrl }
      }));
    },
    onError: () => toast.error('Failed to generate verification QR')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => await api.delete(`/idcards/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['idcards']);
      toast.success('ID Card removed');
    }
  });

  const toggleFlip = (id) => {
    if (!flippedCards[id]?.isFlipped && !flippedCards[id]?.url) {
      generateQRMutation.mutate(id);
      return;
    }

    setFlippedCards(prev => ({
      ...prev,
      [id]: { ...prev[id], isFlipped: !prev[id]?.isFlipped }
    }));
  };

  const getTheme = (type) => {
    switch(type) {
      case 'employee': return 'from-primary-600 to-indigo-800';
      case 'student': return 'from-blue-500 to-cyan-600';
      case 'driver_license': return 'from-orange-500 to-amber-600';
      case 'passport': return 'from-slate-700 to-slate-900';
      default: return 'from-accent-500 to-teal-700';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="text-primary-500" /> ID Wallet
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage and verify digital identities</p>
        </div>
        <Link 
          to="/idcards/add"
          className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-6 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center gap-2"
        >
          <Plus size={18} /> Add New ID
        </Link>
      </div>

      {isError ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-700">
          <p className="text-slate-500 mb-4">Sync interrupted.</p>
          <button onClick={() => refetch()} className="text-primary-600 font-bold">Retry Sync</button>
        </div>
      ) : data?.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-16 text-center">
          <CreditCard className="w-16 h-16 mx-auto mb-4 opacity-10 text-slate-900 dark:text-white" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Wallet is empty</h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-8">Securely store your corporate IDs, student cards, or licenses in the encrypted vault.</p>
          <Link to="/idcards/add" className="bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold py-3 px-8 rounded-2xl transition-colors">
            Add Your First ID
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" style={{ perspective: '1200px' }}>
          {Array.isArray(data) && data.map(card => (
            <div key={card._id} className="relative h-60 w-full group" style={{ perspective: '1200px' }}>
              <div 
                className={`w-full h-full transition-all duration-700 style-preserve-3d shadow-xl rounded-[2rem] cursor-pointer ${flippedCards[card._id]?.isFlipped ? 'rotate-y-180' : ''}`}
                onClick={() => toggleFlip(card._id)}
              >
                {/* Front Side */}
                <div className={`absolute w-full h-full backface-hidden rounded-[2rem] p-8 flex flex-col justify-between text-white bg-gradient-to-br ${getTheme(card.card_type)} overflow-hidden`}>
                  <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none transform translate-x-12 -translate-y-12" />
                  
                  <div className="flex justify-between items-start relative z-10">
                    <div className="opacity-90 uppercase tracking-[0.2em] text-[10px] font-black bg-white/20 px-3 py-1 rounded-full backdrop-blur-md">
                      {String(card.card_type || 'other').replace('_', ' ')}
                    </div>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if(window.confirm('Erase this ID record?')) deleteMutation.mutate(card._id); 
                      }}
                      className="p-2 bg-black/20 hover:bg-red-500 rounded-xl transition-all backdrop-blur-md"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="relative z-10">
                    <h2 className="text-2xl font-black tracking-tight leading-none mb-1">{card.card_holder_name || 'N/A'}</h2>
                    <p className="text-sm font-medium opacity-70 uppercase tracking-widest">{card.issuer || 'N/A'}</p>
                  </div>

                  <div className="flex justify-between items-end relative z-10">
                    <div className="font-mono text-sm opacity-90 tracking-[0.3em]">
                      •••• •••• •••• {(card.card_number || '0000').slice(-4)}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-bold opacity-60">Expires</p>
                      <p className="text-sm font-black mt-0.5 tracking-tighter">
                        {card.expiry_date ? format(new Date(card.expiry_date), 'MM / yy') : '-- / --'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Back Side */}
                <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-white dark:bg-slate-800 rounded-[2rem] p-8 flex flex-col items-center justify-center border border-slate-200 dark:border-slate-700">
                  {generateQRMutation.isLoading && generateQRMutation.variables === card._id ? (
                     <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
                  ) : (
                    <>
                      <div className="bg-white p-3 rounded-2xl shadow-inner mb-4 transition-transform hover:scale-105">
                        {flippedCards[card._id]?.url && (
                          <QRCode value={flippedCards[card._id]?.url} size={140} level="M" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-black tracking-[0.4em] uppercase">Scan for Proof</p>
                      <div className="absolute top-6 left-6 text-success-500 flex items-center gap-2 bg-success-50 dark:bg-success-950/30 px-3 py-1.5 rounded-xl border border-success-100 dark:border-success-900/50 font-black text-[10px] uppercase tracking-wider">
                        <ShieldCheck size={14} /> Secured
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
