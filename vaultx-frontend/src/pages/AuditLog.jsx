import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/axios';
import { Activity, ServerCrash, Loader2, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  
  const fetchLogs = async (p, act) => {
    const actFilter = act ? `&action=${act}` : '';
    const res = await api.get(`/audit?page=${p}&limit=15${actFilter}`);
    return res.data?.data;
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['auditLogs', page, actionFilter],
    queryFn: () => fetchLogs(page, actionFilter),
    keepPreviousData: true,
  });

  const AUDIT_ACTIONS = [
    '',
    'LOGIN', 'LOGOUT', 'REGISTER', 'PASSWORD_RESET', 'PASSWORD_CHANGE',
    'FILE_UPLOAD', 'FILE_DOWNLOAD', 'FILE_DELETE',
    'SHARE_CREATE', 'SHARE_REVOKE', 'SHARE_ACCESS',
    'QR_GENERATE', 'QR_SCAN'
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="text-accent-500" /> Audit Log
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Immutable security events and activity tracking</p>
        </div>

        <div className="flex gap-2 items-center">
          <div className="relative relative-w-full md:w-auto">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="pl-9 pr-8 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 text-slate-700 dark:text-slate-300 outline-none appearance-none cursor-pointer"
            >
              <option value="">All Actions</option>
              {AUDIT_ACTIONS.filter(Boolean).map(a => (
                <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <ServerCrash className="w-12 h-12 mb-4 text-danger-500" />
            <p>Failed to load audit logs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                  <th className="font-medium p-4">Timestamp</th>
                  <th className="font-medium p-4">Action</th>
                  <th className="font-medium p-4">Status</th>
                  <th className="font-medium p-4">Resource</th>
                  <th className="font-medium p-4">IP / Agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {data?.logs?.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-10 text-slate-500">No logs found.</td>
                  </tr>
                ) : (
                  data?.logs?.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                      <td className="p-4 text-sm whitespace-nowrap text-slate-900 dark:text-slate-300">
                        {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                      </td>
                      <td className="p-4 text-sm font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {log.action.replace(/_/g, ' ')}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          log.success ? 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-400' : 'bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-400'
                        }`}>
                          {log.success ? 'SUCCESS' : 'FAILED'}
                        </span>
                      </td>
                      <td className="p-4 text-sm font-mono text-slate-500 dark:text-slate-400">
                        <span title={log.resource_id}>{log.resource_id?.slice(-8) || '-'}</span>
                      </td>
                      <td className="p-4 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate" title={log.user_agent}>
                        <div className="font-medium text-slate-700 dark:text-slate-300">{log.ip_address}</div>
                        <div className="truncate">{log.user_agent || 'Unknown'}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {data?.pagination?.pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900/30">
            <span className="text-sm text-slate-500">
              Page {page} of {data.pagination.pages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 transition-colors"
              >
                Previous
              </button>
              <button
                disabled={page === data.pagination.pages}
                onClick={() => setPage(p => Math.min(data.pagination.pages, p + 1))}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 transition-colors"
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
