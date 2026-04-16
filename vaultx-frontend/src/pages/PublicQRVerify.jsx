import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, XCircle, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'https://vaultx-secure.onrender.com/api';

export default function PublicQRVerify() {
  const { token } = useParams();
  const [status, setStatus] = useState('loading'); // loading, success, error
  const [data, setData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const verifyToken = async () => {
      try {
        const res = await axios.get(`${API_URL}/qr/verify/${token}`);
        if (res.data?.success && res.data?.data?.verified) {
          setData(res.data.data.resource);
          setStatus('success');
        } else {
          setStatus('error');
          setErrorMessage('Invalid verification data.');
        }
      } catch (err) {
        setStatus('error');
        setErrorMessage(err.response?.data?.message || 'Invalid or expired QR code.');
      }
    };

    if (token) {
      verifyToken();
    }
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden text-center">
        
        {status === 'loading' && (
          <div className="p-12 mix-blend-multiply">
            <Loader2 className="w-16 h-16 animate-spin text-primary-500 mx-auto mb-6" />
            <h2 className="text-xl font-bold text-slate-900">Verifying Identity...</h2>
            <p className="text-slate-500 mt-2">Checking cryptographic signatures</p>
          </div>
        )}

        {status === 'error' && (
          <div className="p-10">
            <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle size={40} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Verification Failed</h2>
            <p className="text-slate-600 mb-8">{errorMessage}</p>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-500 text-left">
              <strong>Possible reasons:</strong>
              <ul className="list-disc ml-5 mt-2 space-y-1">
                <li>The QR code has expired</li>
                <li>The associated resource was deleted</li>
                <li>The cryptographic signature is invalid or tampered</li>
              </ul>
            </div>
          </div>
        )}

        {status === 'success' && data && (
          <div>
            <div className="bg-success-600 p-8 text-white relative">
              <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
              </div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-white text-success-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg border-4 border-success-400">
                  <CheckCircle2 size={32} />
                </div>
                <h2 className="text-2xl font-bold mb-1">Identity Verified</h2>
                <div className="inline-flex items-center gap-1.5 bg-success-700/50 px-3 py-1 rounded-full text-sm mt-2 border border-success-500">
                  <ShieldCheck size={16} /> Cryptographically Secure
                </div>
              </div>
            </div>

            <div className="p-8 text-left">
              {data.type === 'idcard' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Cardholder Name</p>
                    <p className="text-lg font-bold text-slate-900">{data.holder}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Identity Type</p>
                      <p className="text-slate-900 capitalize">{data.card_type.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Issuer</p>
                      <p className="text-slate-900">{data.issuer}</p>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Status</p>
                    {data.is_expired ? (
                      <div className="flex items-center gap-2 text-danger-600 font-semibold bg-danger-50 px-3 py-2 rounded-lg">
                        <AlertTriangle size={18} /> EXPIRED
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-success-600 font-semibold bg-success-50 px-3 py-2 rounded-lg">
                        <CheckCircle2 size={18} /> ACTIVE (Valid until {data.expiry_date ? format(new Date(data.expiry_date), 'MM/yy') : 'N/A'})
                      </div>
                    )}
                  </div>
                </div>
              )}

              {data.type === 'file' && (
                <div className="space-y-4 text-center">
                  <p className="text-slate-600">Verified authenticity for file:</p>
                  <p className="text-lg font-mono font-bold text-slate-900 break-all bg-slate-50 p-4 rounded-xl border border-slate-200">
                    {data.name}
                  </p>
                  <div className="flex gap-4 justify-center text-sm text-slate-500 mt-4">
                    <span>{(data.size_bytes / 1024).toFixed(1)} KB</span>
                    <span>•</span>
                    <span>{format(new Date(data.added_at), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-slate-50 p-4 text-xs text-slate-400 border-t border-slate-200">
              Verified by VaultX Secure Infrastructure at {format(new Date(), 'HH:mm:ss')}
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
}
