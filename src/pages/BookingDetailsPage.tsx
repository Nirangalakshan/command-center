import '@/styles/dashboard.css';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import BookingSidebar from '../tabs/BookingSidebar';
import {
  ArrowLeft, CalendarDays, CarFront, CheckCircle2, Clock,
  FileText, Phone, Mail, User, Wrench, Flag, Ban, LayoutDashboard,
  Eye, Plus,
} from 'lucide-react';
import type { BookingRecord, BookingStatus } from '@/services/types';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// ── Task type ─────────────────────────────────────────────────────────────────

type Task = { id: string; label: string; done: boolean };

type BookingRecordWithTasks = BookingRecord & {
  tasks?: Task[];
  taskProgress?: number;
};

// ── Mock data ────────────────────────────────────────────────────────────────

const ALL_MOCK_BOOKINGS: BookingRecordWithTasks[] = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    tenantId: 't-test-001', customerId: null, vehicleId: null,
    status: 'confirmed',
    customerName: 'James Perera', customerPhone: '+94 77 123 4567', customerEmail: 'james.perera@gmail.com',
    serviceType: 'Oil Change, Brake Inspection, Wheel Alignment',
    bookingDate: '2026-04-02', dropOffTime: '08:30 AM', pickupTime: '05:00 PM',
    vehicleMake: 'Toyota', vehicleModel: 'Corolla', vehicleYear: 2020, vehicleRego: 'CAB-1234',
    notes: 'Please check the front left tire — customer mentioned vibration at high speed.',
    createdAt: '2026-04-01T10:22:00Z', updatedAt: '2026-04-02T08:15:00Z',
    tasks: [
      { id: 't1', label: 'Oil Change',       done: true  },
      { id: 't2', label: 'Brake Inspection', done: true  },
      { id: 't3', label: 'Wheel Alignment',  done: false },
      { id: 't4', label: 'Filter Check',     done: false },
    ],
    taskProgress: 50,
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    tenantId: 't-test-001', customerId: null, vehicleId: null,
    status: 'pending',
    customerName: 'Ashan Silva', customerPhone: '+94 71 987 6543', customerEmail: 'ashan.silva@gmail.com',
    serviceType: 'General Service',
    bookingDate: '2026-04-02', dropOffTime: '09:00 AM', pickupTime: '03:00 PM',
    vehicleMake: 'Honda', vehicleModel: 'Civic', vehicleYear: 2019, vehicleRego: 'WP-5678',
    notes: null,
    createdAt: '2026-03-30T08:00:00Z', updatedAt: '2026-03-30T08:00:00Z',
    tasks: [
      { id: 't1', label: 'Engine Check',   done: false },
      { id: 't2', label: 'Fluid Top-Up',   done: false },
      { id: 't3', label: 'Tyre Pressure',  done: false },
    ],
    taskProgress: 0,
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-012345678902',
    tenantId: 't-test-001', customerId: null, vehicleId: null,
    status: 'pending',
    customerName: 'Nimal Rajapaksa', customerPhone: '+94 76 555 1234', customerEmail: null,
    serviceType: 'Roadworthy Inspection',
    bookingDate: '2026-04-02', dropOffTime: '10:00 AM', pickupTime: null,
    vehicleMake: 'Nissan', vehicleModel: 'X-Trail', vehicleYear: 2021, vehicleRego: 'NW-9012',
    notes: 'Customer needs certificate urgently.',
    createdAt: '2026-04-01T09:00:00Z', updatedAt: '2026-04-01T09:00:00Z',
    tasks: [
      { id: 't1', label: 'Visual Inspection', done: false },
      { id: 't2', label: 'Brake Test',        done: false },
      { id: 't3', label: 'Lights Check',      done: false },
      { id: 't4', label: 'Certificate Issue', done: false },
    ],
    taskProgress: 0,
  },
  {
    id: 'd4e5f6a7-b8c9-0123-def0-123456789003',
    tenantId: 't-test-001', customerId: null, vehicleId: null,
    status: 'confirmed',
    customerName: 'Sachini Fernando', customerPhone: '+94 77 333 9876', customerEmail: 'sachini@email.com',
    serviceType: 'AC Service, Oil Change',
    bookingDate: '2026-04-02', dropOffTime: '11:00 AM', pickupTime: '04:00 PM',
    vehicleMake: 'Suzuki', vehicleModel: 'Swift', vehicleYear: 2022, vehicleRego: 'SP-3456',
    notes: null,
    createdAt: '2026-03-29T10:00:00Z', updatedAt: '2026-04-01T14:00:00Z',
    tasks: [
      { id: 't1', label: 'AC Gas Refill',    done: true  },
      { id: 't2', label: 'AC Filter Clean',  done: true  },
      { id: 't3', label: 'Oil Change',       done: true  },
    ],
    taskProgress: 100,
  },
  {
    id: 'e5f6a7b8-c9d0-1234-ef01-234567890004',
    tenantId: 't-test-001', customerId: null, vehicleId: null,
    status: 'completed',
    customerName: 'Ruwan Bandara', customerPhone: '+94 70 222 8765', customerEmail: null,
    serviceType: 'Brake Inspection',
    bookingDate: '2026-03-28', dropOffTime: '08:00 AM', pickupTime: '01:00 PM',
    vehicleMake: 'Mitsubishi', vehicleModel: 'Outlander', vehicleYear: 2018, vehicleRego: 'CP-7890',
    notes: null,
    createdAt: '2026-03-25T07:00:00Z', updatedAt: '2026-03-28T13:00:00Z',
    tasks: [
      { id: 't1', label: 'Brake Pad Check',  done: true },
      { id: 't2', label: 'Brake Fluid',      done: true },
      { id: 't3', label: 'Rotor Inspection', done: true },
    ],
    taskProgress: 100,
  },
  {
    id: 'f6a7b8c9-d0e1-2345-f012-345678900005',
    tenantId: 't-test-001', customerId: null, vehicleId: null,
    status: 'completed',
    customerName: 'Kavindi Dissanayake', customerPhone: '+94 72 111 5432', customerEmail: 'kavindi@gmail.com',
    serviceType: 'Full Service Package',
    bookingDate: '2026-03-25', dropOffTime: '09:00 AM', pickupTime: '05:00 PM',
    vehicleMake: 'Toyota', vehicleModel: 'Prius', vehicleYear: 2020, vehicleRego: 'WP-2233',
    notes: null,
    createdAt: '2026-03-20T09:00:00Z', updatedAt: '2026-03-25T17:00:00Z',
    tasks: [
      { id: 't1', label: 'Oil Change',      done: true },
      { id: 't2', label: 'Filter Replace',  done: true },
      { id: 't3', label: 'Tyre Rotation',   done: true },
      { id: 't4', label: 'Full Inspection', done: true },
    ],
    taskProgress: 100,
  },
  {
    id: 'a7b8c9d0-e1f2-3456-0123-456789000006',
    tenantId: 't-test-001', customerId: null, vehicleId: null,
    status: 'cancelled',
    customerName: 'Priya Jayawardena', customerPhone: '+94 75 444 3210', customerEmail: null,
    serviceType: 'Wheel Alignment',
    bookingDate: '2026-03-20', dropOffTime: '10:00 AM', pickupTime: null,
    vehicleMake: 'Ford', vehicleModel: 'Ranger', vehicleYear: 2017, vehicleRego: 'SG-4455',
    notes: 'Customer cancelled due to schedule conflict.',
    createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-18T14:00:00Z',
  },
  {
    id: 'b8c9d0e1-f2a3-4567-1234-567890000007',
    tenantId: 't-test-001', customerId: null, vehicleId: null,
    status: 'cancelled',
    customerName: 'Dinesh Kumara', customerPhone: '+94 78 666 7654', customerEmail: 'dinesh.k@mail.com',
    serviceType: 'AC Service',
    bookingDate: '2026-03-15', dropOffTime: '02:00 PM', pickupTime: null,
    vehicleMake: 'Hyundai', vehicleModel: 'Tucson', vehicleYear: 2019, vehicleRego: 'NW-6677',
    notes: null,
    createdAt: '2026-03-10T12:00:00Z', updatedAt: '2026-03-13T09:00:00Z',
  },
];

