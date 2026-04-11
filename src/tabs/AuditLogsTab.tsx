import { useState, useEffect } from 'react';
import { RefreshCcw, Search, Calendar, History, Activity } from 'lucide-react';
import { fetchSystemAuditLogs, type AuditLogEntry } from '@/services/auditLogApi';

export function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSystemAuditLogs(200);
      setLogs(data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(s) ||
      log.user_name.toLowerCase().includes(s) ||
      log.resource_type.toLowerCase().includes(s) ||
      (log.resource_id && log.resource_id.toLowerCase().includes(s))
    );
  });

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 flex items-center gap-2">
            <History className="h-6 w-6 text-slate-700" />
            System Audit Logs
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Track and monitor all critical administrative activities across the platform.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent transition-shadow"
            />
          </div>
          <button
            title="Refresh"
            onClick={loadLogs}
            disabled={loading}
            className="p-2 border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="max-h-[min(70vh,560px)] w-full min-w-0 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
              <tr>
                <th className="py-4 px-6">Date & Time</th>
                <th className="py-4 px-6">User</th>
                <th className="py-4 px-6">Role</th>
                <th className="py-4 px-6">Action</th>
                <th className="py-4 px-6">Resource</th>
                <th className="py-4 px-6 min-w-[200px]">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Activity className="h-6 w-6 animate-pulse mx-auto mb-2 opacity-50" />
                    Loading audit trail...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No logs found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="py-3 px-6 text-slate-500">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 opacity-70" />
                        {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                      </div>
                    </td>
                    <td className="py-3 px-6 font-medium text-slate-800">
                      {log.user_name}
                    </td>
                    <td className="py-3 px-6">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 uppercase tracking-wider">
                        {log.user_role}
                      </span>
                    </td>
                    <td className="py-3 px-6">
                      <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-md text-[11px] uppercase tracking-wider">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-6">
                      <div className="flex flex-col">
                        <span className="text-slate-700 font-medium">{log.resource_type}</span>
                        {log.resource_id && (
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5" title={log.resource_id}>
                            {log.resource_id.length > 20 ? log.resource_id.slice(0, 20) + '...' : log.resource_id}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-6">
                      <div className="max-w-xs md:max-w-md lg:max-w-lg truncate text-slate-500 font-mono text-[11px] bg-slate-50 p-1.5 rounded border border-slate-100">
                        {log.details ? JSON.stringify(log.details) : '{}'}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
