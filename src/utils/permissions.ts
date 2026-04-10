import type { UserSession, Permissions } from "@/services/types";

/**
 * Derive a flat permissions object from the authenticated session.
 * All UI should consume these flags instead of scattering role checks.
 */
export function derivePermissions(session: UserSession): Permissions {
  const { role, tenantId, allowedQueueIds } = session;

  const isSuperAdmin = role === "super-admin";
  const isClientAdmin = role === "client-admin";
  const isSupervisor = role === "supervisor";
  const isAgent = role === "agent";

  return {
    canViewAllTenants: isSuperAdmin || isAgent,
    canSwitchTenant: isSuperAdmin,
    canViewSipInfrastructure: isSuperAdmin,
    canViewTenantNames: isSuperAdmin || isSupervisor || isAgent,
    canViewCallsTab: isSuperAdmin || isClientAdmin || isSupervisor || isAgent,
    canViewBookingsTab:
      isSuperAdmin || isClientAdmin || isSupervisor || isAgent,
    canViewAgentsTab: isSuperAdmin || isClientAdmin || isSupervisor,
    canViewOverviewTab: true,
    canViewSipTab: isSuperAdmin,
    canViewClientsTab: isSuperAdmin || isClientAdmin || isSupervisor,
    canSignUpClients: isSuperAdmin || isClientAdmin,
    canAdvanceOnboarding: isSuperAdmin,
    canEditClientDetails: isSuperAdmin || isClientAdmin || isSupervisor,
    canApproveGoLive: isSuperAdmin,
    canRegressStage: isSuperAdmin || isClientAdmin || isSupervisor,
    canViewShiftPanel: isAgent,
    canOnboardAgents: isSuperAdmin || isClientAdmin,
    canViewAgentOnboarding: isSuperAdmin || isClientAdmin || isSupervisor,
    canViewAgentOnboardingTab: isSuperAdmin || isClientAdmin || isSupervisor,
    canViewAuditLogs: isSuperAdmin,
    canManageAgents: isSuperAdmin,
    allowedTenantId: tenantId,
    allowedQueueIds: allowedQueueIds,
  };
}
