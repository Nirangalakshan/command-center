import { useEffect, useMemo, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightLeft,
  CalendarPlus2,
  CarFront,
  ClipboardPenLine,
  History,
  Mail,
  MapPin,
  MessageSquareText,
  PhoneCall,
  Route,
  UserRound,
  Wrench,
} from "lucide-react";
import type {
  Agent,
  CallerContext,
  IncomingCall,
  Queue,
  ServiceRecord,
  Tenant,
  VehicleRecord,
} from "@/services/types";
import {
  fetchLatestBookingByPhone,
} from "@/services/dashboardApi";
import { fetchFirebaseCallerContext } from "@/services/customersApi";
import {
  getServicesByBranch,
  type WorkshopService,
} from "@/services/servicesApi";
import { useToast } from "@/hooks/use-toast";
import { formatDuration, formatPhone } from "@/utils/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type CallSheetMode = "incoming" | "live";

export interface CallDetailSnapshot {
  id: string;
  mode: CallSheetMode;
  tenantId: string;
  workshopName: string;
  workshopColor: string;
  queueName: string;
  agentOrGroupLabel: string;
  customerName: string | null;
  customerPhone: string;
  callStatusText: string;
  didLabel: string;
  branchId: string;
  branchName: string;
  mappingWorkshopName: string;
  ownerId: string;
}

