import { useState } from 'react';
import { format } from 'date-fns';
import type { Queue, Agent, DashboardSummary } from '@/services/types';
import type { BookingNotification } from '@/services/bookingsApi';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Bell, CalendarDays, Clock, Phone, MapPin, Wrench,
  AlertCircle, CheckCircle2, User,
} from 'lucide-react';

// Props kept for future live data wiring
interface NotificationsCardProps {
  queues: Queue[];
  agents: Agent[];
  summary: DashboardSummary | null;
}

/* ─── Mock Data ─── */

const NOW = Math.floor(Date.now() / 1000);

const MOCK_NOTIFICATIONS: BookingNotification[] = [
  // ── Asking approval for additional issues (unread) ────────────────────────
  {
    id: '1',
    type: 'additional_issue_asking',
    title: 'Customer Approval Required',
    message: 'SKYstaff1 found "Brake pad worn" on BK-2026-032603-2303 for skyautoclient — awaiting customer approval. Est. cost: $4,500',
    bookingId: 'hGtltz4pmPt7DBY9OFcx',
    bookingCode: 'BK-2026-032603-2303',
    bookingDate: '2026-04-07',
    bookingTime: 'Drop-off: 11:00, Pick-up: 14:00',
    branchId: 'cuCluwgzYtc3oBsKkmaO',
    branchName: 'SKY KANDY',
    clientName: 'skyautoclient',
    serviceName: 'Wash',
    services: [{ name: 'Wash', staffName: 'SKYstaff1', status: 'Completed' }],
    ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
    targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
    read: false,
    createdAt: { _seconds: NOW - 420, _nanoseconds: 0 },
  },
  {
    id: '2',
    type: 'additional_issue_asking',
    title: 'Customer Approval Required',
    message: 'Roshan found "Suspension noise" on BK-2026-040201-5501 for Chamara Jayasena — awaiting customer approval. Est. cost: $12,000',
    bookingId: 'jkl012',
    bookingCode: 'BK-2026-040201-5501',
    bookingDate: '2026-04-07',
    bookingTime: 'Drop-off: 08:30, Pick-up: 15:00',
    branchId: 'branch03',
    branchName: 'Kandy',
    clientName: 'Chamara Jayasena',
    serviceName: 'General Service',
    services: [{ name: 'General Service', staffName: 'Roshan', status: 'In Progress' }],
    ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
    targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
    read: false,
    createdAt: { _seconds: NOW - 1200, _nanoseconds: 0 },
  },
  {
    id: '3',
    type: 'additional_issue_asking',
    title: 'Customer Approval Required',
    message: 'Ajith found "Battery weak, replace recommended" on BK-2026-040601-8801 for Sanduni Mendis — awaiting customer approval. Est. cost: $8,800',
    bookingId: 'stu901',
    bookingCode: 'BK-2026-040601-8801',
    bookingDate: '2026-04-06',
    bookingTime: 'Drop-off: 10:00, Pick-up: 17:00',
    branchId: 'branch02',
    branchName: 'Colombo 07',
    clientName: 'Sanduni Mendis',
    serviceName: 'Electrical Check',
    services: [{ name: 'Electrical Check', staffName: 'Ajith', status: 'In Progress' }],
    ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
    targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
    read: false,
    createdAt: { _seconds: NOW - 3600, _nanoseconds: 0 },
  },
  {
    id: '4',
    type: 'additional_issue_asking',
    title: 'Customer Approval Required',
    message: 'Kasun found "Tyre sidewall damage" on BK-2026-040301-3301 for Priya Fernando — awaiting customer approval. Est. cost: $18,500',
    bookingId: 'def456',
    bookingCode: 'BK-2026-040301-3301',
    bookingDate: '2026-04-05',
    bookingTime: 'Drop-off: 10:00, Pick-up: 16:00',
    branchId: 'branch03',
    branchName: 'Kandy',
    clientName: 'Priya Fernando',
    serviceName: 'Tyre Check',
    services: [{ name: 'Tyre Check', staffName: 'Kasun', status: 'In Progress' }],
    ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
    targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
    read: true,
    createdAt: { _seconds: NOW - 7200, _nanoseconds: 0 },
  },
  {
    id: '5',
    type: 'additional_issue_asking',
    title: 'Customer Approval Required',
    message: 'Dilhan found "AC compressor leak" on BK-2026-040801-4401 for Amara Bandara — awaiting customer approval. Est. cost: $32,000',
    bookingId: 'ghi789',
    bookingCode: 'BK-2026-040801-4401',
    bookingDate: '2026-04-04',
    bookingTime: 'Drop-off: 07:30',
    branchId: 'branch04',
    branchName: 'Gampaha',
    clientName: 'Amara Bandara',
    serviceName: 'AC Service',
    services: [{ name: 'AC Service', staffName: 'Dilhan', status: 'In Progress' }],
    ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
    targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
    read: true,
    createdAt: { _seconds: NOW - 14400, _nanoseconds: 0 },
  },

  // ── Booking completed ──────────────────────────────────────────────────────
  {
    id: '6',
    type: 'booking_completed',
    title: 'Booking Completed',
    message: 'Booking BK-2026-040501-2201 for Nimal Silva has been completed at Colombo 07. Full Service + Oil Change ✓',
    bookingId: 'abc123',
    bookingCode: 'BK-2026-040501-2201',
    bookingDate: '2026-04-05',
    bookingTime: 'Drop-off: 09:00, Pick-up: 17:00',
    branchId: 'branch02',
    branchName: 'Colombo 07',
    clientName: 'Nimal Silva',
    serviceName: 'Full Service',
    services: [
      { name: 'Full Service', staffName: 'Ajith', status: 'Completed' },
      { name: 'Oil Change',   staffName: 'Ajith', status: 'Completed' },
    ],
    ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
    targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
    read: false,
    createdAt: { _seconds: NOW - 1800, _nanoseconds: 0 },
  },
  {
    id: '7',
    type: 'booking_completed',
    title: 'Booking Completed',
    message: 'Booking BK-2026-033101-6601 for Sunil Rathnayake has been completed at Colombo 07. Brake Service ✓',
    bookingId: 'mno345',
    bookingCode: 'BK-2026-033101-6601',
    bookingDate: '2026-04-03',
    bookingTime: 'Drop-off: 09:00, Pick-up: 13:00',
    branchId: 'branch02',
    branchName: 'Colombo 07',
    clientName: 'Sunil Rathnayake',
    serviceName: 'Brake Service',
    services: [{ name: 'Brake Service', staffName: 'Ajith', status: 'Completed' }],
    ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
    targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
    read: true,
    createdAt: { _seconds: NOW - 86400, _nanoseconds: 0 },
  },
  {
    id: '8',
    type: 'booking_completed',
    title: 'Booking Completed',
    message: 'Booking BK-2026-032603-2303 for skyautoclient has been completed at SKY KANDY. Wash + Additional works ✓',
    bookingId: 'hGtltz4pmPt7DBY9OFcx',
    bookingCode: 'BK-2026-032603-2303',
    bookingDate: '2026-04-01',
    bookingTime: 'Drop-off: 11:00, Pick-up: 14:00',
    branchId: 'cuCluwgzYtc3oBsKkmaO',
    branchName: 'SKY KANDY',
    clientName: 'skyautoclient',
    serviceName: 'Wash',
    services: [
      { name: 'Wash',              staffName: 'SKYstaff1', status: 'Completed' },
      { name: 'Brake pad worn',    staffName: 'SKYstaff1', status: 'Completed' },
      { name: 'Wiper replacement', staffName: 'SKYstaff1', status: 'Completed' },
    ],
    ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
    targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
    read: true,
    createdAt: { _seconds: NOW - 172800, _nanoseconds: 0 },
  },
  {
    id: '9',
    type: 'booking_completed',
    title: 'Booking Completed',
    message: 'Booking BK-2026-040901-7701 for Dilhan Wickrama has been completed at Gampaha. Transmission Service ✓',
    bookingId: 'pqr678',
    bookingCode: 'BK-2026-040901-7701',
    bookingDate: '2026-03-31',
    bookingTime: 'Drop-off: 08:00, Pick-up: 15:00',
    branchId: 'branch04',
    branchName: 'Gampaha',
    clientName: 'Dilhan Wickrama',
    serviceName: 'Transmission Service',
    services: [{ name: 'Transmission Service', staffName: 'Roshan', status: 'Completed' }],
    ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
    targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
    read: true,
    createdAt: { _seconds: NOW - 259200, _nanoseconds: 0 },
  },
  {
    id: '10',
    type: 'booking_completed',
    title: 'Booking Completed',
    message: 'Booking BK-2026-040201-5501 for Chamara Jayasena has been completed at Kandy. General Service + Suspension fix ✓',
    bookingId: 'jkl012x',
    bookingCode: 'BK-2026-040202-5502',
    bookingDate: '2026-03-29',
    bookingTime: 'Drop-off: 08:30, Pick-up: 16:00',
    branchId: 'branch03',
    branchName: 'Kandy',
    clientName: 'Chamara Jayasena',
    serviceName: 'General Service',
    services: [
      { name: 'General Service',   staffName: 'Roshan', status: 'Completed' },
      { name: 'Suspension repair', staffName: 'Roshan', status: 'Completed' },
    ],
    ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
    targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
    read: true,
    createdAt: { _seconds: NOW - 345600, _nanoseconds: 0 },
  },
];

