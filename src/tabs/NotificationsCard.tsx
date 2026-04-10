// import { useState, useEffect, useCallback } from "react";
// import { format } from "date-fns";
// import type {
//   Queue,
//   Agent,
//   DashboardSummary,
//   UserSession,
// } from "@/services/types";
// import {
//   fetchCustomerNotifications,
//   markNotificationReviewed,
//   markCalledCustomer,
//   markNotificationReviewedClosed,
//   type CustomerNotification,
// } from "@/services/notificationsApi";
// import { logSystemActivity } from "@/services/auditLogApi";
// import { Card, CardContent } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";
// import { Separator } from "@/components/ui/separator";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import {
//   Bell,
//   Phone,
//   MapPin,
//   AlertCircle,
//   CheckCircle2,
//   User,
//   Mail,
//   Hash,
//   Calendar,
//   Tag,
// } from "lucide-react";

// // Props kept for future live data wiring
// interface NotificationsCardProps {
//   queues: Queue[];
//   agents: Agent[];
//   summary: DashboardSummary | null;
//   session?: UserSession | null;
// }

// /* ─── Mock Data (disabled) ───
// const MOCK_NOTIFICATIONS = [
//   // ── Asking approval for additional issues (unread) ────────────────────────
//   {
//     id: '1',
//     type: 'additional_issue_asking',
//     title: 'Customer Approval Required',
//     message: 'SKYstaff1 found "Brake pad worn" on BK-2026-032603-2303 for skyautoclient — awaiting customer approval. Est. cost: $4,500',
//     bookingId: 'hGtltz4pmPt7DBY9OFcx',
//     bookingCode: 'BK-2026-032603-2303',
//     bookingDate: '2026-04-07',
//     bookingTime: 'Drop-off: 11:00, Pick-up: 14:00',
//     branchId: 'cuCluwgzYtc3oBsKkmaO',
//     branchName: 'SKY KANDY',
//     clientName: 'skyautoclient',
//     serviceName: 'Wash',
//     services: [{ name: 'Wash', staffName: 'SKYstaff1', status: 'Completed' }],
//     ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
//     targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
//     read: false,
//     createdAt: { _seconds: NOW - 420, _nanoseconds: 0 },
//   },
//   {
//     id: '2',
//     type: 'additional_issue_asking',
//     title: 'Customer Approval Required',
//     message: 'Roshan found "Suspension noise" on BK-2026-040201-5501 for Chamara Jayasena — awaiting customer approval. Est. cost: $12,000',
//     bookingId: 'jkl012',
//     bookingCode: 'BK-2026-040201-5501',
//     bookingDate: '2026-04-07',
//     bookingTime: 'Drop-off: 08:30, Pick-up: 15:00',
//     branchId: 'branch03',
//     branchName: 'Kandy',
//     clientName: 'Chamara Jayasena',
//     serviceName: 'General Service',
//     services: [{ name: 'General Service', staffName: 'Roshan', status: 'In Progress' }],
//     ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
//     targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
//     read: false,
//     createdAt: { _seconds: NOW - 1200, _nanoseconds: 0 },
//   },
//   {
//     id: '3',
//     type: 'additional_issue_asking',
//     title: 'Customer Approval Required',
//     message: 'Ajith found "Battery weak, replace recommended" on BK-2026-040601-8801 for Sanduni Mendis — awaiting customer approval. Est. cost: $8,800',
//     bookingId: 'stu901',
//     bookingCode: 'BK-2026-040601-8801',
//     bookingDate: '2026-04-06',
//     bookingTime: 'Drop-off: 10:00, Pick-up: 17:00',
//     branchId: 'branch02',
//     branchName: 'Colombo 07',
//     clientName: 'Sanduni Mendis',
//     serviceName: 'Electrical Check',
//     services: [{ name: 'Electrical Check', staffName: 'Ajith', status: 'In Progress' }],
//     ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
//     targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
//     read: false,
//     createdAt: { _seconds: NOW - 3600, _nanoseconds: 0 },
//   },
//   {
//     id: '4',
//     type: 'additional_issue_asking',
//     title: 'Customer Approval Required',
//     message: 'Kasun found "Tyre sidewall damage" on BK-2026-040301-3301 for Priya Fernando — awaiting customer approval. Est. cost: $18,500',
//     bookingId: 'def456',
//     bookingCode: 'BK-2026-040301-3301',
//     bookingDate: '2026-04-05',
//     bookingTime: 'Drop-off: 10:00, Pick-up: 16:00',
//     branchId: 'branch03',
//     branchName: 'Kandy',
//     clientName: 'Priya Fernando',
//     serviceName: 'Tyre Check',
//     services: [{ name: 'Tyre Check', staffName: 'Kasun', status: 'In Progress' }],
//     ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
//     targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
//     read: true,
//     createdAt: { _seconds: NOW - 7200, _nanoseconds: 0 },
//   },
//   {
//     id: '5',
//     type: 'additional_issue_asking',
//     title: 'Customer Approval Required',
//     message: 'Dilhan found "AC compressor leak" on BK-2026-040801-4401 for Amara Bandara — awaiting customer approval. Est. cost: $32,000',
//     bookingId: 'ghi789',
//     bookingCode: 'BK-2026-040801-4401',
//     bookingDate: '2026-04-04',
//     bookingTime: 'Drop-off: 07:30',
//     branchId: 'branch04',
//     branchName: 'Gampaha',
//     clientName: 'Amara Bandara',
//     serviceName: 'AC Service',
//     services: [{ name: 'AC Service', staffName: 'Dilhan', status: 'In Progress' }],
//     ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
//     targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
//     read: true,
//     createdAt: { _seconds: NOW - 14400, _nanoseconds: 0 },
//   },