const TODAY = '2026-04-02';

const BOOKINGS_BY_VIEW: Record<string, BookingRecordWithTasks[]> = {
  '/bookings/dashboard': ALL_MOCK_BOOKINGS.filter((b) => b.bookingDate === TODAY),
  '/bookings/pending':   ALL_MOCK_BOOKINGS.filter((b) => b.status === 'pending'),
  '/bookings/confirmed': ALL_MOCK_BOOKINGS.filter((b) => b.status === 'confirmed'),
  '/bookings/completed': ALL_MOCK_BOOKINGS.filter((b) => b.status === 'completed'),
  '/bookings/cancelled': ALL_MOCK_BOOKINGS.filter((b) => b.status === 'cancelled'),
};

const MOCK_BOOKING = ALL_MOCK_BOOKINGS[0];
const MOCK_OTHER_BOOKINGS = ALL_MOCK_BOOKINGS.slice(1, 4);

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BookingStatus, { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-amber-100 text-amber-800 border-amber-200' },
  confirmed: { label: 'Confirmed', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'Cancelled', className: 'bg-rose-100 text-rose-800 border-rose-200' },
};

const STATUS_ACTIONS: { from: BookingStatus; to: BookingStatus; label: string; variant: 'default' | 'outline' | 'destructive' }[] = [
  { from: 'pending',   to: 'confirmed', label: 'Confirm Booking',  variant: 'default' },
  { from: 'confirmed', to: 'completed', label: 'Mark Completed',   variant: 'default' },
  { from: 'pending',   to: 'cancelled', label: 'Cancel Booking',   variant: 'destructive' },
  { from: 'confirmed', to: 'cancelled', label: 'Cancel Booking',   variant: 'destructive' },
];

