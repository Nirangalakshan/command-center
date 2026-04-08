import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import type { Queue, Agent, DashboardSummary } from '@/services/types';
import { fetchNotifications, type BookingNotification } from '@/services/bookingsApi';
import { resolveOwnerUid } from '@/services/bookingsApi';
import { useAuth } from '@/hooks/useAuth';
import { logSystemActivity } from '@/services/auditLogApi';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Bell, Phone, MapPin,
  AlertCircle, CheckCircle2, User, Mail, Hash, Calendar, Tag,
} from 'lucide-react';

// Props kept for future live data wiring
interface NotificationsCardProps {
  queues: Queue[];
  agents: Agent[];
  summary: DashboardSummary | null;
}

/* ─── Helpers ─── */

function timeAgoFromIso(iso: string | null): string {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ''; }
}

type NotifKind = 'asking' | 'completed' | 'other';

function getKind(type: string): NotifKind {
  if (type === 'booking_completed') return 'completed';
  if (type === 'additional_issue_asking' || type === 'additional_issue_quote') return 'asking';
  return 'other';
}

const KIND_CONFIG: Record<NotifKind, {
  icon: React.ReactNode;
  iconBg: string;
  badgeClass: string;
  badgeLabel: string;
  dotColor: string;
}> = {
  asking: {
    icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
    iconBg: 'bg-amber-100',
    badgeClass: 'bg-amber-50 border-amber-200 text-amber-700',
    badgeLabel: '⚡ Approval Needed',
    dotColor: 'bg-amber-400',
  },
  completed: {
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    iconBg: 'bg-emerald-100',
    badgeClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    badgeLabel: '✓ Booking Completed',
    dotColor: 'bg-emerald-400',
  },
  other: {
    icon: <Bell className="h-4 w-4 text-sky-500" />,
    iconBg: 'bg-sky-100',
    badgeClass: 'bg-sky-50 border-sky-200 text-sky-700',
    badgeLabel: '📋 Notification',
    dotColor: 'bg-sky-400',
  },
};