/* ─── Helpers ─── */

function timeAgo(createdAt: { _seconds: number } | null): string {
  if (!createdAt) return '';
  const diff = Date.now() - createdAt._seconds * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type NotifKind = 'asking' | 'completed' | 'other';

function getKind(type: string): NotifKind {
  if (type === 'booking_completed') return 'completed';
  if (type === 'additional_issue_asking') return 'asking';
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

/* ─── Notification Modal ─── */

// Mock phone numbers per client (no API needed)
const MOCK_PHONES: Record<string, string> = {
  'Kasun Perera':      '+94 77 123 4567',
  'skyautoclient':     '+94 22 222 2222',
  'Nimal Silva':       '+94 71 234 5678',
  'Priya Fernando':    '+94 76 345 6789',
  'Amara Bandara':     '+94 70 456 7890',
  'Chamara Jayasena':  '+94 75 567 8901',
  'Sunil Rathnayake':  '+94 77 678 9012',
  'Dilhan Wickrama':   '+94 72 789 0123',
  'Sanduni Mendis':    '+94 71 890 1234',
};

function NotificationModal({
  notification,
  open,
  onClose,
}: {
  notification: BookingNotification | null;
  open: boolean;
  onClose: () => void;
}) {
  const detail = null; // no API call — using mock data only
  const loading = false;

  if (!notification) return null;

  const b = detail?.booking ?? null;
  const kind = getKind(notification.type);
  const cfg = KIND_CONFIG[kind];
  const phone = MOCK_PHONES[notification?.clientName ?? ''] ?? b?.clientPhone ?? '';
  const formattedDate = notification.bookingDate
    ? (() => { try { return format(new Date(notification.bookingDate), 'EEE, dd MMM yyyy'); } catch { return notification.bookingDate; } })()
    : '';

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
        <p className="text-sm text-slate-600">{notification.message}</p>

        <Separator />

        {/* Booking info */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="font-medium">{notification.clientName}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>{notification.branchName}</span>
            </div>
            {formattedDate && (
              <div className="flex items-center gap-2 text-slate-700">
                <CalendarDays className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>{formattedDate}</span>
              </div>
            )}
            {notification.bookingTime && (
              <div className="flex items-center gap-2 text-slate-700">
                <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>{notification.bookingTime}</span>
              </div>
            )}
          </div>

          {/* Services */}
          {notification.services && notification.services.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
                <Wrench className="h-3 w-3" /> Services
              </div>
              <div className="space-y-1.5">
                {notification.services.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${s.status?.toLowerCase() === 'completed' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span className="text-sm font-medium text-slate-800">{s.name}</span>
                    </div>
                    <span className="text-xs text-slate-400">{s.staffName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Additional issues from full booking */}
          {kind === 'asking' && detail?.additionalIssues && detail.additionalIssues.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-amber-500">
                <AlertCircle className="h-3 w-3" /> Additional Issues
              </div>
              <div className="space-y-1.5">
                {detail.additionalIssues.map((issue, i) => {
                  const iss = issue as Record<string, unknown>;
                  return (
                    <div key={i} className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-amber-800">{String(iss.issueTitle ?? '')}</span>
                        <span className="text-xs font-medium text-amber-600">${Number(iss.price ?? 0).toLocaleString()}</span>
                      </div>
                      {iss.description && <p className="mt-0.5 text-xs text-amber-700">{String(iss.description)}</p>}
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${String(iss.completionStatus) === 'completed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                          {String(iss.completionStatus) === 'completed' ? '✓ Completed' : 'Pending'}
                        </span>
                        {iss.customerResponse && (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${String(iss.customerResponse) === 'accept' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200'}`}>
                            {String(iss.customerResponse) === 'accept' ? '✓ Accepted' : '✗ Declined'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              Loading booking details...
            </div>
          )}
        </div>

        <Separator />

        {/* Call customer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              {phone || b?.clientPhone || 'Loading...'}
            </span>
          </div>
          {(phone || b?.clientPhone) && (
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => window.open(`tel:${phone || b?.clientPhone}`, '_self')}
            >
              <Phone className="h-3.5 w-3.5" />
              Call Customer
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Card ─── */

export function NotificationsCard(_props: NotificationsCardProps) {
  const notifications = MOCK_NOTIFICATIONS;
  const [selected, setSelected] = useState<BookingNotification | null>(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

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
              {notifications.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
                  <CheckCircle2 className="h-8 w-8 text-slate-200" />
                  <span className="text-sm">No notifications</span>
                </div>
              )}

              {notifications.map((n, i) => {
                const k = getKind(n.type);
                const c = KIND_CONFIG[k];
                return (
                  <div
                    key={n.id}
                    onClick={() => setSelected(n)}
                    className={`flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors hover:bg-slate-50 ${!n.read ? 'bg-sky-50/50' : ''} ${i < notifications.length - 1 ? 'border-b border-border/60' : ''}`}
                  >
                    {/* Icon */}
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${c.iconBg}`}>
                      {c.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 leading-snug">{n.title}</span>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-mono text-[10px] text-slate-400">{timeAgo(n.createdAt)}</span>
                          {!n.read && <span className="h-2 w-2 rounded-full bg-rose-500" />}
                        </div>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{n.message}</p>
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
