import type { UserSession, Permissions } from '@/services/types';

/**
 * Derive a flat permissions object from the authenticated session.
 * All UI should consume these flags instead of scattering role checks.
 */
export function derivePermissions(session: UserSession): Permissions {
  const { role, tenantId, allowedQueueIds } = session;

  const isSuperAdmin = role === 'super-admin';
  const isClientAdmin = role === 'client-admin';
  const isSupervisor = role === 'supervisor';
  const isAgent = role === 'agent';

  return {
    canViewAllTenants: isSuperAdmin,
    canSwitchTenant: isSuperAdmin,
    canViewSipInfrastructure: isSuperAdmin,
    canViewTenantNames: isSuperAdmin || isSupervisor,
    canViewCallsTab: isSuperAdmin || isClientAdmin || isSupervisor,
    canViewAgentsTab: isSuperAdmin || isClientAdmin || isSupervisor,
    canViewOverviewTab: true,
    canViewSipTab: isSuperAdmin,
    canViewClientsTab: isSuperAdmin || isClientAdmin || isSupervisor,
    canSignUpClients: isSuperAdmin || isClientAdmin,
    canAdvanceOnboarding: isSuperAdmin,
    canEditClientDetails: isSuperAdmin || isClientAdmin || isSupervisor,
    canApproveGoLive: isSuperAdmin,
    canRegressStage: isSuperAdmin || isClientAdmin || isSupervisor,
    allowedTenantId: tenantId,
    allowedQueueIds: allowedQueueIds,
  };
}
