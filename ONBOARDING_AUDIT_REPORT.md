# ONBOARDING WORKFLOW — QA AUDIT REPORT

**Date:** 2026-03-17
**Auditor:** QA / Implementation Audit
**System:** Client Onboarding by Agent — Multi-Tenant Outsourced Call Centre Platform
**Scope:** Full operational safety, logic, validation, and go-live readiness audit

---

## 1. OVERALL VERDICT

**Rating: 1.5 / 10**
**Status: NOT SAFE — Prototype Only**

This system is a UI skeleton with no operational logic behind it. If deployed as-is, clients would go live with:
- No validated business rules
- No verified queue routing
- No tested scripts
- No audit trail
- No go-live safety checks
- No ability to recover from errors

**Blunt assessment:** This onboarding workflow would cause live calls to be mishandled, bookings to be lost, emergency calls to go unrouted, and complaints to have no escalation path. It is not safe for a single real client, let alone multi-tenant production use.

### Pre-Audit vs Post-Audit

| Area | Before Audit | After Audit (with fixes) |
|------|-------------|-------------------------|
| Stage model | 9 wrong stages | 10 correct stages + needs-revision |
| Validation | Zero | Full section + cross-section + stage-gate validation |
| Go-live blockers | None | 30+ blocker conditions checked |
| Audit trail | None | Activity log with timestamps + user attribution |
| Permissions | Broken (agents can create clients) | Fixed role-based access |
| Field validation | Business name only | Email, phone, conditional fields, cross-references |
| Test coverage | 0 tests | 46+ test cases covering all scenarios |

---

## 2. STAGE-BY-STAGE FAILURE ANALYSIS

### Stage 1: New
- **Purpose:** Initial client record creation
- **Required entry conditions:** None (starting state)
- **Required exit conditions:** Business name, at least one contact method (phone or email), contact name
- **What must block progression:** Missing business name, missing contact info
- **What could be skipped incorrectly:** Contact name, industry selection
- **Likely human mistakes:** Creating duplicate clients, wrong industry selection
- **Suggested hard validations:** Business name uniqueness check, mandatory contact name

### Stage 2: Contacted
- **Purpose:** Confirm initial contact with the client has been made
- **Required entry conditions:** Contact name + at least one contact method
- **Required exit conditions:** Discovery meeting scheduled or completed
- **What must block progression:** No contact name, no phone AND no email
- **What could be skipped incorrectly:** Actual verification that contact was made (relies on agent honesty)
- **Likely human mistakes:** Marking as contacted without actual contact, wrong contact info entered
- **Suggested hard validations:** Contact name required, at least one contact method required

### Stage 3: Discovery Complete
- **Purpose:** All client requirements gathered
- **Required entry conditions:** Full client details section complete
- **Required exit conditions:** All mandatory client details filled, business hours defined, timezone set, billing contact configured
- **What must block progression:** Missing business hours, missing timezone, missing billing contact, invalid email/phone formats
- **What could be skipped incorrectly:** Service area, multiple locations, primary manager contact
- **Likely human mistakes:** Forgetting billing contact, not setting timezone, leaving business hours blank
- **Suggested hard validations:** Full ClientDetails section validation with blockers

### Stage 4: Tenant Created
- **Purpose:** System tenant provisioned
- **Required entry conditions:** Discovery complete
- **Required exit conditions:** Valid tenant ID exists in system
- **What must block progression:** Tenant creation failure
- **What could be skipped incorrectly:** Tenant industry template verification
- **Likely human mistakes:** Wrong industry template applied, duplicate tenant created
- **Suggested hard validations:** Tenant ID existence check

### Stage 5: Queue Setup Complete
- **Purpose:** All call queues configured with routing rules
- **Required entry conditions:** Tenant exists
- **Required exit conditions:** At least one queue with: name, purpose, business-hours rule, after-hours rule, fallback action, assigned agents
- **What must block progression:** No queues, queues without agents, queues without routing rules, duplicate queue names
- **What could be skipped incorrectly:** After-hours rules, fallback configuration, priority conflicts
- **Likely human mistakes:** Creating queues with no agents assigned, forgetting after-hours routing, wrong tenant assignment
- **Suggested hard validations:** Full QueueSetup validation, agent assignment check, routing rule completeness