//   // ── Booking completed ──────────────────────────────────────────────────────
//   {
//     id: '6',
//     type: 'booking_completed',
//     title: 'Booking Completed',
//     message: 'Booking BK-2026-040501-2201 for Nimal Silva has been completed at Colombo 07. Full Service + Oil Change ✓',
//     bookingId: 'abc123',
//     bookingCode: 'BK-2026-040501-2201',
//     bookingDate: '2026-04-05',
//     bookingTime: 'Drop-off: 09:00, Pick-up: 17:00',
//     branchId: 'branch02',
//     branchName: 'Colombo 07',
//     clientName: 'Nimal Silva',
//     serviceName: 'Full Service',
//     services: [
//       { name: 'Full Service', staffName: 'Ajith', status: 'Completed' },
//       { name: 'Oil Change',   staffName: 'Ajith', status: 'Completed' },
//     ],
//     ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
//     targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
//     read: false,
//     createdAt: { _seconds: NOW - 1800, _nanoseconds: 0 },
//   },
//   {
//     id: '7',
//     type: 'booking_completed',
//     title: 'Booking Completed',
//     message: 'Booking BK-2026-033101-6601 for Sunil Rathnayake has been completed at Colombo 07. Brake Service ✓',
//     bookingId: 'mno345',
//     bookingCode: 'BK-2026-033101-6601',
//     bookingDate: '2026-04-03',
//     bookingTime: 'Drop-off: 09:00, Pick-up: 13:00',
//     branchId: 'branch02',
//     branchName: 'Colombo 07',
//     clientName: 'Sunil Rathnayake',
//     serviceName: 'Brake Service',
//     services: [{ name: 'Brake Service', staffName: 'Ajith', status: 'Completed' }],
//     ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
//     targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
//     read: true,
//     createdAt: { _seconds: NOW - 86400, _nanoseconds: 0 },
//   },
//   {
//     id: '8',
//     type: 'booking_completed',
//     title: 'Booking Completed',
//     message: 'Booking BK-2026-032603-2303 for skyautoclient has been completed at SKY KANDY. Wash + Additional works ✓',
//     bookingId: 'hGtltz4pmPt7DBY9OFcx',
//     bookingCode: 'BK-2026-032603-2303',
//     bookingDate: '2026-04-01',
//     bookingTime: 'Drop-off: 11:00, Pick-up: 14:00',
//     branchId: 'cuCluwgzYtc3oBsKkmaO',
//     branchName: 'SKY KANDY',
//     clientName: 'skyautoclient',
//     serviceName: 'Wash',
//     services: [
//       { name: 'Wash',              staffName: 'SKYstaff1', status: 'Completed' },
//       { name: 'Brake pad worn',    staffName: 'SKYstaff1', status: 'Completed' },
//       { name: 'Wiper replacement', staffName: 'SKYstaff1', status: 'Completed' },
//     ],
//     ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
//     targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
//     read: true,
//     createdAt: { _seconds: NOW - 172800, _nanoseconds: 0 },
//   },
//   {
//     id: '9',
//     type: 'booking_completed',
//     title: 'Booking Completed',
//     message: 'Booking BK-2026-040901-7701 for Dilhan Wickrama has been completed at Gampaha. Transmission Service ✓',
//     bookingId: 'pqr678',
//     bookingCode: 'BK-2026-040901-7701',
//     bookingDate: '2026-03-31',
//     bookingTime: 'Drop-off: 08:00, Pick-up: 15:00',
//     branchId: 'branch04',
//     branchName: 'Gampaha',
//     clientName: 'Dilhan Wickrama',
//     serviceName: 'Transmission Service',
//     services: [{ name: 'Transmission Service', staffName: 'Roshan', status: 'Completed' }],
//     ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
//     targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
//     read: true,
//     createdAt: { _seconds: NOW - 259200, _nanoseconds: 0 },
//   },
//   {
//     id: '10',
//     type: 'booking_completed',
//     title: 'Booking Completed',
//     message: 'Booking BK-2026-040201-5501 for Chamara Jayasena has been completed at Kandy. General Service + Suspension fix ✓',
//     bookingId: 'jkl012x',
//     bookingCode: 'BK-2026-040202-5502',
//     bookingDate: '2026-03-29',
//     bookingTime: 'Drop-off: 08:30, Pick-up: 16:00',
//     branchId: 'branch03',
//     branchName: 'Kandy',
//     clientName: 'Chamara Jayasena',
//     serviceName: 'General Service',
//     services: [
//       { name: 'General Service',   staffName: 'Roshan', status: 'Completed' },
//       { name: 'Suspension repair', staffName: 'Roshan', status: 'Completed' },
//     ],
//     ownerUid: 'Lv6mGPIB1xRYoqQvNYDQ1esylHY2',
//     targetAdminUid: 'WedELe1BqwZVCogf9jb4ToL830w1',
//     read: true,
// ];
// ─── */

// /* ─── Helpers ─── */

// function timeAgo(createdAt: { _seconds: number } | null): string {
//   if (!createdAt) return "";
//   const diff = Date.now() - createdAt._seconds * 1000;
//   const mins = Math.floor(diff / 60000);
//   if (mins < 1) return "just now";
//   if (mins < 60) return `${mins}m ago`;
//   const hrs = Math.floor(mins / 60);
//   if (hrs < 24) return `${hrs}h ago`;
//   return `${Math.floor(hrs / 24)}d ago`;
// }

// function timeAgoFromIso(iso: string | null): string {
//   if (!iso) return "";
//   try {
//     const diff = Date.now() - new Date(iso).getTime();
//     const mins = Math.floor(diff / 60000);
//     if (mins < 1) return "just now";
//     if (mins < 60) return `${mins}m ago`;
//     const hrs = Math.floor(mins / 60);
//     if (hrs < 24) return `${hrs}h ago`;
//     return `${Math.floor(hrs / 24)}d ago`;
//   } catch {
//     return "";
//   }
// }

