import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Download, ShieldCheck, Lock, AlertCircle, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'https://vaultx-secure.onrender.com/api/v1';

export default function PublicShareView() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const linkId = searchParams.get('link_id');

  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorStatus, setErrorStatus] = useState(null); // 401 (password), 403 (revoked), 404 (not found), 410 (expired/limit)

  const handleDownload = async (e) => {
    e?.preventDefault();
    setIsLoading(true);
    setErrorStatus(null);

    try {
      const res = await axios.post(
        `${API_URL}/sharing/access/${token}?link_id=${linkId}`,
        { password },
        { responseType: 'blob' }
      );

      // Create a URL for the blob and trigger download
      const filename = res.headers['content-disposition']?.split('filename="')[1]?.split('"')[0] || 'shared_file';
      const url = window.URL.createObjectURL(new Blob([res.data], { type: res.headers['content-type'] }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
    } catch (err) {
      setErrorStatus(err.response?.status || 500);
    } finally {
      setIsLoading(false);
    }
  };

  // Error States
  if (errorStatus === 403) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl max-w-md w-full text-center shadow-lg border border-slate-200">
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Access Revoked</h2>
          <p className="text-slate-600">The owner has revoked access to this shared link.</p>
        </div>
      </div>
    );
  }

  if (errorStatus === 410) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl max-w-md w-full text-center shadow-lg border border-slate-200">
          <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Link Expired</h2>
          <p className="text-slate-600">This secure link has expired or reached its maximum download limit.</p>
        </div>
      </div>
    );
  }

  if (errorStatus === 404) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl max-w-md w-full text-center shadow-lg border border-slate-200">
          <div className="w-16 h-16 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Not Found</h2>
          <p className="text-slate-600">This share link does not exist or the file was deleted.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-lg border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-primary-600 p-6 text-center text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <div className="relative z-10 flex justify-center mb-3">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/30">
              <ShieldCheck size={28} />
            </div>
          </div>
          <h1 className="text-xl font-bold mb-1">Secure File Transfer</h1>
          <p className="text-primary-100 text-sm">Powered by VaultX</p>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="flex items-center gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100 border-dashed">
            <Lock className="text-slate-400 shrink-0" size={20} />
            <p className="text-sm text-slate-600">This file is End-to-End Encrypted. It will be decrypted locally during download.</p>
          </div>

          <form onSubmit={handleDownload}>
            {errorStatus === 401 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Password Required</label>
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter the secure password"
                  className="w-full px-4 py-2.5 rounded-xl border border-danger-300 bg-red-50 focus:ring-2 focus:ring-danger-500 outline-none text-slate-900"
                  required
                />
                <p className="text-danger-500 text-xs mt-1">Incorrect password or password required.</p>
              </div>
            )}
            
            {errorStatus !== 401 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Password (if applicable)</label>
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank if no password"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-primary-500 outline-none text-slate-900"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Decrypting & Downloading...
                </>
              ) : (
                <>
                  <Download size={20} />
                  Download Secure File
                </>
              )}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
