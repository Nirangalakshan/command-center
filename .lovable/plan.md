

# Command Centre — Multi-Tenant Call Centre Dashboard

## Architecture Overview

A production-grade, role-aware, tenant-isolated dashboard with ~25 files organized into a clean module structure. All data flows through a centralized mock API service shaped like real endpoints, a permissions system driven by a mock session, and role-aware UI rendering.

```text
src/
├── pages/
│   └── DashboardPage.tsx          # Root page (replaces Index)
├── services/
│   ├── mockSession.ts             # Mock auth session (role, tenantId, queueIds)
│   ├── dashboardApi.ts            # Mock API service layer (swap-ready)
│   └── types.ts                   # All domain model interfaces
├── hooks/
│   ├── useDashboardData.ts        # Main data hook (polling, tenant filtering)
│   ├── useLiveClock.ts            # Live clock hook
│   └── usePermissions.ts          # Derives permissions from session
├── utils/
│   ├── formatters.ts              # formatDuration, formatTime, formatPhone
│   └── permissions.ts             # Permission flags logic
├── components/dashboard/
│   ├── DashboardHeader.tsx        # Logo, tenant selector, clock, connection badge
│   ├── DashboardTabs.tsx          # Tab bar (role-filtered)
│   ├── TenantSelector.tsx         # Locked for client-admin, hidden for agent
│   ├── ConnectionBadge.tsx        # Connected/Reconnecting/Disconnected
│   ├── MetricCard.tsx             # Single KPI card
│   ├── QueueSummaryCard.tsx       # Queue stats card
│   ├── StatusBadge.tsx            # Agent status badge
│   ├── ResultBadge.tsx            # Call result badge
│   ├── LiveDot.tsx                # Pulsing live indicator
│   ├── EmptyState.tsx             # No-data placeholder
│   └── LoadingSkeleton.tsx        # Loading skeleton grid
├── tabs/
│   ├── OverviewTab.tsx            # Metrics + queues + live calls table
│   ├── AgentsTab.tsx              # Filterable agent cards with live timers
│   ├── CallsTab.tsx               # Searchable call log table
│   └── SipLinesTab.tsx            # SIP trunk grid (role-gated)
└── styles/
    └── dashboard.css              # All custom CSS with design tokens
```

## Domain Model (types.ts)

TypeScript interfaces for: `Tenant`, `Queue`, `Agent`, `Call`, `SipLine`, `UserSession`, `DashboardSummary`, `UserRole` enum (`super-admin | client-admin | agent`). Every entity carries `tenantId`. `UserSession` includes `role`, `tenantId`, `allowedQueueIds`.

## Permissions System

`permissions.ts` exports a `derivePermissions(session: UserSession)` function returning a flat object:

| Flag | Super Admin | Client Admin | Agent |
|------|-------------|--------------|-------|
| `canViewAllTenants` | yes | no | no |
| `canSwitchTenant` | yes | no | no |
| `canViewSipInfrastructure` | yes | no | no |
| `canViewTenantNames` | yes | no | no |
| `canViewCallsTab` | yes | yes | no |
| `canViewAgentsTab` | yes | yes | no |
| `canViewSipTab` | yes | no | no |
| `canViewOverviewTab` | yes | yes | yes |

`usePermissions` hook wraps this and provides it via context or direct use.

## Mock Session (mockSession.ts)

Exports `getCurrentSession(): UserSession` — returns a hardcoded super-admin session by default. Includes commented alternatives for client-admin and agent roles for testing. Shaped to be replaced by real auth later.

## Mock API Service (dashboardApi.ts)

- Static seed data arrays for tenants, queues, agents, calls, SIP lines (no `Math.random`)
- Each function accepts `tenantId?: string` and filters accordingly
- Functions: `fetchSession`, `fetchTenants`, `fetchSummary`, `fetchQueues`, `fetchAgents`, `fetchCalls`, `fetchSipLines`
- All return Promises with simulated latency (~200ms)
- Structured to be swappable with real `fetch()` calls

## Data Hook (useDashboardData.ts)

- Fetches all data on mount and on tenant change
- Polls every 8 seconds
- Manages loading/error/connection states
- 1-second interval for `now` timestamp (live timers)
- Exposes: `selectedTenant`, `setSelectedTenant`, `selectedTab`, `setSelectedTab`, all data arrays, `loading`, `error`, `connectionStatus`, `now`, `refresh`

## Role-Aware UI Behavior

**DashboardHeader**: TenantSelector is hidden for agents, locked (showing only their tenant name) for client-admins, full dropdown for super-admins.

**DashboardTabs**: Filters visible tabs based on permissions. Agent sees only Overview. Client-admin sees Overview + Agents + Calls. Super-admin sees all four.

**OverviewTab**: "Client" column in live calls table only visible to super-admin. Per-tenant overview cards in All Clients mode (super-admin only).

**AgentsTab**: Tenant filter chips only for super-admin. Agent role sees only their assigned queues.

**CallsTab**: Client column only for super-admin. Tenant filter only for super-admin.

**SipLinesTab**: Only accessible to super-admin. Shows full infrastructure view with tenant assignments.

## Styling Approach

Single `dashboard.css` file with CSS custom properties as design tokens (identical to the spec's dark theme). The dashboard renders inside a `.cc-root` wrapper that scopes all styles, avoiding conflicts with Tailwind. Fonts: Rajdhani (display) + IBM Plex Mono. Responsive breakpoints for mobile.

## Key Implementation Details

- All components are TypeScript with proper prop interfaces
- Live call durations computed as `now - callStartTime` and re-rendered every second
- Connection badge with pulse animation
- Tables use sticky headers
- Filter chips for queue/status/result filtering
- Search input on Calls tab filters by caller number, agent name, queue name
- Loading skeletons during initial fetch
- Empty states when no data matches filters
- Error banner with retry button on fetch failure
- `DashboardPage.tsx` is wired as the Index route

## Files to Create (~25 files)

1. `src/services/types.ts`
2. `src/services/mockSession.ts`
3. `src/services/dashboardApi.ts`
4. `src/utils/formatters.ts`
5. `src/utils/permissions.ts`
6. `src/hooks/useDashboardData.ts`
7. `src/hooks/useLiveClock.ts`
8. `src/hooks/usePermissions.ts`
9. `src/styles/dashboard.css`
10. `src/components/dashboard/DashboardHeader.tsx`
11. `src/components/dashboard/DashboardTabs.tsx`
12. `src/components/dashboard/TenantSelector.tsx`
13. `src/components/dashboard/ConnectionBadge.tsx`
14. `src/components/dashboard/MetricCard.tsx`
15. `src/components/dashboard/QueueSummaryCard.tsx`
16. `src/components/dashboard/StatusBadge.tsx`
17. `src/components/dashboard/ResultBadge.tsx`
18. `src/components/dashboard/LiveDot.tsx`
19. `src/components/dashboard/EmptyState.tsx`
20. `src/components/dashboard/LoadingSkeleton.tsx`
21. `src/tabs/OverviewTab.tsx`
22. `src/tabs/AgentsTab.tsx`
23. `src/tabs/CallsTab.tsx`
24. `src/tabs/SipLinesTab.tsx`
25. `src/pages/DashboardPage.tsx`

## Files to Modify (2 files)

1. `src/pages/Index.tsx` — import and render `DashboardPage`
2. `src/index.css` — import `dashboard.css`

