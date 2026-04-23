import '@/styles/dashboard.css';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { format, parseISO, startOfDay, isBefore } from 'date-fns';
import BookingSidebar from './BookingSidebar';
import {
  ArrowLeft, CalendarDays, CarFront, CheckCircle2, Clock,
  FileText, Phone, Mail, User, Wrench, Flag, Ban, LayoutDashboard,
  Eye, ChevronDown, ChevronUp, Activity, CalendarCheck, AlertCircle,
  Timer, CalendarRange,
} from 'lucide-react';
import {
  cancelBooking,
  confirmBookingWithStaff,
  getBookingAvailability,
  getBookingById,
  getBookings,
  getStaffForService,
  getWorkshopStaff,
  normalizeBookingAvailabilitySlots,
  patchBookingReschedule,
  resolveDefaultBranchId,
  resolveOwnerUid,
  trimBmsTimeLabel,
  type Booking,
  type BookingDetail,
  type BookingService,
  type BookingConfirmStaffAssignments,
  type BookingReschedulePayload,
  type BookingServiceDetail,
  type BookingTask,
  type WorkshopStaff,
} from '@/services/bookingsApi';
import type { BookingStatus } from '@/services/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

type PageMeta = { title: string; subtitle: string; icon: React.ReactNode };

const PAGE_META: Record<string, PageMeta> = {
  '/bookings/dashboard': { title: "Today's Bookings",   subtitle: 'All bookings for today',        icon: <LayoutDashboard className="h-6 w-6 text-white" /> },
  '/bookings/pending':   { title: 'Booking Requests',   subtitle: 'Awaiting confirmation',         icon: <Clock className="h-6 w-6 text-white" /> },
  '/bookings/confirmed': { title: 'Confirmed Bookings', subtitle: 'Confirmed and upcoming',        icon: <CalendarCheck className="h-6 w-6 text-white" /> },
  '/bookings/completed': { title: 'Completed Bookings', subtitle: 'Successfully completed jobs',   icon: <Flag className="h-6 w-6 text-white" /> },
  '/bookings/cancelled': { title: 'Cancelled Bookings', subtitle: 'Cancelled or rejected bookings',icon: <Ban className="h-6 w-6 text-white" /> },
};

const RESCHEDULE_PATHNAMES = new Set([
  '/bookings/dashboard',
  '/bookings/pending',
  '/bookings/confirmed',
]);

