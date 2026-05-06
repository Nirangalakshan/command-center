import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  Agent,
  Permissions,
  Tenant,
  UserSession,
} from "@/services/types";
import {
  fetchAgentSuburbsAssigned,
  fetchSalesCommissionTenant,
  fetchSalesLeadsMine,
  fetchSalesSuburbWorkshopsWithAgentContact,
  markSalesLeadCalled,
  markSalesSuburbWorkshopCalled,
  normalizeSalesSuburbKey,
  salesProgressFromLeads,
  workshopsMatchingSuburb,
  updateSalesLeadDeskNotes,
  updateSalesSuburbWorkshopAgentRemarks,
  type SalesLeadRow,
  type SalesSuburbRow,
  type SalesSuburbWorkshopWithAgentContact,
} from "@/services/salesWorkspaceApi";
import { LeadOutcomeDrawer } from "@/tabs/sales-workspace/LeadOutcomeDrawer";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PROGRESS_EXPAND_AT = 20;

export interface SalesAgentTabProps {
  agents: Agent[];
  tenants: Tenant[];
  permissions: Permissions;
  session: UserSession;
  currentAgentDbId: string | null;
  onRefreshDashboard: () => void;
}

function resolveAgentId(props: Pick<SalesAgentTabProps, "session" | "agents">): string | null {
  const a = props.agents.find((ag) => ag.userId === props.session.userId);
  return a?.id ?? null;
}