type PageMeta = { title: string; subtitle: string; icon: React.ReactNode };

const PAGE_META: Record<string, PageMeta> = {
  '/bookings/dashboard': { title: "Today's Bookings",   subtitle: 'View and manage bookings for today',  icon: <LayoutDashboard className="h-6 w-6 text-neutral-900" /> },
  '/bookings/pending':   { title: 'Booking Requests',   subtitle: 'Manage your workshop bookings',        icon: <Clock className="h-6 w-6 text-neutral-900" /> },
  '/bookings/confirmed': { title: 'Confirmed Bookings', subtitle: 'All confirmed upcoming bookings',      icon: <CheckCircle2 className="h-6 w-6 text-neutral-900" /> },
  '/bookings/completed': { title: 'Completed Bookings', subtitle: 'History of completed bookings',       icon: <Flag className="h-6 w-6 text-neutral-900" /> },
  '/bookings/cancelled': { title: 'Cancelled Bookings', subtitle: 'Bookings that have been cancelled',   icon: <Ban className="h-6 w-6 text-neutral-900" /> },
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
  const sc = STATUS_CONFIG[booking.status];
  const d = (() => { try { return format(parseISO(booking.bookingDate), 'EEE, dd MMM yyyy'); } catch { return booking.bookingDate; } })();
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
              {booking.serviceType.split(',').map((s) => (
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
  const bookings = BOOKINGS_BY_VIEW[pathname] ?? [];

  return (
    <div className="cc-fade-in flex-1 overflow-y-auto bg-[#f5f5f5]">

      {/* Dark banner */}
      <div className="relative overflow-hidden bg-neutral-900 px-8 py-7 flex items-center justify-between">
        <div className="absolute right-28 top-1/2 -translate-y-1/2 opacity-10 text-white text-[90px] pointer-events-none select-none">⚙</div>
        <div className="absolute right-10 bottom-[-10px] opacity-5 text-white text-[70px] pointer-events-none select-none rotate-[-20deg]">🔧</div>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 shadow-lg flex-shrink-0">
            {meta.icon}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{meta.title}</h1>
            <p className="text-sm text-neutral-400 mt-0.5">{meta.subtitle}</p>
          </div>
        </div>
        {/* <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-2 bg-amber-400 text-neutral-900 hover:bg-amber-500 font-semibold"
            onClick={() => navigate('/bookings/dashboard')}
          >
            <Plus className="h-4 w-4" /> Create Booking
          </Button>
        </div> */}
      </div>

      {/* Table */}
      <div className="p-6">
        {bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              {meta.icon}
            </div>
            <div className="text-lg font-semibold text-slate-500">{meta.title}</div>
            <p className="text-sm text-slate-400">No bookings found.</p>
          </div>
        ) : (
          <Card className="border-0 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Client & Service</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Vehicle</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      onView={() => navigate(`/bookings/${b.id}`)}
                    />
                  ))}
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
  const [booking, setBooking] = useState<BookingRecordWithTasks | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [expandedTaskCard, setExpandedTaskCard] = useState(false);

  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      const found = ALL_MOCK_BOOKINGS.find((b) => b.id === id) ?? MOCK_BOOKING;
      setBooking(found);
      setLoading(false);
    }, 800);
  }, [id]);

  const handleStatusChange = async (to: BookingStatus) => {
    if (!booking) return;
    setUpdating(true);
    try {
      await new Promise((res) => setTimeout(res, 600));
      setBooking({ ...booking, status: to });
      toast({ title: 'Status updated', description: `Booking marked as ${to}.` });
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Could not update status.', variant: 'destructive' });
    } finally {
      setUpdating(false);
    }
  };

  const statusCfg = booking ? STATUS_CONFIG[booking.status] : null;
  const availableActions = booking ? STATUS_ACTIONS.filter((a) => a.from === booking.status) : [];

  const formattedDate = booking?.bookingDate
    ? (() => { try { return format(parseISO(booking.bookingDate), 'EEEE, dd MMMM yyyy'); } catch { return booking.bookingDate; } })()
    : null;

  const vehicleLabel = [booking?.vehicleMake, booking?.vehicleModel, booking?.vehicleYear ? String(booking.vehicleYear) : null]
    .filter(Boolean).join(' ') || null;

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
              {loading
                ? <SkeletonBlock className="mt-1 h-3 w-20" />
                : booking
                  ? <div className="text-xs text-muted-foreground">#{booking.id.slice(0, 8).toUpperCase()}</div>
                  : null
              }
            </div>
          </div>
          {loading
            ? <SkeletonBlock className="h-6 w-20 rounded-full" />
            : statusCfg && (
              <Badge className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusCfg.className}`}>
                {statusCfg.label}
              </Badge>
            )
          }
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {loading && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              {[80, 48, 40].map((h, i) => (
                <Card key={i} className="border-0 bg-white shadow-sm">
                  <CardContent className="p-5 space-y-3">
                    <SkeletonBlock className="h-4 w-24" />
                    <Separator />
                    <div className="grid gap-3 sm:grid-cols-2 pt-1">
                      {Array.from({ length: h / 20 }).map((_, j) => (
                        <SkeletonBlock key={j} className="h-8 w-full" />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="space-y-4">
              <Card className="border-0 bg-slate-900 shadow-lg">
                <CardContent className="p-5 space-y-3">
                  <SkeletonBlock className="h-3 w-16 bg-slate-700" />
                  <SkeletonBlock className="h-9 w-full bg-slate-700 rounded-xl" />
                  <Separator className="bg-slate-700" />
                  <SkeletonBlock className="h-9 w-full bg-slate-700 rounded-lg" />
                  <SkeletonBlock className="h-9 w-full bg-slate-700 rounded-lg" />
                  <Separator className="bg-slate-700" />
                  <SkeletonBlock className="h-3 w-32 bg-slate-700" />
                  <SkeletonBlock className="h-3 w-32 bg-slate-700" />
                </CardContent>
              </Card>
              <SkeletonBlock className="h-9 w-full" />
            </div>
          </div>
        )}

        {!loading && !booking && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
            <CalendarDays className="h-10 w-10 text-slate-300" />
            <div className="text-lg font-semibold">Booking not found</div>
            <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
          </div>
        )}

        {!loading && booking && (
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
                  <Field label="Full name" value={booking.customerName} />
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-slate-900">{booking.customerPhone}</span>
                  </div>
                  {booking.customerEmail && (
                    <div className="flex items-center gap-2 text-sm sm:col-span-2">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-slate-900">{booking.customerEmail}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Service & Time */}
              <Card className="border-0 bg-white shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <Wrench className="h-4 w-4" /> Service & Time
                  </CardTitle>
                </CardHeader>
                <Separator />
                <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Service type</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {booking.serviceType.split(',').map((s) => (
                        <span key={s.trim()} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                          <CheckCircle2 className="h-3 w-3" />{s.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Date</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-900">
                      <CalendarDays className="h-3.5 w-3.5 text-slate-400" />{formattedDate}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Drop-off time</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-amber-600">
                      <Clock className="h-3.5 w-3.5" />{booking.dropOffTime}
                    </div>
                  </div>
                  {booking.pickupTime && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Pick-up time</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-sky-600">
                        <Clock className="h-3.5 w-3.5" />{booking.pickupTime}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Vehicle */}
              {(vehicleLabel || booking.vehicleRego) && (
                <Card className="border-0 bg-white shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <CarFront className="h-4 w-4" /> Vehicle
                    </CardTitle>
                  </CardHeader>
                  <Separator />
                  <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
                    <Field label="Vehicle" value={vehicleLabel} />
                    <Field label="Registration" value={booking.vehicleRego} />
                    <Field label="Year" value={booking.vehicleYear ? String(booking.vehicleYear) : null} />
                  </CardContent>
                </Card>
              )}

              {/* Notes */}
              {booking.notes && (
                <Card className="border-0 bg-white shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <FileText className="h-4 w-4" /> Notes
                    </CardTitle>
                  </CardHeader>
                  <Separator />
                  <CardContent className="pt-4">
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{booking.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right: actions */}
            <div>
              <div className="sticky top-24 space-y-4">
                {/* <Card className="border-0 bg-slate-900 text-white shadow-lg">
                  <CardContent className="p-5">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</div>
                    {statusCfg && (
                      <div className={`mt-2 rounded-xl border px-3 py-2 text-sm font-semibold ${statusCfg.className}`}>
                        {statusCfg.label}
                      </div>
                    )}
                    {availableActions.length > 0 && (
                      <>
                        <Separator className="my-4 bg-slate-700" />
                        <div className="space-y-2">
                          {availableActions.map((action) => (
                            <Button
                              key={action.to}
                              variant={action.variant}
                              className={`w-full font-semibold ${action.variant === 'default' ? 'bg-amber-400 text-slate-950 hover:bg-amber-500' : ''}`}
                              disabled={updating}
                              onClick={() => handleStatusChange(action.to)}
                            >
                              {action.label}
                            </Button>
                          ))}
                        </div>
                      </>
                    )}
                    {booking.status === 'completed' && (
                      <>
                        <Separator className="my-4 bg-slate-700" />
                        <div className="flex items-center gap-2 text-xs text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" /> Booking completed
                        </div>
                      </>
                    )}
                    <Separator className="my-4 bg-slate-700" />
                    <div className="space-y-1 text-xs text-slate-500">
                      <div>Created: <span className="text-slate-400">{booking.createdAt ? (() => { try { return format(parseISO(booking.createdAt), 'dd MMM yyyy HH:mm'); } catch { return booking.createdAt; } })() : '—'}</span></div>
                      <div>Updated: <span className="text-slate-400">{booking.updatedAt ? (() => { try { return format(parseISO(booking.updatedAt), 'dd MMM yyyy HH:mm'); } catch { return booking.updatedAt; } })() : '—'}</span></div>
                    </div>
                  </CardContent>
                </Card> */}

                <Button variant="outline" className="w-full" onClick={() => navigate(-1)}>
                  Back to Bookings
                </Button>

                {/* Customer booking history */}
                <Card className="border-0 bg-white shadow-sm overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Customer Bookings
                    </CardTitle>
                  </CardHeader>
                  <Separator />
                  <CardContent className="p-0">
                    {MOCK_OTHER_BOOKINGS.map((b, idx) => {
                      const sc = STATUS_CONFIG[b.status];
                      const d = (() => { try { return format(parseISO(b.bookingDate), 'dd MMM yyyy'); } catch { return b.bookingDate; } })();
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => navigate(`/bookings/${b.id}`)}
                          className={`w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${idx !== 0 ? 'border-t border-slate-100' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-slate-800">{b.serviceType}</div>
                              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                                <CalendarDays className="h-3 w-3" />{d}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
                                <Clock className="h-3 w-3" />{b.dropOffTime}
                              </div>
                            </div>
                            <Badge className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sc.className}`}>
                              {sc.label}
                            </Badge>
                          </div>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Task Progress Bar */}
                {booking.tasks && booking.tasks.length > 0 && (() => {
                  const doneCount = booking.tasks.filter(t => t.done).length;
                  const totalCount = booking.tasks.length;
                  const pct = booking.taskProgress || 0;
                  const isComplete = pct === 100;
                  return (
                    <Card className="border-0 bg-white shadow-sm overflow-hidden">
                      <CardContent className="p-3">
                        <button
                          onClick={() => setExpandedTaskCard((v) => !v)}
                          className="w-full text-left group"
                        >
                          <div className={`relative rounded-2xl border p-4 transition-all duration-500 overflow-hidden ${
                            isComplete
                              ? 'bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 border-emerald-200/80'
                              : 'bg-gradient-to-br from-neutral-50 via-white to-neutral-50/80 border-neutral-200/80'
                          }`}>

                            {/* Decorative background glow */}
                            {isComplete && (
                              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-400/10 rounded-full blur-2xl -translate-y-6 translate-x-6" />
                            )}

                            {/* Header row */}
                            <div className="flex items-center justify-between mb-3 relative z-10">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                  isComplete
                                    ? 'bg-emerald-500 shadow-md shadow-emerald-500/25'
                                    : 'bg-neutral-900 shadow-md shadow-neutral-900/15'
                                }`}>
                                  <i className={`fas ${isComplete ? 'fa-check-double' : 'fa-tasks'} text-white text-[10px]`} />
                                </div>
                                <div>
                                  <span className="text-[11px] font-extrabold text-neutral-800 tracking-tight">Service Progress</span>
                                  <p className="text-[9px] text-neutral-400 font-medium -mt-0.5">
                                    {isComplete
                                      ? 'All tasks completed'
                                      : `${totalCount - doneCount} task${totalCount - doneCount !== 1 ? 's' : ''} remaining`}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Circular percentage */}
                                <div className="relative w-10 h-10">
                                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="14" fill="none" stroke={isComplete ? '#d1fae5' : '#f5f5f5'} strokeWidth="3" />
                                    <circle
                                      cx="18" cy="18" r="14" fill="none"
                                      stroke={isComplete ? '#10b981' : pct > 50 ? '#f59e0b' : '#3b82f6'}
                                      strokeWidth="3"
                                      strokeLinecap="round"
                                      strokeDasharray={`${pct * 0.88} 88`}
                                      className="transition-all duration-1000 ease-out"
                                    />
                                  </svg>
                                  <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-black ${
                                    isComplete ? 'text-emerald-600' : 'text-neutral-700'
                                  }`}>
                                    {pct}%
                                  </span>
                                </div>
                                <i className={`fas fa-chevron-down text-[9px] text-neutral-400 transition-transform duration-300 ${
                                  expandedTaskCard ? 'rotate-180' : ''
                                }`} />
                              </div>
                            </div>

                            {/* Segmented step bars */}
                            <div className="flex items-center gap-1 relative z-10">
                              {booking.tasks.map((task, i) => (
                                <div key={task.id || i} className="flex-1">
                                  <div className={`w-full h-2 rounded-full transition-all duration-500 ${
                                    task.done
                                      ? isComplete
                                        ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-sm shadow-emerald-500/20'
                                        : 'bg-gradient-to-r from-amber-400 to-amber-500 shadow-sm shadow-amber-500/20'
                                      : 'bg-neutral-200/80'
                                  }`} />
                                </div>
                              ))}
                            </div>

                            {/* Expanded task list */}
                            {expandedTaskCard && (
                              <div className="mt-4 space-y-2 relative z-10">
                                <Separator className="mb-3" />
                                {booking.tasks.map((task, i) => (
                                  <div key={task.id || i} className="flex items-center gap-2.5">
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                                      task.done
                                        ? isComplete
                                          ? 'bg-emerald-500'
                                          : 'bg-amber-400'
                                        : 'bg-neutral-200'
                                    }`}>
                                      {task.done && <i className="fas fa-check text-white text-[7px]" />}
                                    </div>
                                    <span className={`text-xs ${
                                      task.done ? 'line-through text-neutral-400' : 'text-neutral-700 font-medium'
                                    }`}>
                                      {task.label}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </button>
                      </CardContent>
                    </Card>
                  );
                })()}

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