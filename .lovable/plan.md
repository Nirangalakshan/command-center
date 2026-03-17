

## Plan: Agent Groups, DID-Based Client Routing, and Agent Shift View

### What We're Building

Three interconnected features:

1. **Agent Groups** — Agents belong to ring groups. When a call comes in, all available agents in the group see it; any one can answer.
2. **DID → Client Mapping** — Each tenant has assigned DID numbers. When a call arrives on a DID, the system identifies the client (tenant) and end customer (caller) automatically.
3. **Agent Shift View** — When an agent logs in, they see their assigned clients, grouped queues, and incoming calls with client + caller identification prominently displayed.

### Data Model Changes

**`src/services/types.ts`**:

- New `AgentGroup` interface:
  ```
  { id, name, tenantId, queueId, agentIds: string[], ringStrategy: 'ring-all' | 'round-robin' | 'longest-idle' }
  ```
- New `DIDMapping` interface:
  ```
  { did: string, tenantId: string, queueId: string, label: string }
  ```
- New `IncomingCall` interface (for the live agent view):
  ```
  { id, did, callerNumber, callerName, tenantId, tenantName, tenantBrandColor, queueId, queueName, groupId, waitingSince: number, status: 'ringing' | 'queued' }
  ```
- Add `assignedTenantIds: string[]` and `groupIds: string[]` to `Agent`
- Add `didNumbers: string[]` to `Tenant`

### Seed Data (`src/services/dashboardApi.ts`)

- **DID mappings**: 8-10 DIDs across the 4 tenants (e.g., `03 9000 1001` → Melbourne Plumbing Sales, `03 9000 2001` → Sunrise Dental New Patients)
- **Agent groups**: One group per queue (e.g., "Plumbing Sales Team" with agents a-01, a-04 for queue q-s1)
- **Incoming calls**: 3-4 mock ringing/queued calls for the agent shift view
- Some agents get cross-tenant `assignedTenantIds` (e.g., Ben Torres handles both Dental and Plumbing)

### New Component: `src/components/dashboard/AgentShiftPanel.tsx`

Shown at the top of OverviewTab when role is `agent`. Contains:

- **"MY SHIFT" header** with agent name, extension, status
- **Assigned Clients grid** — brand-colored cards per tenant showing queue names and waiting call counts
- **Incoming Calls panel** — live list of ringing/queued calls showing:
  - **Client brand pill** (most prominent — 14px bold with brand color)
  - **DID label** (which number was called, identifying the service line)
  - **Caller number/name** (end customer)
  - **Queue name** and **wait time**
  - The agent group name (so they know which team is being rung)

### Updated Files

| File | Change |
|------|--------|
| `src/services/types.ts` | Add `AgentGroup`, `DIDMapping`, `IncomingCall` types; extend `Agent` and `Tenant` |
| `src/services/dashboardApi.ts` | Add DID_MAPPINGS, AGENT_GROUPS, INCOMING_CALLS seed data; new `fetchIncomingCalls()` and `fetchAgentGroups()` API functions; update agent seed data with `assignedTenantIds` and `groupIds` |
| `src/services/mockSession.ts` | Update agent session (Ben Torres) with multi-tenant access (`assignedTenantIds: ['t-001','t-002']`, `tenantId: null`) |
| `src/components/dashboard/AgentShiftPanel.tsx` | **New** — My Shift panel with client cards + incoming call list with DID-resolved client/caller display |
| `src/tabs/OverviewTab.tsx` | Import and render `AgentShiftPanel` when role is `agent` (pass session, tenants, queues, groups, incoming calls) |
| `src/hooks/useDashboardData.ts` | Add `agentGroups`, `incomingCalls` state; fetch them on poll; expose in `DashboardData`; handle multi-tenant agent sessions |
| `src/utils/permissions.ts` | Give agent `canViewCallsTab: true`; add `canViewShiftPanel: boolean` flag (agent-only) |
| `src/pages/DashboardPage.tsx` | Pass new data (groups, incoming calls, session) through to OverviewTab |
| `src/styles/dashboard.css` | Styles for `.cc-shift-panel`, `.cc-incoming-call-row`, `.cc-client-card` with brand color borders and the slide-in animation |

### Agent UX Flow

```text
Agent logs in → Overview shows shift panel
┌─────────────────────────────────────────────────────┐
│ MY SHIFT — Ben Torres — Ext 2001 — ● Available      │
├─────────────────┬───────────────────────────────────┤
│ 🔵 Melbourne    │ 🟢 Sunrise Dental                 │
│ Plumbing Co     │ Group                             │
│ Sales · Support │ New Patients · Existing            │
│ 2 waiting       │ 1 waiting                         │
├─────────────────┴───────────────────────────────────┤
│ INCOMING CALLS                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 🔵 Melbourne Plumbing  │ DID: 03 9000 1001      │ │
│ │ Caller: 0412 345 678 (David Brown)              │ │
│ │ Queue: Sales │ Group: Plumbing Sales Team        │ │
│ │ Waiting: 0:28                          [ANSWER]  │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 🟢 Sunrise Dental      │ DID: 03 9000 2001      │ │
│ │ Caller: 0423 456 789                            │ │
│ │ Queue: New Patients │ Group: Dental Intake       │ │
│ │ Waiting: 0:12                          [ANSWER]  │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
│ [Normal overview metrics filtered to agent's queues] │
```

### Key Design Decisions

- **DID determines client**: The DID number maps to a tenant + queue. This is how real PBX systems work (Yeastar included) — the inbound number tells you who the call is for.
- **Agent groups = ring groups**: Maps directly to Yeastar ring group concept. All agents in the group see the incoming call simultaneously (ring-all strategy by default).
- **Brand pill prominence**: Incoming call rows use the same `.cc-company-pill` styling (14px bold, brand color) so the agent immediately knows which client the call belongs to.
- **Multi-tenant agents**: Agents like Ben Torres can serve multiple tenants. Their shift panel shows all assigned clients.