// type NotifKind = "asking" | "completed" | "other";

// function getKind(type: string): NotifKind {
//   if (type === "booking_completed") return "completed";
//   if (type === "additional_issue_asking" || type === "additional_issue_quote")
//     return "asking";
//   // if (type === 'estimate_reply') return 'estimate';
//   return "other";
// }

// const KIND_CONFIG: Record<
//   NotifKind,
//   {
//     icon: React.ReactNode;
//     iconBg: string;
//     badgeClass: string;
//     badgeLabel: string;
//     dotColor: string;
//   }
// > = {
//   asking: {
//     icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
//     iconBg: "bg-amber-100",
//     badgeClass: "bg-amber-50 border-amber-200 text-amber-700",
//     badgeLabel: "⚡ Approval Needed",
//     dotColor: "bg-amber-400",
//   },
//   completed: {
//     icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
//     iconBg: "bg-emerald-100",
//     badgeClass: "bg-emerald-50 border-emerald-200 text-emerald-700",
//     badgeLabel: "✓ Booking Completed",
//     dotColor: "bg-emerald-400",
//   },
//   // estimate: {
//   //   icon: <Bell className="h-4 w-4 text-purple-500" />,
//   //   iconBg: 'bg-purple-100',
//   //   badgeClass: 'bg-purple-50 border-purple-200 text-purple-700',
//   //   badgeLabel: '📄 Estimate Reply',
//   //   dotColor: 'bg-purple-400',
//   // },
//   other: {
//     icon: <Bell className="h-4 w-4 text-sky-500" />,
//     iconBg: "bg-sky-100",
//     badgeClass: "bg-sky-50 border-sky-200 text-sky-700",
//     badgeLabel: "📋 Notification",
//     dotColor: "bg-sky-400",
//   },
// };

// /* ─── Notification Modal ─── */

// // Mock phone numbers per client (no API needed)
// const MOCK_PHONES: Record<string, string> = {
//   "Kasun Perera": "+94 77 123 4567",
//   skyautoclient: "+94 22 222 2222",
//   "Nimal Silva": "+94 71 234 5678",
//   "Priya Fernando": "+94 76 345 6789",
//   "Amara Bandara": "+94 70 456 7890",
//   "Chamara Jayasena": "+94 75 567 8901",
//   "Sunil Rathnayake": "+94 77 678 9012",
//   "Dilhan Wickrama": "+94 72 789 0123",
//   "Sanduni Mendis": "+94 71 890 1234",
// };

// function NotificationModal({
//   notification,
//   open,
//   onClose,
//   onCalledCustomer,
//   session,
// }: {
//   notification: DisplayItem | null;
//   open: boolean;
//   onClose: () => void;
//   onCalledCustomer: (id: string) => void;
//   session?: UserSession | null;
// }) {
//   const [callingCustomer, setCallingCustomer] = useState(false);

//   if (!notification) return null;

//   const kind = getKind(notification.type);
//   const cfg = KIND_CONFIG[kind];
//   const phone =
//     notification.customerPhone ??
//     MOCK_PHONES[notification.clientName ?? ""] ??
//     "";

//   async function handleCalledCustomer() {
//     setCallingCustomer(true);
//     try {
//       await markCalledCustomer(notification!.id);

//       // Audit Log
//       await logSystemActivity(
//         session,
//         "notification_called_customer",
//         "notification",
//         notification!.id,
//         {
//           title: notification!.title,
//           clientName: notification!.clientName,
//           phone: phone,
//           bookingCode: notification!.bookingCode,
//         },
//       );

//       onCalledCustomer(notification!.id);
//       onClose();
//     } catch (e) {
//       console.error(e);
//     } finally {
//       setCallingCustomer(false);
//     }
//   }

//   return (
//     <Dialog
//       open={open}
//       onOpenChange={(v) => {
//         if (!v) onClose();
//       }}
//     >
//       <DialogContent className="max-w-lg">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2 text-base">
//             <span
//               className={`flex h-6 w-6 items-center justify-center rounded-full ${cfg.iconBg}`}
//             >
//               {cfg.icon}
//             </span>
//             {notification.title || "Notification"}
//           </DialogTitle>
//         </DialogHeader>

//         {/* Type badge */}
//         <div className="flex items-center gap-2">
//           <Badge
//             className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badgeClass}`}
//           >
//             {cfg.badgeLabel}
//           </Badge>
//           {notification.bookingCode && (
//             <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
//               #{notification.bookingCode}
//             </span>
//           )}
//           {!notification.read && (
//             <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
//               New
//             </span>
//           )}
//         </div>

//         <Separator />

//         {/* Message */}
//         <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-1">
//           <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
//             Message
//           </p>
//           <p className="text-sm text-slate-700 leading-relaxed">
//             {notification.message}
//           </p>
//         </div>

//         <Separator />

//         {/* Customer info grid */}
//         <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-2.5">
//           <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
//             Customer Details
//           </p>
//           <div className="grid grid-cols-1 gap-2 text-sm">
//             <div className="flex items-center gap-2.5 text-slate-700">
//               <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
//               <span className="font-semibold">
//                 {notification.clientName || "—"}
//               </span>
//             </div>
//             {notification.customerEmail && (
//               <div className="flex items-center gap-2.5 text-slate-700">
//                 <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
//                 <span className="text-xs">{notification.customerEmail}</span>
//               </div>
//             )}
//             <div className="flex items-center gap-2.5 text-slate-700">
//               <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
//               <span className="text-xs">{phone || "N/A"}</span>
//             </div>
//             {notification.branchName && (
//               <div className="flex items-center gap-2.5 text-slate-700">
//                 <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
//                 <span className="text-xs">{notification.branchName}</span>
//               </div>
//             )}
//             {/* {notification.customerId && (
//               <div className="flex items-center gap-2.5 text-slate-500">
//                 <Hash className="h-3.5 w-3.5 text-slate-400 shrink-0" />
//                 <span className="font-mono text-[11px]">Customer ID: {notification.customerId}</span>
//               </div>
//             )} */}
//             {/* {notification.bookingId && (
//               <div className="flex items-center gap-2.5 text-slate-500">
//                 <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
//                 <span className="font-mono text-[11px]">Booking ID: {notification.bookingId}</span>
//               </div>
//             )} */}
//             {/* {notification.source && (
//               <div className="flex items-center gap-2.5 text-slate-500">
//                 <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
//                 <span className="text-[11px] capitalize">Source: {notification.source}</span>
//               </div>
//             )} */}
//           </div>
//         </div>

