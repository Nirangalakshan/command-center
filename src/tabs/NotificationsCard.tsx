import { useState, useEffect, useCallback } from "react";
import type {
  Queue,
  Agent,
  DashboardSummary,
  UserSession,
} from "@/services/types";
import {
  fetchCustomerNotifications,
  markNotificationReviewed,
  markCalledCustomer,
  markNotificationReviewedClosed,
  type CustomerNotification,
} from "@/services/notificationsApi";
import { 
  logSystemActivity, 
  fetchAgentAnsweredNotificationIds, 
  fetchCallCustomerAgentMap,
  fetchAnsweredCustomerAgentMap
} from "@/services/auditLogApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Phone,
  MapPin,
  AlertCircle,
  CheckCircle2,
  User,
  Mail,
  Bell,
} from "lucide-react";

/* ─── Types ─── */

interface NotificationsCardProps {
  queues: Queue[];
  agents: Agent[];
  summary: DashboardSummary | null;
  session?: UserSession | null;
}

/* ─── Helpers ─── */

function timeAgoFromIso(iso: string | null): string {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return "";
  }
}

type NotifKind = "asking" | "completed" | "other";

function getKind(type: string): NotifKind {
  if (type === "booking_completed") return "completed";
  if (type === "additional_issue_asking" || type === "additional_issue_quote")
    return "asking";
  return "other";
}

const KIND_CONFIG: Record<
  NotifKind,
  {
    icon: React.ReactNode;
    iconBg: string;
    badgeClass: string;
    badgeLabel: string;
  }
> = {
  asking: {
    icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
    iconBg: "bg-amber-100",
    badgeClass: "bg-amber-50 border-amber-200 text-amber-700",
    badgeLabel: "⚡ Approval Needed",
  },
  completed: {
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    iconBg: "bg-emerald-100",
    badgeClass: "bg-emerald-50 border-emerald-200 text-emerald-700",
    badgeLabel: "✓ Booking Completed",
  },
  other: {
    icon: <Bell className="h-4 w-4 text-sky-500" />,
    iconBg: "bg-sky-100",
    badgeClass: "bg-sky-50 border-sky-200 text-sky-700",
    badgeLabel: "📋 Notification",
  },
};

const MOCK_PHONES: Record<string, string> = {
  "Kasun Perera": "+94 77 123 4567",
  skyautoclient: "+94 22 222 2222",
  "Nimal Silva": "+94 71 234 5678",
  "Priya Fernando": "+94 76 345 6789",
  "Amara Bandara": "+94 70 456 7890",
  "Chamara Jayasena": "+94 75 567 8901",
  "Sunil Rathnayake": "+94 77 678 9012",
  "Dilhan Wickrama": "+94 72 789 0123",
  "Sanduni Mendis": "+94 71 890 1234",
};

/* ─── Notification Modal ─── */