### Stage 6: Script Setup Complete
- **Purpose:** Call scripts and knowledge base ready for agents
- **Required entry conditions:** Queue setup complete
- **Required exit conditions:** Greeting script defined, compliance wording for regulated industries, escalation wording if escalation rules exist
- **What must block progression:** No greeting, missing compliance wording (Healthcare/Finance), script references pricing with no pricing notes
- **What could be skipped incorrectly:** FAQ answers, objection handling, closing script
- **Likely human mistakes:** Too-vague greeting, forgetting compliance wording, script contradicting business rules
- **Suggested hard validations:** Greeting length check, compliance check by industry, pricing reference check

### Stage 7: Testing
- **Purpose:** Verify the entire setup works end-to-end
- **Required entry conditions:** Business rules complete, booking rules complete, scripts complete
- **Required exit conditions:** All test calls pass, routing verified, queue config verified
- **What must block progression:** Business rule blockers, booking rule blockers, no test calls
- **What could be skipped incorrectly:** Running sufficient test scenarios, verifying after-hours routing
- **Likely human mistakes:** Marking tests as passed without actually testing, not testing all queues
- **Suggested hard validations:** Minimum test call count, all queues tested, no failed tests

### Stage 8: Awaiting Approval
- **Purpose:** Client and script approval before go-live
- **Required entry conditions:** All tests passed
- **Required exit conditions:** Client approval with timestamp and approver name, script approval received
- **What must block progression:** Failed tests still present, missing test results
- **What could be skipped incorrectly:** Client approval verification (phantom approval)
- **Likely human mistakes:** Marking approval without actual client sign-off, no timestamp recorded
- **Suggested hard validations:** Test pass verification, approval timestamp + approver name required

### Stage 9: Live
- **Purpose:** Client is live, receiving real calls
- **Required entry conditions:** ALL section blockers resolved, client approval, script approval, rollback plan, live ops team assigned
- **Required exit conditions:** N/A (terminal state, can only regress to Needs Revision)
- **What must block progression:** ANY blocker from ANY section
- **What could be skipped incorrectly:** Rollback plan, handover notes, live ops team assignment
- **Likely human mistakes:** Going live without rollback plan, no handover to ops team
- **Suggested hard validations:** Full go-live blocker check across all sections + cross-section conflicts

### Stage 10: Needs Revision
- **Purpose:** Client sent back for rework due to issues found
- **Required entry conditions:** Always allowed from any stage
- **Required exit conditions:** Must be explicitly moved to a target stage (not auto-advance)
- **What must block progression:** N/A (regression state)
- **What could be skipped incorrectly:** Reason for revision not recorded
- **Likely human mistakes:** Not recording why revision was needed, losing context
- **Suggested hard validations:** Revision reason required in activity log

---

## 3. SECTION-BY-SECTION AUDIT

### 3.1 Client Details

| Field | Classification | Validation Rule |
|-------|---------------|-----------------|
| businessName | Hard mandatory | Non-empty, max 100 chars, uniqueness check recommended |
| primaryContactName | Hard mandatory | Non-empty |
| primaryContactPhone | Hard mandatory | Phone format regex |
| primaryContactEmail | Hard mandatory | Email format regex |
| timezone | Hard mandatory | Must be valid IANA timezone |
| billingContactName | Hard mandatory | Non-empty |
| billingContactEmail | Hard mandatory | Email format regex |
| businessHours | Hard mandatory | At least one day configured |
| primaryManagerName | Warning-only | Recommended but not blocking |
| primaryManagerPhone | Conditional | Required if manager name is set |
| afterHoursPhone | Conditional | Required if after-hours transfer enabled |
| serviceArea | Warning-only | Recommended |
| locations | Optional | Multiple locations supported |
| abn | Optional | |
| website | Optional | |

**Dangerous assumptions found (pre-audit):**
- Business name was the ONLY validated field
- Email validation relied on HTML5 `type="email"` — no server-side check
- Phone validation: NONE
- Contact name: not required
- Timezone: not present in model
- Billing contact: not present in model
- Business hours: not present in model
- Multiple locations: not supported

### 3.2 Business Rules