//         {/* Additional issue detail */}
//         {kind === "asking" && notification.issueTitle && (
//           <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 space-y-1">
//             <div className="flex items-center justify-between">
//               <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-amber-600">
//                 <AlertCircle className="h-3 w-3" /> Additional Issue
//               </div>
//               {notification.price != null && (
//                 <span className="font-bold text-amber-800">
//                   ${notification.price.toLocaleString()}
//                 </span>
//               )}
//             </div>
//             <p className="text-sm font-semibold text-amber-900">
//               {notification.issueTitle}
//             </p>
//             {notification.issueId && (
//               <p className="font-mono text-[10px] text-amber-600">
//                 Issue ID: {notification.issueId}
//               </p>
//             )}
//           </div>
//         )}

//         {/* Booking completed detail */}
//         {kind === "completed" && notification.bookingCode && (
//           <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
//             <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-600 mb-1">
//               <CheckCircle2 className="h-3 w-3" /> Completed Booking
//             </div>
//             <p className="font-mono text-sm font-semibold text-emerald-800">
//               #{notification.bookingCode}
//             </p>
//           </div>
//         )}

//         <Separator />

//         {/* Call + Customer Answered */}
//         <div className="flex items-center justify-between gap-2">
//           <div className="flex items-center gap-2 text-slate-600">
//             <Phone className="h-4 w-4 text-slate-400 shrink-0" />
//             <span className="text-sm font-medium">
//               {phone || "No phone number"}
//             </span>
//           </div>
//           <div className="flex items-center gap-2">
//             {phone && (
//               <Button
//                 size="sm"
//                 className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
//                 onClick={() => window.open(`tel:${phone}`, "_self")}
//               >
//                 <Phone className="h-3.5 w-3.5" />
//                 Call Customer
//               </Button>
//             )}
//             <Button
//               size="sm"
//               variant="outline"
//               className="gap-1.5 border-sky-300 text-sky-700 hover:bg-sky-50"
//               disabled={callingCustomer || notification.calledCustomer}
//               onClick={handleCalledCustomer}
//             >
//               <CheckCircle2 className="h-3.5 w-3.5" />
//               {notification.calledCustomer
//                 ? "Answered ✓"
//                 : callingCustomer
//                   ? "Saving…"
//                   : "Customer Answered"}
//             </Button>
//           </div>
//         </div>
//       </DialogContent>
//     </Dialog>
//   );
// }

// /* ─── Adapter: CustomerNotification → display shape ─── */

// function toDisplayItem(n: CustomerNotification) {
//   return {
//     id: n.id,
//     type: n.type,
//     title: n.title,
//     message: n.message,
//     read: n.read,
//     createdAtIso: n.createdAt,
//     bookingCode: n.bookingCode,
//     branchName: n.workshopName,
//     clientName: n.customerName,
//     customerEmail: n.customerEmail,
//     customerPhone: n.customerPhone,
//     customerId: n.customerId,
//     price: n.price,
//     issueTitle: n.issueTitle,
//     issueId: n.issueId,
//     estimateId: n.estimateId,
//     bookingId: n.bookingId,
//     source: n.source,
//     ownerUid: n.ownerUid,
//     notificationReviewed: n.notificationReviewed,
//     calledCustomer: n.calledCustomer,
//     calledCustomerByDisplayName: n.calledCustomerByDisplayName,
//     calledCustomerByName: n.calledCustomerByName,
//   };
// }

// type DisplayItem = ReturnType<typeof toDisplayItem>;

// /* ─── Main Card ─── */

// export function NotificationsCard({
//   queues,
//   agents,
//   summary,
//   session,
// }: NotificationsCardProps) {
//   const [items, setItems] = useState<DisplayItem[]>([]);
//   const [answeredItems, setAnsweredItems] = useState<DisplayItem[]>([]);
//   const [showAnswered, setShowAnswered] = useState(false);
//   const [loading, setLoading] = useState(true);
//   const [selected, setSelected] = useState<DisplayItem | null>(null);
//   // Track IDs reviewed in this session so other agents/tabs aren't interrupted mid-session
//   const [localReviewed, setLocalReviewed] = useState<Set<string>>(new Set());

//   const loadNotifications = useCallback(() => {
//     return fetchCustomerNotifications().then((data) => {
//       const base = data
//         .filter((n) => n.type !== "estimate_reply")
//         .filter((n) => n.type !== "booking_canceled")
//         .filter((n) => n.type !== "estimate_request")
//         .filter((n) => n.type !== "booking_confirmed");

//       setItems(
//         base
//           .filter((n) => !n.notificationReviewed)
//           .filter((n) => !n.calledCustomer)
//           .map(toDisplayItem),
//       );
//       setAnsweredItems(base.filter((n) => n.calledCustomer).map(toDisplayItem));
//       // Clear local reviewed set — fresh data from API is authoritative
//       setLocalReviewed(new Set());
//     });
//   }, []);

//   useEffect(() => {
//     // Initial load
//     loadNotifications()
//       .catch(console.error)
//       .finally(() => setLoading(false));