interface CallDetailsSheetProps {
  detail: CallDetailSnapshot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function buildIncomingCallSnapshot(
  call: IncomingCall,
  now: number,
): CallDetailSnapshot {
  return {
    id: call.id,
    mode: "incoming",
    tenantId: call.tenantId,
    workshopName: call.tenantName,
    workshopColor: call.tenantBrandColor,
    queueName: call.queueName,
    agentOrGroupLabel: `Group: ${call.groupName}`,
    customerPhone: call.callerNumber,
    customerName: call.callerName,
    didLabel: call.didLabel || call.did,
    branchId: call.branchId ?? "",
    branchName: call.branchName ?? "",
    mappingWorkshopName: call.mappingWorkshopName ?? "",
    ownerId: call.ownerId ?? "",
    callStatusText: `Incoming for ${formatDuration(now - call.waitingSince)}`,
  };
}

export function buildLiveCallSnapshot(args: {
  agent: Agent;
  queues: Queue[];
  tenants: Tenant[];
  incomingCall?: IncomingCall | null;
  now: number;
}): CallDetailSnapshot {
  const { agent, queues, tenants, incomingCall, now } = args;
  const activeNumber = agent.currentCaller || incomingCall?.callerNumber || "";
  const queue = queues.find((entry) => agent.queueIds.includes(entry.id));
  const tenant = tenants.find((entry) => entry.id === agent.tenantId);

  return {
    id: agent.id,
    mode: "live",
    tenantId: agent.tenantId,
    workshopName: tenant?.name || agent.tenantName || "Workshop",
    workshopColor: tenant?.brandColor || "var(--cc-color-cyan)",
    queueName: queue?.name || agent.queueName || "Live Queue",
    agentOrGroupLabel: `Agent: ${agent.name}${agent.extension ? ` · Ext ${agent.extension}` : ""}`,
    customerPhone: activeNumber,
    customerName: incomingCall?.callerName ?? null,
    didLabel:
      incomingCall?.didLabel ||
      incomingCall?.did ||
      queue?.name ||
      "Active line",
    branchId: incomingCall?.branchId ?? "",
    branchName: incomingCall?.branchName ?? "",
    mappingWorkshopName: incomingCall?.mappingWorkshopName ?? "",
    ownerId: incomingCall?.ownerId ?? "",
    callStatusText: `Live for ${agent.callStartTime ? formatDuration(now - agent.callStartTime) : "—"}`,
  };
}

export function CallDetailsSheet({
  detail,
  open,
  onOpenChange,
}: CallDetailsSheetProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [callerContext, setCallerContext] = useState<CallerContext | null>(
    null,
  );
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const [branchServices, setBranchServices] = useState<
    WorkshopService[] | null
  >(null);
  const [branchServicesLoading, setBranchServicesLoading] = useState(false);
  const commandButtons = useMemo(
    () => [
      { label: "Book Now", icon: CalendarPlus2 },
      { label: "Log Note", icon: ClipboardPenLine },
      { label: "Profile", icon: UserRound },
      { label: "Booking Details", icon: CalendarCheck },
      { label: "Reroute Call", icon: Route },
      { label: "Call Dispatch", icon: ArrowRightLeft },
    ],
    [],
  );

  useEffect(() => {
    let cancelled = false;

    if (!open || !detail?.customerPhone) {
      setCallerContext(null);
      setContextError(null);
      setContextLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setContextLoading(true);
    setContextError(null);
    setCallerContext(null);

    // Always fetch caller context from Firebase bookings
    const ownerKey = detail.ownerId || detail.tenantId;
    const contextPromise = ownerKey
      ? fetchFirebaseCallerContext(ownerKey, detail.customerPhone)
      : Promise.resolve(null);

    contextPromise
      .then((context) => {
        if (!cancelled) setCallerContext(context);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[CallDetailsSheet] Caller context fetch failed:', error);
          setContextError(
            error instanceof Error
              ? error.message
              : "Failed to load caller context",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detail?.id, detail?.tenantId, detail?.ownerId, detail?.customerPhone, open]);

  useEffect(() => {
    let cancelled = false;

    if (!open || !detail?.branchId || !detail?.ownerId) {
      setBranchServices(null);
      setBranchServicesLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setBranchServicesLoading(true);

    getServicesByBranch(detail.ownerId, detail.branchId)
      .then((services) => {
        if (!cancelled) setBranchServices(services);
      })
      .catch((error) => {
        console.error("Failed to load branch services", error);
      })
      .finally(() => {
        if (!cancelled) setBranchServicesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detail?.branchId, detail?.ownerId, open]);

  const latestServiceByVehicle = useMemo(
    () => buildLatestServiceMap(callerContext?.services || []),
    [callerContext?.services],
  );

  const resolvedCustomerName =
    callerContext?.customer.name || normalizeCustomerName(detail?.customerName);
  const resolvedCustomerEmail = callerContext?.customer.email || "";
  const availableVehicles = callerContext?.vehicles || [];
  const statusTone = callerContext
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
    : "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  const statusLabel = callerContext
    ? "Known Customer"
    : contextLoading
      ? "Searching..."
      : "Unknown Caller";
  const canOpenBooking = detail?.mode === "live";
  // const canOpenBooking = true;
  if (!detail) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-l border-slate-200 bg-slate-50 p-0 sm:max-w-2xl"
      >
        <ScrollArea className="h-full">
          <div className="min-h-full">
            <SheetHeader className="border-b border-slate-200 bg-white px-6 py-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full border-0 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{
                    color: detail.workshopColor,
                    background: `${detail.workshopColor}18`,
                  }}
                >
                  {detail.mode === "incoming" ? "Incoming Call" : "Live Call"}
                </Badge>
                <div
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${statusTone}`}
                >
                  <UserRound className="h-3.5 w-3.5" />
                  {statusLabel}
                </div>
              </div>
              <SheetTitle className="mt-3 text-2xl">
                {resolvedCustomerName}
              </SheetTitle>
              <SheetDescription className="text-sm text-slate-600">
                {detail.callStatusText}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 p-6">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="grid gap-4 p-6 md:grid-cols-2">
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      Workshop / Branch
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">
                      {(detail.mappingWorkshopName || detail.workshopName) +
                        (detail.branchName ? ` - ${detail.branchName}` : "")}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {detail.queueName}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      Caller
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">
                      {formatPhone(detail.customerPhone)}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {detail.agentOrGroupLabel}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      Profile Status
                    </div>
                    <div className="mt-2 text-sm font-medium text-slate-900">
                      {statusLabel}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      Line / DID
                    </div>
                    <div className="mt-2 text-sm font-medium text-slate-900">
                      {detail.didLabel}
                    </div>
                  </div>
                  {detail.ownerId && (
                    <div>
                      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Owner ID
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-900 font-mono text-xs">
                        {detail.ownerId}
                      </div>
                    </div>
                  )}
                  {callerContext?.customer.email && (
                    <div>
                      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Email
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                        <Mail className="h-4 w-4 text-slate-500" />
                        {callerContext.customer.email}
                      </div>
                    </div>
                  )}
                  {callerContext?.customer.address && (
                    <div>
                      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Address
                      </div>
                      <div className="mt-2 flex items-start gap-2 text-sm font-medium text-slate-900">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                        <span>{callerContext.customer.address}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {callerContext?.customer.notes && (
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Customer Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-slate-700">
                    {callerContext.customer.notes}
                  </CardContent>
                </Card>
              )}

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">System Commands</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {commandButtons.map((command) => {
                    const Icon = command.icon;
                    return (
                      <Button
                        key={command.label}
                        variant={
                          command.label === "Book Now" ? "default" : "outline"
                        }
                        className="justify-start"
                        // disabled={command.label === 'Book Now' && !canOpenBooking}
                        onClick={() => {
                          if (command.label === 'Book Now') {
                            setBookingDialogOpen(true);
                            return;
                          }
                          toast({
                            title: command.label,
                            description: `${command.label} selected for ${resolvedCustomerName}.`,
                          });
                        }}
                      >
                        <Icon className="h-4 w-4" />
                        {command.label}
                      </Button>
                    );
                  })}
                </CardContent>
              </Card>

              <Tabs defaultValue="vehicles" className="space-y-4">
                <TabsList className="grid h-auto grid-cols-3 rounded-xl bg-slate-200/70 p-1">
                  <TabsTrigger value="vehicles" className="rounded-lg">
                    Vehicles
                  </TabsTrigger>
                  <TabsTrigger value="services" className="rounded-lg">
                    History
                  </TabsTrigger>
                  <TabsTrigger value="branch-services" className="rounded-lg">
                    Branch Services
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="vehicles" className="mt-0">
                  {contextLoading ? (
                    <Card className="border-slate-200 bg-white shadow-sm">
                      <CardContent className="p-5 text-sm text-slate-600">
                        Loading caller vehicles...
                      </CardContent>
                    </Card>
                  ) : callerContext?.vehicles.length ? (
                    <div className="space-y-3">
                      {callerContext.vehicles.map((vehicle) => (
                        <VehicleCard
                          key={vehicle.id}
                          vehicle={vehicle}
                          latestService={
                            latestServiceByVehicle.get(vehicle.id) ?? null
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <Card className="border-slate-200 bg-white shadow-sm">
                      <CardContent className="p-5">
                        <EmptyState
                          message={
                            contextError ||
                            "No vehicles found for this caller yet."
                          }
                        />
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="services" className="mt-0">
                  <Card className="border-slate-200 bg-white shadow-sm">
                    <CardContent className="space-y-4 p-5">
                      {contextLoading ? (
                        <div className="text-sm text-slate-600">
                          Loading recent service history...
                        </div>
                      ) : callerContext?.services.length ? (
                        callerContext.services.map((service, index) => (
                          <div key={service.id} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className="rounded-full bg-slate-100 p-2 text-slate-700">
                                {index === 0 ? (
                                  <PhoneCall className="h-4 w-4" />
                                ) : index % 2 === 0 ? (
                                  <History className="h-4 w-4" />
                                ) : (
                                  <Wrench className="h-4 w-4" />
                                )}
                              </div>
                              {index < callerContext.services.length - 1 && (
                                <div className="mt-2 h-full w-px bg-slate-200" />
                              )}
                            </div>
                            <div className="pb-4">
                              <div className="text-sm font-semibold text-slate-950">
                                {service.serviceType}
                              </div>
                              <div className="mt-1 text-sm text-slate-600">
                                {describeService(
                                  service,
                                  callerContext.vehicles,
                                )}
                              </div>
                              {service.advisorNotes && (
                                <div className="mt-1 text-sm text-slate-600">
                                  {service.advisorNotes}
                                </div>
                              )}
                              <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                {formatServiceDate(service.serviceDate)}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState
                          message={
                            contextError ||
                            "No prior service history found for this caller yet."
                          }
                        />
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="branch-services" className="mt-0">
                  <Card className="border-slate-200 bg-white shadow-sm">
                    <CardContent className="space-y-4 p-5">
                      {branchServicesLoading ? (
                        <div className="text-sm text-slate-600">
                          Loading branch services...
                        </div>
                      ) : branchServices?.length ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {branchServices.map((service) => (
                            <div
                              key={service.id}
                              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="font-semibold text-slate-900">
                                {service.name}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                                <span>{service.duration} mins</span>
                                <div className="h-1 w-1 rounded-full bg-slate-300" />
                                <span>${service.price}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="No services found for this branch." />
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
                Quick context: this panel now uses workshop customer records
                tied to the incoming caller number, so agents see real vehicles
                and service history instead of generated placeholder data.
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function normalizeCustomerName(name?: string | null): string {
  return name && name.trim() ? name.trim() : "Unknown caller";
}

function buildLatestServiceMap(
  services: ServiceRecord[],
): Map<string, ServiceRecord> {
  const map = new Map<string, ServiceRecord>();
  for (const service of services) {
    if (!map.has(service.vehicleId)) {
      map.set(service.vehicleId, service);
    }
  }
  return map;
}

function formatVehicleLabel(vehicle: VehicleRecord): string {
  const parts = [
    vehicle.year ? String(vehicle.year) : null,
    vehicle.make,
    vehicle.model,
  ].filter(Boolean);
  return parts.join(" ") || "Vehicle";
}

function formatServiceDate(serviceDate: string): string {
  const parsed = new Date(serviceDate);
  if (Number.isNaN(parsed.getTime())) return serviceDate;
  return parsed.toLocaleDateString();
}

function formatAmount(amount: number | null): string | null {
  if (amount == null) return null;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function describeService(
  service: ServiceRecord,
  vehicles: VehicleRecord[],
): string {
  const vehicle = vehicles.find((entry) => entry.id === service.vehicleId);
  const parts = [
    vehicle ? `${vehicle.rego} · ${formatVehicleLabel(vehicle)}` : null,
    service.odometerKm != null
      ? `${service.odometerKm.toLocaleString()} km`
      : null,
    formatAmount(service.amount),
  ].filter(Boolean);
  return parts.join(" · ");
}

function VehicleCard({
  vehicle,
  latestService,
}: {
  vehicle: VehicleRecord;
  latestService: ServiceRecord | null;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
            <CarFront className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-950">{vehicle.rego}</div>
            <div className="text-sm text-slate-600">
              {formatVehicleLabel(vehicle)}
            </div>
            {vehicle.notes && (
              <div className="mt-1 text-sm text-slate-500">{vehicle.notes}</div>
            )}
          </div>
        </div>
        <div className="space-y-1 text-sm text-slate-600 sm:text-right">
          <div className="font-medium text-slate-900">
            {latestService
              ? latestService.serviceType
              : "No service history yet"}
          </div>
          <div>
            {latestService
              ? formatServiceDate(latestService.serviceDate)
              : "Waiting for first visit"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
