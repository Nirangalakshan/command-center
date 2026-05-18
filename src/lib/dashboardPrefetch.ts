import type { QueryClient } from '@tanstack/react-query';
import {
  fetchCalls,
  fetchQueues,
  fetchAgentGroups,
  fetchSipLines,
} from '@/services/dashboardApi';
import { fetchAgentOnboarding } from '@/services/agentOnboardingApi';
import { attendanceDayRangeAustralianYmd } from '@/utils/australianTime';
import {
  callsFetchLimitForTab,
  tabNeedsAgentGroups,
  tabNeedsAgentOnboarding,
  tabNeedsCalls,
  tabNeedsQueues,
  tabNeedsSip,
} from '@/lib/dashboardQueryLimits';

/** Warm React Query cache when the user hovers a sidebar destination (best-effort). */
export function prefetchDashboardNavTab(
  queryClient: QueryClient,
  opts: { tenantId: string | null; callDate: string; tabKey: string; isAgent: boolean },
): void {
  const { tenantId, callDate, tabKey, isAgent } = opts;
  if (!tenantId) return;

  if (tabNeedsQueues(tabKey)) {
    void queryClient.prefetchQuery({
      queryKey: ['queues', tenantId],
      queryFn: () => fetchQueues(tenantId),
      staleTime: 8_000,
    });
  }

  if (tabNeedsCalls(tabKey)) {
    const limit = callsFetchLimitForTab(tabKey);
    const { startIso, endIso } = attendanceDayRangeAustralianYmd(callDate);
    void queryClient.prefetchQuery({
      queryKey: ['calls', tenantId, callDate, limit],
      queryFn: () => fetchCalls(tenantId, limit, startIso, endIso),
      staleTime: 5_000,
    });
  }

  if (tabNeedsAgentGroups(tabKey)) {
    void queryClient.prefetchQuery({
      queryKey: ['agentGroups', tenantId],
      queryFn: () => fetchAgentGroups(tenantId),
      staleTime: 45_000,
    });
  }

  if (tabNeedsSip(tabKey, isAgent)) {
    void queryClient.prefetchQuery({
      queryKey: ['sipLines', tenantId],
      queryFn: () => fetchSipLines(tenantId),
      staleTime: 15_000,
    });
  }

  if (tabNeedsAgentOnboarding(tabKey, isAgent)) {
    void queryClient.prefetchQuery({
      queryKey: ['agentOnboarding', tenantId],
      queryFn: () => fetchAgentOnboarding(tenantId),
      staleTime: 60_000,
    });
  }
}
