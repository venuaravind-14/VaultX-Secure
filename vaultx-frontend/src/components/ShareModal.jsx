import { useState } from 'react';
import { X, Copy, Check, Loader2, Link2, Lock, Clock, Download, Shield, AlertCircle, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../api/axios';
import QRCode from 'react-qr-code';

export default function ShareModal({ file, onClose }) {
  const [step, setStep] = useState('form'); // form | result | error
  const [isLoading, setIsLoading] = useState(false);
  const [createdLink, setCreatedLink] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form state (controlled — avoids react-hook-form overhead for a simple form)
  const [form, setForm] = useState({
    expiry_hours: 24,
    download_limit: 5,
    password: '',
    usePassword: false,
  });
  const [formErrors, setFormErrors] = useState({});

  const validate = () => {
    const errs = {};
    const hours = parseInt(form.expiry_hours, 10);
    if (isNaN(hours) || hours < 1 || hours > 720)
      errs.expiry_hours = 'Must be between 1 and 720 hours (30 days)';
    const dl = parseInt(form.download_limit, 10);
    if (isNaN(dl) || dl < 1 || dl > 100)
      errs.download_limit = 'Must be between 1 and 100';
    if (form.usePassword && form.password.length < 8)
      errs.password = 'Password must be at least 8 characters';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    setErrorMsg('');

    const payload = {
      file_id: file._id,
      expiry_hours: parseInt(form.expiry_hours, 10),
      download_limit: parseInt(form.download_limit, 10),
    };
    if (form.usePassword && form.password) {
      payload.password = form.password;
    }

    try {
      const res = await api.post('/sharing', payload);
      if (res.data?.success && res.data?.data) {
        setCreatedLink(res.data.data);
        setStep('result');
        toast.success('Secure link generated!');
      } else {
        throw new Error(res.data?.message || 'Unexpected response from server');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to create share link';
      setErrorMsg(msg);
      setStep('error');
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const copyLink = () => {
    if (!createdLink?.access_url) return;
    navigator.clipboard.writeText(createdLink.access_url)
      .then(() => {
        setIsCopied(true);
        toast.success('Link copied to clipboard');
        setTimeout(() => setIsCopied(false), 2500);
      })
      .catch(() => toast.error('Failed to copy — please copy manually'));
  };

  const expiryPresets = [
    { label: '1h', value: 1 },
    { label: '24h', value: 24 },
    { label: '7d', value: 168 },
    { label: '30d', value: 720 },
  ];

  return (
    <div
      className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-100 dark:bg-primary-900/40 rounded-xl flex items-center justify-center">
              <Link2 size={18} className="text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Share File</h2>
              <p className="text-xs text-slate-500 truncate max-w-[200px]" title={file.original_name}>
                {file.original_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          {/* ── FORM STEP ── */}
          {step === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Expiry */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <Clock size={14} className="inline mr-1.5 opacity-70" />
                  Link expires in
                </label>
                <div className="flex gap-2 mb-2">
                  {expiryPresets.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, expiry_hours: p.value }))}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        parseInt(form.expiry_hours) === p.value
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="720"
                    value={form.expiry_hours}
                    onChange={e => setForm(f => ({ ...f, expiry_hours: e.target.value }))}
                    className="w-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  <span className="text-sm text-slate-500">hours custom</span>
                </div>
                {formErrors.expiry_hours && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.expiry_hours}</p>
                )}
              </div>

              {/* Download limit */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <Download size={14} className="inline mr-1.5 opacity-70" />
                  Max downloads
                </label>
                <div className="flex gap-2 mb-2">
                  {[1, 5, 10, 25].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, download_limit: v }))}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        parseInt(form.download_limit) === v
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {v}×
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={form.download_limit}
                  onChange={e => setForm(f => ({ ...f, download_limit: e.target.value }))}
                  className="w-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
                {formErrors.download_limit && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.download_limit}</p>
                )}
              </div>

              {/* Password toggle */}
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.usePassword}
                    onChange={e => setForm(f => ({ ...f, usePassword: e.target.checked, password: '' }))}
                    className="w-4 h-4 rounded accent-primary-600"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock size={14} className="opacity-70" />
                    Protect with password
                  </span>
                </label>
                {form.usePassword && (
                  <div className="mt-2">
                    <input
                      type="password"
                      placeholder="Enter password (min 8 chars)"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    {formErrors.password && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <><Loader2 size={18} className="animate-spin" /> Generating secure link...</>
                ) : (
                  <><Shield size={18} /> Generate Secure Link</>
                )}
              </button>
            </form>
          )}

          {/* ── RESULT STEP ── */}
          {step === 'result' && createdLink && (
            <div className="space-y-5">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
                <Shield size={16} />
                Secure link created — share it with confidence
              </div>

              {/* QR Code */}
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <QRCode
                    value={createdLink.access_url}
                    size={150}
                    level="M"
                  />
                </div>
              </div>

              {/* Link copy */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Share URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdLink.access_url}
                    className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 dark:text-slate-300 outline-none"
                    onClick={e => e.target.select()}
                  />
                  <button
                    onClick={copyLink}
                    className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center gap-1.5 text-sm font-medium"
                  >
                    {isCopied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-slate-500 text-xs mb-0.5">Expires</p>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {new Date(createdLink.expiry_at).toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-slate-500 text-xs mb-0.5">Downloads</p>
                  <p className="font-medium text-slate-900 dark:text-white">
                    0 / {createdLink.download_limit}
                  </p>
                </div>
              </div>

              {createdLink.is_password_protected && (
                <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  <Lock size={13} />
                  Password protected — share the password separately
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setStep('form'); setCreatedLink(null); }}
                  className="flex-1 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium py-2.5 rounded-xl transition-colors text-sm"
                >
                  Create Another
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* ── ERROR STEP ── */}
          {step === 'error' && (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle size={28} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-1">Link Creation Failed</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{errorMsg}</p>
              </div>
              <button
                onClick={() => { setStep('form'); setErrorMsg(''); }}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-xl transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