//     // Poll every 30s — keeps all agents in sync
//     const interval = setInterval(() => {
//       loadNotifications().catch(console.error);
//     }, 30_000);

//     return () => clearInterval(interval);
//   }, [loadNotifications]);

//   function handleSelect(n: DisplayItem) {
//     setSelected(n);
//     // Hide immediately in this session so the list doesn't show it while modal is open
//     setLocalReviewed((prev) => new Set(prev).add(n.id));
//     // Refresh list so other agents' changes are reflected
//     loadNotifications().catch(console.error);
//   }

//   function handleCalledCustomer(id: string) {
//     // Remove from list immediately in this session
//     setItems((prev) => prev.filter((n) => n.id !== id));
//   }

//   // Exclude locally-reviewed items so the list hides them immediately on click
//   const visibleItems = items.filter((n) => !localReviewed.has(n.id));
//   const unreadCount = visibleItems.filter((n) => !n.read).length;

//   return (
//     <>
//       <div className="space-y-4">
//         {/* Header */}
//         <div className="flex items-center gap-2">
//           <button
//             onClick={() => setShowAnswered(false)}
//             className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
//               !showAnswered
//                 ? "bg-rose-100 text-rose-600"
//                 : "text-muted-foreground hover:bg-slate-100"
//             }`}
//           >
//             <span className="relative flex h-2 w-2">
//               <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
//               <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
//             </span>
//             Notifications
//             {unreadCount > 0 && (
//               <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
//                 {unreadCount}
//               </span>
//             )}
//           </button>

//           <button
//             onClick={() => setShowAnswered(true)}
//             className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
//               showAnswered
//                 ? "bg-emerald-100 text-emerald-700"
//                 : "text-muted-foreground hover:bg-slate-100"
//             }`}
//           >
//             <Phone className="h-3 w-3" />
//             Customer Answered
//             {answeredItems.length > 0 && (
//               <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
//                 {answeredItems.length}
//               </span>
//             )}
//           </button>
//         </div>

//         {/* Card */}
//         <Card className="border-border/80 bg-white shadow-sm overflow-hidden">
//           <CardContent className="p-0">
//             <div className="max-h-[480px] overflow-y-auto">
//               {loading && (
//                 <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
//                   <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
//                   <span className="text-sm">Loading…</span>
//                 </div>
//               )}

//               {/* ── Notifications list ── */}
//               {!loading && !showAnswered && (
//                 <>
//                   {visibleItems.length === 0 && (
//                     <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
//                       <CheckCircle2 className="h-8 w-8 text-slate-200" />
//                       <span className="text-sm">No notifications</span>
//                     </div>
//                   )}
//                   {visibleItems.map((n, i) => {
//                     const k = getKind(n.type);
//                     const c = KIND_CONFIG[k];
//                     const timeStr = n.createdAtIso
//                       ? timeAgoFromIso(n.createdAtIso)
//                       : "";
//                     return (
//                       <div
//                         key={n.id}
//                         onClick={async () => {
//                           // Wait for server to set notificationReviewed=true BEFORE fetching,
//                           // so the fresh list excludes this notification for all agents
//                           await markNotificationReviewed(n.id).catch(
//                             console.error,
//                           );
//                           handleSelect(n);
//                         }}
//                         className={`flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors hover:bg-slate-50 ${!n.read ? "bg-sky-50/50" : ""} ${i < visibleItems.length - 1 ? "border-b border-border/60" : ""}`}
//                       >
//                         {/* Left: icon + call button */}
//                         <div className="flex shrink-0 flex-col items-center gap-2">
//                           <div
//                             className={`flex h-8 w-8 items-center justify-center rounded-full ${c.iconBg}`}
//                           >
//                             {c.icon}
//                           </div>
//                           {/* <p>{(n.id)}</p> */}
//                           {(n.customerPhone ??
//                             MOCK_PHONES[n.clientName ?? ""]) && (
//                             <button
//                               onClick={(e) => {
//                                 e.stopPropagation();
//                                 window.open(
//                                   `tel:${n.customerPhone ?? MOCK_PHONES[n.clientName ?? ""]}`,
//                                   "_self",
//                                 );
//                               }}
//                               className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition-colors hover:bg-emerald-200"
//                               title={
//                                 n.customerPhone ??
//                                 MOCK_PHONES[n.clientName ?? ""]
//                               }
//                             >
//                               <Phone className="h-3.5 w-3.5" />
//                             </button>
//                           )}
//                         </div>

//                         {/* Right: content */}
//                         <div className="min-w-0 flex-1">
//                           {/* Title + time */}
//                           <div className="flex items-start justify-between gap-2">
//                             <span className="text-sm font-semibold text-slate-900 leading-snug">
//                               {n.title}
//                             </span>
//                             <div className="flex shrink-0 flex-col items-end gap-1">
//                               <span className="font-mono text-[10px] text-slate-400">
//                                 {timeStr}
//                               </span>
//                               {!n.read && (
//                                 <span className="h-2 w-2 rounded-full bg-rose-500" />
//                               )}
//                             </div>
//                           </div>

//                           {/* Message
//                       <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{n.message}</p> */}

//                           {/* Customer name + phone */}
//                           <div className="mt-1.5 flex items-center gap-2">
//                             {n.clientName && (
//                               <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
//                                 <User className="h-3 w-3 text-slate-400" />
//                                 {n.clientName}
//                               </span>
//                             )}
//                             {(n.customerPhone ??
//                               MOCK_PHONES[n.clientName ?? ""]) && (
//                               <span className="flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
//                                 <Phone className="h-3 w-3" />
//                                 {n.customerPhone ??
//                                   MOCK_PHONES[n.clientName ?? ""]}
//                               </span>
//                             )}
//                           </div>

