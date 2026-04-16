import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/axios';
import { Activity, ServerCrash, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useAuthStore } from '../store/useAuthStore';

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const { isAuthenticated } = useAuthStore();
  
  const fetchLogs = async (p) => {
    const res = await api.get(`/audit?page=${p}&limit=15`);
    return res.data?.data;
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['auditLogs', page],
    queryFn: () => fetchLogs(page),
    enabled: !!isAuthenticated,
  });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Activity className="text-accent-500" /> Security Log
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Immutable ledger of all security-critical operations</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <ServerCrash className="w-12 h-12 mb-4 text-danger-500 opacity-50" />
            <p className="font-bold text-slate-700 dark:text-slate-300">Sync Interrupted</p>
            <p className="text-sm">We couldn't retrieve the security logs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                  <th className="p-6">Timestamp</th>
                  <th className="p-6">Secure Action</th>
                  <th className="p-6">Protection Result</th>
                  <th className="p-6 text-right">Origin (IP)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {data?.logs?.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center py-20 text-slate-500 font-medium">No activity recorded in this sector yet.</td>
                  </tr>
                ) : (
                  data?.logs?.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/10 transition-colors">
                      <td className="p-6 text-sm whitespace-nowrap text-slate-500 dark:text-slate-400 font-medium">
                        {log.timestamp ? format(new Date(log.timestamp), 'MMM d, HH:mm:ss') : 'recent'}
                      </td>
                      <td className="p-6 text-sm font-black text-slate-800 dark:text-slate-100 whitespace-nowrap uppercase tracking-tight">
                        {(log.action || 'system_event').replace(/_/g, ' ')}
                      </td>
                      <td className="p-6">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black tracking-widest ${
                          log.success ? 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-400' : 'bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-400'
                        }`}>
                          {log.success ? 'PASSED' : 'DENIED'}
                        </span>
                      </td>
                      <td className="p-6 text-right">
                        <div className="text-xs font-bold text-slate-600 dark:text-slate-300 font-mono">{log.ip_address}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[200px] ml-auto" title={log.user_agent}>{log.user_agent || 'Encrypted Client'}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {data?.pagination?.pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 p-6 bg-slate-50/50 dark:bg-slate-900/20">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Sector {page} / {data.pagination.pages}
            </span>
            <div className="flex gap-4">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-6 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white dark:hover:bg-slate-800 disabled:opacity-20 text-slate-600 dark:text-slate-300 transition-all active:scale-95"
              >
                Prev
              </button>
              <button
                disabled={page === data.pagination.pages}
                onClick={() => setPage(p => Math.min(data.pagination.pages, p + 1))}
                className="px-6 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white dark:hover:bg-slate-800 disabled:opacity-20 text-slate-600 dark:text-slate-300 transition-all active:scale-95"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
