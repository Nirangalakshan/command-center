import "@/styles/dashboard.css";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import {
  ArrowLeft,
  CalendarPlus2,
  CarFront,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Plus,
  CheckCircle2,
} from "lucide-react";
import type { VehicleRecord } from "@/services/types";
import {
  createBooking,
  type BookingServiceItem,
  type VehicleDetails,
} from "@/services/bookingsApi";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { logSystemActivity } from "@/services/auditLogApi";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { getServices, getServicesByBranch, type WorkshopService } from "@/services/servicesApi";
import {
  getBranchDetail,
  getBranchDetailForTenant,
  resolveSessionTenantBmsIds,
  type BmsBranchDetail,
} from "@/services/branchesApi";

interface BookingPageState {
  tenantId: string;
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  availableVehicles: VehicleRecord[];
  workshopName?: string;
  workshopColor?: string;
  branchId?: string;
  ownerId?: string;
}

interface ServiceType {
  value: string;
  label: string;
  duration: string;
  price: string;
  included: string[];
  color: string;
  image?: string;
}


function generateTimeSlots(start: string, end: string, step = 30): string[] {
  const slots: string[] = [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let total = sh * 60 + sm;
  const endTotal = eh * 60 + em;
  while (total <= endTotal) {
    const h = Math.floor(total / 60)
      .toString()
      .padStart(2, "0");
    const m = (total % 60).toString().padStart(2, "0");
    slots.push(`${h}:${m}`);
    total += step;
  }
  return slots;
}

function toMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function isTimeWithinWindow(time: string, open?: string | null, close?: string | null): boolean {
  const t = toMinutes(time);
  const o = toMinutes(open);
  const c = toMinutes(close);
  if (t == null || o == null || c == null) return false;
  return t >= o && t <= c;
}

function getWeekdayForBranch(date: Date, timezone?: string): string {
  const localNoon = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
    0,
  );
  if (!timezone) return format(localNoon, "EEEE");
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: timezone,
  }).format(localNoon);
}

type SimpleHoursShape = {
  open?: string | null;
  close?: string | null;
  closed?: boolean;
};

function getInlineSchedule(detail: unknown): SimpleHoursShape | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const hasAny = "open" in d || "close" in d || "closed" in d;
  if (!hasAny) return null;
  return {
    open: typeof d.open === "string" ? d.open : null,
    close: typeof d.close === "string" ? d.close : null,
    closed: Boolean(d.closed),
  };
}