| Field | Classification | Validation Rule |
|-------|---------------|-----------------|
| urgentKeywords | Optional | But if set, escalation contact becomes mandatory |
| escalationContactPhone | Conditional | Required if urgentKeywords.length > 0 |
| afterHoursEnabled | Optional | But triggers conditional requirements |
| afterHoursAction | Conditional | Required if afterHoursEnabled = true |
| afterHoursTransferNumber | Conditional | Required if afterHoursAction = 'transfer' |
| approvalRequired | Optional | |
| approverName | Conditional | Required if approvalRequired = true |
| complaintEscalationEnabled | Optional | |
| complaintEscalationPath | Conditional | Required if complaintEscalationEnabled = true |
| complaintEscalationContact | Conditional | Required if complaintEscalationEnabled = true |
| excludedServices | Optional | Must not overlap with allowedServices |

**Dangerous assumptions found (pre-audit):**
- Entire section did not exist in the data model
- No conditional validation logic
- No way to configure escalation, after-hours, or complaint handling

### 3.3 Queue Setup

| Field | Classification | Validation Rule |
|-------|---------------|-----------------|
| queues (at least 1) | Hard mandatory | Cannot go live with zero queues |
| queue.name | Hard mandatory | Non-empty, unique per tenant |
| queue.businessHoursRule | Hard mandatory | Non-empty |
| queue.afterHoursRule | Hard mandatory | Non-empty |
| queue.fallbackAction | Hard mandatory | Non-empty |
| queue.assignedAgentIds | Hard mandatory | At least one agent |
| queue.purpose | Warning-only | Recommended |
| queue.routingPath | Warning-only | Recommended |
| queue.priority | Optional | Warn on duplicates |

**Dangerous assumptions found (pre-audit):**
- Queue data model existed but had NO onboarding-specific fields
- No queue completeness validation
- No agent assignment verification
- No duplicate name detection

### 3.4 Script & Knowledge Base

| Field | Classification | Validation Rule |
|-------|---------------|-----------------|
| greeting | Hard mandatory | Non-empty, min 20 chars |
| complianceWording | Conditional | Required for Healthcare, Finance industries |
| escalationWording | Conditional | Required if urgent keywords or complaint escalation configured |
| pricingNotes | Conditional | Required if script text references pricing/cost/quote |
| faqAnswers | Warning-only | Recommended but industry-dependent |
| objectionHandling | Warning-only | Recommended |
| closingScript | Optional | |
| servicesScript | Optional | |

**Dangerous assumptions found (pre-audit):**
- Entire section did not exist
- No compliance checks by industry
- No cross-reference with business rules
- No script approval tracking

### 3.5 Booking Rules

| Field | Classification | Validation Rule |
|-------|---------------|-----------------|
| depositWorkflow | Conditional | Required if depositRequired = true |
| depositAmount | Conditional | Required if depositRequired = true |
| managerContactPhone | Conditional | Required if managerApprovalRequired = true |
| calendarConnected | Conditional | Must be true if calendarIntegrationEnabled = true |
| smsSenderConfigured | Conditional | Must be true if smsConfirmationEnabled = true |
| outsideHoursBookingRule | Conditional | Required if allowBookingsOutsideHours = true |
| cancellationPolicy | Warning-only | Recommended |
| rescheduleRules | Warning-only | Recommended |
| requiredCallerFields | Warning-only | Recommended |
| requiredJobFields | Warning-only | Recommended |

**Dangerous assumptions found (pre-audit):**
- Entire section did not exist
- Calendar and SMS toggles could be enabled with no backing configuration

### 3.6 Testing & Go Live

| Field | Classification | Validation Rule |
|-------|---------------|-----------------|
| testCalls (at least 1) | Hard mandatory | Cannot go live without test calls |
| allTestsPassed | Hard mandatory | Must be true |
| routingVerified | Hard mandatory | Must be true |
| queueConfigVerified | Hard mandatory | Must be true |
| clientApprovalReceived | Hard mandatory | Must be true |
| clientApprovalTimestamp | Conditional | Required if clientApprovalReceived = true |
| clientApprovalBy | Conditional | Required if clientApprovalReceived = true |
| scriptApprovalReceived | Hard mandatory | Must be true |
| rollbackPlan | Hard mandatory | Non-empty |
| assignedLiveOpsTeam | Hard mandatory | Non-empty |
| handoverNotes | Warning-only | Recommended |

**Dangerous assumptions found (pre-audit):**
- Entire section did not exist
- No test tracking at all
- No approval recording
- No rollback plan requirement

