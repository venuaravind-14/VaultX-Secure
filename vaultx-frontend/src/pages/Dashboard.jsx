import { useQuery } from 'https://esm.sh/@tanstack/react-query@5?external=react,react-dom';
import { Activity, ShieldCheck, FileKey, Link as LinkIcon, ServerCrash, Loader2, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../api/axios';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

const fetchDashboardData = async () => {
  const [filesRes, idcardsRes, sharesRes, auditRes] = await Promise.all([
    api.get('/files?limit=5'),
    api.get('/idcards?limit=5'),
    api.get('/sharing?limit=5'),
    api.get('/audit?limit=5')
  ]);
  
  return {
    files: filesRes.data?.data,
    idcards: idcardsRes.data?.data,
    shares: sharesRes.data?.data,
    recentAudits: auditRes.data?.data?.logs || []
  };
};

export default function Dashboard() {
  const { user, isAuthenticated } = useAuthStore();
  
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboardData'],
    queryFn: fetchDashboardData,
    enabled: !!isAuthenticated && !!user,
    retry: 2,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-[70vh] items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary-500" />
        <p className="text-slate-400 font-medium animate-pulse">Establishing Secure Session...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center text-center px-4 animate-in fade-in duration-500">
        <ServerCrash className="w-16 h-16 mb-4 text-danger-500 opacity-50" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Vault Connection Interrupted</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mb-6">
          We encountered a protocol error while reaching the secure vault services. This may happen during session rotation.
        </p>
        <button 
          onClick={() => refetch()}
          className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 px-8 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center gap-2"
        >
          <Activity size={18} /> Reconnect Now
        </button>
      </div>
    );
  }

  const stats = [
    { label: 'Secure Files', value: data?.files?.pagination?.total || 0, icon: <FileKey size={20} />, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Digital IDs', value: data?.idcards?.pagination?.total || 0, icon: <ShieldCheck size={20} />, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
    { label: 'Active Shares', value: data?.shares?.pagination?.total || 0, icon: <LinkIcon size={20} />, color: 'text-teal-500', bg: 'bg-teal-50 dark:bg-teal-900/20' },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Vault Overview
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Protected as <span className="text-primary-600 dark:text-primary-400 font-bold">{user?.email}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-1.5 pl-4 pr-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase font-bold text-slate-400 leading-none text-right">Protection</span>
            <span className="text-sm font-bold text-success-600 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-success-500 rounded-full" /> Verified
            </span>
          </div>
          <div className="bg-slate-100 dark:bg-slate-700 p-2.5 rounded-xl">
             <ShieldCheck size={20} className="text-slate-600 dark:text-slate-300" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow group">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${stat.bg} ${stat.color}`}>
              {stat.icon}
            </div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
            <h3 className="text-4xl font-black text-slate-900 dark:text-white mt-1">{stat.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col p-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Recent Artifacts</h3>
            <Link to="/files" className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-primary-600 hover:text-white rounded-xl transition-all">
              <ArrowRight size={20} />
            </Link>
          </div>
          
          <div className="space-y-3 flex-1">
            {data?.files?.files && Array.isArray(data.files.files) && data.files.files.length > 0 ? (
              data.files.files.slice(0, 4).map((f) => (
                <div key={f._id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-900/30 p-4 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{f.original_name || 'Unnamed Artifact'}</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                      {f.size_bytes ? (f.size_bytes / 1024).toFixed(1) : '0'} KB • {f.created_at ? formatDistanceToNow(new Date(f.created_at), { addSuffix: true }) : 'recent'}
                    </span>
                  </div>
                  <div className="px-2.5 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 text-[10px] font-black text-slate-500 uppercase">
                    {(f.mime_type || 'application/octet-stream').split('/')[1] || 'FILE'}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-3xl">
                <FileKey size={40} className="mb-2 opacity-20" />
                <p className="text-sm font-medium">No secure files yet</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col p-8">
           <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Security Events</h3>
            <Link to="/audit" className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-accent-600 hover:text-white rounded-xl transition-all">
              <ArrowRight size={20} />
            </Link>
          </div>

          <div className="space-y-4 flex-1">
            {data?.recentAudits && Array.isArray(data.recentAudits) && data.recentAudits.length > 0 ? (
              data.recentAudits.slice(0, 5).map((log) => (
                <div key={log._id} className="flex items-center gap-4 group">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 transition-transform group-hover:scale-125 ${log.success ? 'bg-success-500 shadow-sm shadow-success-500/50' : 'bg-danger-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">
                      {(log.action || 'system_event').replace(/_/g, ' ')}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                      {log.timestamp ? formatDistanceToNow(new Date(log.timestamp), { addSuffix: true }) : 'recent'} • {log.ip_address || 'unknown'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 border-2 border-dashed border-slate-100 dark:border-slate-700 rounded-3xl">
                <Activity size={40} className="mb-2 opacity-20" />
                <p className="text-sm font-medium">Awaiting security events</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
