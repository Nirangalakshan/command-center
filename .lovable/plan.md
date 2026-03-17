

# Client Signup Feature — Agents Can Sign Up Clients

## What This Adds

A new "Clients" tab in the dashboard where agents (and admins) can register new business clients (tenants) through a multi-step onboarding form. This follows the workflow: Client Signs Up → Tenant Created → Business Configuration → Go Live.

## Architecture

### New Types (types.ts additions)

- `OnboardingStage`: enum of the 9 pipeline stages (`signup`, `tenant-created`, `phone-setup`, `business-config`, `call-flow-design`, `agent-training`, `soft-launch`, `go-live`, `monitoring`)
- `TenantOnboarding`: extends `Tenant` with `onboardingStage`, `createdBy`, `createdAt`, `notes`
- `NewClientForm`: shape for the signup form fields (business name, industry, contact name, contact phone, contact email, brand color, notes)

### New Files

1. **`src/tabs/ClientsTab.tsx`** — Main tab view showing:
   - A list/table of all tenants with their onboarding stage as a pipeline badge
   - A "Sign Up New Client" button that opens a modal form
   - Stage progression controls (for super-admin / client-admin)

2. **`src/components/dashboard/ClientSignupModal.tsx`** — Modal dialog with form fields:
   - Business Name (required)
   - Industry (select: Trades, Healthcare, Property, Finance, Other)
   - Contact Name, Phone, Email
   - Brand Color picker (simple preset swatches)
   - Notes field
   - Submit creates a new tenant in mock data and shows success

3. **`src/components/dashboard/OnboardingStageBadge.tsx`** — Visual badge showing current pipeline stage with color coding

4. **`src/services/dashboardApi.ts`** — Add `createTenant(data)` mock endpoint that appends to the tenant list and returns the new tenant

### Modified Files

5. **`src/services/types.ts`** — Add `OnboardingStage`, `TenantOnboarding`, `NewClientForm` types
6. **`src/utils/permissions.ts`** — Add `canSignUpClients` permission (all roles can do this per requirement)
7. **`src/services/types.ts`** — Add `canSignUpClients` to `Permissions` interface
8. **`src/pages/DashboardPage.tsx`** — Add "Clients" tab to TABS array, render `ClientsTab`, pass permissions
9. **`src/components/dashboard/DashboardTabs.tsx`** — Handle new `clients` tab visibility
10. **`src/styles/dashboard.css`** — Add modal, form, and pipeline badge styles

### Permissions

| Permission | Super Admin | Client Admin | Agent |
|---|---|---|---|
| `canSignUpClients` | yes | yes | yes |
| See all clients list | yes | own tenant only | own tenant only |
| Advance onboarding stage | yes | no | no |

### UI Behavior

- **All roles** see a "Clients" tab with a "+ New Client" button
- The signup form is a styled modal using the existing dark theme
- On submit, the new tenant appears in the list with stage "signup"
- Super-admins see all tenants; client-admins and agents see only their own tenant plus any they created
- The client list shows: name, industry, stage badge, contact, created date
- Mock API stores new tenants in memory (resets on refresh — ready for real backend)

### Form Flow

```text
[+ NEW CLIENT button]
       ↓
┌─────────────────────────┐
│  Sign Up New Client     │
│                         │
│  Business Name: [____]  │
│  Industry:    [select]  │
│  Contact:     [____]    │
│  Phone:       [____]    │
│  Email:       [____]    │
│  Brand Color: ● ● ● ●  │
│  Notes:       [____]    │
│                         │
│  [Cancel]  [Create]     │
└─────────────────────────┘
       ↓
  Tenant created → appears in list
  with stage "Signup" badge
```

### Pipeline Stages (visual badges in client list)

Each stage gets a color-coded badge: Signup (cyan) → Tenant Created (blue) → Phone Setup (purple) → Business Config (amber) → Call Flow (orange) → Training (slate) → Soft Launch (amber) → Go Live (green) → Monitoring (green pulse)

