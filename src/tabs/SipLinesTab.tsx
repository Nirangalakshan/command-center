import type { SipLine, Tenant, Permissions } from '@/services/types';
import { formatDuration, formatPhone } from '@/utils/formatters';
import { LiveDot } from '@/components/dashboard/LiveDot';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SipLinesTabProps {
  sipLines: SipLine[];
  tenants: Tenant[];
  permissions: Permissions;
  now: number;
}

export function SipLinesTab({ sipLines, tenants, permissions, now }: SipLinesTabProps) {
  // Only super-admin should see this tab — double-check
  if (!permissions.canViewSipInfrastructure) {
    return <EmptyState message="You do not have permission to view SIP infrastructure." />;
  }

  const activeCount = sipLines.filter((l) => l.status === 'active').length;
  const idleCount = sipLines.filter((l) => l.status === 'idle').length;

  return (
    <div className="cc-fade-in space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Yeastar SIP Trunks
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-sm text-rose-700">
          <span className="font-semibold">{activeCount}</span>
          <span>in use</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700">
          <span className="font-semibold">{idleCount}</span>
          <span>available</span>
        </div>
      </div>

      {sipLines.length === 0 ? (
        <EmptyState message="No SIP lines configured" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {sipLines.map((l) => {
            const isActive = l.status === 'active';
            const tenant = l.tenantId ? tenants.find((t) => t.id === l.tenantId) : null;
            return (
              <Card key={l.id} className="overflow-hidden border-border/80 bg-white shadow-sm">
                {isActive && <div className="h-1 w-full bg-rose-500" />}
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base">{l.label}</CardTitle>
                  <Badge
                    variant="outline"
                    className="rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      color: isActive ? 'var(--cc-color-red)' : 'var(--cc-color-green)',
                      background: isActive ? 'rgba(244,63,94,0.12)' : 'rgba(52,211,153,0.12)',
                    }}
                  >
                    {isActive ? 'IN USE' : 'IDLE'}
                  </Badge>
                </CardHeader>
                <CardContent>
                {isActive ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs">
                        {formatPhone(l.activeCaller)}
                      </span>
                      <span className="inline-flex items-center font-mono text-xs font-semibold text-rose-600">
                        <LiveDot /> {l.activeSince ? formatDuration(now - l.activeSince) : '—'}
                      </span>
                    </div>
                    {permissions.canViewTenantNames && tenant && (
                      <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        {tenant.name}
                      </div>
                    )}
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
                      {l.trunkName}
                    </div>
                  </>
                ) : (
                    <div className="font-mono text-xs text-muted-foreground">No active call</div>
                )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
