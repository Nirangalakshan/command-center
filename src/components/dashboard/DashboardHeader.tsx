import type { Tenant, Permissions, ConnectionStatus, UserRole } from '@/services/types';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectionBadge } from './ConnectionBadge';
import { TenantSelector } from './TenantSelector';

interface DashboardHeaderProps {
  tenants: Tenant[];
  selectedTenant: string | null;
  onSelectTenant: (id: string | null) => void;
  connectionStatus: ConnectionStatus;
  clockStr: string;
  permissions: Permissions;
  displayName: string;
  currentRole: UserRole;
  onSignOut: () => Promise<void>;
}

export function DashboardHeader({
  tenants,
  selectedTenant,
  onSelectTenant,
  connectionStatus,
  clockStr,
  permissions,
  displayName,
  currentRole,
  onSignOut,
}: DashboardHeaderProps) {
  const currentTenant = tenants.find((t) => t.id === permissions.allowedTenantId);

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-xl shadow-sm">
              <span aria-hidden="true">📡</span>
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight text-slate-950">Command Centre</div>
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Yeastar P-Series · {currentRole} · {displayName}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <TenantSelector
              tenants={tenants}
              selectedTenant={selectedTenant}
              onSelect={onSelectTenant}
              permissions={permissions}
              currentTenantName={currentTenant?.name}
            />
            <ConnectionBadge status={connectionStatus} />
            <div className="rounded-full border border-border bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
              {clockStr}
            </div>
            <Button onClick={onSignOut} variant="outline" className="gap-2 bg-white">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
