import '@/styles/dashboard.css';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import BookingSidebar from '../tabs/BookingSidebar';
import {
  ArrowLeft, CalendarDays, CarFront, CheckCircle2, Clock,
  FileText, Phone, Mail, User, Wrench, Flag, Ban, LayoutDashboard,
  Eye, ChevronDown, ChevronUp, Activity,
} from 'lucide-react';
import { getBookingById, getBookings, type Booking, type BookingDetail } from '@/services/bookingsApi';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';



type Task = { id: string; label: string; done: boolean };

type BookingRecordWithTasks = any; 

const MOCK_OTHER_BOOKINGS: any[] = [];

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  Pending:   { label: 'Pending',   className: 'bg-amber-100 text-amber-800 border-amber-200' },
  Confirmed: { label: 'Confirmed', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  Completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  Cancelled: { label: 'Cancelled', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  Canceled:  { label: 'Canceled',  className: 'bg-rose-100 text-rose-800 border-rose-200' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm text-slate-900">{value}</div>
    </div>
  );
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

// ── Booking row ───────────────────────────────────────────────────────────────

function BookingRow({ booking, onView }: { booking: BookingRecordWithTasks; onView: () => void }) {
  const sc = STATUS_CONFIG[(booking.status as BookingStatus) || 'pending'] || STATUS_CONFIG.pending;
  const d = (() => { try { return format(parseISO(booking.bookingDate), 'EEE, dd MMM yyyy'); } catch { return booking.bookingDate || 'N/A'; } })();
  const vehicleLabel = [booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(' ');

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      {/* Client & Service */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-bold text-white">
            {booking.customerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{booking.customerName}</div>
            <div className="text-xs text-slate-400">{booking.customerPhone}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {String(booking.serviceType || '').split(',').map((s) => (
                <span key={s.trim()} className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200">
                  {s.trim()}
                </span>
              ))}
            </div>
          </div>
        </div>
      </td>

      {/* Date & Time */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <CalendarDays className="h-3.5 w-3.5" />{d}
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-600">
          <Clock className="h-3.5 w-3.5" />{booking.dropOffTime}
        </div>
        {booking.pickupTime && (
          <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-sky-600">
            <Clock className="h-3.5 w-3.5" />{booking.pickupTime}
          </div>
        )}
      </td>

      {/* Vehicle */}
      <td className="px-4 py-3">
        <div className="text-xs font-semibold text-slate-800">{vehicleLabel}</div>
        {booking.vehicleRego && (
          <div className="mt-0.5 text-[11px] text-slate-400">{booking.vehicleRego}</div>
        )}
        {booking.vehicleYear && (
          <div className="mt-0.5 text-[11px] text-slate-400">{booking.vehicleYear}</div>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <Badge className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${sc.className}`}>
          {sc.label}
        </Badge>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onView}>
          <Eye className="h-3.5 w-3.5" /> View
        </Button>
      </td>
    </tr>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

function BookingListView({ meta, pathname }: { meta: PageMeta; pathname: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ownerUid = location.state?.ownerId || "89UqVYLG4MRllNRCrDsgBrIXsCK2";
    const branchId = location.state?.branchId;

    getBookings(ownerUid, 100).then(data => {
      let filtered = data;
      if (branchId) {
        filtered = filtered.filter(b => b.branchId === branchId);
      }
      
      const mapped = filtered.map(b => ({
         id: b.id,
         status: (b as any).status || 'pending',
         customerName: b.client || 'Unknown',
         customerPhone: b.clientPhone || '',
         customerEmail: b.clientEmail || '',
         serviceType: b.services?.map(s => s.serviceName).join(', ') || 'General Service',
         bookingDate: b.date || '',
         dropOffTime: b.time || '',
         pickupTime: b.pickupTime || '',
         vehicleMake: '',
         vehicleModel: '',
         vehicleYear: null,
         vehicleRego: b.vehicleNumber || '',
         notes: b.notes || '',
         tasks: [],
      }));

      // If we are on a specific filter tab
      let finalBookings = mapped;
      if (pathname === '/bookings/pending') {
        finalBookings = mapped.filter(b => b.status === 'pending');
      } else if (pathname === '/bookings/confirmed') {
        finalBookings = mapped.filter(b => b.status === 'confirmed');
      } else if (pathname === '/bookings/completed') {
        finalBookings = mapped.filter(b => b.status === 'completed');
      } else if (pathname === '/bookings/cancelled') {
        finalBookings = mapped.filter(b => b.status === 'cancelled');
      }

      setBookings(finalBookings);
    })
    .catch(console.error)
    .finally(() => setLoading(false));
  }, [pathname, location.state]);

  return (
    <div className="cc-fade-in flex-1 overflow-y-auto bg-[#f5f5f5]">
      <div className="relative overflow-hidden bg-neutral-900 px-8 py-7 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 shadow-lg flex-shrink-0">
            {meta.icon}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{meta.title}</h1>
            <p className="text-sm text-neutral-400 mt-0.5">{meta.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
            <div className="animate-spin h-8 w-8 border-4 border-amber-400 border-t-transparent rounded-full" />
            <p className="text-sm">Loading bookings from Firebase...</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              {meta.icon}
            </div>
            <div className="text-lg font-semibold text-slate-500">{meta.title}</div>
            <p className="text-sm text-slate-400">No bookings found.</p>
          </div>
        ):}

        {!loading && bookings.length > 0 && (
          <Card className="border-0 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Client & Service</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Vehicle</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Progress</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const sc = STATUS_CONFIG[b.status] ?? { label: b.status, className: 'bg-slate-100 text-slate-600' };
                    const d = (() => { try { return format(new Date(b.date), 'dd MMM yyyy'); } catch { return b.date; } })();
                    return (
                      <tr
                        key={b.id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-bold text-white">
                              {b.clientName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{b.clientName}</div>
                              <div className="text-xs text-slate-400">{b.bookingCode}</div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {b.services.map((s) => (
                                  <span key={s.name} className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200">
                                    {s.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <CalendarDays className="h-3.5 w-3.5" />{d}
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-600">
                            <Clock className="h-3.5 w-3.5" />{b.time}
                          </div>
                          {b.pickupTime && (
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-sky-600">
                              <Clock className="h-3.5 w-3.5" />{b.pickupTime}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {b.vehicleNumber ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-slate-900">
                          ${b.totalPrice.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${sc.className}`}>
                            {sc.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 min-w-[120px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-amber-400 transition-all"
                                style={{ width: `${b.progress.percentage}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-slate-500 shrink-0">
                              {b.progress.completed}/{b.progress.total}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs"
                            onClick={() => navigate(`/bookings/${b.id}`)}
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Detail view ───────────────────────────────────────────────────────────────

function BookingDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [otherBookings, setOtherBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [expandedTaskCard, setExpandedTaskCard] = useState(false);

  const location = useLocation();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const ownerUid = location.state?.ownerId || "89UqVYLG4MRllNRCrDsgBrIXsCK2";
    
    // For single detail view, fetch all and find it, or use getBookingById if it exists
    getBookings(ownerUid, 100).then(data => {
      const b: any = data.find(x => x.id === id);
      if (b) {
        setBooking({
           id: b.id,
           status: b.status || 'pending',
           customerName: b.client || 'Unknown',
           customerPhone: b.clientPhone || '',
           customerEmail: b.clientEmail || '',
           serviceType: b.services?.map((s: any) => s.serviceName).join(', ') || 'General Service',
           bookingDate: b.date || '',
           dropOffTime: b.time || '',
           pickupTime: b.pickupTime || '',
           vehicleMake: '',
           vehicleModel: '',
           vehicleYear: null,
           vehicleRego: b.vehicleNumber || '',
           notes: b.notes || '',
           tasks: [],
        });
      }
    })
    .catch(console.error)
    .finally(() => setLoading(false));
  }, [id, location.state]);

  const b = detail?.booking ?? null;
  const statusCfg = b ? (STATUS_CONFIG[b.status] ?? { label: b.status, className: 'bg-slate-100 text-slate-600' }) : null;
  const formattedDate = b?.date ? (() => { try { return format(new Date(b.date), 'EEEE, dd MMMM yyyy'); } catch { return b.date; } })() : null;
  const tasks = detail?.tasks ?? [];
  const taskPct = detail?.progress.tasks.percentage ?? 0;
  const isComplete = taskPct === 100;
  const createdAtDate = b?.createdAt ? new Date(b.createdAt._seconds * 1000) : null;

  return (
    <div className="cc-fade-in flex-1 overflow-y-auto bg-[#f5f5f5]">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 shadow-sm">
              <CalendarDays className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <div className="text-base font-semibold tracking-tight">Booking Details</div>
              {loading ? <SkeletonBlock className="mt-1 h-3 w-20" /> : b ? <div className="text-xs text-muted-foreground">{b.bookingCode}</div> : null}
            </div>
          </div>
          {loading ? <SkeletonBlock className="h-6 w-20 rounded-full" /> : statusCfg && (
            <Badge className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusCfg.className}`}>{statusCfg.label}</Badge>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {loading && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="border-0 bg-white shadow-sm">
                  <CardContent className="p-5 space-y-3">
                    <SkeletonBlock className="h-4 w-24" /><Separator />
                    <div className="grid gap-3 sm:grid-cols-2 pt-1">
                      <SkeletonBlock className="h-8 w-full" /><SkeletonBlock className="h-8 w-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="space-y-4"><SkeletonBlock className="h-40 w-full rounded-xl" /><SkeletonBlock className="h-9 w-full" /></div>
          </div>
        )}

        {!loading && !b && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
            <CalendarDays className="h-10 w-10 text-slate-300" />
            <div className="text-lg font-semibold">Booking not found</div>
            <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
          </div>
        )}

        {!loading && b && detail && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">

              {/* Customer */}
              <Card className="border-0 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <User className="h-4 w-4" /> Customer
                  </CardTitle>
                </CardHeader>
                <Separator />
                <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
                  <Field label="Full name" value={b.client} />
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-slate-900">{b.clientPhone}</span>
                  </div>
                  {b.clientEmail && (
                    <div className="flex items-center gap-2 text-sm sm:col-span-2">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-slate-900">{b.clientEmail}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Services */}
              <Card className="border-0 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <Wrench className="h-4 w-4" /> Services & Time
                  </CardTitle>
                </CardHeader>
                <Separator />
                <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
                  <div className="sm:col-span-2 space-y-2">
                    {detail.services.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${s.completionStatus === 'completed' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          <span className="text-sm font-medium text-slate-800">{s.name}</span>
                          {s.staffName && <span className="text-xs text-slate-400">— {s.staffName}</span>}
                        </div>
                        <span className="text-sm font-bold text-slate-900">${s.price.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Date</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-900">
                      <CalendarDays className="h-3.5 w-3.5 text-slate-400" />{formattedDate}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Drop-off</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-amber-600">
                      <Clock className="h-3.5 w-3.5" />{b.time}
                    </div>
                  </div>
                  {b.pickupTime && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Pick-up</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-sky-600">
                        <Clock className="h-3.5 w-3.5" />{b.pickupTime}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Total</div>
                    <div className="mt-0.5 text-sm font-bold text-slate-900">${b.totalPrice.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Branch</div>
                    <div className="mt-0.5 text-sm text-slate-900">{b.branchName}</div>
                  </div>
                </CardContent>
              </Card>

              {/* Tasks progress */}
              {tasks.length > 0 && (
                <Card className="border-0 bg-white shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Tasks</span>
                      <button onClick={() => setExpandedTaskCard((v) => !v)} className="flex items-center gap-1 text-xs font-normal text-slate-400 hover:text-slate-600">
                        {expandedTaskCard ? <><ChevronUp className="h-3.5 w-3.5" />Hide</> : <><ChevronDown className="h-3.5 w-3.5" />Show</>}
                      </button>
                    </CardTitle>
                  </CardHeader>
                  <Separator />
                  <CardContent className="pt-4 space-y-4">
                    {/* Progress bar */}
                    <div className={`rounded-2xl border p-4 ${isComplete ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-[11px] font-bold text-neutral-800">Task Progress</div>
                          <div className="text-[9px] text-neutral-400 mt-0.5">
                            {isComplete ? 'All done!' : `${detail.progress.tasks.completed}/${detail.progress.tasks.total} completed`}
                          </div>
                        </div>
                        <div className="relative w-10 h-10">
                          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="14" fill="none" stroke={isComplete ? '#d1fae5' : '#f1f5f9'} strokeWidth="3" />
                            <circle cx="18" cy="18" r="14" fill="none"
                              stroke={isComplete ? '#10b981' : taskPct > 50 ? '#f59e0b' : '#3b82f6'}
                              strokeWidth="3" strokeLinecap="round"
                              strokeDasharray={`${taskPct * 0.88} 88`}
                              className="transition-all duration-700"
                            />
                          </svg>
                          <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-black ${isComplete ? 'text-emerald-600' : 'text-neutral-700'}`}>
                            {taskPct}%
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {tasks.map((task, i) => (
                          <div key={i} className="flex-1 h-2 rounded-full overflow-hidden bg-neutral-200">
                            <div className={`h-full rounded-full transition-all duration-500 ${task.done ? (isComplete ? 'bg-emerald-400' : 'bg-amber-400') : ''}`} style={{ width: task.done ? '100%' : '0%' }} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Task list */}
                    {expandedTaskCard && (
                      <div className="space-y-2">
                        {tasks.map((task) => (
                          <div key={task.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                            <div className={`mt-0.5 h-4 w-4 shrink-0 rounded-full flex items-center justify-center ${task.done ? (isComplete ? 'bg-emerald-500' : 'bg-amber-400') : 'border-2 border-slate-300 bg-white'}`}>
                              {task.done && <CheckCircle2 className="h-3 w-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`text-xs font-medium ${task.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.name}</div>
                              {task.serviceName && <div className="text-[11px] text-slate-400 mt-0.5">{task.serviceName}</div>}
                              {task.staffNote && <div className="text-[11px] text-slate-500 mt-0.5 italic">"{task.staffNote}"</div>}
                              {task.imageUrl && (
                                <img
                                  src={task.imageUrl}
                                  alt={task.name}
                                  className="mt-2 h-20 w-32 rounded-lg object-cover border border-slate-200"
                                />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Vehicle */}
              {(b.vehicleNumber || b.vehicleMake || b.vehicleColour) && (
                <Card className="border-0 bg-white shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <CarFront className="h-4 w-4" /> Vehicle
                    </CardTitle>
                  </CardHeader>
                  <Separator />
                  <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
                    <Field label="Registration" value={b.vehicleNumber} />
                    <Field label="Make" value={b.vehicleMake} />
                    <Field label="Model" value={b.vehicleModel} />
                    <Field label="Year" value={b.vehicleYear} />
                    <Field label="Colour" value={b.vehicleColour} />
                    <Field label="Body type" value={b.vehicleBodyType} />
                    <Field label="Mileage" value={b.vehicleMileage} />
                    <Field label="VIN / Chassis" value={b.vehicleVinChassis} />
                    <Field label="Engine number" value={b.vehicleEngineNumber} />
                  </CardContent>
                </Card>
              )}

              {/* Notes */}
              {b.notes && (
                <Card className="border-0 bg-white shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <FileText className="h-4 w-4" /> Notes
                    </CardTitle>
                  </CardHeader>
                  <Separator />
                  <CardContent className="pt-4">
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{b.notes}</p>
                  </CardContent>
                </Card>
              )}

              {/* Activity */}
              {detail.activities.filter((a) => a.message).length > 0 && (
                <Card className="border-0 bg-white shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <Activity className="h-4 w-4" /> Activity
                    </CardTitle>
                  </CardHeader>
                  <Separator />
                  <CardContent className="pt-4 space-y-3">
                    {detail.activities.filter((a) => a.message).map((act) => (
                      <div key={act.id} className="flex items-start gap-3">
                        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-700">{act.message}</div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {act.performedByName}
                            {act.timestamp && ` · ${format(new Date(act.timestamp._seconds * 1000), 'dd MMM yyyy HH:mm')}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right sidebar */}
            <div>
              <div className="sticky top-24 space-y-4">
                <Card className="border-0 bg-slate-900 text-white shadow-lg">
                  <CardContent className="p-5 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Booking Info</div>
                    {statusCfg && <div className={`rounded-xl border px-3 py-2 text-sm font-semibold ${statusCfg.className}`}>{statusCfg.label}</div>}
                    <Separator className="bg-slate-700" />
                    <div className="space-y-1.5 text-xs">
                      <div className="text-slate-500">Code: <span className="text-slate-300">{b.bookingCode}</span></div>
                      {createdAtDate && <div className="text-slate-500">Created: <span className="text-slate-400">{format(createdAtDate, 'dd MMM yyyy HH:mm')}</span></div>}
                      <div className="text-slate-500">Tasks: <span className="text-slate-400">{detail.progress.tasks.completed}/{detail.progress.tasks.total} ({taskPct}%)</span></div>
                      <div className="text-slate-500">Services: <span className="text-slate-400">{detail.progress.services.completed}/{detail.progress.services.total}</span></div>
                    </div>
                  </CardContent>
                </Card>

                <Button variant="outline" className="w-full" onClick={() => navigate(-1)}>Back</Button>

                {/* Customer booking history */}
                {/* <Card className="border-0 bg-white shadow-sm overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Customer Bookings History</CardTitle>
                  </CardHeader>
                  <Separator />
                  <CardContent className="p-0">
                    {otherBookings.length === 0 && <p className="px-4 py-3 text-xs text-slate-400">No other bookings.</p>}
                    {otherBookings.map((ob, idx) => {
                      const sc = STATUS_CONFIG[ob.status] ?? { label: ob.status, className: 'bg-slate-100 text-slate-600' };
                      const d = (() => { try { return format(new Date(ob.date), 'dd MMM yyyy'); } catch { return ob.date; } })();
                      return (
                        <button key={ob.id} type="button" onClick={() => navigate(`/bookings/${ob.id}`)}
                          className={`w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${idx !== 0 ? 'border-t border-slate-100' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-slate-800">{ob.services.map((s) => s.name).join(', ')}</div>
                              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><CalendarDays className="h-3 w-3" />{d}</div>
                              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600"><Clock className="h-3 w-3" />{ob.time}</div>
                            </div>
                            <Badge className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sc.className}`}>{sc.label}</Badge>
                          </div>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card> */}


              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function BookingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const pageMeta = PAGE_META[location.pathname];

  return (
    <div className="flex h-screen overflow-hidden">
      <BookingSidebar />
      {!id && pageMeta
        ? <BookingListView meta={pageMeta} pathname={location.pathname} />
        : <BookingDetailView />
      }
    </div>
  );
}
