import { useState, useEffect, useRef, useMemo } from 'react';
import type { Call, CallResult, Queue, Tenant, Permissions } from '@/services/types';
import { fetchCallerNameByPhone } from '@/services/customersApi';
import { fetchDIDMappings } from '@/services/dashboardApi';
import {
  mergeCallsWithLinkusLog,
  readLinkusCallLog,
  LINKUS_CALL_LOG_EVENT,
} from '@/services/linkusCallLog';
import { formatTime, formatPhone, formatSeconds } from '@/utils/formatters';
import { RESULT_MAP } from '@/components/dashboard/ResultBadge';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface CallsTabProps {
  calls: Call[];
  queues: Queue[];
  tenants: Tenant[];
  permissions: Permissions;
}

// ── Caller-name resolution hook ──────────────────────────────────────────────

/**
 * Fetches real customer names from Firebase for every unique callerNumber
 * in the calls list, keyed by callerNumber for O(1) lookup in the table.
 * Results are cached across re-renders so the same number is never fetched twice.
 *
 * Owner UID resolution order (mirrors CallDetailsSheet):
 *   1. DID mapping ownerId (looked up by call.dialedNumber)
 *   2. tenant.bmsOwnerUid
 *   3. call.tenantId (final fallback — works when tenantId IS the Firebase owner UID)
 */
