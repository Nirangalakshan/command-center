import { useMemo } from 'react';
import { derivePermissions } from '@/utils/permissions';
import type { UserSession, Permissions } from '@/services/types';

/** Derives permissions from the current session. Memoised. */
export function usePermissions(session: UserSession | null): Permissions {
  return useMemo(() => {
    if (!session) {
      return {
        canViewAllTenants: false,
        canSwitchTenant: false,
        canViewSipInfrastructure: false,
        canViewTenantNames: false,
        canViewCallsTab: false,
        canViewAgentsTab: false,
        canViewOverviewTab: false,
        canViewSipTab: false,
        canViewClientsTab: false,
        canSignUpClients: false,
        canAdvanceOnboarding: false,
        allowedTenantId: null,
        allowedQueueIds: [],
      };
    }
    return derivePermissions(session);
  }, [session]);
}
