import type { ReactNode } from "react";
import { EmptyState } from "@/components/dashboard/EmptyState";

export function SalesTenantScope({
  tenantId,
  children,
}: {
  tenantId: string | null;
  children: (tid: string) => ReactNode;
}) {
  if (!tenantId) {
    return (
      <EmptyState message="Select a tenant to use the sales workspace — open Overview and pick a workshop, or ensure your profile has a tenant assigned." />
    );
  }
  return <>{children(tenantId)}</>;
}
