

## Plan: Agent Onboarding System

### What We're Building

A complete agent onboarding workflow — when a new agent joins the call centre, super-admins can create their account, assign them to tenants/queues/groups, and track their readiness through onboarding stages before they go live on calls.

This is separate from the existing **client onboarding** (which onboards business tenants). Agent onboarding handles **people**.

---

### Features

1. **Agent Onboarding Tab** — New "Agent Onboarding" sub-section within the existing Agents tab (or a dedicated tab visible to super-admin and client-admin)
2. **Create Agent flow** — Multi-step form: personal details → assign tenant(s) → assign queues/groups → create auth account → set initial status
3. **Agent onboarding stages**: `invited` → `account-created` → `training` → `shadowing` → `live`
4. **Agent list with onboarding status** — Table showing all agents with their onboarding stage, assigned tenants, queues, and progress
5. **Bulk actions** — Advance stage, reassign queues/groups

---

### Database Changes

**New table: `agent_onboarding`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Default `gen_random_uuid()` |
| `agent_id` | text (FK agents.id) | The agent record |
| `user_id` | uuid (FK auth.users) | The auth user, nullable until account created |
| `stage` | enum `agent_onboarding_stage` | `invited`, `account-created`, `training`, `shadowing`, `live` |
| `invited_by` | uuid | Who invited them |
| `invited_at` | timestamptz | Default `now()` |
| `personal_email` | text | For sending invite |
| `phone` | text | |
| `notes` | text | |
| `training_checklist` | jsonb | `{ pbxLogin: bool, scriptReview: bool, testCalls: bool, systemNav: bool }` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**New enum**: `agent_onboarding_stage` (`invited`, `account-created`, `training`, `shadowing`, `live`)

**RLS**: Super-admin full access. Client-admin/supervisor can read/manage agents in their tenant.

**Migration also adds**: INSERT/UPDATE policies on `agents` table for super-admin (currently missing — agents can't be created via the app).

---

### New Edge Function: `create-agent`

Combines multiple steps:
1. Creates an auth user account (via `auth.admin.createUser`)
2. Creates a `profiles` record with tenant assignment
3. Assigns `agent` role in `user_roles`
4. Creates `agents` table record with queue/group assignments
5. Creates `agent_onboarding` record at `account-created` stage

Requires super-admin or client-admin role to call.

---

### UI Components

| File | Description |
|------|-------------|
| `src/tabs/AgentOnboardingTab.tsx` | Main tab — agent onboarding pipeline table with stage badges, filters, and actions |
| `src/components/dashboard/CreateAgentModal.tsx` | Multi-step modal: Step 1 (name, email, phone) → Step 2 (select tenant, queues, groups) → Step 3 (review & create) |
| `src/components/dashboard/AgentOnboardingRow.tsx` | Expandable row showing agent details, training checklist, and stage advancement |
| `src/components/dashboard/AgentTrainingChecklist.tsx` | Interactive checklist component (PBX login verified, script reviewed, test calls completed, system navigation confirmed) |
| `src/components/dashboard/AgentOnboardingStageBadge.tsx` | Stage badge component matching existing `OnboardingStageBadge` style |

### Modified Files

| File | Change |
|------|--------|
| `src/services/types.ts` | Add `AgentOnboarding`, `AgentOnboardingStage`, `NewAgentForm`, `TrainingChecklist` types |
| `src/services/dashboardApi.ts` | Add `fetchAgentOnboarding()`, `createAgent()`, `advanceAgentStage()`, `updateTrainingChecklist()` |
| `src/utils/permissions.ts` | Add `canOnboardAgents`, `canViewAgentOnboarding` flags |
| `src/pages/DashboardPage.tsx` | Add agent onboarding tab, pass data |
| `src/hooks/useDashboardData.ts` | Fetch agent onboarding data |
| `src/styles/dashboard.css` | Styles for training checklist, multi-step modal |

### Onboarding Flow

```text
Super-admin clicks "Add Agent"
  ┌──────────────────────────────────────┐
  │ STEP 1: PERSONAL DETAILS            │
  │ Name: ________  Email: __________   │
  │ Phone: ________                      │
  ├──────────────────────────────────────┤
  │ STEP 2: ASSIGNMENTS                 │
  │ Tenant: [Melbourne Plumbing ▼]      │
  │ Queues: ☑ Sales  ☑ Support          │
  │ Group:  [Plumbing Sales Team ▼]     │
  ├──────────────────────────────────────┤
  │ STEP 3: REVIEW & CREATE             │
  │ Creates login account + agent record │
  │              [Create Agent]          │
  └──────────────────────────────────────┘

Agent appears in pipeline → Training stage
  ┌──────────────────────────────────────┐
  │ TRAINING CHECKLIST                   │
  │ ☑ PBX login verified                │
  │ ☑ Call scripts reviewed             │
  │ ☐ 3 test calls completed            │
  │ ☐ System navigation confirmed       │
  │                                      │
  │ [Advance to Shadowing →]            │
  └──────────────────────────────────────┘

Shadowing → Live (agent can now take real calls)
```