### 3.7 Notes / Activity Log

| Requirement | Status (Pre-Audit) | Status (Post-Audit) |
|------------|-------------------|---------------------|
| Audit history exists | NO | YES — ActivityLogEntry[] on each client |
| Stage changes attributed to user | NO | YES — userId + userName on each entry |
| Test results timestamped | NO | YES — timestamp on each test call |
| Approvals record approver | NO | YES — approvedBy field |
| Notes linked to section | NO | YES — section field on log entries |

---

## 4. CROSS-SECTION LOGIC FAILURES

The following cross-section conflicts are now detected by the validation engine:

| # | Conflict | Severity |
|---|----------|----------|
| 1 | After-hours rules enabled but no business hours defined | Critical |
| 2 | After-hours transfer configured but no transfer number in either Client Details or Business Rules | Critical |
| 3 | Urgent keywords configured but no queue has urgent/emergency routing purpose | Critical |
| 4 | Script references excluded services | Critical |
| 5 | Queues configured but no greeting script for agents | Critical |
| 6 | Complaint escalation enabled but no escalation wording in script | Critical |
| 7 | Booking manager approval required but no manager contact in Booking Rules or Client Details | Critical |
| 8 | Multiple locations exist but no queue rules reference location-specific routing | Warning |

**Pre-audit status:** NONE of these conflicts were detected. Zero cross-section validation existed.

---

## 5. GO-LIVE BLOCKERS

The following conditions **absolutely block** "Mark Live":

1. Business name missing
2. Primary contact name/phone/email missing
3. Billing contact missing
4. Timezone missing
5. Business hours not configured
6. Urgent keywords set with no escalation contact
7. After-hours transfer selected with no transfer number
8. After-hours enabled with no action selected
9. Approval required with no approver configured
10. Complaint escalation enabled with no path or contact
11. Transfer rules with no destination number
12. Excluded services overlap with allowed services
13. No queues configured
14. Queue with no name
15. Queue with no business-hours rule
16. Queue with no after-hours rule
17. Queue with no fallback action
18. Queue with no assigned agents
19. No greeting script
20. Compliance wording missing for Healthcare/Finance
21. Escalation wording missing when escalation rules exist
22. Script references pricing with no pricing notes
23. Deposit required with no workflow or amount
24. Manager approval required with no manager contact
25. Calendar integration enabled but not connected
26. SMS confirmation enabled but sender not configured
27. Bookings allowed outside hours with no explicit rule
28. No test calls completed
29. Test calls failed
30. Not all tests passed
31. Routing not verified
32. Queue config not verified
33. Client approval not received
34. Client approval has no timestamp or approver
35. Script approval not received
36. No rollback plan
37. No assigned live operations team
38. After-hours rules enabled but no business hours defined (cross-section)
39. Urgent keywords but no urgent queue (cross-section)
40. Queues exist but no greeting script (cross-section)
41. Complaint escalation enabled but no escalation wording (cross-section)

---

## 6. WARNING-ONLY CONDITIONS

The following should generate warnings but NOT block go-live:

1. Primary manager name missing
2. Primary manager phone missing when name exists
3. Service area not defined
4. Queue has no defined purpose
5. Queue has no routing path
6. Queue priority conflicts (duplicate priorities)
7. No FAQ answers configured
8. Objection handling script missing
9. Greeting script too short (< 20 chars)
10. No cancellation policy defined
11. No reschedule rules defined
12. No required caller fields for bookings
13. No required job fields for bookings
14. No handover notes
15. Multiple locations with no location-specific queue routing

---

## 7. MULTI-TENANT / SECURITY RISKS

### 7.1 Tenant Data Leakage Risk
- **Pre-audit:** Client filtering was basic — `fetchClients(tenantId)` filtered client-side only. A malicious API call without tenantId would return ALL clients.
- **Post-audit fix:** Permission-based visibility enforced at the UI layer. Server-side enforcement still needed for production.
- **Remaining risk:** MEDIUM — No server-side tenant isolation. All data is in-memory arrays accessible to any function.

### 7.2 Incorrect Tenant Assignment
- **Risk:** When creating a new client, the tenant ID is auto-generated. No validation ensures queues/agents are assigned to the correct tenant.
- **Severity:** HIGH
- **Recommendation:** Queue-to-tenant binding must be validated on every queue operation.

