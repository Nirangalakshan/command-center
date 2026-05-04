import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  RefreshCcw,
  Search,
  Calendar,
  History,
  Activity,
  Eye,
  MessageCircleReply,
} from 'lucide-react';
import {
  fetchSystemAuditLogs,
  type AuditLogEntry,
  isAuditChatSupportEntry,
} from '@/services/auditLogApi';
import { cn } from '@/lib/utils';

function normAction(log: AuditLogEntry): string {
  return (log.action ?? '').trim().toLowerCase().replace(/-/g, '_');
}

function pickStr(d: Record<string, unknown>, keys: readonly string[]): string {
  for (const k of keys) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

function readReceiptPostedState(
  d: Record<string, unknown>,
): boolean | undefined {
  const v = d.readReceiptPosted ?? d.read_receipt_posted;
  if (v === true || v === 'true' || v === 1) return true;
  if (v === false || v === 'false' || v === 0) return false;
  return undefined;
}

function asDetailRecord(details: unknown): Record<string, unknown> {
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  if (typeof details === 'string') {
    try {
      const p = JSON.parse(details) as unknown;
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function normResourceType(log: AuditLogEntry): string {
  return (log.resource_type ?? '').trim().toLowerCase().replace(/-/g, '_');
}

function resourceTypeLabel(log: AuditLogEntry): string {
  const t = normResourceType(log);
  if (t === 'bms_chat' || t === 'support_chat') return 'Support chat';
  if (t === 'session') return 'Session';
  if (t === 'booking') return 'Booking';
  if (t === 'notification') return 'Notification';
  return log.resource_type || '—';
}

function auditDetailsCell(log: AuditLogEntry): ReactNode {
  if (!isAuditChatSupportEntry(log)) {
    return (
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-100 bg-slate-50/80 p-2 font-mono text-[11px] text-slate-600">
        {log.details && Object.keys(log.details).length > 0
          ? JSON.stringify(log.details, null, 2)
          : '{}'}
      </pre>
    );
  }

  const d = asDetailRecord(log.details);
  const action = normAction(log);

  if (action === 'chat_viewed') {
    const contact = pickStr(d, ['tenantName', 'tenant_name']);
    const workshop = pickStr(d, ['workshopDisplayName', 'workshop_display_name']);
    const readOk = readReceiptPostedState(d) === true;
    const readFailed = readReceiptPostedState(d) === false;
    return (
      <div className="space-y-1.5 text-xs leading-snug text-slate-700">
        <div className="flex items-center gap-1.5 font-semibold text-violet-800">
          <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Opened support conversation
        </div>
        {readOk ? (
          <p className="text-[11px] text-emerald-700">Read receipt posted.</p>
        ) : readFailed ? (
          <p className="text-[11px] text-amber-700">
            Thread loaded; read receipt did not post (conversation may still show as unread).
          </p>
        ) : null}
        {contact ? (
          <p>
            <span className="text-slate-400">Contact</span>{' '}
            <span className="font-medium text-slate-800">{contact}</span>
          </p>
        ) : null}
        {workshop ? (
          <p>
            <span className="text-slate-400">Workshop</span>{' '}
            <span className="font-medium text-slate-800">{workshop}</span>
          </p>
        ) : null}
        {log.resource_id ? (
          <p className="break-all font-mono text-[10px] text-slate-400">
            Conversation {log.resource_id}
          </p>
        ) : null}
      </div>
    );
  }

  if (action === 'chat_reply') {
    const preview = pickStr(d, ['textPreview', 'text_preview', 'text', 'message', 'body']);
    const mid = pickStr(d, ['messageId', 'message_id']);
    const contact = pickStr(d, ['tenantName', 'tenant_name', 'userName', 'user_name']);
    return (
      <div className="space-y-1.5 text-xs leading-snug text-slate-700">
        <div className="flex items-center gap-1.5 font-semibold text-sky-800">
          <MessageCircleReply className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Sent support chat reply
        </div>
        {contact ? (
          <p>
            <span className="text-slate-400">Contact</span>{' '}
            <span className="font-medium text-slate-800">{contact}</span>
          </p>
        ) : null}
        {preview ? (
          <p className="whitespace-pre-wrap break-words rounded-md border border-slate-100 bg-slate-50/90 px-2 py-1.5 text-[11px] text-slate-600">
            {preview}
          </p>
        ) : null}
        {mid ? (
          <p className="break-all font-mono text-[10px] text-slate-400">Message {mid}</p>
        ) : null}
        {log.resource_id ? (
          <p className="break-all font-mono text-[10px] text-slate-400">
            Conversation {log.resource_id}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-100 bg-slate-50/80 p-2 font-mono text-[11px] text-slate-600">
      {log.details && Object.keys(log.details).length > 0
        ? JSON.stringify(log.details, null, 2)
        : '{}'}
    </pre>
  );
}

function actionLabel(log: AuditLogEntry): string {
  const a = normAction(log);
  switch (a) {
    case 'chat_viewed':
      return 'Support chat opened';
    case 'chat_reply':
      return 'Support chat reply';
    case 'login':
      return 'Login';
    case 'create_booking':
      return 'Booking created';
    case 'notification_viewed':
      return 'Notification viewed';
    case 'notification_call_customer':
      return 'Call customer';
    case 'notification_customer_answered':
      return 'Customer answered';
    default:
      return log.action || '—';
  }
}

function detailsSearchBlob(log: AuditLogEntry): string {
  try {
    return JSON.stringify(log.details ?? {}).toLowerCase();
  } catch {
    return '';
  }
}

type FilterMode = 'all' | 'support_chat';

export function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
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
    void loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterMode === 'support_chat' && !isAuditChatSupportEntry(log)) return false;

      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      const userName = (log.user_name ?? '').toLowerCase();
      const userRole = (log.user_role ?? '').toLowerCase();
      const resourceType = (log.resource_type ?? '').toLowerCase();
      const resourceId = (log.resource_id ?? '').toLowerCase();

      return (
        (log.action ?? '').toLowerCase().includes(s) ||
        userName.includes(s) ||
        userRole.includes(s) ||
        resourceType.includes(s) ||
        resourceTypeLabel(log).toLowerCase().includes(s) ||
        actionLabel(log).toLowerCase().includes(s) ||
        resourceId.includes(s) ||
        detailsSearchBlob(log).includes(s)
      );
    });
  }, [logs, searchTerm, filterMode]);

  return (
    <div className="animate-in fade-in space-y-6 duration-500 slide-in-from-bottom-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-2xl font-bold text-transparent">
            <History className="h-6 w-6 text-slate-700" />
            System Audit Logs
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Track activity across the command centre, including support chat (open thread, send reply)
            and other audited actions.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                filterMode === 'all'
                  ? 'border border-slate-300 bg-white text-slate-900 shadow-sm'
                  : 'border border-transparent text-slate-600 hover:bg-white/80',
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('support_chat')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                filterMode === 'support_chat'
                  ? 'border border-slate-300 bg-white text-slate-900 shadow-sm'
                  : 'border border-transparent text-slate-600 hover:bg-white/80',
              )}
            >
              Support chat
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search logs…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-400 sm:w-64"
            />
          </div>
          <button
            title="Refresh"
            type="button"
            onClick={() => void loadLogs()}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[min(70vh,560px)] w-full min-w-0 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 font-medium text-slate-600">
              <tr>
                <th className="whitespace-nowrap px-6 py-4">Date & Time</th>
                <th className="whitespace-nowrap px-6 py-4">User</th>
                <th className="whitespace-nowrap px-6 py-4">Role</th>
                <th className="whitespace-nowrap px-6 py-4">Action</th>
                <th className="whitespace-nowrap px-6 py-4">Resource</th>
                <th className="min-w-[240px] px-6 py-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Activity className="mx-auto mb-2 h-6 w-6 animate-pulse opacity-50" />
                    Loading audit trail…
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No logs found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const chatRow = isAuditChatSupportEntry(log);
                  const na = normAction(log);
                  return (
                    <tr
                      key={log.id ?? `${log.created_at}-${log.action}-${log.resource_id}`}
                      className={`transition-colors hover:bg-slate-50/50 ${chatRow ? 'bg-slate-50/30' : ''}`}
                    >
                      <td className="whitespace-nowrap px-6 py-3 text-slate-500">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 opacity-70" />
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 font-medium text-slate-800">
                        {log.user_name?.trim() || '—'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
                          {log.user_role ?? '—'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span
                          className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                            na === 'chat_viewed'
                              ? 'bg-violet-100 text-violet-800'
                              : na === 'chat_reply'
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {actionLabel(log)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-700">
                            {resourceTypeLabel(log)}
                          </span>
                          {log.resource_id && (
                            <span
                              className="mt-0.5 font-mono text-[10px] text-slate-400"
                              title={log.resource_id}
                            >
                              {log.resource_id.length > 20
                                ? `${log.resource_id.slice(0, 20)}…`
                                : log.resource_id}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="max-w-md px-6 py-3 align-top text-slate-600 lg:max-w-lg">
                        {auditDetailsCell(log)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
