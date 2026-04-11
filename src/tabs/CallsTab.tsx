import { useState, useMemo } from 'react';
import type { Call, Queue, Tenant, Permissions } from '@/services/types';
import { formatTime, formatPhone, formatSeconds } from '@/utils/formatters';
import { ResultBadge, RESULT_MAP } from '@/components/dashboard/ResultBadge';
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

export function CallsTab({ calls, queues, tenants, permissions }: CallsTabProps) {
  const [filterResult, setFilterResult] = useState('all');
  const [filterQueue, setFilterQueue] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const availableQueues = useMemo(() => {
    const qids = new Set(calls.map((c) => c.queueId));
    return queues.filter((q) => qids.has(q.id));
  }, [calls, queues]);

  const filtered = useMemo(() => {
    let list = calls;
    if (filterResult !== 'all') list = list.filter((c) => c.result === filterResult);
    if (filterQueue !== 'all') list = list.filter((c) => c.queueId === filterQueue);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((c) =>
        c.callerNumber.includes(s) ||
        c.agentName.toLowerCase().includes(s) ||
        c.queueName.toLowerCase().includes(s) ||
        c.tenantName.toLowerCase().includes(s) ||
        (c.callerName && c.callerName.toLowerCase().includes(s))
      );
    }
    return list;
  }, [calls, filterResult, filterQueue, searchTerm]);

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
            placeholder="Search by caller, agent, queue, client..."
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
          <CardTitle className="text-base">Call History</CardTitle>
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
                  <TableHead>Caller</TableHead>
                  {permissions.canViewTenantNames && (
                    <TableHead>Client</TableHead>
                  )}
                  <TableHead>Queue</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const tenant = tenants.find((t) => t.id === c.tenantId);
                  const brandColor = tenant?.brandColor || 'var(--cc-color-cyan)';

                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{formatTime(c.startTime)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatPhone(c.callerNumber)}
                        {c.callerName && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {c.callerName}
                          </div>
                        )}
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
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            color: queues.find((q) => q.id === c.queueId)?.color || 'var(--cc-color-cyan)',
                            background: `${queues.find((q) => q.id === c.queueId)?.color || 'var(--cc-color-cyan)'}18`,
                          }}
                        >
                          {c.queueName}
                        </Badge>
                      </TableCell>
                      <TableCell>{c.agentName}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.durationSeconds > 0 ? formatSeconds(c.durationSeconds) : '—'}
                      </TableCell>
                      <TableCell><ResultBadge result={c.result} /></TableCell>
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