function NotificationModal({
  notification,
  open,
  onClose,
  onCalledCustomer,
  session,
}: {
  notification: DisplayItem | null;
  open: boolean;
  onClose: () => void;
  onCalledCustomer: (id: string) => void;
  session?: UserSession | null;
}) {
  const [callingCustomer, setCallingCustomer] = useState(false);

  if (!notification) return null;

  const kind = getKind(notification.type);
  const cfg = KIND_CONFIG[kind];
  const phone =
    notification.customerPhone ??
    MOCK_PHONES[notification.clientName ?? ""] ??
    "";

  async function handleCalledCustomer() {
    setCallingCustomer(true);
    try {
      await markCalledCustomer(notification!.id);

      // Audit Log — Customer Answered
      await logSystemActivity(
        session,
        "notification_customer_answered",
        "notification",
        notification!.id,
        {
          customerName: notification?.clientName,
          phoneNumber: notification?.customerPhone,
        },
      );

      onCalledCustomer(notification!.id);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setCallingCustomer(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-slate-800">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${cfg.iconBg}`}>
              {cfg.icon}
            </span>
            {notification.title || "Notification"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Badge className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badgeClass}`}>
            {cfg.badgeLabel}
          </Badge>
          {notification.bookingCode && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
              #{notification.bookingCode}
            </span>
          )}
        </div>

        <Separator />

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Message</p>
          <p className="text-sm text-slate-700 leading-relaxed">{notification.message}</p>
        </div>

        <Separator />

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Customer Details</p>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center gap-2.5 text-slate-700 font-semibold">
              <User className="h-3.5 w-3.5 text-slate-400" />
              {notification.clientName || "—"}
            </div>
            {notification.customerEmail && (
              <div className="flex items-center gap-2.5 text-slate-700 text-xs">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                {notification.customerEmail}
              </div>
            )}
            <div className="flex items-center gap-2.5 text-slate-700 text-xs">
              <Phone className="h-3.5 w-3.5 text-slate-400" />
              {phone || "N/A"}
            </div>
            {notification.branchName && (
              <div className="flex items-center gap-2.5 text-slate-700 text-xs">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                {notification.branchName}
              </div>
            )}
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-600">
            <Phone className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-sm font-medium">{phone || "No phone number"}</span>
          </div>
          <div className="flex items-center gap-2">
            {phone && (
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  logSystemActivity(
                    session,
                    "notification_call_customer",
                    "notification",
                    notification!.id,
                    {
                      title: notification!.title,
                      clientName: notification!.clientName,
                      phone: phone,
                    },
                  );
                  window.open(`tel:${phone}`, "_self");
                }}
              >
                <Phone className="h-3.5 w-3.5" />
                Call Customer
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-sky-300 text-sky-700 hover:bg-sky-50"
              disabled={callingCustomer || notification.calledCustomer}
              onClick={handleCalledCustomer}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {notification.calledCustomer ? "Answered ✓" : callingCustomer ? "Saving…" : "Customer Answered"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Adapter: CustomerNotification → DisplayItem ─── */

function toDisplayItem(n: CustomerNotification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    read: n.read,
    createdAtIso: n.createdAt,
    bookingCode: n.bookingCode,
    branchName: n.workshopName,
    clientName: n.customerName,
    customerEmail: n.customerEmail,
    customerPhone: n.customerPhone,
    customerId: n.customerId,
    price: n.price,
    issueTitle: n.issueTitle,
    issueId: n.issueId,
    estimateId: n.estimateId,
    bookingId: n.bookingId,
    source: n.source,
    ownerUid: n.ownerUid,
    notificationReviewed: n.notificationReviewed,
    calledCustomer: n.calledCustomer,
    calledCustomerByDisplayName: n.calledCustomerByDisplayName,
    calledCustomerByName: n.calledCustomerByName,
  };
}

type DisplayItem = ReturnType<typeof toDisplayItem>;

/* ─── Main Card ─── */

export function NotificationsCard({ session, ...restProps }: NotificationsCardProps) {
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [answeredItems, setAnsweredItems] = useState<DisplayItem[]>([]);
  const [showAnswered, setShowAnswered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DisplayItem | null>(null);
  const [localReviewed, setLocalReviewed] = useState<Set<string>>(new Set());
  
  // Custom maps for data enrichment from Supabase logs
  const [calledByMap, setCalledByMap] = useState<Map<string, string>>(new Map());
  const [answeredByMap, setAnsweredByMap] = useState<Map<string, string>>(new Map());

  const isAgent = session?.role === "agent";

  const loadNotifications = useCallback(async () => {
    try {
      const [allNotifs, cMap, aMap] = await Promise.all([
        fetchCustomerNotifications(),
        fetchCallCustomerAgentMap(),
        fetchAnsweredCustomerAgentMap()
      ]);

      setCalledByMap(cMap);
      setAnsweredByMap(aMap);

      const base = allNotifs
        .filter((n) => !["estimate_reply", "booking_canceled", "estimate_request", "booking_confirmed", "additional_issue_quote"].includes(n.type));

      // 1. Pending List
      setItems(
        base
          .filter((n) => !n.notificationReviewed && !n.calledCustomer)
          .map(toDisplayItem),
      );

      // 2. Answered List (with filtering for Agents)
      const allAnswered = base.filter((n) => n.calledCustomer).map(toDisplayItem);
      
      if (isAgent && session?.userId) {
        // Filter: Agent only sees their own answered ones (based on audit logs)
        const myIds = await fetchAgentAnsweredNotificationIds(session.userId);
        setAnsweredItems(allAnswered.filter((n) => myIds.has(n.id)));
      } else {
        // Super Admin sees everything
        setAnsweredItems(allAnswered);
      }

      setLocalReviewed(new Set());
    } catch (e) {
      console.error("[NotificationsCard] Load failed:", e);
    }
  }, [isAgent, session?.userId]);

  useEffect(() => {
    loadNotifications().finally(() => setLoading(false));
    const interval = setInterval(loadNotifications, 30_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  function handleSelect(n: DisplayItem) {
    setSelected(n);
    setLocalReviewed((prev) => new Set(prev).add(n.id));
    loadNotifications().catch(console.error);
  }

  const visibleItems = items.filter((n) => !localReviewed.has(n.id));
  const unreadCount = visibleItems.filter((n) => !n.read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowAnswered(false)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${!showAnswered ? "bg-rose-100 text-rose-600" : "text-muted-foreground hover:bg-slate-100"}`}
        >
          <span className="relative flex h-2 w-2">
            {!showAnswered && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
          Notifications {unreadCount > 0 && <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>}
        </button>

        <button
          onClick={() => setShowAnswered(true)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${showAnswered ? "bg-emerald-100 text-emerald-700" : "text-muted-foreground hover:bg-slate-100"}`}
        >
          <Phone className="h-3 w-3" />
          Customer Answered {answeredItems.length > 0 && <span className="ml-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{answeredItems.length}</span>}
        </button>
      </div>

      <Card className="border-border/80 bg-white shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="max-h-[480px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : showAnswered ? (
              /* --- Answered Tab --- */
              answeredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
                  <Phone className="h-8 w-8 text-slate-200" />
                  <span className="text-sm">No answered customers yet</span>
                </div>
              ) : (
                answeredItems.map((n, i) => {
                  const cfg = KIND_CONFIG[getKind(n.type)];
                  const agentAnswered = answeredByMap.get(n.id) || n.calledCustomerByDisplayName || n.calledCustomerByName;
                  const agentCalled = calledByMap.get(n.id);
                  return (
                    <div key={n.id} className={`flex items-start gap-3 px-5 py-4 ${i < answeredItems.length - 1 ? "border-b border-border/60" : ""}`}>
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cfg.iconBg}`}>{cfg.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900 leading-snug">{n.title}</span>
                          <span className="font-mono text-[10px] text-slate-400 shrink-0">{timeAgoFromIso(n.createdAtIso)}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            <User className="h-3 w-3 text-slate-400" /> {n.clientName || "Unknown"}
                          </span>
                          {n.customerPhone && (
                            <span className="flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <Phone className="h-3 w-3" /> {n.customerPhone}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {n.bookingCode && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500">#{n.bookingCode}</span>}
                          {n.branchName && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{n.branchName}</span>}
                          <span className="rounded-md bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Answered ✓</span>
                          {agentAnswered && (
                            <span className="flex items-center gap-1 rounded-md bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] text-sky-700">
                              <User className="h-3 w-3" /> CC-Agent: {agentAnswered}
                            </span>
                          )}
                          {agentCalled && agentCalled !== agentAnswered && (
                            <span className="flex items-center gap-1 rounded-md bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                              <Phone className="h-3 w-3" /> Called by: {agentCalled}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              /* --- Pending Tab --- */
              visibleItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
                  <CheckCircle2 className="h-8 w-8 text-slate-200" />
                  <span className="text-sm">No notifications</span>
                </div>
              ) : (
                visibleItems.map((n, i) => {
                  const cfg = KIND_CONFIG[getKind(n.type)];
                  const agentCalled = calledByMap.get(n.id);
                  return (
                    <div
                      key={n.id}
                      onClick={async () => {
                        markNotificationReviewed(n.id).catch(console.error);
                        logSystemActivity(session, "notification_viewed", "notification", n.id, { title: n.title }).catch(console.error);
                        handleSelect(n);
                      }}
                      className={`flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors hover:bg-slate-50 ${!n.read ? "bg-sky-50/50" : ""} ${i < visibleItems.length - 1 ? "border-b border-border/60" : ""}`}
                    >
                      <div className="flex shrink-0 flex-col items-center gap-2">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${cfg.iconBg}`}>{cfg.icon}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900 leading-snug">{n.title}</span>
                          <span className="font-mono text-[10px] text-slate-400 shrink-0">{timeAgoFromIso(n.createdAtIso)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{n.clientName}</span>
                          {agentCalled && (
                            <span className="flex items-center gap-1 rounded-md bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                              <Phone className="h-3 w-3" /> Called by: {agentCalled}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {n.bookingCode && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500">#{n.bookingCode}</span>}
                          {n.branchName && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{n.branchName}</span>}
                          <Badge className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cfg.badgeClass}`}>{cfg.badgeLabel}</Badge>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </CardContent>
      </Card>

      <NotificationModal
        notification={selected}
        open={Boolean(selected)}
        session={session}
        onClose={() => {
          if (selected) markNotificationReviewedClosed(selected.id).catch(console.error);
          setSelected(null);
          loadNotifications().catch(console.error);
        }}
        onCalledCustomer={(id) => {
          setItems((prev) => prev.filter((n) => n.id !== id));
        }}
      />
    </div>
  );
}
