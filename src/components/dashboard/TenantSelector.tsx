import type { Tenant, Permissions } from '@/services/types';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TenantSelectorProps {
  tenants: Tenant[];
  selectedTenant: string | null;
  onSelect: (tenantId: string | null) => void;
  permissions: Permissions;
  currentTenantName?: string;
}

export function TenantSelector({
  tenants,
  selectedTenant,
  onSelect,
  permissions,
  currentTenantName,
}: TenantSelectorProps) {
  // Agents don't see the tenant selector at all
  if (!permissions.canSwitchTenant && !permissions.allowedTenantId) {
    return null;
  }

  // Client admins see a locked label — no dropdown
  if (!permissions.canSwitchTenant) {
    return (
      <Badge variant="outline" className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
        Locked: {currentTenantName || 'Your Organisation'}
      </Badge>
    );
  }

  return (
    <Select value={selectedTenant || '__all__'} onValueChange={(value) => onSelect(value === '__all__' ? null : value)}>
      <SelectTrigger className="w-[180px] bg-white">
        <SelectValue placeholder="All Clients" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All Clients</SelectItem>
        {tenants.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