function useCallerNames(calls: Call[], tenants: Tenant[]) {
  // Map<callerNumber, resolvedName | null>
  const [nameMap, setNameMap] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(false);
  // Persistent cache keyed by "ownerUid::callerNumber" so it invalidates when ownerUid changes
  const cacheRef = useRef<Map<string, string | null>>(new Map());
  // DID → ownerId from did_mappings table
  const [didOwnerMap, setDidOwnerMap] = useState<Map<string, string>>(new Map());
  const [didMapLoaded, setDidMapLoaded] = useState(false);
  const didMapLoadedRef = useRef(false);

  // Build tenantId → bmsOwnerUid lookup
  const ownerByTenant = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tenants) {
      if (t.bmsOwnerUid) m.set(t.id, t.bmsOwnerUid);
    }
    return m;
  }, [tenants]);

  // Load DID mappings once to resolve ownerId from dialedNumber
  useEffect(() => {
    if (didMapLoadedRef.current) return;
    didMapLoadedRef.current = true;

    fetchDIDMappings()
      .then((mappings) => {
        const m = new Map<string, string>();
        for (const d of mappings) {
          if (d.ownerId) m.set(d.did, d.ownerId);
        }
        setDidOwnerMap(m);
        // Clear any names cached with the wrong ownerUid (fallback tenantId)
        cacheRef.current.clear();
        setDidMapLoaded(true);
      })
      .catch(() => {
        // DID mappings may not be accessible for non-super-admin — continue without
        setDidMapLoaded(true);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Collect unique (ownerUid, callerNumber) pairs that aren't cached yet
    const lookups = new Map<string, string>(); // callerNumber → ownerUid
    for (const call of calls) {
      // Resolve owner UID in priority order (matches CallDetailsSheet logic):
      // 1. DID mapping ownerId (from dialedNumber)
      // 2. tenant.bmsOwnerUid
      // 3. tenantId itself (fallback — many setups use tenantId as the Firebase UID)
      const didOwner = call.dialedNumber ? didOwnerMap.get(call.dialedNumber) : undefined;
      const tenantOwner = ownerByTenant.get(call.tenantId);
      const ownerUid = didOwner || tenantOwner || call.tenantId;

      // Cache key includes ownerUid so if it changes (e.g. DID map loads), we re-fetch
      const cacheKey = `${ownerUid}::${call.callerNumber}`;
      if (cacheRef.current.has(cacheKey)) continue;
      if (lookups.has(call.callerNumber)) continue;

      if (ownerUid) {
        lookups.set(call.callerNumber, ownerUid);
      }
    }

    if (lookups.size === 0) {
      // Nothing new to fetch — rebuild nameMap from cache
      const next = new Map<string, string | null>();
      for (const [key, val] of cacheRef.current) {
        const phone = key.split('::')[1];
        if (phone) next.set(phone, val);
      }
      setNameMap(next);
      return;
    }

    setLoading(true);

    // Fire all lookups in parallel
    const entries = Array.from(lookups.entries());
    Promise.allSettled(
      entries.map(([phone, ownerUid]) =>
        fetchCallerNameByPhone(ownerUid, phone).then((name) => ({
          phone,
          ownerUid,
          name,
        })),
      ),
    ).then((results) => {
      if (cancelled) return;

      for (const r of results) {
        if (r.status === 'fulfilled') {
          const cacheKey = `${r.value.ownerUid}::${r.value.phone}`;
          cacheRef.current.set(cacheKey, r.value.name);
        }
      }

      // Rebuild phone → name map from cache
      const next = new Map<string, string | null>();
      for (const [key, val] of cacheRef.current) {
        const phone = key.split('::')[1];
        if (phone) next.set(phone, val);
      }
      setNameMap(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [calls, ownerByTenant, didOwnerMap, didMapLoaded]);

  return { nameMap, loading };
}

function CallStatusBadge({ result }: { result: CallResult }) {
  const r = RESULT_MAP[result] ?? RESULT_MAP.missed;
  const label = result === 'abandoned' ? 'Hung up' : r.label;
  return (
    <Badge
      variant="outline"
      className="rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold"
      style={{ color: r.color, background: r.bg }}
    >
      {label}
    </Badge>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function CallsTab({ calls, queues, tenants, permissions }: CallsTabProps) {
  const [filterResult, setFilterResult] = useState('all');
  const [filterQueue, setFilterQueue] = useState('all');
  const [filterDirection, setFilterDirection] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [linkusLog, setLinkusLog] = useState<Call[]>(() => readLinkusCallLog());

  useEffect(() => {
    const sync = () => setLinkusLog(readLinkusCallLog());
    window.addEventListener(LINKUS_CALL_LOG_EVENT, sync);
    return () => window.removeEventListener(LINKUS_CALL_LOG_EVENT, sync);
  }, []);

  const allCalls = useMemo(
    () => mergeCallsWithLinkusLog(calls, linkusLog),
    [calls, linkusLog],
  );

  const { nameMap, loading: namesLoading } = useCallerNames(allCalls, tenants);

  const availableQueues = useMemo(() => {
    const qids = new Set(allCalls.map((c) => c.queueId));
    return queues.filter((q) => qids.has(q.id));
  }, [allCalls, queues]);

  const filtered = useMemo(() => {
    let list = allCalls;
    if (filterDirection !== 'all') {
      list = list.filter((c) => c.direction === filterDirection);
    }
    if (filterResult !== 'all') list = list.filter((c) => c.result === filterResult);
    if (filterQueue !== 'all') list = list.filter((c) => c.queueId === filterQueue);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((c) => {
        const resolvedName = nameMap.get(c.callerNumber);
        const dirLabel = c.direction === 'outbound' ? 'outbound' : 'inbound';
        return (
          c.callerNumber.includes(s) ||
          c.agentName.toLowerCase().includes(s) ||
          c.queueName.toLowerCase().includes(s) ||
          c.tenantName.toLowerCase().includes(s) ||
          dirLabel.includes(s) ||
          (c.callerName && c.callerName.toLowerCase().includes(s)) ||
          (resolvedName && resolvedName.toLowerCase().includes(s))
        );
      });
    }
    return list;
  }, [allCalls, filterDirection, filterResult, filterQueue, searchTerm, nameMap]);

  return (
    <div className="cc-fade-in space-y-6">
      <Card className="border-border/80 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            className="max-w-md bg-white"
            type="text"
            placeholder="Search by customer name, phone, agent, queue, tenant, inbound / outbound…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-white shadow-sm">
        <CardHeader className="gap-4 pb-3">
          <div className="space-y-4">
            <div>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Filter by Direction
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filterDirection === 'all' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setFilterDirection('all')}
                >
                  All calls
                </Button>
                <Button
                  variant={filterDirection === 'inbound' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full bg-white"
                  onClick={() => setFilterDirection('inbound')}
                >
                  Inbound
                </Button>
                <Button
                  variant={filterDirection === 'outbound' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full bg-white"
                  onClick={() => setFilterDirection('outbound')}
                >
                  Outbound
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Filter by Result
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filterResult === 'all' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setFilterResult('all')}
                >
                  All Results
                </Button>
                {Object.entries(RESULT_MAP).map(([key, val]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    className="rounded-full bg-white"
                    onClick={() => setFilterResult(key)}
                    style={filterResult === key ? { borderColor: val.color, color: val.color, background: val.bg } : {}}
                  >
                    {val.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Filter by Queue
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filterQueue === 'all' ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setFilterQueue('all')}
                >
                  All Queues
                </Button>
                {availableQueues.map((q) => (
                  <Button
                    key={q.id}
                    variant="outline"
                    size="sm"
                    className="rounded-full bg-white"
                    onClick={() => setFilterQueue(q.id)}
                    style={filterQueue === q.id ? { borderColor: q.color, color: q.color, background: `${q.color}0a` } : {}}
                  >
                    {q.icon} {q.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-border/80 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-3 text-base">
            Call History
            {namesLoading && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-normal text-slate-500">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
                Resolving names…
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState message="No calls match filters" />
          ) : (
            <div className="max-h-[min(70vh,560px)] w-full min-w-0 overflow-auto rounded-md border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  {permissions.canViewTenantNames && (
                    <TableHead>Tenant</TableHead>
                  )}
                  <TableHead>Agent</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const tenant = tenants.find((t) => t.id === c.tenantId);
                  const brandColor = tenant?.brandColor || 'var(--cc-color-cyan)';
                  const resolvedName = nameMap.get(c.callerNumber) || c.callerName;

                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{formatTime(c.startTime)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge
                            variant="outline"
                            className={
                              c.direction === 'outbound'
                                ? 'rounded-full border-violet-300 bg-violet-50 text-[11px] font-semibold text-violet-800'
                                : 'rounded-full border-sky-300 bg-sky-50 text-[11px] font-semibold text-sky-800'
                            }
                          >
                            {c.direction === 'outbound' ? 'Outbound' : 'Inbound'}
                          </Badge>
                          {c.id.startsWith('linkus-') && (
                            <Badge
                              variant="outline"
                              className="rounded-full border-amber-200 bg-amber-50 text-[10px] font-medium text-amber-900"
                              title="Logged from this browser until PBX CDR appears in Supabase"
                            >
                              Softphone
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {resolvedName ? (
                          <span className="font-medium text-foreground">{resolvedName}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {formatPhone(c.callerNumber)}
                      </TableCell>
                      {permissions.canViewTenantNames && (
                        <TableCell>
                          <span
                            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold"
                            style={{
                              color: brandColor,
                              borderColor: `${brandColor}40`,
                              background: `${brandColor}12`,
                            }}
                          >
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brandColor }} />
                            {c.tenantName}
                          </span>
                        </TableCell>
                      )}
                      <TableCell className="max-w-[200px]">
                        <span className="font-medium text-foreground">{c.agentName}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.durationSeconds > 0 ? formatSeconds(c.durationSeconds) : '—'}
                      </TableCell>
                      <TableCell>
                        <CallStatusBadge result={c.result} />
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
    </div>
  );
}