function ServiceCard({
  service,
  selected,
  onToggle,
}: {
  service: ServiceType;
  selected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      onClick={onToggle}
      className={`cursor-pointer rounded-2xl border-2 bg-white transition-all ${
        selected
          ? "border-amber-400 shadow-md"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-center gap-4 p-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl text-2xl font-bold"
          style={{
            background: service.color + "22",
            border: `2px solid ${service.color}44`,
          }}
        >
          {service.image ? (
            <img
              src={service.image}
              alt={service.label}
              className="h-full w-full object-cover"
            />
          ) : (
            <span style={{ color: service.color }}>
              {service.label.charAt(0)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900">{service.label}</div>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {service.duration}
            </span>
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3" />
              {service.included.length} tasks
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-slate-900">
            {service.price}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all ${selected ? "border-amber-400 bg-amber-400 text-white" : "border-slate-300 bg-white text-slate-400 hover:border-amber-400 hover:text-amber-400"}`}
        >
          {selected ? (
            <Check className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </button>
      </div>
      <div className="px-4 pb-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded ? "Hide details" : "Show details"}
        </button>
      </div>
      {expanded && (
        <div className="mx-4 mb-4 rounded-xl bg-amber-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-400">
              <Check className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-700">
              What's included
            </span>
          </div>
          <ul className="space-y-1.5">
            {service.included.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded border-2 border-amber-400 bg-white">
                  <Check className="h-2.5 w-2.5 text-amber-500" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function BookingPage() {
  const { session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const state = location.state as BookingPageState | null;
  const [submitting, setSubmitting] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("new");
  const [vehicleRego, setVehicleRego] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [vehicleVin, setVehicleVin] = useState("");
  const [vehicleMileage, setVehicleMileage] = useState("");
  const [vehicleBodyType, setVehicleBodyType] = useState("");
  const [vehicleEngineNumber, setVehicleEngineNumber] = useState("");

  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [dropOffTime, setDropOffTime] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [notes, setNotes] = useState("");

  const [services, setServices] = useState<WorkshopService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [branchDetail, setBranchDetail] = useState<BmsBranchDetail | null>(null);
  const [branchHoursError, setBranchHoursError] = useState<string | null>(null);

  useEffect(() => {
    const ownerIdToUse = state?.ownerId;
    const branchIdToUse = state?.branchId;

    if (!ownerIdToUse) {
      setServicesError("No Owner ID available. Please start booking from an active call session.");
      setServicesLoading(false);
      return;
    }

    const fetchPromise = branchIdToUse
      ? getServicesByBranch(ownerIdToUse, branchIdToUse)
      : getServices(ownerIdToUse);

    fetchPromise
      .then((data) => setServices(data))
      .catch((err: Error) => setServicesError(err.message))
      .finally(() => setServicesLoading(false));
  }, [state?.branchId, state?.ownerId]);

  const availableVehicles: VehicleRecord[] = state?.availableVehicles ?? [];
  const workshopColor = state?.workshopColor || "var(--cc-color-cyan)";
  const chosenServices = services.filter((s) =>
    selectedServices.includes(s.id),
  );
  const activeBranchId = state?.branchId || (chosenServices[0]?.branches?.[0] ?? "");
  const weekday = selectedDate
    ? getWeekdayForBranch(selectedDate, branchDetail?.timezone)
    : null;
  const daySchedule = weekday
    ? branchDetail?.daySchedules?.[weekday] ??
      (branchDetail?.hours?.[weekday]
        ? {
            dayOfWeek: weekday,
            closed: !!branchDetail?.hours?.[weekday]?.closed,
            open: branchDetail?.hours?.[weekday]?.open ?? null,
            close: branchDetail?.hours?.[weekday]?.close ?? null,
          }
        : undefined) ??
      (getInlineSchedule(branchDetail)
        ? {
            dayOfWeek: weekday,
            closed: !!getInlineSchedule(branchDetail)?.closed,
            open: getInlineSchedule(branchDetail)?.open ?? null,
            close: getInlineSchedule(branchDetail)?.close ?? null,
          }
        : undefined)
    : undefined;
  const branchClosedOnSelectedDay = !!selectedDate && !!daySchedule?.closed;
  const dropOffSlots =
    daySchedule?.open && daySchedule?.close
      ? generateTimeSlots(daySchedule.open, daySchedule.close)
      : [];
  const pickupSlots = dropOffSlots;
  const dropOffOutsideHours =
    !!dropOffTime &&
    !!selectedDate &&
    !branchClosedOnSelectedDay &&
    !isTimeWithinWindow(dropOffTime, daySchedule?.open, daySchedule?.close);
  const pickupOutsideHours =
    !!pickupTime &&
    !!selectedDate &&
    !branchClosedOnSelectedDay &&
    !isTimeWithinWindow(pickupTime, daySchedule?.open, daySchedule?.close);
  const pickupBeforeDropOff =
    !!pickupTime &&
    !!dropOffTime &&
    toMinutes(pickupTime) != null &&
    toMinutes(dropOffTime) != null &&
    (toMinutes(pickupTime) as number) < (toMinutes(dropOffTime) as number);
  const availabilityMessage = branchClosedOnSelectedDay
    ? `${branchDetail?.name || "Branch"} is closed on ${weekday}.`
    : daySchedule?.open && daySchedule?.close
      ? `Open hours on ${weekday}: ${daySchedule.open} - ${daySchedule.close}`
      : null;

  useEffect(() => {
    let cancelled = false;
    async function loadBranchHours() {
      try {
        const owner = state?.ownerId;
        const tenantBranch = activeBranchId
          ? activeBranchId
          : (await resolveSessionTenantBmsIds(session?.tenantId)).branchId || "";
        const branchIdToUse = tenantBranch;
        const detail = owner && branchIdToUse
          ? await getBranchDetail(owner, branchIdToUse)
          : await getBranchDetailForTenant(session?.tenantId, branchIdToUse || undefined);
        if (!cancelled) {
          setBranchDetail(detail ?? null);
          setBranchHoursError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setBranchDetail(null);
          setBranchHoursError(
            err instanceof Error ? err.message : "Failed to load branch open hours.",
          );
        }
      }
    }
    loadBranchHours();
    return () => {
      cancelled = true;
    };
  }, [state?.ownerId, session?.tenantId, activeBranchId]);

  const toggleService = (value: string) =>
    setSelectedServices((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );

  useEffect(() => {
    if (!state) return;
    setCustomerName(state.customerName || "");
    setCustomerPhone(state.customerPhone || "");
    setCustomerEmail(state.customerEmail || "");
    const v = availableVehicles[0];
    if (v) {
      setSelectedVehicleId(v.id);
      setVehicleRego(v.rego || "");
      setVehicleMake(v.make || "");
      setVehicleModel(v.model || "");
      setVehicleYear(v.year ? String(v.year) : "");
      setVehicleColor(v.color || "");
      setVehicleVin(v.vin || "");
    }
  }, []);

  const handleVehicleSelect = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    if (vehicleId === "new") {
      setVehicleRego("");
      setVehicleMake("");
      setVehicleModel("");
      setVehicleYear("");
      setVehicleColor("");
      setVehicleVin("");
      setVehicleMileage("");
      setVehicleBodyType("");
      setVehicleEngineNumber("");
      return;
    }
    const v = availableVehicles.find((x) => x.id === vehicleId);
    if (!v) return;
    setVehicleRego(v.rego || "");
    setVehicleMake(v.make || "");
    setVehicleModel(v.model || "");
    setVehicleYear(v.year ? String(v.year) : "");
    setVehicleColor(v.color || "");
    setVehicleVin(v.vin || "");
    setVehicleMileage("");
    setVehicleBodyType("");
    setVehicleEngineNumber("");
  };

  const handleSubmit = async () => {
    if (
      !customerName ||
      !customerPhone ||
      selectedServices.length === 0 ||
      !selectedDate ||
      !dropOffTime
    ) {
      toast({
        title: "Missing required fields",
        description: "Please complete all required fields.",
      });
      return;
    }

    if (branchClosedOnSelectedDay || dropOffOutsideHours || pickupOutsideHours || pickupBeforeDropOff) {
      toast({
        title: "Branch not available",
        description:
          branchClosedOnSelectedDay
            ? `${branchDetail?.name || "Branch"} is closed on ${weekday}.`
            : pickupBeforeDropOff
              ? "Pick-up time cannot be before drop-off time."
              : "Selected time is outside branch open hours.",
        variant: "destructive",
      });
      return;
    }

    const serviceItems: BookingServiceItem[] = chosenServices.map((s) => ({
      serviceId: s.id,
      serviceName: s.name,
      price: s.price,
      duration: s.duration,
    }));

    const branchId = activeBranchId;
    const ownerUidToUse = state?.ownerId;

    if (!ownerUidToUse) {
      toast({
        title: "Booking Failed",
        description: "Missing Owner ID. Bookings must be initiated from a call session.",
        variant: "destructive",
      });
      return;
    }

    const vehicleDetails: VehicleDetails = {
      make: vehicleMake || undefined,
      model: vehicleModel || undefined,
      year: vehicleYear || undefined,
      registrationNumber: vehicleRego || undefined,
      mileage: vehicleMileage || undefined,
      bodyType: vehicleBodyType || undefined,
      colour: vehicleColor || undefined,
      vinChassis: vehicleVin || undefined,
      engineNumber: vehicleEngineNumber || undefined,
    };

    const payload = {
      ownerUid: ownerUidToUse,
      branchId,
      date: format(selectedDate, "yyyy-MM-dd"),
      time: dropOffTime,
      pickupTime: pickupTime || undefined,
      services: serviceItems,
      client: customerName,
      clientEmail: customerEmail,
      clientPhone: customerPhone,
      customerId: state?.customerId ?? undefined,
      vehicleDetails,
      notes: notes || undefined,
    };

    setSubmitting(true);
    try {
      const result = await createBooking(payload);
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const firebaseUser = auth.currentUser;

        await (supabase as any).from("bms_bookings").insert({
          bms_booking_id: result.bookingId ?? null,
          owner_uid: ownerUidToUse,
          branch_id: branchId || null,
          agent_uid: firebaseUser?.uid ?? null,
          agent_email: firebaseUser?.email ?? null,
          client_name: customerName,
          client_phone: customerPhone || null,
          client_email: customerEmail || null,
          customer_id: state?.customerId ?? null,
          vehicle_number: vehicleRego || null,
          vehicle_details: [vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(" ") || null,
          booking_date: format(selectedDate, "yyyy-MM-dd"),
          booking_time: dropOffTime,
          pickup_time: pickupTime || null,
          services: serviceItems,
          notes: notes || null,
          bms_status: "Pending",
          bms_response: result,
        });
      } catch {
      }

      await logSystemActivity(session, 'CREATE_BOOKING', 'BOOKING', result.bookingId, {
        customerName,
        service: chosenServices.map((s) => s.name).join(", "),
        date: format(selectedDate, "yyyy-MM-dd"),
        time: dropOffTime
      });

      toast({
        title: "Booking confirmed!",
        description: `${chosenServices.map((s) => s.name).join(", ")} on ${format(selectedDate, "dd MMM yyyy")} at ${dropOffTime}`,
      });
      navigate(-1);
    } catch (error) {
      toast({
        title: "Booking failed",
        description:
          error instanceof Error ? error.message : "Could not save booking.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const bookingDateStr = selectedDate
    ? format(selectedDate, "EEE, dd MMM yyyy")
    : null;
  const canConfirm = !!(
    customerName &&
    customerPhone &&
    selectedServices.length > 0 &&
    selectedDate &&
    dropOffTime &&
    !branchClosedOnSelectedDay &&
    !dropOffOutsideHours &&
    !pickupOutsideHours &&
    !pickupBeforeDropOff &&
    dropOffSlots.length > 0
  );

  return (
    <div className="cc-fade-in min-h-screen bg-[#f5f5f5] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 shadow-sm">
              <CalendarPlus2 className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <div className="text-base font-semibold tracking-tight">
                {state?.workshopName || "Workshop"}
              </div>
              <div className="text-xs text-muted-foreground">
                Online Booking
              </div>
            </div>
          </div>
          {state?.workshopName && (
            <Badge
              variant="outline"
              className="hidden rounded-full border-0 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] sm:inline-flex"
              style={{ color: workshopColor, background: workshopColor + "18" }}
            >
              {state.workshopName}
            </Badge>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">
                Pick your services
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Select one or more services for your visit
              </p>
              {servicesLoading && (
                <p className="mt-6 text-sm text-slate-400">Loading services...</p>
              )}
              {servicesError && (
                <p className="mt-6 text-sm text-red-500">
                  Failed to load services: {servicesError}
                </p>
              )}
              <div className="mt-4 space-y-3">
                {services.map((s) => (
                  <ServiceCard
                    key={s.id}
                    service={{
                      value: s.id,
                      label: s.name,
                      image: s.imageUrl ?? undefined,
                      duration:
                        s.duration < 60
                          ? `${s.duration} min`
                          : `${Math.floor(s.duration / 60)}h${s.duration % 60 ? ` ${s.duration % 60}m` : ""}`,
                      price: `$${s.price.toLocaleString()}`,
                      color: "#f59e0b",
                      included: s.checklist?.map((c) => c.name) ?? [],
                    }}
                    selected={selectedServices.includes(s.id)}
                    onToggle={() => toggleService(s.id)}
                  />
                ))}
              </div>
            </div>
            <Card className="border-0 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  When would you like to visit?{" "}
                  <span className="text-rose-500">*</span>
                </CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Date
                    </div>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => {
                        setSelectedDate(d);
                        setDropOffTime("");
                        setPickupTime("");
                      }}
                      disabled={(d) => {
                        const inPast = isBefore(startOfDay(d), startOfDay(new Date()));
                        if (inPast) return true;
                        const branchDay = getWeekdayForBranch(d, branchDetail?.timezone);
                        const daily =
                          branchDetail?.daySchedules?.[branchDay] ??
                          (branchDetail?.hours?.[branchDay]
                            ? {
                                closed: !!branchDetail?.hours?.[branchDay]?.closed,
                              }
                            : getInlineSchedule(branchDetail));
                        return !!daily?.closed;
                      }}
                      fromDate={new Date()}
                      toDate={addDays(new Date(), 90)}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                    />
                  </div>
                  <div className="space-y-5">
                    {(availabilityMessage || branchHoursError) && (
                      <div
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          branchClosedOnSelectedDay || branchHoursError
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {branchHoursError || availabilityMessage}
                      </div>
                    )}
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                        Drop-off time
                      </div>
                      <p className="mb-3 text-xs text-slate-400">
                        When do you drop off?
                      </p>
                      {!selectedDate ? null : dropOffSlots.length === 0 ? (
                        <p className="mb-3 text-xs text-rose-600">
                          No open hours available for the selected date.
                        </p>
                      ) : null}
                      <div className="grid grid-cols-3 gap-2">
                        {dropOffSlots.map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            disabled={
                              !selectedDate ||
                              branchClosedOnSelectedDay ||
                              !isTimeWithinWindow(
                                slot,
                                daySchedule?.open,
                                daySchedule?.close,
                              )
                            }
                            onClick={() => setDropOffTime(slot)}
                            className={`rounded-lg border px-2 py-2 text-sm font-medium transition-all ${dropOffTime === slot ? "border-amber-400 bg-amber-400 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50 disabled:opacity-40"}`}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />
                        Pick-up time
                        <span className="ml-1 font-normal text-slate-400">
                          (optional)
                        </span>
                      </div>
                      {!selectedDate ? null : pickupSlots.length === 0 ? (
                        <p className="mb-3 text-xs text-rose-600">
                          No open hours available for the selected date.
                        </p>
                      ) : null}
                      <div className="grid grid-cols-3 gap-2">
                        {pickupSlots.map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            disabled={
                              !selectedDate ||
                              !dropOffTime ||
                              branchClosedOnSelectedDay ||
                              toMinutes(slot) == null ||
                              toMinutes(dropOffTime) == null ||
                              (toMinutes(slot) as number) < (toMinutes(dropOffTime) as number) ||
                              !isTimeWithinWindow(
                                slot,
                                daySchedule?.open,
                                daySchedule?.close,
                              )
                            }
                            onClick={() =>
                              setPickupTime(pickupTime === slot ? "" : slot)
                            }
                            className={`rounded-lg border px-2 py-2 text-sm font-medium transition-all ${pickupTime === slot ? "border-sky-400 bg-sky-400 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50 disabled:opacity-40"}`}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-white shadow-sm">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Client information
                  </div>
                </div>
                <Separator className="mb-4" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-name">
                      Full name <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="customer-name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-phone">
                      Phone <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="customer-phone"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone number"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="customer-email">
                      Email <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="customer-email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="name@example.com"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <CarFront className="h-4 w-4" /> Vehicle Details
                </CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label>Select vehicle or add new</Label>
                  <Select
                    value={selectedVehicleId}
                    onValueChange={handleVehicleSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">+ New vehicle</SelectItem>
                      {availableVehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {[
                            v.rego,
                            v.make,
                            v.model,
                            v.year ? String(v.year) : "",
                            v.color ? `(${v.color})` : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} placeholder="Make" />
                  <Input value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="Model" />
                  <Input value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} placeholder="Year" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input value={vehicleRego} onChange={(e) => setVehicleRego(e.target.value)} placeholder="Registration" />
                  <Input value={vehicleMileage} onChange={(e) => setVehicleMileage(e.target.value)} placeholder="Mileage" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input value={vehicleBodyType} onChange={(e) => setVehicleBodyType(e.target.value)} placeholder="Body type" />
                  <Input value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} placeholder="Colour" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input value={vehicleVin} onChange={(e) => setVehicleVin(e.target.value)} placeholder="VIN / Chassis" />
                  <Input value={vehicleEngineNumber} onChange={(e) => setVehicleEngineNumber(e.target.value)} placeholder="Engine number" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Notes
                </CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Vehicle details, special requests..."
                  rows={4}
                />
              </CardContent>
            </Card>
          </div>
          <div>
            <div className="sticky top-24">
              <Card className="border-0 bg-slate-900 text-white shadow-lg">
                <CardContent className="p-5">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Order Summary
                  </div>
                  <div className="mb-4 text-xs text-slate-500">
                    {selectedServices.length > 0
                      ? `${selectedServices.length} service${selectedServices.length > 1 ? "s" : ""} selected`
                      : "No service selected"}
                  </div>
                  {state?.workshopName && (
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm text-slate-300">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                        {state.workshopName}
                      </div>
                    </div>
                  )}
                  {chosenServices.map((s) => (
                    <div
                      key={s.id}
                      className="mb-2 rounded-xl bg-slate-800 px-3 py-2"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-slate-200">
                          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                          {s.name}
                        </div>
                        <span className="font-bold text-amber-400">
                          ${s.price.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        {s.duration < 60
                          ? `${s.duration} min`
                          : `${Math.floor(s.duration / 60)}h${s.duration % 60 ? ` ${s.duration % 60}m` : ""}`}
                      </div>
                    </div>
                  ))}
                  {bookingDateStr && (
                    <div className="mb-3 rounded-xl bg-slate-800 px-3 py-2 text-xs text-slate-400">
                      {bookingDateStr}
                      {dropOffTime && (
                        <div className="mt-0.5 font-semibold text-white">
                          Drop-off {dropOffTime}
                        </div>
                      )}
                      {pickupTime && (
                        <div className="mt-0.5 text-sky-400">
                          Pick-up {pickupTime}
                        </div>
                      )}
                    </div>
                  )}
                  {(vehicleRego || vehicleMake) && (
                    <div className="mb-3 rounded-xl bg-slate-800 px-3 py-2 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5 mb-1">
                        <CarFront className="h-3.5 w-3.5" />
                        <span className="font-medium text-slate-300">
                          {[vehicleMake, vehicleModel, vehicleYear]
                            .filter(Boolean)
                            .join(" ") || "Vehicle"}
                        </span>
                      </div>
                      {vehicleRego && (
                        <div>
                          Reg: <span className="text-white">{vehicleRego}</span>
                        </div>
                      )}
                      {vehicleColor && (
                        <div>
                          Colour:{" "}
                          <span className="text-white">{vehicleColor}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {chosenServices.length > 0 && (
                    <div className="mb-4 flex items-center justify-between rounded-xl bg-amber-400/10 px-3 py-2">
                      <span className="text-sm font-semibold text-slate-300">
                        Total
                      </span>
                      <span className="text-lg font-bold text-amber-400">
                        $
                        {chosenServices
                          .reduce((sum, s) => sum + s.price, 0)
                          .toLocaleString()}
                      </span>
                    </div>
                  )}
                  <Separator className="mb-4 bg-slate-700" />
                  <Button
                    className="w-full bg-amber-400 font-semibold text-slate-950 hover:bg-amber-500"
                    disabled={!canConfirm || submitting}
                    onClick={handleSubmit}
                  >
                    {submitting ? "Saving..." : "Confirm Booking"}
                  </Button>
                  <p className="mt-3 text-center text-[11px] text-slate-500">
                    By confirming, the booking will be saved to the system.
                  </p>
                </CardContent>
              </Card>
              <Button
                variant="outline"
                className="mt-3 w-full"
                disabled={submitting}
                onClick={() => navigate(-1)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