function toMinutesOptional(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

function generateTimeSlots(start: string, end: string, step = 30): string[] {
  const slots: string[] = [];
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let total = sh * 60 + sm;
  const endTotal = eh * 60 + em;
  while (total <= endTotal) {
    const h = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const m = (total % 60).toString().padStart(2, '0');
    slots.push(`${h}:${m}`);
    total += step;
  }
  return slots;
}

function canShowRescheduleAction(pathname: string, status: string): boolean {
  if (!RESCHEDULE_PATHNAMES.has(pathname)) return false;
  const s = status.toLowerCase();
  return s === 'pending' || s === 'confirmed';
}

type BookingRecordWithTasks = {
  id: string;
  bookingCode:string;
  status: string;
  branchId: string;
  branchName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceType: string;
  bookingDate: string;
  dropOffTime: string;
  pickupTime: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehicleRego: string;
  notes: string;
  tasks: BookingTask[];
  totalPrice: number;
  progress: { completed: number; total: number; percentage: number };
};

const MOCK_OTHER_BOOKINGS: BookingRecordWithTasks[] = [];

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-amber-100 text-amber-800 border-amber-200' },
  confirmed: { label: 'Confirmed', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  Canceled: { label: 'Cancelled', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  canceled:  { label: 'Canceled',  className: 'bg-rose-100 text-rose-800 border-rose-200' },
  cancelled: { label: 'Cancelled', className: 'bg-rose-100 text-rose-800 border-rose-200' },
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
  const { session } = useAuth();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<BookingRecordWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerUidForApi, setOwnerUidForApi] = useState('');
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
  const [confirmModalBooking, setConfirmModalBooking] =
    useState<BookingRecordWithTasks | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmModalLoading, setConfirmModalLoading] = useState(false);
  const [confirmStaffByService, setConfirmStaffByService] = useState<
    Record<string, WorkshopStaff[]>
  >({});
  const [confirmServices, setConfirmServices] = useState<BookingServiceDetail[]>([]);
  const [serviceStaffAssignments, setServiceStaffAssignments] = useState<Record<string, string>>({});

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleBooking, setRescheduleBooking] =
    useState<BookingRecordWithTasks | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleServices, setRescheduleServices] = useState<BookingServiceDetail[]>([]);
  const [rescheduleBranchId, setRescheduleBranchId] = useState('');
  const [rescheduleStaffByService, setRescheduleStaffByService] = useState<
    Record<string, WorkshopStaff[]>
  >({});
  const [rescheduleStaffAssignments, setRescheduleStaffAssignments] = useState<
    Record<string, string>
  >({});
  const [rescheduleNewDate, setRescheduleNewDate] = useState('');
  const [rescheduleNewDropTime, setRescheduleNewDropTime] = useState('');
  const [rescheduleNewPickupTime, setRescheduleNewPickupTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  // Reschedule: GET /bookings/availability — workshop open hours / capacity for the chosen date + services.
  const [rescheduleAvailSlots, setRescheduleAvailSlots] = useState<string[]>([]);
  const [rescheduleAvailabilityLoading, setRescheduleAvailabilityLoading] =
    useState(false);
  const [rescheduleAvailabilityError, setRescheduleAvailabilityError] = useState<
    string | null
  >(null);
  const [rescheduleAvailabilityDone, setRescheduleAvailabilityDone] =
    useState(false);

  const rescheduleServiceIds = useMemo(
    () => rescheduleServices.map((s) => s.id).join(','),
    [rescheduleServices],
  );

  const showPendingActions =
    pathname === '/bookings/dashboard' || pathname === '/bookings/pending';

  const loadBookings = useCallback(async () => {
    const stateOwnerId = location.state?.ownerId;
    const stateBranchId = location.state?.branchId;

    if (stateOwnerId) localStorage.setItem('cc_last_owner_id', stateOwnerId);
    if (stateBranchId) localStorage.setItem('cc_last_branch_id', stateBranchId);

    const ownerUid =
      stateOwnerId ||
      localStorage.getItem('cc_last_owner_id') ||
      (await resolveOwnerUid(session?.tenantId));
    const branchId =
      stateBranchId ||
      localStorage.getItem('cc_last_branch_id') ||
      (await resolveDefaultBranchId(session?.tenantId)) ||
      undefined;

    if (!ownerUid) {
      setBookings([]);
      setOwnerUidForApi('');
      setLoading(false);
      return;
    }

    setOwnerUidForApi(ownerUid);
    setLoading(true);

    try {
      const data = await getBookings(ownerUid, 100, branchId);
      //console.log('bookings', data);
      let filtered = data;
      if (branchId) {
        filtered = filtered.filter(b => b.branchId === branchId);
      }
      const mapped = filtered.map(b => ({
        id: b.id,
        bookingCode: (b as any).bookingCode || '',
        status: ((b as any).status || 'pending').toLowerCase(),
        branchId: b.branchId || '',
        branchName: b.branchName || '',
        customerName: (b as any).clientName || b.client || 'Unknown',
        customerPhone: b.clientPhone || '',
        customerEmail: b.clientEmail || '',
        serviceType: b.services?.map((s: any) => s.serviceName || s.name).join(', ') || 'General Service',
        bookingDate: b.date || '',
        dropOffTime: b.time || '',
        pickupTime: b.pickupTime || '',
        vehicleMake: (b as any).vehicleMake || '',
        vehicleModel: '',
        vehicleYear: null,
        vehicleRego: b.vehicleNumber || '',
        notes: b.notes || '',
        tasks: [],
        totalPrice: (b as any).totalPrice ?? 0,
        progress: (b as any).progress ?? { completed: 0, total: 0, percentage: 0 },
      }));
      const todayStr = new Date().toISOString().slice(0, 10);
      let finalBookings = mapped;
      if (pathname === '/bookings/dashboard') {
        finalBookings = mapped.filter(b => b.bookingDate === todayStr);
      } else if (pathname === '/bookings/pending') {
        finalBookings = mapped.filter(b => b.status === 'pending');
      } else if (pathname === '/bookings/confirmed') {
        finalBookings = mapped.filter(b => b.status === 'confirmed');
      } else if (pathname === '/bookings/completed') {
        finalBookings = mapped.filter(b => b.status === 'completed');
      } else if (pathname === '/bookings/cancelled') {
        finalBookings = mapped.filter(b => b.status === 'cancelled' || b.status === 'canceled');
      }
      setBookings(finalBookings);
    } catch {
      // console.error(e);
    } finally {
      setLoading(false);
    }
  }, [pathname, location.state, session?.tenantId]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // Reschedule: per-service staff for the *new* date (separate from open-hours check below).
  const syncRescheduleStaffForDate = useCallback(
    async (
      dateStr: string,
      services: BookingServiceDetail[],
      branchId: string,
    ) => {
      if (!ownerUidForApi || !dateStr || !branchId || services.length === 0) {
        setRescheduleStaffByService({});
        setRescheduleStaffAssignments({});
        return;
      }
      const staffLists = await Promise.all(
        services.map(async (svc) => {
          try {
            const staff = await getStaffForService(ownerUidForApi, svc.id, {
              branchId,
              date: dateStr,
            });
            return [svc.id, staff] as const;
          } catch {
            return [svc.id, []] as const;
          }
        }),
      );
      const bySvc = Object.fromEntries(staffLists) as Record<string, WorkshopStaff[]>;
      const assignments: Record<string, string> = {};
      for (const svc of services) {
        const pool = bySvc[svc.id] ?? [];
        const match =
          pool.find((w) => w.id === svc.staffId) ||
          pool.find((w) => w.name === svc.staffName);
        if (match) assignments[svc.id] = match.id;
      }
      setRescheduleStaffByService(bySvc);
      setRescheduleStaffAssignments(assignments);
    },
    [ownerUidForApi],
  );

  useEffect(() => {
    if (
      !rescheduleOpen ||
      !rescheduleNewDate ||
      !rescheduleBranchId ||
      !rescheduleServiceIds
    ) {
      return;
    }
    void syncRescheduleStaffForDate(
      rescheduleNewDate,
      rescheduleServices,
      rescheduleBranchId,
    );
  }, [
    rescheduleOpen,
    rescheduleNewDate,
    rescheduleBranchId,
    rescheduleServiceIds,
    rescheduleServices,
    syncRescheduleStaffForDate,
  ]);

  // Reschedule: booking availability — block saving when branch has no open slots for this date/service mix.
  useEffect(() => {
    if (!rescheduleOpen || !rescheduleNewDate || !rescheduleBranchId || !ownerUidForApi) {
      return;
    }

    if (rescheduleServices.length === 0) {
      setRescheduleAvailSlots([]);
      setRescheduleAvailabilityError(null);
      setRescheduleAvailabilityLoading(false);
      setRescheduleAvailabilityDone(true);
      return;
    }

    let cancelled = false;
    setRescheduleAvailabilityLoading(true);
    setRescheduleAvailabilityDone(false);
    setRescheduleAvailabilityError(null);

    const serviceIds = rescheduleServices.map((s) => s.id);

    void (async () => {
      try {
        const avail = await getBookingAvailability(
          ownerUidForApi,
          rescheduleBranchId,
          rescheduleNewDate,
          serviceIds,
        );
        if (cancelled) return;
        const slots = Array.isArray(avail.availableSlots)
          ? avail.availableSlots
          : [];
        setRescheduleAvailSlots(slots);
      } catch (e) {
        if (cancelled) return;
        setRescheduleAvailSlots([]);
        setRescheduleAvailabilityError(
          e instanceof Error ? e.message : 'Could not load availability.',
        );
      } finally {
        if (!cancelled) {
          setRescheduleAvailabilityLoading(false);
          setRescheduleAvailabilityDone(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    rescheduleOpen,
    rescheduleNewDate,
    rescheduleBranchId,
    rescheduleServiceIds,
    ownerUidForApi,
    rescheduleServices,
  ]);

  const openConfirmModal = useCallback(
    async (booking: BookingRecordWithTasks) => {
      if (!ownerUidForApi) {
        toast({
          variant: 'destructive',
          title: 'Cannot confirm',
          description: 'Workshop context is missing.',
        });
        return;
      }
      setConfirmModalBooking(booking);
      setConfirmModalOpen(true);
      setConfirmModalLoading(true);
      try {
        const bookingDetail = await getBookingById(ownerUidForApi, booking.id);
        const services = bookingDetail.services ?? [];
        const bookingBranchId =
          bookingDetail.booking?.branchId || booking.branchId || '';
        const bookingDate = bookingDetail.booking?.date || booking.bookingDate || '';

        if (bookingBranchId) {
          await getWorkshopStaff(ownerUidForApi, {
            branchId: bookingBranchId,
            status: 'Active',
          }).catch((err) => {
            console.warn(
              '[openConfirmModal] getWorkshopStaff failed; per-service staff still loads.',
              err,
            );
            return [];
          });
        }

        const staffLists = await Promise.all(
          services.map(async (svc) => {
            if (!bookingBranchId || !bookingDate) return [svc.id, []] as const;
            try {
              const staff = await getStaffForService(ownerUidForApi, svc.id, {
                branchId: bookingBranchId,
                date: bookingDate,
              });
              return [svc.id, staff] as const;
            } catch {
              return [svc.id, []] as const;
            }
          }),
        );
        const staffByService = Object.fromEntries(staffLists) as Record<
          string,
          WorkshopStaff[]
        >;
        const assignments: Record<string, string> = {};
        for (const svc of services) {
          const options = staffByService[svc.id] ?? [];
          const match =
            options.find((s) => s.id === svc.staffId) ||
            options.find((s) => s.name === svc.staffName);
          if (match) assignments[svc.id] = match.id;
        }
        setConfirmStaffByService(staffByService);
        setConfirmServices(services);
        setServiceStaffAssignments(assignments);
      } catch (e) {
        setConfirmStaffByService({});
        setConfirmServices([]);
        setServiceStaffAssignments({});
        toast({
          variant: 'destructive',
          title: 'Failed to load staff/services',
          description:
            e instanceof Error ? e.message : 'Could not load confirmation data.',
        });
      } finally {
        setConfirmModalLoading(false);
      }
    },
    [ownerUidForApi, toast],
  );

  const handleCancelBookingRequest = useCallback(
    async (bookingId: string) => {
      if (!ownerUidForApi) {
        toast({
          variant: 'destructive',
          title: 'Cannot update',
          description:
            'Workshop context is missing. Open bookings from the dashboard with a tenant selected.',
        });
        return;
      }
      setUpdatingBookingId(bookingId);
      try {
        await cancelBooking(ownerUidForApi, bookingId);
        toast({
          title: 'Booking canceled',
          description: 'The request has been canceled.',
        });
        await loadBookings();
      } catch (e) {
        toast({
          variant: 'destructive',
          title: 'Update failed',
          description:
            e instanceof Error ? e.message : 'Could not cancel this booking.',
        });
      } finally {
        setUpdatingBookingId(null);
      }
    },
    [ownerUidForApi, toast, loadBookings],
  );

  const handleConfirmBookingWithStaff = useCallback(
    async (
      bookingId: string,
      services: BookingServiceDetail[],
      assignments: Record<string, string>,
      staffByService: Record<string, WorkshopStaff[]>,
    ): Promise<boolean> => {
      if (!ownerUidForApi) {
        toast({
          variant: 'destructive',
          title: 'Cannot confirm',
          description:
            'Workshop context is missing. Open bookings from the dashboard with a tenant selected.',
        });
        return false;
      }
      const staffAssignments: BookingConfirmStaffAssignments = {};
      for (const s of services) {
        const staffId = assignments[s.id];
        if (!staffId) {
          toast({
            variant: 'destructive',
            title: 'Cannot confirm',
            description: 'Assign staff for every service before confirming.',
          });
          return false;
        }
        const pool = staffByService[s.id] ?? [];
        const member = pool.find((w) => w.id === staffId);
        staffAssignments[s.id] = {
          staffId,
          staffName: member?.name?.trim() || staffId,
        };
      }

      setUpdatingBookingId(bookingId);
      try {
        await confirmBookingWithStaff(ownerUidForApi, bookingId, staffAssignments);
        toast({
          title: 'Booking confirmed',
          description: 'Staff assignments were sent and the booking was confirmed.',
        });
        await loadBookings();
        return true;
      } catch (e) {
        toast({
          variant: 'destructive',
          title: 'Confirm failed',
          description:
            e instanceof Error ? e.message : 'Could not confirm this booking.',
        });
        return false;
      } finally {
        setUpdatingBookingId(null);
      }
    },
    [ownerUidForApi, toast, loadBookings],
  );

  const openRescheduleModal = useCallback(
    async (booking: BookingRecordWithTasks) => {
      if (!ownerUidForApi) {
        toast({
          variant: 'destructive',
          title: 'Cannot reschedule',
          description: 'Workshop context is missing.',
        });
        return;
      }
      setRescheduleBooking(booking);
      setRescheduleNewDate(booking.bookingDate);
      setRescheduleNewDropTime(trimBmsTimeLabel(booking.dropOffTime));
      setRescheduleNewPickupTime(trimBmsTimeLabel(booking.pickupTime));
      setRescheduleReason('');
      setRescheduleOpen(true);
      setRescheduleLoading(true);
      setRescheduleServices([]);
      setRescheduleStaffByService({});
      setRescheduleStaffAssignments({});
      setRescheduleBranchId('');
      setRescheduleAvailSlots([]);
      setRescheduleAvailabilityError(null);
      setRescheduleAvailabilityLoading(false);
      setRescheduleAvailabilityDone(false);
      try {
        const detail = await getBookingById(ownerUidForApi, booking.id);
        const services = detail.services ?? [];
        const br = detail.booking?.branchId || booking.branchId || '';
        setRescheduleBranchId(br);
        setRescheduleServices(services);
      } catch (e) {
        toast({
          variant: 'destructive',
          title: 'Failed to load booking',
          description:
            e instanceof Error ? e.message : 'Could not open reschedule.',
        });
        setRescheduleOpen(false);
        setRescheduleBooking(null);
      } finally {
        setRescheduleLoading(false);
      }
    },
    [ownerUidForApi, toast],
  );

  const handleRescheduleSubmit = useCallback(async (): Promise<boolean> => {
    if (!ownerUidForApi || !rescheduleBooking) return false;
    if (!rescheduleNewDate.trim() || !rescheduleNewDropTime.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Choose a new date and drop-off time.',
      });
      return false;
    }

    // Drop-off must fall in BMS availability when we have services + a loaded slot list (workshop open hours).
    const allowedSlots = normalizeBookingAvailabilitySlots(rescheduleAvailSlots);
    if (rescheduleServices.length > 0 && allowedSlots.length > 0) {
      const dropNorm = trimBmsTimeLabel(rescheduleNewDropTime);
      if (!allowedSlots.includes(dropNorm)) {
        toast({
          variant: 'destructive',
          title: 'Invalid drop-off time',
          description:
            'Choose a drop-off time from the available slots for this date.',
        });
        return false;
      }
    }
    if (
      rescheduleServices.length > 0 &&
      rescheduleAvailabilityDone &&
      !rescheduleAvailabilityLoading &&
      allowedSlots.length === 0 &&
      !rescheduleAvailabilityError
    ) {
      toast({
        variant: 'destructive',
        title: 'Workshop not available',
        description:
          'No open slots on this date for these services. Pick another day.',
      });
      return false;
    }
    if (rescheduleAvailabilityError) {
      toast({
        variant: 'destructive',
        title: 'Cannot reschedule',
        description: rescheduleAvailabilityError,
      });
      return false;
    }

    const dropM = toMinutesOptional(rescheduleNewDropTime);
    const pickM = toMinutesOptional(rescheduleNewPickupTime);
    if (
      rescheduleNewPickupTime.trim() &&
      dropM != null &&
      pickM != null &&
      pickM < dropM
    ) {
      toast({
        variant: 'destructive',
        title: 'Invalid times',
        description: 'Pick-up must be on or after drop-off.',
      });
      return false;
    }

    const payload: BookingReschedulePayload = {
      newDate: rescheduleNewDate.trim(),
      newTime: rescheduleNewDropTime.trim(),
    };
    if (rescheduleNewPickupTime.trim()) {
      payload.newPickupTime = rescheduleNewPickupTime.trim();
    }
    if (rescheduleReason.trim()) {
      payload.reason = rescheduleReason.trim();
    }

    const staffAssignments: BookingConfirmStaffAssignments = {};
    for (const s of rescheduleServices) {
      const sid = rescheduleStaffAssignments[s.id];
      if (!sid) continue;
      const pool = rescheduleStaffByService[s.id] ?? [];
      const member = pool.find((w) => w.id === sid);
      staffAssignments[s.id] = {
        staffId: sid,
        staffName: member?.name?.trim() || sid,
      };
    }
    if (Object.keys(staffAssignments).length > 0) {
      payload.staffAssignments = staffAssignments;
    }

    setUpdatingBookingId(rescheduleBooking.id);
    try {
      await patchBookingReschedule(
        ownerUidForApi,
        rescheduleBooking.id,
        payload,
      );
      toast({
        title: 'Booking rescheduled',
        description:
          'The customer will be notified of the new date and time.',
      });
      await loadBookings();
      return true;
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Reschedule failed',
        description:
          e instanceof Error ? e.message : 'Could not reschedule this booking.',
      });
      return false;
    } finally {
      setUpdatingBookingId(null);
    }
  }, [
    ownerUidForApi,
    rescheduleBooking,
    rescheduleNewDate,
    rescheduleNewDropTime,
    rescheduleNewPickupTime,
    rescheduleReason,
    rescheduleServices,
    rescheduleStaffAssignments,
    rescheduleStaffByService,
    rescheduleAvailSlots,
    rescheduleAvailabilityDone,
    rescheduleAvailabilityLoading,
    rescheduleAvailabilityError,
    toast,
    loadBookings,
  ]);

  const rescheduleTimeSlots = useMemo(
    () => generateTimeSlots('06:00', '21:00', 30),
    [],
  );

  const rescheduleAvailSlotsNormalized = useMemo(
    () => normalizeBookingAvailabilitySlots(rescheduleAvailSlots),
    [rescheduleAvailSlots],
  );

  // Prefer BMS availability slots; generic grid only before response or when there are no line items.
  const rescheduleDropOptions = useMemo(() => {
    if (rescheduleAvailSlotsNormalized.length > 0) {
      return rescheduleAvailSlotsNormalized;
    }
    return rescheduleTimeSlots;
  }, [rescheduleAvailSlotsNormalized, rescheduleTimeSlots]);

  const reschedulePickupOptions = useMemo(() => {
    const dropM = toMinutesOptional(rescheduleNewDropTime);
    if (dropM == null) return rescheduleDropOptions;
    return rescheduleDropOptions.filter(
      (t) => (toMinutesOptional(t) ?? 0) >= dropM,
    );
  }, [rescheduleDropOptions, rescheduleNewDropTime]);

  const rescheduleSaveBlockedMessage = useMemo(() => {
    if (!rescheduleOpen) return '';
    if (rescheduleServices.length === 0) return '';
    if (rescheduleAvailabilityLoading) return '';
    if (!rescheduleAvailabilityDone) return '';
    if (rescheduleAvailabilityError) return rescheduleAvailabilityError;
    if (rescheduleAvailSlotsNormalized.length === 0) {
      return 'No open slots on this date. The workshop may be closed or fully booked for these services.';
    }
    const drop = trimBmsTimeLabel(rescheduleNewDropTime);
    if (drop && !rescheduleAvailSlotsNormalized.includes(drop)) {
      return 'Pick a drop-off time from the available list for this date.';
    }
    return '';
  }, [
    rescheduleOpen,
    rescheduleServices.length,
    rescheduleAvailabilityLoading,
    rescheduleAvailabilityDone,
    rescheduleAvailabilityError,
    rescheduleAvailSlotsNormalized,
    rescheduleNewDropTime,
  ]);

  // If drop-off moves later, clear pick-up when it would be before the new drop-off.
  useEffect(() => {
    if (!rescheduleOpen || !rescheduleNewPickupTime.trim()) return;
    const pick = trimBmsTimeLabel(rescheduleNewPickupTime);
    if (!reschedulePickupOptions.includes(pick)) {
      setRescheduleNewPickupTime('');
    }
  }, [
    rescheduleOpen,
    rescheduleNewDropTime,
    reschedulePickupOptions,
    rescheduleNewPickupTime,
  ]);

  const rescheduleCalendarSelected = useMemo(() => {
    if (!rescheduleNewDate || rescheduleNewDate.length < 10) return undefined;
    try {
      return parseISO(`${rescheduleNewDate.slice(0, 10)}T12:00:00`);
    } catch {
      return undefined;
    }
  }, [rescheduleNewDate]);

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
        ) : null}

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
                    const d = (() => { try { return format(parseISO(b.bookingDate), 'dd MMM yyyy'); } catch { return b.bookingDate; } })();
                    return (
                      <tr
                        key={b.id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-bold text-white">
                              {b.customerName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{b.customerName}</div>
                              {b.bookingCode && (
                                <div className="mt-0.5 inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                                  #{b.bookingCode}
                                </div>
                              )}
                              <div className="mt-1 flex flex-wrap gap-1">
                                {String(b.serviceType || '').split(',').map((s) => (
                                  <span key={s.trim()} className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200">
                                    {s.trim()}
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
                            <Clock className="h-3.5 w-3.5" />{b.dropOffTime}
                          </div>
                          {b.pickupTime && (
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-sky-600">
                              <Clock className="h-3.5 w-3.5" />{b.pickupTime}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {b.vehicleRego || '—'}
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
                          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs"
                              onClick={() => navigate(`/bookings/${b.id}`)}
                            >
                              <Eye className="h-3.5 w-3.5" /> View
                            </Button>
                            {canShowRescheduleAction(pathname, b.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 border-blue-200 text-xs text-blue-700 hover:bg-blue-50"
                                disabled={Boolean(updatingBookingId)}
                                onClick={() => openRescheduleModal(b)}
                              >
                                <CalendarRange className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                                Reschedule
                              </Button>
                            )}
                            {showPendingActions && b.status === 'pending' && (
                              <div className="flex flex-wrap gap-1">
                                <Button
                                  size="sm"
                                  className="gap-1 bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700"
                                  disabled={updatingBookingId === b.id}
                                  onClick={() => openConfirmModal(b)}
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  {updatingBookingId === b.id ? '…' : 'Confirm'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 border-rose-300 px-2 text-xs text-rose-700 hover:bg-rose-50"
                                  disabled={updatingBookingId === b.id}
                                  onClick={() => handleCancelBookingRequest(b.id)}
                                >
                                  <Ban className="h-3 w-3" />
                                  Cancel
                                </Button>
                              </div>
                            )}
                          </div>
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

      <Dialog
        open={confirmModalOpen}
        onOpenChange={(open) => {
          setConfirmModalOpen(open);
          if (!open) {
            setConfirmModalBooking(null);
            setConfirmStaffByService({});
            setConfirmServices([]);
            setServiceStaffAssignments({});
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Confirm Booking
              {confirmModalBooking?.bookingCode
                ? ` #${confirmModalBooking.bookingCode}`
                : ''}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div><span className="font-semibold">Customer:</span> {confirmModalBooking?.customerName || '—'}</div>
              <div><span className="font-semibold">Branch:</span> {confirmModalBooking?.branchName || '—'}</div>
            </div>

            {confirmModalLoading ? (
              <div className="py-4 text-sm text-slate-500">Loading staff and services…</div>
            ) : (
              <div className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Services ({confirmServices.length})
                  </div>
                  <div className="max-h-48 space-y-1 overflow-y-auto text-sm">
                    {confirmServices.length === 0 ? (
                      <div className="text-slate-500">No booking services found.</div>
                    ) : (
                      confirmServices.map((s) => (
                        <div key={s.id} className="rounded-md bg-slate-50 px-2 py-1">
                          <div className="font-medium text-slate-800">{s.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            ${Number(s.price || 0).toLocaleString()} • {s.duration || 0} min
                          </div>
                          <select
                            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                            value={serviceStaffAssignments[s.id] || ''}
                            onChange={(e) =>
                              setServiceStaffAssignments((prev) => ({
                                ...prev,
                                [s.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Select staff…</option>
                            {(confirmStaffByService[s.id] ?? []).map((staff) => (
                              <option key={staff.id} value={staff.id}>
                                {staff.name}
                                {staff.staffRole ? ` (${staff.staffRole})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))
                    )}
                  </div>
              </div>
            )}

            {!confirmModalLoading &&
              confirmServices.length > 0 &&
              confirmServices.some((s) => !serviceStaffAssignments[s.id]) && (
                <p className="text-xs text-amber-700">
                  Please assign a staff member for every service before confirming.
                </p>
              )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmModalOpen(false)}
                disabled={Boolean(updatingBookingId)}
              >
                Close
              </Button>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={
                  !confirmModalBooking ||
                  Boolean(updatingBookingId) ||
                  confirmServices.some((s) => !serviceStaffAssignments[s.id])
                }
                onClick={async () => {
                  if (!confirmModalBooking) return;
                  const ok = await handleConfirmBookingWithStaff(
                    confirmModalBooking.id,
                    confirmServices,
                    serviceStaffAssignments,
                    confirmStaffByService,
                  );
                  if (ok) setConfirmModalOpen(false);
                }}
              >
                {updatingBookingId === confirmModalBooking?.id ? 'Confirming…' : 'Confirm Booking'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rescheduleOpen}
        onOpenChange={(open) => {
          setRescheduleOpen(open);
          if (!open) {
            setRescheduleBooking(null);
            setRescheduleServices([]);
            setRescheduleStaffByService({});
            setRescheduleStaffAssignments({});
            setRescheduleBranchId('');
            setRescheduleNewDate('');
            setRescheduleNewDropTime('');
            setRescheduleNewPickupTime('');
            setRescheduleReason('');
            setRescheduleAvailSlots([]);
            setRescheduleAvailabilityError(null);
            setRescheduleAvailabilityLoading(false);
            setRescheduleAvailabilityDone(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-blue-600" />
              Reschedule booking
              {rescheduleBooking?.bookingCode
                ? ` #${rescheduleBooking.bookingCode}`
                : ''}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Current date and time
              </div>
              {rescheduleBooking ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-800">
                    <span className="font-medium">
                      {(() => {
                        try {
                          return format(
                            parseISO(rescheduleBooking.bookingDate),
                            'yyyy-MM-dd',
                          );
                        } catch {
                          return rescheduleBooking.bookingDate;
                        }
                      })()}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span>{rescheduleBooking.dropOffTime || '—'}</span>
                    {rescheduleBooking.pickupTime ? (
                      <>
                        <span className="text-slate-400">·</span>
                        <span>{rescheduleBooking.pickupTime}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="text-xs text-slate-600">
                    {rescheduleBooking.branchName || 'Branch'}
                  </div>
                </>
              ) : (
                <div className="text-slate-500">—</div>
              )}
            </div>

            {rescheduleLoading ? (
              <div className="py-4 text-sm text-slate-500">Loading booking…</div>
            ) : (
             <>


<div className="grid gap-6 lg:grid-cols-2">

{/* 🔹 LEFT SIDE — Calendar */}
<div>
  <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
    New date
  </Label>

  <Calendar
    mode="single"
    selected={rescheduleCalendarSelected}
    onSelect={(d) => {
      if (!d) return;
      setRescheduleNewDate(format(d, 'yyyy-MM-dd'));
    }}
    disabled={(d) =>
      isBefore(startOfDay(d), startOfDay(new Date()))
    }
    fromDate={new Date()}
    className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
  />
</div>

{/* 🔹 RIGHT SIDE — Time Slots */}
<div className="space-y-4">

  {/* Drop-off (ONLY ≤ 11:00) */}
  <div>
    <Label>Drop-off time</Label>
    <div className="mt-2 grid grid-cols-3 gap-2">
      {rescheduleDropOptions
        .filter((t) => t <= "11:00")
        .map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setRescheduleNewDropTime(t)}
            className={`px-3 py-2 text-sm rounded-md border 
              ${
                rescheduleNewDropTime === t
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
              }`}
          >
            {t}
          </button>
        ))}
    </div>
  </div>

  {/* Pick-up (ONLY ≥ 14:00) */}
  <div>
    <Label>Pick-up time (optional)</Label>

    <div className="mt-2 grid grid-cols-3 gap-2">
      <button
        type="button"
        onClick={() => setRescheduleNewPickupTime("")}
        className={`px-3 py-2 text-sm rounded-md border
          ${
            rescheduleNewPickupTime === ""
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
          }`}
      >
        None
      </button>

      {reschedulePickupOptions
        .filter((t) => t >= "14:00")
        .map((t) => (
          <button
            key={`p-${t}`}
            type="button"
            onClick={() => setRescheduleNewPickupTime(t)}
            className={`px-3 py-2 text-sm rounded-md border
              ${
                rescheduleNewPickupTime === t
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
              }`}
          >
            {t}
          </button>
        ))}
    </div>
  </div>

</div>

</div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Assigned staff (optional)
                  </div>
                  <p className="mb-2 text-xs text-slate-500">
                    Reassigning will notify the new staff. Staff lists use the new date and branch.
                  </p>
                  <div className="max-h-40 space-y-2 overflow-y-auto text-sm">
                    {rescheduleServices.length === 0 ? (
                      <div className="text-slate-500">No services on this booking.</div>
                    ) : (
                      rescheduleServices.map((s) => (
                        <div key={s.id} className="rounded-md bg-slate-50 px-2 py-2">
                          <div className="font-medium text-slate-800">{s.name}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            Currently: {s.staffName || '—'}
                          </div>
                          <select
                            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                            value={rescheduleStaffAssignments[s.id] || ''}
                            onChange={(e) =>
                              setRescheduleStaffAssignments((prev) => ({
                                ...prev,
                                [s.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Keep / clear selection…</option>
                            {(rescheduleStaffByService[s.id] ?? []).map((staff) => (
                              <option key={staff.id} value={staff.id}>
                                {staff.name}
                                {staff.staffRole ? ` (${staff.staffRole})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="cc-reschedule-reason">Reason (optional)</Label>
                  <Textarea
                    id="cc-reschedule-reason"
                    className="mt-1.5 min-h-[72px] text-sm"
                    placeholder="e.g. Customer requested a later slot, staff unavailable…"
                    value={rescheduleReason}
                    onChange={(e) => setRescheduleReason(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    The customer may be emailed the new date and time; changes are recorded in the audit log.
                  </p>
                </div>
              </>
            )}

            {rescheduleSaveBlockedMessage && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                Cannot save reschedule: {rescheduleSaveBlockedMessage}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button
                variant="outline"
                onClick={() => setRescheduleOpen(false)}
                disabled={Boolean(updatingBookingId)}
              >
                Cancel
              </Button>
              <Button
                className="bg-blue-600 text-white hover:bg-blue-700"
                disabled={
                  !rescheduleBooking ||
                  Boolean(updatingBookingId) ||
                  rescheduleLoading ||
                  rescheduleAvailabilityLoading ||
                  Boolean(rescheduleSaveBlockedMessage) ||
                  !rescheduleNewDate ||
                  !rescheduleNewDropTime
                }
                onClick={async () => {
                  const ok = await handleRescheduleSubmit();
                  if (ok) setRescheduleOpen(false);
                }}
              >
                {updatingBookingId === rescheduleBooking?.id
                  ? 'Saving…'
                  : 'Save reschedule'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Agent access timer ────────────────────────────────────────────────────────

const AGENT_ACCESS_DURATION = 5 * 60; // 5 minutes in seconds

function useAccessCountdown(onExpire: () => void) {
  const { session } = useAuth();
  const isAgent = session?.role === 'agent';
  const [secondsLeft, setSecondsLeft] = useState(AGENT_ACCESS_DURATION);
  const expireCalled = useRef(false);

  useEffect(() => {
    expireCalled.current = false;
    setSecondsLeft(AGENT_ACCESS_DURATION);

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!expireCalled.current && isAgent) {
            expireCalled.current = true;
            onExpire();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isAgent, onExpire]);

  return { isAgent, secondsLeft };
}

function CountdownBadge({ secondsLeft }: { secondsLeft: number }) {
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const isUrgent = secondsLeft <= 60;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors ${
        isUrgent
          ? 'border-red-300 bg-red-50 text-red-700 animate-pulse'
          : 'border-amber-300 bg-amber-50 text-amber-700'
      }`}
    >
      <Timer className="h-3.5 w-3.5" />
      <span className="tabular-nums">
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
    </div>
  );
}

// ── Detail view ───────────────────────────────────────────────────────────────

function BookingDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session } = useAuth();
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [otherBookings, setOtherBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [expandedTaskCard, setExpandedTaskCard] = useState(false);

  const location = useLocation();

  const handleTimerExpire = useCallback(() => {
    toast({
      title: 'Access expired',
      description: 'Your 5-minute viewing window has ended.',
      variant: 'destructive',
    });
    navigate(-1);
  }, [toast, navigate]);

  const { isAgent, secondsLeft } = useAccessCountdown(handleTimerExpire);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    async function load() {
      const stateOwnerId = location.state?.ownerId;
      if (stateOwnerId) localStorage.setItem('cc_last_owner_id', stateOwnerId);

      const ownerUid =
        stateOwnerId ||
        localStorage.getItem('cc_last_owner_id') ||
        (await resolveOwnerUid(session?.tenantId));

      if (!ownerUid) {
        setLoading(false);
        return;
      }

      try {
        const data = await getBookingById(ownerUid, id!);
        setDetail(data);
      } catch {
        // console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, location.state, session?.tenantId]);

  const b = detail?.booking ?? null;
  const statusCfg = b ? (STATUS_CONFIG[b.status.toLowerCase()] ?? { label: b.status, className: 'bg-slate-100 text-slate-600' }) : null;
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
          <div className="flex items-center gap-3">
            <CountdownBadge secondsLeft={secondsLeft} />
            {loading ? <SkeletonBlock className="h-6 w-20 rounded-full" /> : statusCfg && (
              <Badge className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusCfg.className}`}>{statusCfg.label}</Badge>
            )}
          </div>
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

              {/* Additional Works */}
              {detail.additionalIssues && detail.additionalIssues.length > 0 && (
                <Card className="border-0 bg-white shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      Additional Works
                      <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        {detail.additionalIssues.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <Separator />
                  <CardContent className="pt-4 space-y-4">
                    {detail.additionalIssues.map((issue, idx) => {
                      const i = issue as Record<string, unknown>;
                      const isIssueCompleted = String(i.completionStatus ?? '') === 'completed';
                      const customerResponse = String(i.customerResponse ?? '');
                      const responseColor = customerResponse === 'accept'
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        : customerResponse === 'decline'
                          ? 'bg-rose-100 text-rose-700 border-rose-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200';

                      return (
                        <div key={String(i.id ?? idx)} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${isIssueCompleted ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                              <span className="text-sm font-semibold text-slate-900">{String(i.issueTitle ?? 'Untitled')}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {customerResponse && (
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${responseColor}`}>
                                  {customerResponse === 'accept' ? '✓ Accepted' : customerResponse === 'decline' ? '✗ Declined' : customerResponse}
                                </span>
                              )}
                              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${isIssueCompleted ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                                {isIssueCompleted ? 'Completed' : 'Pending'}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2 text-xs">
                            {i.description && (
                              <div>
                                <div className="font-semibold uppercase tracking-[0.12em] text-slate-400">Description</div>
                                <div className="mt-0.5 text-slate-700">{String(i.description)}</div>
                              </div>
                            )}
                            {i.recommendedRepair && (
                              <div>
                                <div className="font-semibold uppercase tracking-[0.12em] text-slate-400">Recommended Repair</div>
                                <div className="mt-0.5 text-slate-700">{String(i.recommendedRepair)}</div>
                              </div>
                            )}
                            {i.partsRequired && (
                              <div>
                                <div className="font-semibold uppercase tracking-[0.12em] text-slate-400">Parts Required</div>
                                <div className="mt-0.5 text-slate-700">{String(i.partsRequired)}</div>
                              </div>
                            )}
                            {i.price != null && (
                              <div>
                                <div className="font-semibold uppercase tracking-[0.12em] text-slate-400">Price</div>
                                <div className="mt-0.5 font-bold text-slate-900">${Number(i.price).toLocaleString()}</div>
                              </div>
                            )}
                            {i.reportedByStaffName && (
                              <div>
                                <div className="font-semibold uppercase tracking-[0.12em] text-slate-400">Reported By</div>
                                <div className="mt-0.5 text-slate-700">{String(i.reportedByStaffName)}</div>
                              </div>
                            )}
                          </div>

                          {(i.imageUrl || i.completionImageUrl) && (
                            <div className="flex gap-3">
                              {i.imageUrl && (
                                <div className="flex-1">
                                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Before</div>
                                  <img src={String(i.imageUrl)} alt="Issue" className="h-28 w-full rounded-xl object-cover border border-slate-200" />
                                </div>
                              )}
                              {i.completionImageUrl && (
                                <div className="flex-1">
                                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">After</div>
                                  <img src={String(i.completionImageUrl)} alt="Completion" className="h-28 w-full rounded-xl object-cover border border-slate-200" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
  const navigate = useNavigate();
  const { session } = useAuth();
  const { toast } = useToast();
  const pageMeta = PAGE_META[location.pathname];
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (session?.role === 'agent') {
      const EXPIRY_KEY = 'agent_booking_expiry';
      const now = Date.now();
      let expiry = sessionStorage.getItem(EXPIRY_KEY);

      if (!expiry) {
        expiry = (now + 300000).toString(); // 5 minutes
        sessionStorage.setItem(EXPIRY_KEY, expiry);
      }

      const calculateTimeLeft = () => {
        const currentNow = Date.now();
        const diff = Math.floor((parseInt(expiry!) - currentNow) / 1000);
        return Math.max(0, diff);
      };

      setTimeLeft(calculateTimeLeft());

      const timer = setInterval(() => {
        const remaining = calculateTimeLeft();
        setTimeLeft(remaining);

        if (remaining <= 0) {
          clearInterval(timer);
          sessionStorage.removeItem(EXPIRY_KEY);
          toast({
            title: "Time Limit Reached",
            description: "Returning to dashboard due to time limit.",
          });
          navigate('/');
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [session, navigate, toast]);

  return (
    <div className="flex h-screen overflow-hidden relative">
      <BookingSidebar />
      {!id && pageMeta
        ? <BookingListView meta={pageMeta} pathname={location.pathname} />
        : <BookingDetailView />
      }

      {/* Countdown Timer Overlay for Agents */}
      {timeLeft !== null && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 rounded-full bg-rose-100 px-4 py-2 text-rose-700 shadow-md border border-rose-200 pointer-events-none transition-all">
          <Clock className="h-4 w-4 animate-pulse" />
          <span className="font-bold font-mono text-sm text-rose-700">
            {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
            remaining
          </span>
        </div>
      )}
    </div>
  );
}
