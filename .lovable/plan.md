

## Plan: Phase 1 — Real Backend, Auth, and Database

This is the first phase of making the dashboard production-ready. It establishes Supabase as the backend with invite-only auth, a proper database schema, and replaces mock data with real queries. Yeastar PBX integration will follow in Phase 2 once the backend foundation is solid.

---

### What We're Building

1. **Lovable Cloud setup** — Supabase database, auth, and edge functions
2. **Invite-only authentication** — Super admin creates user accounts, login page with email/password
3. **Database schema** — All entities (tenants, queues, agents, users, roles, DID mappings, agent groups) in Supabase with RLS
4. **Replace mock API** — Swap `dashboardApi.ts` mock functions with real Supabase queries
5. **Protected routes** — Dashboard behind auth, login page for unauthenticated users

---

### Database Schema

**Tables:**

| Table | Key Fields | RLS |
|-------|-----------|-----|
| `profiles` | `id (FK auth.users)`, `display_name`, `tenant_id` | Users read own profile |
| `user_roles` | `user_id`, `role` (enum: super-admin, client-admin, supervisor, agent) | Security definer function |
| `tenants` | `id`, `name`, `industry`, `status`, `brand_color`, `did_numbers` | Scoped by role |
| `queues` | `id`, `tenant_id`, `name`, `type`, `color`, `icon` | Tenant-scoped |
| `agents` | `id`, `user_id`, `tenant_id`, `extension`, `status`, `queue_ids`, `group_ids`, `assigned_tenant_ids` | Tenant-scoped |
| `agent_groups` | `id`, `name`, `tenant_id`, `queue_id`, `agent_ids`, `ring_strategy` | Tenant-scoped |
| `did_mappings` | `did`, `tenant_id`, `queue_id`, `label` | Tenant-scoped |
| `calls` | `id`, `tenant_id`, `queue_id`, `agent_id`, `caller_number`, `result`, `duration_seconds`, ... | Tenant-scoped |
| `sip_lines` | `id`, `tenant_id`, `label`, `trunk_name`, `status` | Super-admin only |
| `tenant_onboarding` | `id (FK tenants)`, `onboarding_stage`, `contact_*`, `client_details (jsonb)`, `business_rules (jsonb)`, ... | Role-scoped |

**RLS approach:**
- `has_role()` security definer function (no recursive RLS)
- Super-admin sees all; client-admin/supervisor see own tenant; agent sees own assigned data
- Roles stored in `user_roles` table (never on profiles)

---

### Auth Flow

1. **Login page** (`/login`) — email + password only, no self-registration
2. **Admin user management** — Super admin creates users via an edge function that calls `supabase.auth.admin.createUser()`, assigns role and tenant
3. **Session handling** — `onAuthStateChange` listener, derive permissions from `user_roles` + `profiles`
4. **Protected routing** — Redirect to `/login` if no session

---

### Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/config.toml` | Create — edge function config |
| Migration: `create_tables` | Create all tables, enums, RLS policies, `has_role()` function |
| Migration: `seed_data` | Seed the 4 existing tenants, queues, agents, DID mappings |
| `supabase/functions/create-user/index.ts` | Edge function — admin creates users with role + tenant assignment |
| `src/pages/LoginPage.tsx` | Create — login form |
| `src/pages/AdminUsersPage.tsx` | Create — user management for super-admin |
| `src/integrations/supabase/client.ts` | Create — Supabase client setup |
| `src/hooks/useAuth.ts` | Create — auth state, session, permissions derivation |
| `src/services/dashboardApi.ts` | Rewrite — replace mock functions with Supabase queries |
| `src/services/mockSession.ts` | Remove — no longer needed |
| `src/hooks/useDashboardData.ts` | Update — use real auth session, real queries |
| `src/App.tsx` | Update — add routes, auth provider, protected routing |
| `src/pages/DashboardPage.tsx` | Update — remove mock role switcher, use real session |

---

### Phase 2 (next, not in this plan)
- Yeastar P-Series API integration via edge function proxy (your PBX is on-premise, so we'll need a webhook relay or polling approach)
- Real-time call events via Supabase Realtime subscriptions
- Agent status sync with PBX

---

### Technical Notes

- **On-premise Yeastar**: Since the PBX is on your local network, the Supabase edge function cannot directly reach it. Phase 2 will address this with either: (a) Yeastar webhook pushing events to a Supabase edge function endpoint, or (b) a lightweight relay agent running on your network that syncs PBX state to Supabase.
- **Onboarding data**: Complex nested objects (clientDetails, businessRules, etc.) will be stored as `jsonb` columns to preserve the current flexible structure without over-normalizing.
- **Existing seed data**: The 4 tenants, 9 queues, 18 agents, and DID mappings will be migrated into the database as initial seed data.