//                           {/* Badges */}
//                           <div className="mt-1.5 flex flex-wrap gap-1">
//                             {n.bookingCode && (
//                               <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
//                                 #{n.bookingCode}
//                               </span>
//                             )}
//                             {n.branchName && (
//                               <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
//                                 {n.branchName}
//                               </span>
//                             )}
//                             {n.price != null && (
//                               <span className="rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
//                                 ${n.price.toLocaleString()}
//                               </span>
//                             )}
//                             <span
//                               className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${c.badgeClass}`}
//                             >
//                               {c.badgeLabel}
//                             </span>
//                           </div>
//                         </div>
//                       </div>
//                     );
//                   })}
//                 </>
//               )}

//               {/* ── Customer Answered list ── */}
//               {!loading && showAnswered && (
//                 <>
//                   {answeredItems.length === 0 && (
//                     <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
//                       <Phone className="h-8 w-8 text-slate-200" />
//                       <span className="text-sm">No answered customers yet</span>
//                     </div>
//                   )}
//                   {answeredItems.map((n, i) => {
//                     const k = getKind(n.type);
//                     const c = KIND_CONFIG[k];
//                     const timeStr = n.createdAtIso
//                       ? timeAgoFromIso(n.createdAtIso)
//                       : "";
//                     const callerName =
//                       n.calledCustomerByDisplayName ?? n.calledCustomerByName;
//                     return (
//                       <div
//                         key={n.id}
//                         className={`flex items-start gap-3 px-5 py-4 ${i < answeredItems.length - 1 ? "border-b border-border/60" : ""}`}
//                       >
//                         <div
//                           className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${c.iconBg}`}
//                         >
//                           {c.icon}
//                         </div>
//                         <div className="min-w-0 flex-1">
//                           <div className="flex items-start justify-between gap-2">
//                             <span className="text-sm font-semibold text-slate-900 leading-snug">
//                               {n.title}
//                             </span>
//                             <span className="font-mono text-[10px] text-slate-400 shrink-0">
//                               {timeStr}
//                             </span>
//                           </div>
//                           <div className="mt-1.5 flex flex-wrap items-center gap-2">
//                             {n.clientName && (
//                               <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
//                                 <User className="h-3 w-3 text-slate-400" />
//                                 {n.clientName}
//                               </span>
//                             )}
//                             {n.customerPhone && (
//                               <span className="flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
//                                 <Phone className="h-3 w-3" />
//                                 {n.customerPhone}
//                               </span>
//                             )}
//                           </div>
//                           <div className="mt-1.5 flex flex-wrap gap-1">
//                             {n.bookingCode && (
//                               <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
//                                 #{n.bookingCode}
//                               </span>
//                             )}
//                             {n.branchName && (
//                               <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
//                                 {n.branchName}
//                               </span>
//                             )}
//                             <span
//                               className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${c.badgeClass}`}
//                             >
//                               {c.badgeLabel}
//                             </span>
//                             <span className="rounded-md bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
//                               Answered ✓
//                             </span>
//                             {callerName && (
//                               <span className="flex items-center gap-1 rounded-md bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] text-sky-700">
//                                 <User className="h-3 w-3" />
//                                 CC-Agent Name: {callerName}
//                               </span>
//                             )}
//                           </div>
//                         </div>
//                       </div>
//                     );
//                   })}
//                 </>
//               )}
//             </div>
//           </CardContent>
//         </Card>
//       </div>

//       <NotificationModal
//         notification={selected}
//         session={session}
//         open={Boolean(selected)}
//         onClose={() => {
//           if (selected) {
//             // Only mark reviewed on close — so agent must open to trigger it
//             markNotificationReviewedClosed(selected.id).catch(console.error);
//           }
//           setSelected(null);
//           setLoading(true);
//           loadNotifications()
//             .catch(console.error)
//             .finally(() => setLoading(false));
//         }}
//         onCalledCustomer={handleCalledCustomer}
//       />
//     </>
//   );
// }

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import type { Queue, Agent, DashboardSummary, UserSession } from "@/services/types";
import {
  fetchCustomerNotifications,
  markNotificationReviewed,
  markCalledCustomer,
  markNotificationReviewedClosed,
  type CustomerNotification,
} from "@/services/notificationsApi";
import { logSystemActivity } from "@/services/auditLogApi";
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
  Bell,
  Phone,
  MapPin,
  AlertCircle,
  CheckCircle2,
  User,
  Mail,
  Hash,
  Calendar,
  Tag,
} from "lucide-react";

// Props kept for future live data wiring
interface NotificationsCardProps {
  queues: Queue[];
  agents: Agent[];
  summary: DashboardSummary | null;
  session?: UserSession | null;
}

/* ─── Mock Data (disabled) ───
const MOCK_NOTIFICATIONS = [
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
];
─── */

/* ─── Helpers ─── */

function timeAgo(createdAt: { _seconds: number } | null): string {
  if (!createdAt) return "";
  const diff = Date.now() - createdAt._seconds * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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
  // if (type === 'estimate_reply') return 'estimate';
  return "other";
}

const KIND_CONFIG: Record<
  NotifKind,
  {
    icon: React.ReactNode;
    iconBg: string;
    badgeClass: string;
    badgeLabel: string;
    dotColor: string;
  }
> = {
  asking: {
    icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
    iconBg: "bg-amber-100",
    badgeClass: "bg-amber-50 border-amber-200 text-amber-700",
    badgeLabel: "⚡ Approval Needed",
    dotColor: "bg-amber-400",
  },
  completed: {
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    iconBg: "bg-emerald-100",
    badgeClass: "bg-emerald-50 border-emerald-200 text-emerald-700",
    badgeLabel: "✓ Booking Completed",
    dotColor: "bg-emerald-400",
  },
  // estimate: {
  //   icon: <Bell className="h-4 w-4 text-purple-500" />,
  //   iconBg: 'bg-purple-100',
  //   badgeClass: 'bg-purple-50 border-purple-200 text-purple-700',
  //   badgeLabel: '📄 Estimate Reply',
  //   dotColor: 'bg-purple-400',
  // },
  other: {
    icon: <Bell className="h-4 w-4 text-sky-500" />,
    iconBg: "bg-sky-100",
    badgeClass: "bg-sky-50 border-sky-200 text-sky-700",
    badgeLabel: "📋 Notification",
    dotColor: "bg-sky-400",
  },
};

