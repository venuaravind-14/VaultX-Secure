import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Download, Lock, Loader2, AlertCircle, ShieldCheck, FileText, Clock, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'https://vaultx-secure.onrender.com/api';

const formatBytes = (bytes) => {
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default function PublicShareView() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const linkId = searchParams.get('link_id');

  const [status, setStatus] = useState('loading'); // loading | ready | password | downloading | error | expired | exhausted
  const [linkInfo, setLinkInfo] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  // Fetch link metadata on mount
  useEffect(() => {
    if (!token || !linkId) {
      setStatus('error');
      setErrorMsg('Invalid share link — missing token or link ID.');
      return;
    }

    const fetchInfo = async () => {
      try {
        const res = await axios.get(`${API_URL}/sharing/info/${token}?link_id=${linkId}`);
        const data = res.data?.data;

        if (!data) throw new Error('No data received');

        setLinkInfo(data);

        if (data.is_revoked) { setStatus('error'); setErrorMsg('This share link has been revoked.'); return; }
        if (data.is_expired) { setStatus('expired'); return; }
        if (data.is_exhausted) { setStatus('exhausted'); return; }
        if (!data.is_valid) { setStatus('error'); setErrorMsg('This share link is no longer valid.'); return; }
        if (data.is_password_protected) { setStatus('password'); return; }

        setStatus('ready');
      } catch (err) {
        const msg = err.response?.data?.message || 'Failed to load share link info.';
        setStatus('error');
        setErrorMsg(msg);
      }
    };

    fetchInfo();
  }, [token, linkId]);

  const handleDownload = async (pwd = null) => {
    setIsDownloading(true);
    const toastId = toast.loading('Preparing download...');

    try {
      const config = {
        responseType: 'blob',
        timeout: 180_000,
      };

      // If password-protected, send via POST with password in body
      let response;
      if (pwd) {
        response = await axios.post(
          `${API_URL}/sharing/access/${token}?link_id=${linkId}`,
          { password: pwd },
          config
        );
      } else {
        response = await axios.get(
          `${API_URL}/sharing/access/${token}?link_id=${linkId}`,
          config
        );
      }

      // Extract filename from Content-Disposition header
      const disposition = response.headers['content-disposition'] || '';
      const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const filename = filenameMatch
        ? decodeURIComponent(filenameMatch[1])
        : linkInfo?.file?.name || 'download';

      const contentType = response.headers['content-type'] || 'application/octet-stream';
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Download complete!', { id: toastId });
      setStatus('exhausted'); // Assume this was the last download or re-fetch info

    } catch (err) {
      const status = err.response?.status;
      let msg = 'Download failed. Please try again.';

      if (status === 401 && pwd !== null) msg = 'Incorrect password. Please try again.';
      else if (status === 410) msg = 'This link has expired or reached its download limit.';
      else if (status === 404) msg = 'File not found — it may have been deleted.';
      else if (err.response?.data?.message) msg = err.response.data.message;

      toast.error(msg, { id: toastId });

      if (status === 401 && pwd !== null) {
        setPassword('');
        // Stay on password screen
      } else if (status === 410) {
        setStatus('exhausted');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (!password.trim()) { toast.error('Please enter the password'); return; }
    handleDownload(password);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden">
        {/* Branding strip */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4 flex items-center gap-2">
          <ShieldCheck size={20} className="text-white" />
          <span className="text-white font-bold tracking-wide">VaultX Secure</span>
          <span className="text-primary-200 text-sm ml-auto">Encrypted Share</span>
        </div>

        <div className="p-6">
          {/* Loading */}
          {status === 'loading' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
              <p className="text-slate-500 dark:text-slate-400">Verifying secure link...</p>
            </div>
          )}

          {/* Ready to download */}
          {(status === 'ready' || status === 'downloading') && linkInfo && (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText size={22} className="text-primary-600 dark:text-primary-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 dark:text-white truncate" title={linkInfo.file?.name}>
                    {linkInfo.file?.name || 'Shared File'}
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {formatBytes(linkInfo.file?.size_bytes)}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5"><Clock size={13} /> Expires</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {new Date(linkInfo.expiry_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5"><Download size={13} /> Downloads left</span>
                  <span className="font-medium text-slate-900 dark:text-white">{linkInfo.downloads_remaining}</span>
                </div>
              </div>

              <button
                onClick={() => handleDownload(null)}
                disabled={isDownloading}
                className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isDownloading
                  ? <><Loader2 size={18} className="animate-spin" /> Downloading...</>
                  : <><Download size={18} /> Download File</>
                }
              </button>

              <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
                Files are AES-256-GCM encrypted. Download is decrypted in transit.
              </p>
            </div>
          )}

          {/* Password required */}
          {status === 'password' && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Lock size={24} className="text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="font-bold text-slate-900 dark:text-white text-lg">Password Required</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {linkInfo?.file?.name && <span className="font-medium">"{linkInfo.file.name}" </span>}
                  is password protected.
                </p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password..."
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoFocus
                    className="w-full px-4 pr-10 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={isDownloading}
                  className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {isDownloading
                    ? <><Loader2 size={16} className="animate-spin" /> Verifying...</>
                    : <><Download size={16} /> Unlock & Download</>
                  }
                </button>
              </form>
            </div>
          )}

          {/* Expired */}
          {status === 'expired' && (
            <StatusCard
              icon={<Clock size={28} className="text-amber-500" />}
              iconBg="bg-amber-100 dark:bg-amber-900/30"
              title="Link Expired"
              message="This share link has expired. Please ask the sender for a new link."
            />
          )}

          {/* Exhausted */}
          {status === 'exhausted' && (
            <StatusCard
              icon={<Download size={28} className="text-slate-500" />}
              iconBg="bg-slate-100 dark:bg-slate-700"
              title="Download Limit Reached"
              message="This link has reached its maximum download count and is no longer active."
            />
          )}

          {/* Error */}
          {status === 'error' && (
            <StatusCard
              icon={<AlertCircle size={28} className="text-red-500" />}
              iconBg="bg-red-100 dark:bg-red-900/30"
              title="Link Unavailable"
              message={errorMsg || 'This share link is invalid or no longer available.'}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatusCard({ icon, iconBg, title, message }) {
  return (
    <div className="text-center py-6 space-y-3">
      <div className={`w-16 h-16 ${iconBg} rounded-2xl flex items-center justify-center mx-auto`}>
        {icon}
      </div>
      <h2 className="font-bold text-slate-900 dark:text-white text-lg">{title}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">{message}</p>
    </div>
  );
}