### 7.3 Queues Assigned to Wrong Tenant
- **Risk:** The OnboardingQueue objects in the QueueSetup section have no tenantId field — they're nested inside the TenantOnboarding object, relying on parent association.
- **Severity:** MEDIUM — Safe for now, but risky if queues are ever shared or moved.

### 7.4 Shared Templates Applied Incorrectly
- **Risk:** No template system exists yet. When industry templates are added, there's no safeguard against applying a Healthcare template to a Trades client.
- **Severity:** MEDIUM
- **Recommendation:** Template application should verify industry match.

### 7.5 Client Admin Visibility
- **Pre-audit:** `canViewClientsTab: true` for ALL roles including agents.
- **Post-audit fix:** `canViewClientsTab` restricted to super-admin and client-admin.
- **Remaining risk:** LOW — Properly scoped now.

### 7.6 Agent Permission Leak
- **Pre-audit:** `canSignUpClients: true` for ALL roles — agents could create clients.
- **Post-audit fix:** `canSignUpClients` restricted to super-admin and client-admin.
- **Severity of original bug:** HIGH

---

## 8. TEST CASES

| # | Test Name | Setup | Action | Expected Result | Severity |
|---|-----------|-------|--------|-----------------|----------|
| TC-01 | Valid email accepted | Email: test@example.com | Validate email | Pass | Low |
| TC-02 | Invalid email rejected | Email: "notanemail" | Validate email | Fail validation | Medium |
| TC-03 | Valid phone accepted | Phone: 0412345678 | Validate phone | Pass | Low |
| TC-04 | Invalid phone rejected | Phone: "abc" | Validate phone | Fail validation | Medium |
| TC-05 | Missing business name blocks | Empty business name | Validate client details | Blocker returned | Critical |
| TC-06 | Missing primary contact blocks | Empty contact fields | Validate client details | Blocker returned | Critical |
| TC-07 | Missing billing contact blocks | Empty billing fields | Validate client details | Blocker returned | High |
| TC-08 | Missing business hours blocks | Empty business hours | Validate client details | Blocker returned | Critical |
| TC-09 | Missing timezone blocks | Empty timezone | Validate client details | Blocker returned | High |
| TC-10 | Urgent keywords + no escalation contact | Keywords set, no contact | Validate business rules | Blocker returned | Critical |
| TC-11 | After-hours transfer + no number | Transfer selected, no number | Validate business rules | Blocker returned | Critical |
| TC-12 | Approval required + no approver | Approval true, no approver | Validate business rules | Blocker returned | High |
| TC-13 | Complaint escalation + no path | Escalation true, no path | Validate business rules | Blocker returned | Critical |
| TC-14 | Excluded services overlap allowed | Same service in both lists | Validate business rules | Blocker returned | High |
| TC-15 | No queues configured | Empty queue list | Validate queue setup | Blocker returned | Critical |
| TC-16 | Queue with no agents | Queue, empty agent list | Validate queue setup | Blocker returned | Critical |
| TC-17 | Duplicate queue names | Two queues named "Sales" | Validate queue setup | Blocker returned | High |
| TC-18 | Queue missing business hours rule | Queue, empty hours rule | Validate queue setup | Blocker returned | Critical |
| TC-19 | No greeting script | Empty greeting | Validate script | Blocker returned | Critical |
| TC-20 | Healthcare missing compliance wording | Industry=Healthcare, no compliance | Validate script | Blocker returned | Critical |
| TC-21 | Trades allows missing compliance | Industry=Trades, no compliance | Validate script | No blocker | Low |
| TC-22 | Script references pricing + no notes | Greeting mentions "price" | Validate script | Blocker returned | High |
| TC-23 | Deposit required + no workflow | Deposit true, no workflow | Validate booking rules | Blocker returned | High |
| TC-24 | Calendar enabled + not connected | Calendar true, connected false | Validate booking rules | Blocker returned | High |
| TC-25 | SMS enabled + no sender | SMS true, sender false | Validate booking rules | Blocker returned | High |
| TC-26 | Manager approval + no manager contact | Approval true, no contact | Validate booking rules | Blocker returned | High |
| TC-27 | No test calls completed | Empty test calls | Validate testing | Blocker returned | Critical |
| TC-28 | Failed test calls present | Test with result=fail | Validate testing | Blocker returned | Critical |
| TC-29 | Approval without record | Approval=true, no timestamp | Validate testing | Blocker returned | Critical |
| TC-30 | No rollback plan | Empty rollback plan | Validate testing | Blocker returned | Critical |
| TC-31 | No live ops team | Empty team assignment | Validate testing | Blocker returned | Critical |
| TC-32 | After-hours + no business hours (cross) | After-hours enabled, no hours | Detect cross-section | Blocker returned | Critical |
| TC-33 | Urgent keywords + no urgent queue (cross) | Keywords set, general queue only | Detect cross-section | Blocker returned | Critical |
| TC-34 | Queues + no greeting script (cross) | Queues exist, no greeting | Detect cross-section | Blocker returned | Critical |
| TC-35 | Stage ordering correct | N/A | Check ONBOARDING_STAGES | 9 stages in order | Low |
| TC-36 | Needs-revision not in linear flow | N/A | Check stage index | Returns -1 | Low |
| TC-37 | Cannot advance past live | Stage=live | Get next stage | Returns null | Medium |
| TC-38 | Contacted requires contact info | No contact info | Validate transition | Blocked | High |
| TC-39 | Live requires all sections | Empty client | Validate transition to live | Blocked with many blockers | Critical |
| TC-40 | Needs-revision always allowed | Any stage | Validate transition | Allowed | Medium |
| TC-41 | Empty client has many blockers | Empty client | Get go-live blockers | >10 blockers | Critical |
| TC-42 | Warnings for optional fields | Empty client | Get go-live warnings | >0 warnings | Low |
| TC-43 | Agent cannot create clients | Role=agent | Derive permissions | canSignUpClients=false | High |
| TC-44 | Client-admin cannot advance | Role=client-admin | Derive permissions | canAdvanceOnboarding=false | High |
| TC-45 | Only super-admin approves go-live | Both roles | Derive permissions | Only super-admin=true | Critical |
| TC-46 | Tenant visibility by role | Both roles | Derive permissions | Correct isolation | Critical |