function NotificationModal({
  notification,
  open,
  onClose,
}: {
  notification: DisplayItem | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!notification) return null;

  const kind = getKind(notification.type);
  const cfg = KIND_CONFIG[kind];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${cfg.iconBg}`}>{cfg.icon}</span>
            {notification.title || 'Notification'}
          </DialogTitle>
        </DialogHeader>

        {/* Type badge */}
        <div className="flex items-center gap-2">
          <Badge className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badgeClass}`}>
            {cfg.badgeLabel}
          </Badge>
          {notification.bookingCode && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
              #{notification.bookingCode}
            </span>
          )}
          {!notification.read && (
            <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">New</span>
          )}
        </div>

        <Separator />

        {/* Message */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Message</p>
          <p className="text-sm text-slate-700 leading-relaxed">{notification.message}</p>
        </div>

        <Separator />

        {/* Customer info grid */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Customer Details</p>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center gap-2.5 text-slate-700">
              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="font-semibold">{notification.clientName || '—'}</span>
            </div>
            {notification.customerEmail && (
              <div className="flex items-center gap-2.5 text-slate-700">
                <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="text-xs">{notification.customerEmail}</span>
              </div>
            )}
            {notification.branchName && (
              <div className="flex items-center gap-2.5 text-slate-700">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="text-xs">{notification.branchName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Additional issue detail */}
        {kind === 'asking' && notification.issueTitle && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-amber-600">
                <AlertCircle className="h-3 w-3" /> Additional Issue
              </div>
              {notification.price != null && (
                <span className="font-bold text-amber-800">${notification.price.toLocaleString()}</span>
              )}
            </div>
            <p className="text-sm font-semibold text-amber-900">{notification.issueTitle}</p>
            {notification.issueId && (
              <p className="font-mono text-[10px] text-amber-600">Issue ID: {notification.issueId}</p>
            )}
          </div>
        )}

        {/* Booking completed detail */}
        {kind === 'completed' && notification.bookingCode && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-600 mb-1">
              <CheckCircle2 className="h-3 w-3" /> Completed Booking
            </div>
            <p className="font-mono text-sm font-semibold text-emerald-800">#{notification.bookingCode}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Adapter: BookingNotification → display shape ─── */

function parseTimeIso(val: any): string | null {
  if (!val) return null;
  try {
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val.seconds) return new Date(val.seconds * 1000).toISOString();
    if (val._seconds) return new Date(val._seconds * 1000).toISOString();
    return new Date(val).toISOString();
  } catch (e) {
    return null;
  }
}

function toDisplayItem(n: BookingNotification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    read: n.read,
    createdAtIso: parseTimeIso(n.createdAt),
    bookingCode: n.bookingCode,
    branchName: n.branchName,
    clientName: n.clientName,
    customerEmail: '',
    customerId: '',
    price: null as number | null,
    issueTitle: null as string | null,
    issueId: null as string | null,
    estimateId: null as string | null,
    bookingId: n.bookingId,
    source: '',
    ownerUid: n.ownerUid,
  };
}

type DisplayItem = ReturnType<typeof toDisplayItem>;

/* ─── Main Card ─── */

export function NotificationsCard(_props: NotificationsCardProps) {
  const { session } = useAuth();
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DisplayItem | null>(null);

  useEffect(() => {
    const ownerUid = localStorage.getItem('cc_last_owner_id') || '';
    if (!ownerUid) {
      resolveOwnerUid()
        .then((uid) => fetchNotifications(uid))
        .then((data) => setItems(
          data
            .filter((n) => n.type !== 'estimate_reply')
            .filter((n) => n.type !== 'booking_canceled')
            .filter((n) => n.type !== 'booking_confirmed')
            .map(toDisplayItem),
        ))
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      fetchNotifications(ownerUid)
        .then((data) => setItems(
          data
            .filter((n) => n.type !== 'estimate_reply')
            .filter((n) => n.type !== 'booking_canceled')
            .filter((n) => n.type !== 'booking_confirmed')
            .map(toDisplayItem),
        ))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, []);

  const handleNotificationClick = (n: DisplayItem) => {
    setSelected(n);
    if (session) {
      logSystemActivity(session, 'VIEW_NOTIFICATION', 'NOTIFICATION', n.id, {
        title: n.title,
        type: n.type,
        bookingCode: n.bookingCode
      }).catch(console.error);
    }
  };

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
          Notifications
          {unreadCount > 0 && (
            <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-600">
              {unreadCount} new
            </span>
          )}
        </div>

        {/* Single card with internal scroll */}
        <Card className="border-border/80 bg-white shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="max-h-[480px] overflow-y-auto">

              {loading && (
                <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                  <span className="text-sm">Loading notifications…</span>
                </div>
              )}

              {!loading && items.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
                  <CheckCircle2 className="h-8 w-8 text-slate-200" />
                  <span className="text-sm">No notifications</span>
                </div>
              )}

              {!loading && items.map((n, i) => {
                const k = getKind(n.type);
                const c = KIND_CONFIG[k];
                const timeStr = n.createdAtIso
                  ? timeAgoFromIso(n.createdAtIso)
                  : '';
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors hover:bg-slate-50 ${!n.read ? 'bg-sky-50/50' : ''} ${i < items.length - 1 ? 'border-b border-border/60' : ''}`}
                  >
                    {/* Left: icon */}
                    <div className="flex shrink-0 flex-col items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${c.iconBg}`}>
                        {c.icon}
                      </div>
                    </div>

                    {/* Right: content */}
                    <div className="min-w-0 flex-1">
                      {/* Title + time */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 leading-snug">{n.title}</span>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-mono text-[10px] text-slate-400">{timeStr}</span>
                          {!n.read && <span className="h-2 w-2 rounded-full bg-rose-500" />}
                        </div>
                      </div>

                      {/* Customer name */}
                      <div className="mt-1.5 flex items-center gap-2">
                        {n.clientName && (
                          <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            <User className="h-3 w-3 text-slate-400" />
                            {n.clientName}
                          </span>
                        )}
                      </div>

                      {/* Badges */}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {n.bookingCode && (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
                            #{n.bookingCode}
                          </span>
                        )}
                        {n.branchName && (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                            {n.branchName}
                          </span>
                        )}
                        {n.price != null && (
                          <span className="rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            ${n.price.toLocaleString()}
                          </span>
                        )}
                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${c.badgeClass}`}>
                          {c.badgeLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <NotificationModal
        notification={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
