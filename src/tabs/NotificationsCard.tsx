import { useState, useEffect, useCallback, useRef } from "react";
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
  patchBookingAdditionalIssueCustomerResponse,
  patchBookingAdditionalIssuePrice,
  type CustomerNotification,
  type AdditionalIssueCustomerResponse,
} from "@/services/notificationsApi";
import {
  logSystemActivity,
  fetchAgentAnsweredNotificationIds,
  fetchCallCustomerAgentMap,
  fetchAnsweredCustomerAgentMap,
} from "@/services/auditLogApi";
import { fetchDIDMappings } from "@/services/dashboardApi";
import { resolveOwnerUid } from "@/services/bookingsApi";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  XCircle,
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

function pickFirstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function getRefFromSource(
  source: string | null | undefined,
  keys: string[],
): string {
  const raw = String(source ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of keys) {
      const value = parsed[key];
      if (value == null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
  } catch {
    // Source is not JSON; ignore.
  }
  return "";
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
  onAdditionalIssueResponded,
  session,
}: {
  notification: DisplayItem | null;
  open: boolean;
  onClose: () => void;
  onCalledCustomer: (id: string) => void;
  onAdditionalIssueResponded: (id: string) => void;
  session?: UserSession | null;
}) {
  const [callingCustomer, setCallingCustomer] = useState(false);
  const [issueDecisionLoading, setIssueDecisionLoading] =
    useState<AdditionalIssueCustomerResponse | null>(null);
  const [issuePriceInput, setIssuePriceInput] = useState("");
  const [issuePriceSubmitting, setIssuePriceSubmitting] = useState(false);
  const kind = getKind(notification?.type ?? "");
  const cfg = KIND_CONFIG[kind];
  const isAdditionalIssueQuote = notification?.type === "additional_issue_quote";
  const isAdditionalIssueFound = notification?.type === "additional_issue_found";
  const bookingRef = pickFirstNonEmpty(
    notification?.bookingId,
    getRefFromSource(notification?.source, [
      "bookingId",
      "booking_id",
      "bmsBookingId",
      "bms_booking_id",
    ]),
  );
  const issueRef = pickFirstNonEmpty(
    notification?.issueId,
    getRefFromSource(notification?.source, [
      "issueId",
      "issue_id",
      "additionalIssueId",
      "additional_issue_id",
    ]),
  );
  const canSubmitIssueDecision =
    Boolean(isAdditionalIssueQuote) &&
    Boolean(bookingRef) &&
    Boolean(issueRef);
  const canSubmitIssuePrice =
    Boolean(isAdditionalIssueFound) &&
    Boolean(bookingRef) &&
    Boolean(issueRef);
  const phone =
    notification?.customerPhone ??
    MOCK_PHONES[notification?.clientName ?? ""] ??
    "";
  const didNumber = notification?.didNumber?.trim() ?? "";

  useEffect(() => {
    if (!open || !notification) return;
    setIssuePriceInput(
      typeof notification.price === "number" && !Number.isNaN(notification.price)
        ? String(notification.price)
        : "",
    );
    setIssuePriceSubmitting(false);
  }, [open, notification]);

  if (!notification) return null;

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
    } catch {
      // console.error(e);
    } finally {
      setCallingCustomer(false);
    }
  }

  async function handleAdditionalIssueDecision(
    customerResponse: AdditionalIssueCustomerResponse,
  ) {
    if (!bookingRef || !issueRef) return;
    setIssueDecisionLoading(customerResponse);
    try {
      const ownerUid =
        notification.ownerUid?.trim() ||
        (await resolveOwnerUid(session?.tenantId)).trim() ||
        null;
      await patchBookingAdditionalIssueCustomerResponse(
        bookingRef,
        issueRef,
        customerResponse,
        { ownerUid },
      );
      await logSystemActivity(
        session,
        "notification_additional_issue_decision",
        "notification",
        notification.id,
        {
          customerResponse,
          bookingId: bookingRef,
          issueId: issueRef,
        },
      );
      onAdditionalIssueResponded(notification.id);
      toast({
        title:
          customerResponse === "accept"
            ? "Quote accepted"
            : "Quote rejected",
        description:
          customerResponse === "accept"
            ? "Customer accepted the additional issue quote."
            : "Customer rejected the additional issue quote.",
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save accept / reject.";
      console.error("[handleAdditionalIssueDecision]", e);
      toast({
        variant: "destructive",
        title: "Could not update quote",
        description: message,
      });
    } finally {
      setIssueDecisionLoading(null);
    }
  }

  async function handleApproveAdditionalIssue() {
    if (!bookingRef || !issueRef) {
      toast({
        variant: "destructive",
        title: "Missing server references",
        description:
          `Cannot approve yet. bookingId: ${bookingRef || "missing"}, issueId: ${issueRef || "missing"}.`,
      });
      return;
    }
    const parsedPrice = Number(issuePriceInput);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      toast({
        variant: "destructive",
        title: "Invalid price",
        description: "Enter a valid price greater than or equal to 0.",
      });
      return;
    }

    setIssuePriceSubmitting(true);
    try {
      const ownerUid =
        notification.ownerUid?.trim() ||
        (await resolveOwnerUid(session?.tenantId)).trim() ||
        null;
      await patchBookingAdditionalIssuePrice(
        bookingRef,
        issueRef,
        {
          status: "approved",
          price: parsedPrice,
          customerPhone: notification.customerPhone ?? undefined,
          customerEmail: notification.customerEmail ?? undefined,
        },
        { ownerUid },
      );
      toast({
        title: "Issue approved",
        description: "Additional issue approved and price submitted.",
      });
      onAdditionalIssueResponded(notification.id);
      //onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not approve issue.";
      toast({
        variant: "destructive",
        title: "Approval failed",
        description: message,
      });
    } finally {
      setIssuePriceSubmitting(false);
    }
  }

  async function handleDeclineAdditionalIssue() {
    if (!bookingRef || !issueRef) {
      toast({
        variant: "destructive",
        title: "Missing server references",
        description:
          `Cannot decline yet. bookingId: ${bookingRef || "missing"}, issueId: ${issueRef || "missing"}.`,
      });
      return;
    }
    setIssuePriceSubmitting(true);
    try {
      const ownerUid =
        notification.ownerUid?.trim() ||
        (await resolveOwnerUid(session?.tenantId)).trim() ||
        null;
      await patchBookingAdditionalIssuePrice(
        bookingRef,
        issueRef,
        {
          status: "rejected",
          customerPhone: notification.customerPhone ?? undefined,
          customerEmail: notification.customerEmail ?? undefined,
        },
        { ownerUid },
      );
      toast({
        title: "Issue declined",
        description: "Additional issue was declined.",
      });
      onAdditionalIssueResponded(notification.id);
      // onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not decline issue.";
      toast({
        variant: "destructive",
        title: "Decline failed",
        description: message,
      });
    } finally {
      setIssuePriceSubmitting(false);
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
            {didNumber && (
              <div className="flex items-center gap-2.5 text-slate-700 text-xs">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                DID: {didNumber}
              </div>
            )}
            {notification.branchName && (
              <div className="flex items-center gap-2.5 text-slate-700 text-xs">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                {notification.branchName}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {isAdditionalIssueQuote && (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"
                disabled={
                  !canSubmitIssueDecision || issueDecisionLoading !== null
                }
                onClick={() => handleAdditionalIssueDecision("reject")}
              >
                <XCircle className="h-3.5 w-3.5" />
                {issueDecisionLoading === "reject" ? "Saving…" : "Reject"}
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={
                  !canSubmitIssueDecision || issueDecisionLoading !== null
                }
                onClick={() => handleAdditionalIssueDecision("accept")}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {issueDecisionLoading === "accept" ? "Saving…" : "Accept"}
              </Button>
            </div>
            {!canSubmitIssueDecision && (
              <p className="text-center text-xs text-amber-700">
                Quote response needs a booking and issue reference from the server.
              </p>
            )}
            <Separator />
          </>
        )}

        {isAdditionalIssueFound && (
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Approve additional issue
              </p>
              {/* <p>issueid: {notification.issueId}</p> */}
              <p>price</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={issuePriceInput}
                  onChange={(e) => setIssuePriceInput(e.target.value)}
                  placeholder="Enter price (e.g. 120.00)"
                  disabled={issuePriceSubmitting}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                  disabled={issuePriceSubmitting}
                  onClick={handleDeclineAdditionalIssue}
                >
                  {issuePriceSubmitting ? "Saving..." : "Decline"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  disabled={
                    issuePriceSubmitting ||
                    !issuePriceInput.trim()
                  }
                  onClick={handleApproveAdditionalIssue}
                >
                  {issuePriceSubmitting ? "Saving..." : "Approve & Submit"}
                </Button>
              </div>
              {!canSubmitIssuePrice && (
                <p className="text-xs text-amber-700">
                  This action needs booking and issue references from the server.
                </p>
              )}
            </div>
            <Separator />
          </>
        )}

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
    didNumber: null as string | null,
    notificationReviewed: n.notificationReviewed,
    calledCustomer: n.calledCustomer,
    calledCustomerByDisplayName: n.calledCustomerByDisplayName,
    calledCustomerByName: n.calledCustomerByName,
  };
}

type DisplayItem = ReturnType<typeof toDisplayItem>;

function buildDidByOwnerMap(
  rows: Array<{ did: string; ownerId: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const owner = String(row.ownerId ?? "").trim();
    const did = String(row.did ?? "").trim();
    if (!owner || !did) continue;
    if (!map.has(owner)) {
      map.set(owner, did);
    }
  }
  return map;
}

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
  const [didByOwnerMap, setDidByOwnerMap] = useState<Map<string, string>>(new Map());

  const isAgent = session?.role === "agent";

  useEffect(() => {
    let cancelled = false;
    fetchDIDMappings()
      .then((mappings) => {
        if (cancelled) return;
        setDidByOwnerMap(buildDidByOwnerMap(mappings));
      })
      .catch(() => {
        if (cancelled) return;
        // Do not replace with an empty map: a later retry or duplicate effect
        // failure would wipe DIDs that were already resolved.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        .filter((n) => !["estimate_reply", 
         "booking_canceled", 
         "estimate_request", 
         "booking_confirmed",
        //  "additional_issue_found",
         "booking_status_changed" 
       ].includes(n.type));

      // 1. Pending List
      setItems(
        base
          .filter((n) => !n.notificationReviewed && !n.calledCustomer)
          .map((n) => ({
            ...toDisplayItem(n),
            didNumber: n.ownerUid ? didByOwnerMap.get(n.ownerUid) ?? null : null,
          })),
      );

      // 2. Answered List (with filtering for Agents)
      const allAnswered = base.filter((n) => n.calledCustomer).map((n) => ({
        ...toDisplayItem(n),
        didNumber: n.ownerUid ? didByOwnerMap.get(n.ownerUid) ?? null : null,
      }));
      
      if (isAgent && session?.userId) {
        // Filter: Agent only sees their own answered ones (based on audit logs)
        const myIds = await fetchAgentAnsweredNotificationIds(session.userId);
        setAnsweredItems(allAnswered.filter((n) => myIds.has(n.id)));
      } else {
        // Super Admin sees everything
        setAnsweredItems(allAnswered);
      }

      setLocalReviewed(new Set());
    } catch {
      // console.error("[NotificationsCard] Load failed:", e);
    }
  }, [didByOwnerMap, isAgent, session?.userId]);

  useEffect(() => {
    if (!session?.userId) return;

    // Initial load + poll. `loadNotifications` must stay in deps so the interval
    // never closes over a stale empty `didByOwnerMap` (that caused DID to vanish
    // after the first 30s tick or any later refresh).
    loadNotifications().finally(() => setLoading(false));

    const interval = setInterval(loadNotifications, 30_000);
    return () => clearInterval(interval);
  }, [session?.userId, loadNotifications]);

  function handleSelect(n: DisplayItem) {
    setSelected(n);
    setLocalReviewed((prev) => new Set(prev).add(n.id));
    loadNotifications().catch(() => {});
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
                          {n.didNumber && (
                            <span className="flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                              <Phone className="h-3 w-3" /> DID: {n.didNumber}
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
                        markNotificationReviewed(n.id).catch(() => {});
                        logSystemActivity(session, "notification_viewed", "notification", n.id, { title: n.title }).catch(() => {});
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
                          {n.didNumber && (
                            <span className="rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                              DID: {n.didNumber}
                            </span>
                          )}
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
          if (selected) markNotificationReviewedClosed(selected.id).catch(() => {});
          setSelected(null);
          loadNotifications().catch(() => {});
        }}
        onCalledCustomer={(id) => {
          setItems((prev) => prev.filter((n) => n.id !== id));
        }}
        onAdditionalIssueResponded={(id) => {
          setItems((prev) => prev.filter((n) => n.id !== id));
        }}
      />
    </div>
  );
}

export type { AdditionalIssueCustomerResponse } from "@/services/notificationsApi";
