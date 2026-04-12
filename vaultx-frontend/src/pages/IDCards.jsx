import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/axios';
import { Plus, CreditCard, Trash2, ShieldCheck, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import QRCode from 'react-qr-code';

export default function IDCards() {
  const queryClient = useQueryClient();
  const [flippedCards, setFlippedCards] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['idcards'],
    queryFn: async () => {
      const res = await api.get('/idcards?limit=50');
      return res.data?.data?.cards || [];
    }
  });

  const generateQRMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.post('/qr/generate', { type: 'idcard', resource_id: id });
      return { id, token: res.data.data.token, accessUrl: `${window.location.origin}/qr/verify/${res.data.data.token}` };
    },
    onSuccess: ({ id, accessUrl }) => {
      // We store the access URL in local component state for speed instead of patching DB
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
    // If not flipped and no QR URL generated yet, generate it first
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

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">ID Wallet</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage and verify digital identities</p>
        </div>
        <Link 
          to="/idcards/new"
          className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-xl transition-colors flex items-center gap-2"
        >
          <Plus size={18} /> <span className="hidden sm:inline">Add Card</span>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : data?.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 border-dashed p-12 text-center text-slate-500">
          <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium text-slate-900 dark:text-white mb-2">Your wallet is empty</p>
          <p className="mb-6">Add your first digital ID card to start verifying access instantly.</p>
          <Link to="/idcards/new" className="text-primary-600 font-medium hover:underline inline-flex items-center gap-1">
            <Plus size={16} /> Add ID Card
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative" style={{ perspective: '1000px' }}>
          {data?.map(card => (
            <div key={card._id} className="relative h-56 w-full" style={{ perspective: '1000px' }}>
              <div 
                className={`w-full h-full transition-transform duration-700 style-preserve-3d shadow-xl rounded-2xl cursor-pointer ${flippedCards[card._id]?.isFlipped ? 'rotate-y-180' : ''}`}
                onClick={() => toggleFlip(card._id)}
              >
                {/* Front Side */}
                <div className={`absolute w-full h-full backface-hidden rounded-2xl p-6 flex flex-col justify-between text-white bg-gradient-to-br ${getTheme(card.card_type)} overflow-hidden`}>
                  
                  {/* Glassmorphism decor overlay - moved down in DOM to avoid intercepting clicks */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none transform translate-x-10 -translate-y-10" />
                  <div className="absolute bottom-0 right-0 w-32 h-32 bg-black/10 rounded-tl-full blur-sm pointer-events-none" />

                  <div className="flex justify-between items-start relative z-10">
                    <div className="opacity-90 uppercase tracking-widest text-xs font-bold font-mono">
                      {card.card_type.replace('_', ' ')}
                    </div>
                    {/* Delete button (stop propagation so it doesn't flip card) */}
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if(window.confirm('Delete this ID card?')) deleteMutation.mutate(card._id); 
                      }}
                      className="p-1.5 bg-black/20 hover:bg-red-500/80 rounded-lg transition-colors backdrop-blur-sm"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="relative z-10 mb-2">
                    <h2 className="text-xl font-bold tracking-wide">{card.card_holder_name}</h2>
                    <p className="text-sm opacity-80 mt-1">{card.issuer}</p>
                  </div>

                  <div className="flex justify-between items-end pb-1 relative z-10">
                    <div className="font-mono text-sm opacity-90 tracking-widest">
                      {/* Mask except last 4 */}
                      •••• •••• •••• {card.card_number.slice(-4)}
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className="text-[10px] uppercase opacity-70">Exp</span>
                      <span className="text-sm font-medium leading-none mt-1">
                        {format(new Date(card.expiry_date), 'MM/yy')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Back Side (QR Code for Verification) */}
                <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-white dark:bg-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center border border-slate-200 dark:border-slate-700">
                  {generateQRMutation.isLoading && generateQRMutation.variables === card._id ? (
                     <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                  ) : (
                    <>
                      <div className="bg-white p-2 rounded-xl shadow-sm mb-3">
                        {flippedCards[card._id]?.url && (
                          <QRCode value={flippedCards[card._id]?.url} size={120} level="M" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">SCAN TO VERIFY</p>
                      <div className="absolute top-4 left-4 text-success-500 flex items-center gap-1.5 bg-success-50 dark:bg-success-900/20 px-2 py-1 rounded border border-success-200 dark:border-success-800 font-semibold text-[10px] uppercase">
                        <ShieldCheck size={12} /> Secure
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
