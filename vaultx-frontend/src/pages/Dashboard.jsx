import { useQuery } from '@tanstack/react-query';
import { Activity, ShieldCheck, FileKey, Link as LinkIcon, ServerCrash, Loader2, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../api/axios';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

const fetchDashboardData = async () => {
  // Parallel fetch using Promise.all to get summary from files, idcards, sharing, and audit limits
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
  const { user } = useAuthStore();
  
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboardData'],
    queryFn: fetchDashboardData,
  });

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-slate-500 dark:text-slate-400">
        <ServerCrash className="w-12 h-12 mb-4 text-danger-500" />
        <p>Failed to load dashboard data.</p>
      </div>
    );
  }

  const stats = [
    { label: 'Secure Files', value: data?.files?.pagination?.total || 0, icon: <FileKey size={24} />, color: 'text-primary-500', bg: 'bg-primary-100 dark:bg-primary-900/50' },
    { label: 'Digital IDs', value: data?.idcards?.pagination?.total || 0, icon: <ShieldCheck size={24} />, color: 'text-accent-500', bg: 'bg-accent-100 dark:bg-accent-900/50' },
    { label: 'Active Shares', value: data?.shares?.pagination?.total || 0, icon: <LinkIcon size={24} />, color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/50' },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      <div className="bg-gradient-to-r from-primary-600 to-accent-500 rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
        {/* Decorative Circles */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-20 w-32 h-32 bg-white opacity-10 rounded-full blur-xl"></div>
        
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">
              Welcome back, {user?.name?.split(' ')[0] || 'User'}!
            </h1>
            <p className="text-primary-50 opacity-90 text-sm sm:text-base">
              Your digital vault is fully encrypted and secure.
            </p>
          </div>
          <div className="hidden sm:flex w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl items-center justify-center border border-white/30 shadow-inner">
            <ShieldCheck size={32} className="text-white" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Files */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileKey size={20} className="text-primary-500" /> Recent Files
            </h3>
            <Link to="/files" className="text-sm text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center gap-1">
              View All <ArrowRight size={16} />
            </Link>
          </div>
          <div className="p-6 flex-1">
            {data?.files?.files?.length > 0 ? (
              <ul className="space-y-4">
                {data.files.files.slice(0, 4).map((f) => (
                  <li key={f._id} className="flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-medium text-slate-900 dark:text-white truncate">{f.original_name}</span>
                      <span className="text-xs text-slate-500 uppercase">{f.mime_type.split('/')[1] || 'FILE'} • {(f.size_bytes / 1024).toFixed(1)} KB</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-slate-500 dark:text-slate-400 py-6">No files uploaded yet.</p>
            )}
          </div>
        </div>

        {/* Recent Audit Logs */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity size={20} className="text-accent-500" /> Recent Security Events
            </h3>
            <Link to="/audit" className="text-sm text-primary-600 dark:text-primary-400 font-medium hover:underline flex items-center gap-1">
              View Audit <ArrowRight size={16} />
            </Link>
          </div>
          <div className="p-6 flex-1">
            {data?.recentAudits?.length > 0 ? (
              <ul className="space-y-4">
                {data.recentAudits.slice(0, 4).map((log) => (
                  <li key={log._id} className="flex items-start gap-3">
                    <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${log.success ? 'bg-success-500' : 'bg-danger-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {log.action.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })} from {log.ip_address}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-slate-500 dark:text-slate-400 py-6">No recent security events.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