/* ─── Notification Modal ─── */

// Mock phone numbers per client (no API needed)
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
          title: notification!.title,
          clientName: notification!.clientName,
          phone: phone,
          bookingCode: notification!.bookingCode,
          branchName: notification!.branchName,
          type: notification!.type,
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${cfg.iconBg}`}
            >
              {cfg.icon}
            </span>
            {notification.title || "Notification"}
          </DialogTitle>
        </DialogHeader>

        {/* Type badge */}
        <div className="flex items-center gap-2">
          <Badge
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badgeClass}`}
          >
            {cfg.badgeLabel}
          </Badge>
          {notification.bookingCode && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
              #{notification.bookingCode}
            </span>
          )}
          {!notification.read && (
            <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
              New
            </span>
          )}
        </div>

        <Separator />

        {/* Message */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Message
          </p>
          <p className="text-sm text-slate-700 leading-relaxed">
            {notification.message}
          </p>
        </div>

        <Separator />

        {/* Customer info grid */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Customer Details
          </p>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center gap-2.5 text-slate-700">
              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="font-semibold">
                {notification.clientName || "—"}
              </span>
            </div>
            {notification.customerEmail && (
              <div className="flex items-center gap-2.5 text-slate-700">
                <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="text-xs">{notification.customerEmail}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-slate-700">
              <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="text-xs">{phone || "N/A"}</span>
            </div>
            {notification.branchName && (
              <div className="flex items-center gap-2.5 text-slate-700">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="text-xs">{notification.branchName}</span>
              </div>
            )}
            {/* {notification.customerId && (
              <div className="flex items-center gap-2.5 text-slate-500">
                <Hash className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="font-mono text-[11px]">Customer ID: {notification.customerId}</span>
              </div>
            )} */}
            {/* {notification.bookingId && (
              <div className="flex items-center gap-2.5 text-slate-500">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="font-mono text-[11px]">Booking ID: {notification.bookingId}</span>
              </div>
            )} */}
            {/* {notification.source && (
              <div className="flex items-center gap-2.5 text-slate-500">
                <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="text-[11px] capitalize">Source: {notification.source}</span>
              </div>
            )} */}
          </div>
        </div>

        {/* Additional issue detail */}
        {kind === "asking" && notification.issueTitle && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-amber-600">
                <AlertCircle className="h-3 w-3" /> Additional Issue
              </div>
              {notification.price != null && (
                <span className="font-bold text-amber-800">
                  ${notification.price.toLocaleString()}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-amber-900">
              {notification.issueTitle}
            </p>
            {notification.issueId && (
              <p className="font-mono text-[10px] text-amber-600">
                Issue ID: {notification.issueId}
              </p>
            )}
          </div>
        )}

        {/* Booking completed detail */}
        {kind === "completed" && notification.bookingCode && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-600 mb-1">
              <CheckCircle2 className="h-3 w-3" /> Completed Booking
            </div>
            <p className="font-mono text-sm font-semibold text-emerald-800">
              #{notification.bookingCode}
            </p>
          </div>
        )}

        <Separator />

        {/* Call + Customer Answered */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-600">
            <Phone className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-sm font-medium">
              {phone || "No phone number"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {phone && (
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  // Audit Log — Call Customer
                  logSystemActivity(
                    session,
                    "notification_call_customer",
                    "notification",
                    notification!.id,
                    {
                      title: notification!.title,
                      clientName: notification!.clientName,
                      phone: phone,
                      bookingCode: notification!.bookingCode,
                      branchName: notification!.branchName,
                      type: notification!.type,
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
              {notification.calledCustomer
                ? "Answered ✓"
                : callingCustomer
                  ? "Saving…"
                  : "Customer Answered"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Adapter: CustomerNotification → display shape ─── */

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
  // Track IDs reviewed in this session so other agents/tabs aren't interrupted mid-session
  const [localReviewed, setLocalReviewed] = useState<Set<string>>(new Set());

  const loadNotifications = useCallback(() => {
    return fetchCustomerNotifications().then((data) => {
      const base = data
        .filter((n) => n.type !== "estimate_reply")
        .filter((n) => n.type !== "booking_canceled")
        .filter((n) => n.type !== "estimate_request")
        .filter((n) => n.type !== "booking_confirmed")
        .filter((n) => n.type !== "additional_issue_quote");

      setItems(
        base
          .filter((n) => !n.notificationReviewed)
          .filter((n) => !n.calledCustomer)
          .map(toDisplayItem),
      );
      setAnsweredItems(base.filter((n) => n.calledCustomer).map(toDisplayItem));
      // Clear local reviewed set — fresh data from API is authoritative
      setLocalReviewed(new Set());
    });
  }, []);

  useEffect(() => {
    // Initial load
    loadNotifications()
      .catch(console.error)
      .finally(() => setLoading(false));

    // Poll every 30s — keeps all agents in sync
    const interval = setInterval(() => {
      loadNotifications().catch(console.error);
    }, 30_000);

    return () => clearInterval(interval);
  }, [loadNotifications]);

  function handleSelect(n: DisplayItem) {
    setSelected(n);
    // Hide immediately in this session so the list doesn't show it while modal is open
    setLocalReviewed((prev) => new Set(prev).add(n.id));
    // Refresh list so other agents' changes are reflected
    loadNotifications().catch(console.error);
  }

  function handleCalledCustomer(id: string) {
    // Remove from list immediately in this session
    setItems((prev) => prev.filter((n) => n.id !== id));
  }

  // Exclude locally-reviewed items so the list hides them immediately on click
  const visibleItems = items.filter((n) => !localReviewed.has(n.id));
  const unreadCount = visibleItems.filter((n) => !n.read).length;

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAnswered(false)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              !showAnswered
                ? "bg-rose-100 text-rose-600"
                : "text-muted-foreground hover:bg-slate-100"
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
            </span>
            Notifications
            {unreadCount > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowAnswered(true)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              showAnswered
                ? "bg-emerald-100 text-emerald-700"
                : "text-muted-foreground hover:bg-slate-100"
            }`}
          >
            <Phone className="h-3 w-3" />
            Customer Answered
            {answeredItems.length > 0 && (
              <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {answeredItems.length}
              </span>
            )}
          </button>
        </div>

        {/* Card */}
        <Card className="border-border/80 bg-white shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="max-h-[480px] overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                  <span className="text-sm">Loading…</span>
                </div>
              )}

              {/* ── Notifications list ── */}
              {!loading && !showAnswered && (
                <>
                  {visibleItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
                      <CheckCircle2 className="h-8 w-8 text-slate-200" />
                      <span className="text-sm">No notifications</span>
                    </div>
                  )}
                  {visibleItems.map((n, i) => {
                    const k = getKind(n.type);
                    const c = KIND_CONFIG[k];
                    const timeStr = n.createdAtIso
                      ? timeAgoFromIso(n.createdAtIso)
                      : "";
                    return (
                      <div
                        key={n.id}
                        onClick={async () => {
                          await markNotificationReviewed(n.id).catch(
                            console.error,
                          );

                          // Audit Log — View Notification
                          logSystemActivity(
                            session,
                            "notification_viewed",
                            "notification",
                            n.id,
                            {
                              title: n.title,
                              clientName: n.clientName,
                              bookingCode: n.bookingCode,
                              branchName: n.branchName,
                              type: n.type,
                            },
                          ).catch(console.error);

                          handleSelect(n);
                        }}
                        className={`flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors hover:bg-slate-50 ${!n.read ? "bg-sky-50/50" : ""} ${i < visibleItems.length - 1 ? "border-b border-border/60" : ""}`}
                      >
                        <div className="flex shrink-0 flex-col items-center gap-2">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full ${c.iconBg}`}
                          >
                            {c.icon}
                          </div>
                          {(n.customerPhone ??
                            MOCK_PHONES[n.clientName ?? ""]) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(
                                  `tel:${n.customerPhone ?? MOCK_PHONES[n.clientName ?? ""]}`,
                                  "_self",
                                );
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 transition-colors hover:bg-emerald-200"
                              title={
                                n.customerPhone ??
                                MOCK_PHONES[n.clientName ?? ""]
                              }
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900 leading-snug">
                              {n.title}
                            </span>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="font-mono text-[10px] text-slate-400">
                                {timeStr}
                              </span>
                              {!n.read && (
                                <span className="h-2 w-2 rounded-full bg-rose-500" />
                              )}
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            {n.clientName && (
                              <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                <User className="h-3 w-3 text-slate-400" />
                                {n.clientName}
                              </span>
                            )}
                            {(n.customerPhone ??
                              MOCK_PHONES[n.clientName ?? ""]) && (
                              <span className="flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                <Phone className="h-3 w-3" />
                                {n.customerPhone ??
                                  MOCK_PHONES[n.clientName ?? ""]}
                              </span>
                            )}
                          </div>
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
                            <span
                              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${c.badgeClass}`}
                            >
                              {c.badgeLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* ── Customer Answered list ── */}
              {!loading && showAnswered && (
                <>
                  {answeredItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
                      <Phone className="h-8 w-8 text-slate-200" />
                      <span className="text-sm">No answered customers yet</span>
                    </div>
                  )}
                  {answeredItems.map((n, i) => {
                    const k = getKind(n.type);
                    const c = KIND_CONFIG[k];
                    const timeStr = n.createdAtIso
                      ? timeAgoFromIso(n.createdAtIso)
                      : "";
                    const callerName =
                      n.calledCustomerByDisplayName ?? n.calledCustomerByName;
                    return (
                      <div
                        key={n.id}
                        className={`flex items-start gap-3 px-5 py-4 ${i < answeredItems.length - 1 ? "border-b border-border/60" : ""}`}
                      >
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${c.iconBg}`}
                        >
                          {c.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900 leading-snug">
                              {n.title}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">
                              {timeStr}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {n.clientName && (
                              <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                <User className="h-3 w-3 text-slate-400" />
                                {n.clientName}
                              </span>
                            )}
                            {n.customerPhone && (
                              <span className="flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                <Phone className="h-3 w-3" />
                                {n.customerPhone}
                              </span>
                            )}
                          </div>
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
                            <span
                              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${c.badgeClass}`}
                            >
                              {c.badgeLabel}
                            </span>
                            <span className="rounded-md bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                              Answered ✓
                            </span>
                            {callerName && (
                              <span className="flex items-center gap-1 rounded-md bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] text-sky-700">
                                <User className="h-3 w-3" />
                                CC-Agent Name: {callerName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <NotificationModal
        notification={selected}
        open={Boolean(selected)}
        session={session}
        onClose={() => {
          if (selected) {
            // Only mark reviewed on close — so agent must open to trigger it
            markNotificationReviewedClosed(selected.id).catch(console.error);
          }
          setSelected(null);
          setLoading(true);
          loadNotifications()
            .catch(console.error)
            .finally(() => setLoading(false));
        }}
        onCalledCustomer={handleCalledCustomer}
      />
    </>
  );
}