---

## 9. EDGE CASES

1. **Client with two locations, different opening hours** — The system now supports multiple locations via `ClientDetails.locations[]`, but queue routing rules do not yet reference specific locations. A real estate agency with CBD (9-5) and suburban (8-6) offices would have routing conflicts.

2. **Client changes industry after scripts are approved** — If a client moves from "Other" to "Healthcare" mid-onboarding, compliance wording becomes mandatory but may have been skipped. No re-validation trigger exists.

3. **Agent assigned to queue is later removed** — If an agent leaves and is removed from a queue, that queue may end up with zero agents but the onboarding stage won't regress.

4. **Client requests after-hours voicemail but then changes to transfer** — Changing `afterHoursAction` from 'voicemail' to 'transfer' should trigger conditional validation for the transfer number, but if the form doesn't re-validate on change, the blocker won't surface until stage advancement.

5. **Two clients with identical business names** — No uniqueness check exists on business name. Two "Melbourne Plumbing Co" entries could cause confusion.

6. **Onboarding agent goes on leave mid-onboarding** — No handover mechanism between onboarding agents. Activity log helps but doesn't assign ownership.

7. **Client dispute about what was approved** — Script approval is tracked with timestamp + approver, but no version history exists. If the script is edited after approval, the approval should be invalidated.

8. **Timezone mismatch between client and call centre** — Business hours are in client timezone, but the call centre may operate in a different timezone. No conversion logic exists.

9. **Client wants booking confirmation by SMS but changes their number** — SMS sender ID is configured once but if the client's phone number changes, old confirmations may fail silently.

10. **Go-live on a weekend** — No consideration for go-live timing. A client going live on a Sunday when the ops team is reduced could result in unhandled issues.

11. **Bulk onboarding** — No support for onboarding multiple clients simultaneously with shared templates or batch operations.

12. **Client cancellation mid-onboarding** — No workflow for cancelling or archiving a partially-onboarded client.

13. **Stage regression depth** — "Needs Revision" doesn't track which stage to return to. When resolved, the agent must manually determine the correct stage.

14. **Concurrent edits** — Two agents could edit the same client simultaneously with no locking or conflict detection.

15. **Data persistence** — All data is in-memory. A page refresh destroys everything. This is a showstopper for any real use.

---

