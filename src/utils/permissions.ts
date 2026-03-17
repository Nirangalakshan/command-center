import type { UserSession, Permissions } from '@/services/types';

/**
 * Derive a flat permissions object from the authenticated session.
 * All UI should consume these flags instead of scattering role checks.
 */
export function derivePermissions(session: UserSession): Permissions {
  const { role, tenantId, allowedQueueIds } = session;

  const isSuperAdmin = role === 'super-admin';
  const isClientAdmin = role === 'client-admin';
  const isAgent = role === 'agent';

  return {
    canViewAllTenants: isSuperAdmin,
    canSwitchTenant: isSuperAdmin,
    canViewSipInfrastructure: isSuperAdmin,
    canViewTenantNames: isSuperAdmin,
    canViewCallsTab: isSuperAdmin || isClientAdmin,
    canViewAgentsTab: isSuperAdmin || isClientAdmin,
    canViewOverviewTab: true,
    canViewSipTab: isSuperAdmin,
    canViewClientsTab: isSuperAdmin || isClientAdmin,
    canSignUpClients: isSuperAdmin || isClientAdmin, // agents must NOT create clients
    canAdvanceOnboarding: isSuperAdmin,
    canEditClientDetails: isSuperAdmin || isClientAdmin,
    canApproveGoLive: isSuperAdmin,                   // only super-admin can approve go-live
    canRegressStage: isSuperAdmin || isClientAdmin,    // both can send back to revision
    allowedTenantId: tenantId,
    allowedQueueIds: allowedQueueIds,
  };
}