/** Flat table: suburbs & workshops from `sales_suburb_workshops` (agent scope via RLS), plus per-agent call + remarks. */
function SuburbWorkshopsTable({
  workshops,
  loading,
  onRefresh,
}: {
  workshops: SalesSuburbWorkshopWithAgentContact[];
  loading?: boolean;
  onRefresh?: () => void | Promise<void>;
}) {
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      [...workshops].sort((a, b) => {
        const bySub = (a.suburb || "").localeCompare(b.suburb || "", undefined, {
          sensitivity: "base",
        });
        if (bySub !== 0) return bySub;
        return (a.workshop_name || "").localeCompare(b.workshop_name || "", undefined, {
          sensitivity: "base",
        });
      }),
    [workshops],
  );

  useEffect(() => {
    setNoteDrafts(Object.fromEntries(workshops.map((w) => [w.id, w.agent_remarks ?? ""])));
  }, [workshops]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Suburb workshops</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          Rows come from Sales → Suburb workshops. Your &quot;Mark as called&quot; and remarks are saved for you only (other agents have their own).
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <EmptyState message="Loading workshops…" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workshop records for your access.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table className="w-max min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Suburb</TableHead>
                  <TableHead>Workshop name</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="min-w-[10rem]">Mark as called</TableHead>
                  <TableHead className="min-w-[220px]">Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((w) => {
                  const called = Boolean(w.agent_first_called_at);
                  const draft = noteDrafts[w.id] ?? w.agent_remarks ?? "";
                  const dirty = draft.trim() !== (w.agent_remarks ?? "").trim();
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="text-sm">{w.suburb?.trim() || "—"}</TableCell>
                      <TableCell className="font-medium">{w.workshop_name?.trim() || "—"}</TableCell>
                      <TableCell className="text-sm">{w.owner_name?.trim() || "—"}</TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {w.phone_number?.trim() || "—"}
                      </TableCell>
                      <TableCell className="text-sm break-all">{w.owner_email?.trim() || "—"}</TableCell>
                      <TableCell className="align-top">
                        {called ? (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {w.agent_first_called_at
                              ? new Date(w.agent_first_called_at).toLocaleString()
                              : "Marked"}
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="w-full min-w-[9rem]"
                            disabled={markingId === w.id}
                            onClick={() => {
                              setMarkingId(w.id);
                              void markSalesSuburbWorkshopCalled(w.id)
                                .then(async () => {
                                  toast.success("Marked as called");
                                  await onRefresh?.();
                                })
                                .catch((e) =>
                                  toast.error(e instanceof Error ? e.message : "Could not update"),
                                )
                                .finally(() => setMarkingId(null));
                            }}
                          >
                            {markingId === w.id ? "Saving…" : "Mark as called"}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-2 min-w-[200px] max-w-md">
                          <Textarea
                            rows={3}
                            value={draft}
                            onChange={(e) =>
                              setNoteDrafts((prev) => ({ ...prev, [w.id]: e.target.value }))
                            }
                            placeholder="Your notes on this workshop"
                            className="text-sm"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!dirty || savingNotesId === w.id}
                            onClick={() => {
                              setSavingNotesId(w.id);
                              void updateSalesSuburbWorkshopAgentRemarks(w.id, draft)
                                .then(async () => {
                                  toast.success("Remarks saved");
                                  await onRefresh?.();
                                })
                                .catch((e) =>
                                  toast.error(e instanceof Error ? e.message : "Could not save"),
                                )
                                .finally(() => setSavingNotesId(null));
                            }}
                          >
                            {savingNotesId === w.id && dirty ? "Saving…" : "Save remarks"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AgentSalesHomeTab({
  agents,
  session,
  tenants,
  currentAgentDbId,
  onRefreshDashboard: _onRefreshDashboard,
}: SalesAgentTabProps) {
  const agentId = currentAgentDbId ?? resolveAgentId({ agents, session });
  const [leads, setLeads] = useState<SalesLeadRow[]>([]);
  const [suburbAssignments, setSuburbAssignments] = useState<SalesSuburbRow[]>([]);
  const [commissions, setCommissions] = useState<
    Awaited<ReturnType<typeof fetchSalesCommissionTenant>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setErr(null);
    }
    try {
      const resolvedAgentId = currentAgentDbId ?? resolveAgentId({ agents, session });
      const [ml, sbRows] = await Promise.all([
        fetchSalesLeadsMine(),
        resolvedAgentId
          ? fetchAgentSuburbsAssigned(resolvedAgentId).catch(() => [] as SalesSuburbRow[])
          : Promise.resolve([] as SalesSuburbRow[]),
      ]);

      setLeads(ml);
      setSuburbAssignments(sbRows);

      const tids = [...new Set(ml.map((l) => l.tenant_id))];
      if (tids.length === 1) {
        setCommissions(await fetchSalesCommissionTenant(tids[0]));
      } else {
        let acc: Awaited<ReturnType<typeof fetchSalesCommissionTenant>> = [];
        for (const t of tids) {
          const c = await fetchSalesCommissionTenant(t);
          acc = acc.concat(c);
        }
        setCommissions(acc);
      }
    } catch (e) {
      if (!silent) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [agents, currentAgentDbId, session.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => salesProgressFromLeads(leads), [leads]);
  const assignedSuburbLabels = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const r of suburbAssignments) {
      const raw = r.suburb?.trim() ?? "";
      if (!raw) continue;
      const key = normalizeSalesSuburbKey(raw);
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(raw);
    }
    return labels.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [suburbAssignments]);
  const pendingCommissions = commissions.filter((c) => c.status === "Pending Review" &&
    (!agentId || c.agent_id === agentId)).length;
  const followUps = leads.filter((l) => l.follow_up_at).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Agent home</h2>
        <p className="text-sm text-muted-foreground">
          Assigned leads-only view — privacy enforced by tenant rules.
        </p>
      </div>
      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      ) : null}
      {loading ? (
        <EmptyState message="Loading desk summary…" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">My assignments</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{stats.assignedTotal}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Open follow-ups</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{followUps}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Trials credited</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{stats.trialStarted}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Commissions pending</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{pendingCommissions}</p></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Assigned suburbs</CardTitle>
              <p className="text-sm font-normal text-muted-foreground">
                Your territory from Sales → Agent suburb assignment — workshops and leads use these patches.
              </p>
            </CardHeader>
            <CardContent>
              {!agentId ? (
                <p className="text-sm text-muted-foreground">
                  Your login is not yet linked to an agent row — ops can attach it under Agents.
                </p>
              ) : assignedSuburbLabels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No suburbs on your profile yet — ask a super admin to assign suburbs to you.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {assignedSuburbLabels.map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {stats.assignedTotal >= PROGRESS_EXPAND_AT ? (
            <Card>
              <CardHeader><CardTitle>Snapshot</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="outline">Called · {stats.called}</Badge>
                <Badge variant="outline">Not called · {stats.notCalled}</Badge>
                <Badge variant="secondary">Interested · {stats.interested}</Badge>
                <Badge variant="secondary">Visits · {stats.siteVisitsBooked}</Badge>
                <Badge>Converted · {stats.converted}</Badge>
              </CardContent>
            </Card>
          ) : (
            <p className="text-xs text-muted-foreground">
              Extended funnel snapshot appears automatically when at least twenty leads are routed to your queue.
            </p>
          )}
          <Button type="button" variant="outline" onClick={() => void load()}>
            Refresh summary
          </Button>
        </>
      )}
    </div>
  );
}

export function AgentMyCallListTab({
  agents,
  session,
  currentAgentDbId,
  tenants,
  onRefreshDashboard: _onRefreshDashboard,
}: SalesAgentTabProps) {
  const [rows, setRows] = useState<SalesLeadRow[]>([]);
  const [workshops, setWorkshops] = useState<SalesSuburbWorkshopWithAgentContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totalFromApi, setTotalFromApi] = useState<number | null>(null);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcomeLead, setOutcomeLead] = useState<SalesLeadRow | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const [r, ws] = await Promise.all([
        fetchSalesLeadsMine(),
        fetchSalesSuburbWorkshopsWithAgentContact().catch(
          () => [] as SalesSuburbWorkshopWithAgentContact[],
        ),
      ]);
      setTotalFromApi(r.length);
      setRows(r);
      setNoteDrafts(Object.fromEntries(r.map((l) => [l.id, l.notes ?? ""])));
      setWorkshops(ws);
    } catch (e) {
      if (!silent) {
        setLoadError(e instanceof Error ? e.message : "Failed to load your call list");
        setRows([]);
        setTotalFromApi(null);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [agents, currentAgentDbId, session.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const agentLabel = agents.find((a) => (currentAgentDbId ?? resolveAgentId({ agents, session })) === a.id)?.name;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">My call list</h2>
          <p className="text-sm text-muted-foreground">
            Mark called and save remarks in the table below (scroll horizontally if your screen is narrow). Workshop directory above is from the database — use{" "}
            <strong className="font-medium text-foreground">Reload</strong> to refresh.
            {agentLabel ? ` · ${agentLabel}` : ""}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Reload
        </Button>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load leads</AlertTitle>
          <AlertDescription className="text-sm">{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <SuburbWorkshopsTable
        workshops={workshops}
        loading={loading}
        onRefresh={() => {
          void load({ silent: true });
        }}
      />

      {!loadError && !loading && totalFromApi === 0 ? (
        <Alert>
          <AlertTitle className="text-base">No leads are visible yet</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground space-y-2">
            <p>
              The database returned <strong>0</strong> leads you are allowed to see. Typical fixes:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Apply Supabase migrations <code className="text-xs font-mono">20260511120000</code>{" "}
                and <code className="text-xs font-mono">20260511140000</code> (suburb-patch access + fuzzy suburb match).
              </li>
              <li>
                Add leads in Sales (super admin) with the <strong>same tenant</strong> as your suburb rows, or assign the lead directly to you.
              </li>
              <li>
                Put the same suburb text on the lead as in Agent suburb assignment — matching ignores case; longer
                labels like &quot;Melbourne, VIC&quot; match a patch &quot;Melbourne&quot; after the fuzzy migration.
              </li>
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {loading ? <EmptyState message="Hydrating roster…" /> : (
        <div className="overflow-x-auto rounded-md border">
        <Table className="w-max min-w-full">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Suburb</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="min-w-[10rem]">Mark as called</TableHead>
              <TableHead className="min-w-[220px]">Remarks</TableHead>
              <TableHead className="min-w-[9rem]">Call outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const called = Boolean(r.first_called_at);
              const draft = noteDrafts[r.id] ?? r.notes ?? "";
              const dirty = draft.trim() !== (r.notes ?? "").trim();
              return (
                <TableRow
                  key={r.id}
                  className={`align-top ${r.journey_stage === "converted" ? "opacity-80 bg-muted/20" : ""}`}
                >
                  <TableCell className="align-top">{r.display_name}</TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap align-top">{r.phone}</TableCell>
                  <TableCell className="text-sm align-top">{r.suburb?.trim() || "—"}</TableCell>
                  <TableCell className="align-top"><Badge variant="outline">{r.journey_stage}</Badge></TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1.5 min-w-[9.5rem]">
                      {r.journey_stage === "converted" ? (
                        <span className="text-xs text-muted-foreground">
                          {called && r.first_called_at
                            ? `First call: ${new Date(r.first_called_at).toLocaleString()}`
                            : "—"}
                        </span>
                      ) : called ? (
                        <span className="text-xs text-muted-foreground">
                          {r.first_called_at
                            ? new Date(r.first_called_at).toLocaleString()
                            : "Marked"}
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          disabled={markingId === r.id}
                          onClick={() => {
                            setMarkingId(r.id);
                            void markSalesLeadCalled(r.id)
                              .then(async () => {
                                toast.success("Marked as called");
                                await load({ silent: true });
                              })
                              .catch((e) =>
                                toast.error(e instanceof Error ? e.message : "Could not update"),
                              )
                              .finally(() => setMarkingId(null));
                          }}
                        >
                          {markingId === r.id ? "Saving…" : "Mark as called"}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-2 min-w-[200px] max-w-md">
                      <Textarea
                        rows={3}
                        value={draft}
                        onChange={(e) =>
                          setNoteDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        placeholder="Notes visible to admins on the progress tracker"
                        className="text-sm"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!dirty || savingNotesId === r.id}
                        onClick={() => {
                          setSavingNotesId(r.id);
                          void updateSalesLeadDeskNotes(r.id, draft)
                            .then(async () => {
                              toast.success("Remarks saved");
                              await load({ silent: true });
                            })
                            .catch((e) =>
                              toast.error(e instanceof Error ? e.message : "Could not save"),
                            )
                            .finally(() => setSavingNotesId(null));
                        }}
                      >
                        {savingNotesId === r.id && dirty ? "Saving…" : "Save remarks"}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    {r.journey_stage !== "converted" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        className="w-full min-w-[8rem]"
                        onClick={() => {
                          setOutcomeLead(r);
                          setOutcomeOpen(true);
                        }}
                      >
                        Log outcome
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState message="No rows to show — see the note above the table." />
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        </div>
      )}

      <LeadOutcomeDrawer
        lead={outcomeLead}
        open={outcomeOpen}
        onOpenChange={(v) => {
          setOutcomeOpen(v);
          if (!v) setOutcomeLead(null);
        }}
        onSaved={() => {
          void load({ silent: true });
        }}
      />
    </div>
  );
}

export function AgentCallWorkspaceTab(props: SalesAgentTabProps) {
  const [rows, setRows] = useState<SalesLeadRow[]>([]);
  const [workshops, setWorkshops] = useState<SalesSuburbWorkshopWithAgentContact[]>([]);
  const [sel, setSel] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deskNotes, setDeskNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [leads, ws] = await Promise.all([
        fetchSalesLeadsMine(),
        fetchSalesSuburbWorkshopsWithAgentContact().catch(
          () => [] as SalesSuburbWorkshopWithAgentContact[],
        ),
      ]);
      setRows(leads);
      setWorkshops(ws);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const picked = rows.find((r) => r.id === sel) ?? rows[0] ?? null;

  useEffect(() => {
    if (!picked) {
      setDeskNotes("");
      return;
    }
    setDeskNotes(picked.notes ?? "");
  }, [picked]);

  const workshopsForLead = useMemo(() => {
    if (!picked?.suburb?.trim()) return [];
    return workshopsMatchingSuburb(workshops, picked.suburb);
  }, [picked?.suburb, workshops]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Call workspace</h2>
        <p className="text-sm text-muted-foreground">
          Tie each dial to CRM outcomes — this drawer logs post-call results (trials / visits / conversions).
          Desk notes sync to supervisors on lead records and timelines. Use Overview + softphone for live PBX routing.
        </p>
      </div>
      {loading ? <EmptyState message="Loading assignees…" /> : rows.length === 0 ? (
        <EmptyState message="Nothing assigned — supervisors release leads from Assignment Board." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px,minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>Active dial target</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Select
                value={picked?.id ?? ""}
                onValueChange={(v) => setSel(v)}
              >
                <SelectTrigger><SelectValue placeholder="Pick assigned lead" /></SelectTrigger>
                <SelectContent>
                  {rows.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {picked ? (
                <>
                  <div className="rounded-lg bg-muted px-3 py-2 font-mono text-sm">{picked.phone}</div>
                  <div className="text-xs text-muted-foreground">{picked.suburb || "No suburb captured"} · {picked.journey_stage}</div>
                  <Button type="button" onClick={() => setOpen(true)} disabled={!picked}>
                    Open outcome drawer
                  </Button>
                </>
              ) : null}
            </CardContent>
          </Card>
          <div className="space-y-4 min-w-0">
            <Card>
              <CardHeader><CardTitle>Suburb workshops</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-4">
                {workshopsForLead.length > 0 ? (
                  workshopsForLead.map((workshopForLead) => (
                    <div key={workshopForLead.id} className="rounded-lg border bg-background px-3 py-2 space-y-2">
                      <div className="font-medium">{workshopForLead.workshop_name || "Workshop"}</div>
                      <dl className="grid gap-2 sm:grid-cols-2">
                        {workshopForLead.phone_number ? (
                          <div><span className="text-muted-foreground text-xs">Phone</span><div className="font-mono text-xs">{workshopForLead.phone_number}</div></div>
                        ) : null}
                        {workshopForLead.owner_name ? (
                          <div><span className="text-muted-foreground text-xs">Owner</span><div>{workshopForLead.owner_name}</div></div>
                        ) : null}
                        {workshopForLead.owner_email ? (
                          <div><span className="text-muted-foreground text-xs">Owner email</span><div className="break-all text-xs">{workshopForLead.owner_email}</div></div>
                        ) : null}
                        {workshopForLead.location ? (
                          <div className="sm:col-span-2"><span className="text-muted-foreground text-xs">Location</span><div>{workshopForLead.location}</div></div>
                        ) : null}
                        {workshopForLead.website ? (
                          <div className="sm:col-span-2">
                            <a href={workshopForLead.website.startsWith("http") ? workshopForLead.website : `https://${workshopForLead.website}`} className="text-primary underline break-all text-xs" target="_blank" rel="noreferrer">
                              {workshopForLead.website}
                            </a>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">
                    No workshop records for this lead&apos;s suburb — ask a manager to publish one under Sales → Suburb workshops.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-dashed bg-muted/30">
              <CardHeader><CardTitle>Operator hints</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <p>1. Dial from Overview / softphone, then log the disposition so supervisors retain a clean audit trail.</p>
                <p>2. Every outcome replaces the CRM “notes” preview with what you typed in that call — use desk notes below for quieter scratchpads.</p>
                <Button type="button" variant="secondary" disabled={!picked} onClick={() => setOpen(true)}>Jump to disposition</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Desk remarks</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Saved to this lead&apos;s CRM notes immediately. Logging a disposition overwrites notes with that call memo — recap important context after each log if needed.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="desk-notes">Notes visible to admins</Label>
                  <Textarea
                    id="desk-notes"
                    rows={5}
                    value={deskNotes}
                    onChange={(e) => setDeskNotes(e.target.value)}
                    disabled={!picked}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!picked || notesSaving}
                  onClick={() => {
                    if (!picked) return;
                    setNotesSaving(true);
                    void updateSalesLeadDeskNotes(picked.id, deskNotes).then(async () => {
                      toast.success("Desk notes saved");
                      await reload();
                    }).catch((e) => toast.error(e instanceof Error ? e.message : "Could not save")).finally(() => setNotesSaving(false));
                  }}
                >
                  {notesSaving ? "Saving…" : "Save desk notes"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      <LeadOutcomeDrawer lead={picked} open={open} onOpenChange={setOpen} onSaved={reload} />
    </div>
  );
}

export function AgentFollowUpsTab() {
  const [rows, setRows] = useState<SalesLeadRow[]>([]);
  useEffect(() => {
    void fetchSalesLeadsMine().then((l) =>
      setRows(
        l
          .filter((x) => x.follow_up_at)
          .sort((a, b) =>
            String(a.follow_up_at!).localeCompare(String(b.follow_up_at!)),
          ),
      ),
    );
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">My follow-ups</h2>
          <p className="text-sm text-muted-foreground">Rows created when disposition = call back later.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void fetchSalesLeadsMine().then(setRows)}>Reload</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>When</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.display_name}<div className="font-mono text-[11px] text-muted-foreground">{r.phone}</div></TableCell>
              <TableCell className="whitespace-nowrap text-sm">{r.follow_up_at ? new Date(r.follow_up_at).toLocaleString() : "—"}</TableCell>
              <TableCell className="text-sm">{r.notes || "—"}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 ? <TableRow><TableCell colSpan={3}><EmptyState message="No scheduled retries — outcomes will queue them automatically." /></TableCell></TableRow> : null}
        </TableBody>
      </Table>
    </div>
  );
}

export function AgentMyPipelineTab() {
  const [rows, setRows] = useState<SalesLeadRow[]>([]);
  useEffect(() => {
    void fetchSalesLeadsMine().then(setRows);
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, SalesLeadRow[]>();
    for (const r of rows) {
      const g = r.journey_stage;
      const arr = m.get(g) ?? [];
      arr.push(r);
      m.set(g, arr);
    }
    return m;
  }, [rows]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">My pipeline</h2>
      <p className="text-sm text-muted-foreground">Rows grouped automatically by funnel stage assignment.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from(groups.entries()).map(([stage, list]) => (
          <Card key={stage}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge>{stage}</Badge> <span>{list.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {list.map((l) => (
                <div key={l.id} className="rounded border px-3 py-2">{l.display_name}</div>
              ))}
              {list.length === 0 ? <EmptyState message="Quiet stage." /> : null}
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 ? <EmptyState message="Assignments appear after routing." /> : null}
      </div>
    </div>
  );
}

export function AgentPerformanceRewardsTab(props: SalesAgentTabProps) {
  const agentId = props.currentAgentDbId ?? resolveAgentId(props);
  const [leads, setLeads] = useState<SalesLeadRow[]>([]);
  const [coms, setComs] = useState<Awaited<ReturnType<typeof fetchSalesCommissionTenant>>>([]);
  useEffect(() => {
    void fetchSalesLeadsMine().then(async (mine) => {
      setLeads(mine);
      const tids = [...new Set(mine.map((l) => l.tenant_id))];
      let agg: typeof coms = [];
      for (const t of tids) agg = agg.concat(await fetchSalesCommissionTenant(t));
      setComs(agg);
    });
  }, []);

  const mine = coms.filter((c) => !agentId || c.agent_id === agentId);

  const convertedCount = leads.filter((l) => l.journey_stage === "converted").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Performance &amp; rewards</h2>
        <p className="text-sm text-muted-foreground">Self-serve rollup — finance still reviews payouts.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Converted</CardTitle></CardHeader>
        <CardContent><p className="text-3xl font-semibold">{convertedCount}</p></CardContent>
      </Card>
      <div>
        <h3 className="text-sm font-semibold mb-2">Commission events</h3>
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Lead</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {mine.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(c.created_at).toLocaleString()}</TableCell>
                <TableCell className="font-mono text-xs truncate max-w-[200px]">{c.lead_id}</TableCell>
                <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
              </TableRow>
            ))}
            {mine.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <EmptyState message="Win conversions to generate Pending Review commissions." />
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