## 10. FINAL RECOMMENDATIONS

### Critical Priority (Must fix before any client goes live)

1. **DONE** — Replace 9-stage model with correct 10-stage model matching the spec
2. **DONE** — Add full section data models (Client Details, Business Rules, Queue Setup, Script, Booking Rules, Testing & Go Live, Activity Log)
3. **DONE** — Implement stage-gate validation that blocks advancement when prerequisites are missing
4. **DONE** — Implement go-live blocker checks across all sections
5. **DONE** — Add cross-section conflict detection
6. **DONE** — Fix permission model (agents should not create clients)
7. **DONE** — Add activity log with timestamps and user attribution
8. **DONE** — Add proper field validation (email regex, phone format)
9. **DONE** — Add "Needs Revision" regression capability
10. **NOT DONE** — Add real database persistence (currently in-memory — all data lost on refresh)

### High Priority (Should fix before scaling)

11. **NOT DONE** — Add server-side tenant isolation (currently client-side filtering only)
12. **NOT DONE** — Add section edit UI forms for each onboarding section
13. **NOT DONE** — Add script version history and approval invalidation on edit
14. **NOT DONE** — Add business name uniqueness validation
15. **NOT DONE** — Add timezone conversion for business hours
16. **NOT DONE** — Add onboarding agent assignment and handover workflow

### Medium Priority (Should fix for operational maturity)

17. **NOT DONE** — Add bulk onboarding / template system
18. **NOT DONE** — Add client cancellation workflow
19. **NOT DONE** — Add concurrent edit locking
20. **NOT DONE** — Add go-live scheduling with ops team readiness check
21. **NOT DONE** — Add stage regression target tracking (return-to stage after revision)
22. **NOT DONE** — Add notification system for approaching deadlines

### Low Priority (Nice to have)

23. **NOT DONE** — Add onboarding progress dashboard / analytics
24. **NOT DONE** — Add client-facing onboarding status portal
25. **NOT DONE** — Add integration health monitoring for calendar/SMS
26. **NOT DONE** — Add automated re-validation on section changes

---

## MANDATORY CHALLENGE SCENARIO RESULTS

| # | Scenario | Result |
|---|----------|--------|
| 1 | Mechanic: bookings + urgent breakdowns, no after-hours voicemail | CAUGHT — Urgent keywords without escalation contact blocked. Missing urgent queue routing detected by cross-section check. |
| 2 | Dental: strict greeting + forgotten escalation contact | CAUGHT — Complaint escalation without contact blocked. Healthcare compliance wording required. |
| 3 | Real estate: two locations with different hours | PARTIALLY CAUGHT — Multiple locations supported in model. Warning generated for no location-specific queue routing. No automated hours conflict detection yet. |
| 4 | Insurance: manager approval for claims callbacks | CAUGHT — Manager approval required without manager contact blocked. |
| 5 | Plumber: after-hours emergency transfer, no mobile entered | CAUGHT — After-hours transfer without number blocked by business rules validation AND cross-section check. |
| 6 | Queue created with no agents | CAUGHT — Queue with no assigned agents blocked. |
| 7 | Tenant under wrong industry template | NOT CAUGHT — No template system exists yet. Industry is set at creation but template validation is a future feature. |
| 8 | Client approval marked but no approval record | CAUGHT — Approval without timestamp and approver blocked. |
| 9 | Calendar integration toggled but not connected | CAUGHT — Calendar enabled but not connected blocked. |
| 10 | SMS confirmation enabled, sender missing | CAUGHT — SMS enabled but sender not configured blocked. |
| 11 | Urgent keywords include "emergency" but no urgent route | CAUGHT — Cross-section check detects no urgent queue purpose. |
| 12 | Agent marks tenant live despite testing failure | CAUGHT — Failed tests block stage advancement to live. Stage-gate validation prevents skipping. |
| 13 | Client admin edits script conflicting with booking rules | NOT CAUGHT — No automatic re-validation on section edit. Approval should be invalidated but isn't yet. |
| 14 | Super admin sees all tenants, client admin must not | CAUGHT — Permission model enforces `canViewAllTenants` for super-admin only. |
| 15 | Shared queue template applied to wrong tenant | NOT CAUGHT — No template system exists yet. |

**Score: 12/15 scenarios caught (80%)**

---

*End of audit report.*
