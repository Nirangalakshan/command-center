/* ═══════════════════════════════════════════════════════════════
   Onboarding Validation Engine

   Central validation for stage transitions, section completeness,
   go-live blockers, and cross-section conflict detection.
   ═══════════════════════════════════════════════════════════════ */

import type {
  TenantOnboarding,
  OnboardingStage,
  ValidationResult,
  ValidationIssue,
  StageTransitionResult,
} from '@/services/types';

/* ─── Stage Order ─── */

export const ONBOARDING_STAGES: OnboardingStage[] = [
  'new',
  'contacted',
  'discovery-complete',
  'tenant-created',
  'queue-setup-complete',
  'script-setup-complete',
  'testing',
  'awaiting-approval',
  'live',
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s+\-()]{8,20}$/;

/* ─── Field Validators ─── */

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone.trim());
}

/* ─── Section Validators ─── */

export function validateClientDetails(client: TenantOnboarding): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const d = client.clientDetails;

  if (!d.businessName?.trim()) {
    issues.push({ section: 'Client Details', field: 'businessName', message: 'Business name is required', severity: 'blocker' });
  }
  if (!d.primaryContactName?.trim()) {
    issues.push({ section: 'Client Details', field: 'primaryContactName', message: 'Primary contact name is required', severity: 'blocker' });
  }
  if (!d.primaryContactPhone?.trim()) {
    issues.push({ section: 'Client Details', field: 'primaryContactPhone', message: 'Primary contact phone is required', severity: 'blocker' });
  } else if (!isValidPhone(d.primaryContactPhone)) {
    issues.push({ section: 'Client Details', field: 'primaryContactPhone', message: 'Primary contact phone format is invalid', severity: 'blocker' });
  }
  if (!d.primaryContactEmail?.trim()) {
    issues.push({ section: 'Client Details', field: 'primaryContactEmail', message: 'Primary contact email is required', severity: 'blocker' });
  } else if (!isValidEmail(d.primaryContactEmail)) {
    issues.push({ section: 'Client Details', field: 'primaryContactEmail', message: 'Primary contact email format is invalid', severity: 'blocker' });
  }
  if (!d.timezone?.trim()) {
    issues.push({ section: 'Client Details', field: 'timezone', message: 'Timezone is required', severity: 'blocker' });
  }
  if (!d.billingContactEmail?.trim()) {
    issues.push({ section: 'Client Details', field: 'billingContactEmail', message: 'Billing contact email is required', severity: 'blocker' });
  } else if (!isValidEmail(d.billingContactEmail)) {
    issues.push({ section: 'Client Details', field: 'billingContactEmail', message: 'Billing contact email format is invalid', severity: 'blocker' });
  }
  if (!d.billingContactName?.trim()) {
    issues.push({ section: 'Client Details', field: 'billingContactName', message: 'Billing contact name is required', severity: 'blocker' });
  }
  if (!d.primaryManagerName?.trim()) {
    issues.push({ section: 'Client Details', field: 'primaryManagerName', message: 'Primary manager contact is required', severity: 'warning' });
  }
  if (!d.primaryManagerPhone?.trim() && d.primaryManagerName?.trim()) {
    issues.push({ section: 'Client Details', field: 'primaryManagerPhone', message: 'Primary manager phone is missing', severity: 'warning' });
  }
  if (!d.businessHours || d.businessHours.length === 0) {
    issues.push({ section: 'Client Details', field: 'businessHours', message: 'Business hours must be configured', severity: 'blocker' });
  }
  if (!d.serviceArea?.trim()) {
    issues.push({ section: 'Client Details', field: 'serviceArea', message: 'Service area is not defined', severity: 'warning' });
  }

  return issues;
}

export function validateBusinessRules(client: TenantOnboarding): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const b = client.businessRules;

  // Urgent keywords set but no escalation contact
  if (b.urgentKeywords.length > 0 && !b.escalationContactPhone?.trim()) {
    issues.push({ section: 'Business Rules', field: 'escalationContactPhone', message: 'Urgent keywords are configured but no escalation contact phone exists', severity: 'blocker' });
  }
  if (b.urgentKeywords.length > 0 && !b.escalationContactName?.trim()) {
    issues.push({ section: 'Business Rules', field: 'escalationContactName', message: 'Urgent keywords are configured but no escalation contact name exists', severity: 'blocker' });
  }

  // After-hours enabled but no action configured
  if (b.afterHoursEnabled && b.afterHoursAction === 'none') {
    issues.push({ section: 'Business Rules', field: 'afterHoursAction', message: 'After-hours is enabled but no action is selected', severity: 'blocker' });
  }
  // After-hours transfer selected but no number
  if (b.afterHoursEnabled && b.afterHoursAction === 'transfer' && !b.afterHoursTransferNumber?.trim()) {
    issues.push({ section: 'Business Rules', field: 'afterHoursTransferNumber', message: 'After-hours transfer is selected but no transfer number is provided', severity: 'blocker' });
  }
  // After-hours voicemail selected but no greeting
  if (b.afterHoursEnabled && b.afterHoursAction === 'voicemail' && !b.afterHoursVoicemailGreeting?.trim()) {
    issues.push({ section: 'Business Rules', field: 'afterHoursVoicemailGreeting', message: 'After-hours voicemail is selected but no greeting is configured', severity: 'warning' });
  }

  // Approval required but no approver
  if (b.approvalRequired && !b.approverName?.trim()) {
    issues.push({ section: 'Business Rules', field: 'approverName', message: 'Approval is required but no approver is configured', severity: 'blocker' });
  }
  if (b.approvalRequired && !b.approverPhone?.trim() && !b.approverEmail?.trim()) {
    issues.push({ section: 'Business Rules', field: 'approverPhone', message: 'Approval is required but no approver contact method exists', severity: 'blocker' });
  }

  // Complaint escalation enabled but no path
  if (b.complaintEscalationEnabled && !b.complaintEscalationPath?.trim()) {
    issues.push({ section: 'Business Rules', field: 'complaintEscalationPath', message: 'Complaint escalation is enabled but no escalation path is defined', severity: 'blocker' });
  }
  if (b.complaintEscalationEnabled && !b.complaintEscalationContact?.trim()) {
    issues.push({ section: 'Business Rules', field: 'complaintEscalationContact', message: 'Complaint escalation is enabled but no escalation contact is set', severity: 'blocker' });
  }

  // Transfer rules with no destination
  for (const rule of b.transferRules) {
    if (rule.trigger && !rule.destinationNumber?.trim()) {
      issues.push({ section: 'Business Rules', field: 'transferRules', message: `Transfer rule "${rule.trigger}" has no destination number`, severity: 'blocker' });
    }
  }

  // Excluded services contradict allowed services
  for (const excluded of b.excludedServices) {
    if (b.allowedServices.includes(excluded)) {
      issues.push({ section: 'Business Rules', field: 'excludedServices', message: `Service "${excluded}" is listed in both allowed and excluded services`, severity: 'blocker' });
    }
  }

  return issues;
}

export function validateQueueSetup(client: TenantOnboarding): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const q = client.queueSetup;

  if (!q.queues || q.queues.length === 0) {
    issues.push({ section: 'Queue Setup', field: 'queues', message: 'No queues are configured — at least one queue is required', severity: 'blocker' });
    return issues;
  }

  // Duplicate queue names
  const names = q.queues.map((queue) => queue.name.toLowerCase().trim());
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
  if (duplicates.length > 0) {
    issues.push({ section: 'Queue Setup', field: 'queues', message: `Duplicate queue names found: ${[...new Set(duplicates)].join(', ')}`, severity: 'blocker' });
  }

  for (const queue of q.queues) {
    if (!queue.name?.trim()) {
      issues.push({ section: 'Queue Setup', field: 'queues', message: `Queue "${queue.id}" has no name`, severity: 'blocker' });
    }
    if (!queue.purpose?.trim()) {
      issues.push({ section: 'Queue Setup', field: 'queues', message: `Queue "${queue.name}" has no defined purpose`, severity: 'warning' });
    }
    if (!queue.businessHoursRule?.trim()) {
      issues.push({ section: 'Queue Setup', field: 'queues', message: `Queue "${queue.name}" has no business-hours routing rule`, severity: 'blocker' });
    }
    if (!queue.afterHoursRule?.trim()) {
      issues.push({ section: 'Queue Setup', field: 'queues', message: `Queue "${queue.name}" has no after-hours routing rule`, severity: 'blocker' });
    }
    if (!queue.fallbackAction?.trim()) {
      issues.push({ section: 'Queue Setup', field: 'queues', message: `Queue "${queue.name}" has no fallback action`, severity: 'blocker' });
    }
    if (!queue.assignedAgentIds || queue.assignedAgentIds.length === 0) {
      issues.push({ section: 'Queue Setup', field: 'queues', message: `Queue "${queue.name}" has no assigned agents`, severity: 'blocker' });
    }
    if (!queue.routingPath?.trim()) {
      issues.push({ section: 'Queue Setup', field: 'queues', message: `Queue "${queue.name}" has no routing path defined`, severity: 'warning' });
    }
  }

  // Priority conflicts
  const priorities = q.queues.map((queue) => queue.priority);
  const dupPriorities = priorities.filter((p, i) => priorities.indexOf(p) !== i && p > 0);
  if (dupPriorities.length > 0) {
    issues.push({ section: 'Queue Setup', field: 'queues', message: `Multiple queues share the same priority level: ${[...new Set(dupPriorities)].join(', ')}`, severity: 'warning' });
  }

  return issues;
}

export function validateScriptKnowledgeBase(client: TenantOnboarding): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const s = client.scriptKnowledgeBase;

  if (!s.greeting?.trim()) {
    issues.push({ section: 'Script & Knowledge Base', field: 'greeting', message: 'No greeting script is configured', severity: 'blocker' });
  }
  if (!s.faqAnswers || s.faqAnswers.length === 0) {
    issues.push({ section: 'Script & Knowledge Base', field: 'faqAnswers', message: 'No FAQ answers are configured', severity: 'warning' });
  }
  if (!s.objectionHandling?.trim()) {
    issues.push({ section: 'Script & Knowledge Base', field: 'objectionHandling', message: 'Objection handling script is missing', severity: 'warning' });
  }

  // Compliance wording required for regulated industries
  const regulatedIndustries = ['Healthcare', 'Finance', 'Insurance'];
  if (regulatedIndustries.includes(client.industry) && !s.complianceWording?.trim()) {
    issues.push({ section: 'Script & Knowledge Base', field: 'complianceWording', message: `Compliance wording is required for ${client.industry} industry`, severity: 'blocker' });
  }

  // Escalation wording required if urgent keywords or complaint escalation configured
  if (
    (client.businessRules.urgentKeywords.length > 0 || client.businessRules.complaintEscalationEnabled) &&
    !s.escalationWording?.trim()
  ) {
    issues.push({ section: 'Script & Knowledge Base', field: 'escalationWording', message: 'Escalation wording is missing but escalation rules are configured', severity: 'blocker' });
  }

  // Script references pricing but pricing notes missing
  const scriptText = `${s.greeting} ${s.servicesScript} ${s.closingScript}`.toLowerCase();
  if ((scriptText.includes('price') || scriptText.includes('cost') || scriptText.includes('quote')) && !s.pricingNotes?.trim()) {
    issues.push({ section: 'Script & Knowledge Base', field: 'pricingNotes', message: 'Script references pricing but no pricing notes are provided', severity: 'blocker' });
  }

  // Script too vague check — greeting must be at least 20 characters
  if (s.greeting?.trim() && s.greeting.trim().length < 20) {
    issues.push({ section: 'Script & Knowledge Base', field: 'greeting', message: 'Greeting script is too short to be operationally useful (< 20 chars)', severity: 'warning' });
  }

  return issues;
}

export function validateBookingRules(client: TenantOnboarding): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const b = client.bookingRules;

  if (!b.requiredCallerFields || b.requiredCallerFields.length === 0) {
    issues.push({ section: 'Booking Rules', field: 'requiredCallerFields', message: 'No required caller fields are defined for bookings', severity: 'warning' });
  }
  if (!b.requiredJobFields || b.requiredJobFields.length === 0) {
    issues.push({ section: 'Booking Rules', field: 'requiredJobFields', message: 'No required job fields are defined for bookings', severity: 'warning' });
  }

  // Deposit required but no workflow
  if (b.depositRequired && !b.depositWorkflow?.trim()) {
    issues.push({ section: 'Booking Rules', field: 'depositWorkflow', message: 'Deposit is required but no deposit workflow is configured', severity: 'blocker' });
  }
  if (b.depositRequired && !b.depositAmount?.trim()) {
    issues.push({ section: 'Booking Rules', field: 'depositAmount', message: 'Deposit is required but no deposit amount is specified', severity: 'blocker' });
  }

  // Manager approval required but no contact
  if (b.managerApprovalRequired && !b.managerContactPhone?.trim()) {
    issues.push({ section: 'Booking Rules', field: 'managerContactPhone', message: 'Manager approval is required but no manager contact phone is provided', severity: 'blocker' });
  }
  if (b.managerApprovalRequired && !b.managerContactName?.trim()) {
    issues.push({ section: 'Booking Rules', field: 'managerContactName', message: 'Manager approval is required but no manager name is provided', severity: 'blocker' });
  }

  // Calendar integration toggled but not connected
  if (b.calendarIntegrationEnabled && !b.calendarConnected) {
    issues.push({ section: 'Booking Rules', field: 'calendarConnected', message: 'Calendar integration is enabled but no calendar is connected', severity: 'blocker' });
  }

  // SMS confirmation enabled but no sender config
  if (b.smsConfirmationEnabled && !b.smsSenderConfigured) {
    issues.push({ section: 'Booking Rules', field: 'smsSenderConfigured', message: 'SMS confirmation is enabled but sender is not configured', severity: 'blocker' });
  }

  if (!b.cancellationPolicy?.trim()) {
    issues.push({ section: 'Booking Rules', field: 'cancellationPolicy', message: 'No cancellation policy is defined', severity: 'warning' });
  }
  if (!b.rescheduleRules?.trim()) {
    issues.push({ section: 'Booking Rules', field: 'rescheduleRules', message: 'No reschedule rules are defined', severity: 'warning' });
  }

  // Bookings outside hours without explicit rule
  if (b.allowBookingsOutsideHours && !b.outsideHoursBookingRule?.trim()) {
    issues.push({ section: 'Booking Rules', field: 'outsideHoursBookingRule', message: 'Bookings allowed outside business hours but no explicit rule is defined', severity: 'blocker' });
  }

  return issues;
}

export function validateTestingGoLive(client: TenantOnboarding): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const t = client.testingGoLive;

  if (!t.testCalls || t.testCalls.length === 0) {
    issues.push({ section: 'Testing & Go Live', field: 'testCalls', message: 'No test calls have been completed', severity: 'blocker' });
  } else {
    const failedTests = t.testCalls.filter((tc) => tc.result === 'fail');
    if (failedTests.length > 0) {
      issues.push({ section: 'Testing & Go Live', field: 'testCalls', message: `${failedTests.length} test call(s) failed`, severity: 'blocker' });
    }
    if (!t.allTestsPassed) {
      issues.push({ section: 'Testing & Go Live', field: 'allTestsPassed', message: 'Not all tests have passed', severity: 'blocker' });
    }
  }

  if (!t.routingVerified) {
    issues.push({ section: 'Testing & Go Live', field: 'routingVerified', message: 'Call routing has not been verified', severity: 'blocker' });
  }
  if (!t.queueConfigVerified) {
    issues.push({ section: 'Testing & Go Live', field: 'queueConfigVerified', message: 'Queue configuration has not been verified', severity: 'blocker' });
  }
  if (!t.clientApprovalReceived) {
    issues.push({ section: 'Testing & Go Live', field: 'clientApprovalReceived', message: 'Client approval has not been received', severity: 'blocker' });
  }
  if (t.clientApprovalReceived && !t.clientApprovalTimestamp?.trim()) {
    issues.push({ section: 'Testing & Go Live', field: 'clientApprovalTimestamp', message: 'Client approval is marked but no approval timestamp exists', severity: 'blocker' });
  }
  if (t.clientApprovalReceived && !t.clientApprovalBy?.trim()) {
    issues.push({ section: 'Testing & Go Live', field: 'clientApprovalBy', message: 'Client approval is marked but no approver is recorded', severity: 'blocker' });
  }
  if (!t.scriptApprovalReceived) {
    issues.push({ section: 'Testing & Go Live', field: 'scriptApprovalReceived', message: 'Script approval has not been received', severity: 'blocker' });
  }
  if (!t.rollbackPlan?.trim()) {
    issues.push({ section: 'Testing & Go Live', field: 'rollbackPlan', message: 'No rollback plan is defined', severity: 'blocker' });
  }
  if (!t.handoverNotes?.trim()) {
    issues.push({ section: 'Testing & Go Live', field: 'handoverNotes', message: 'No handover notes are provided', severity: 'warning' });
  }
  if (!t.assignedLiveOpsTeam?.trim()) {
    issues.push({ section: 'Testing & Go Live', field: 'assignedLiveOpsTeam', message: 'No live operations team is assigned', severity: 'blocker' });
  }

  return issues;
}

/* ─── Cross-Section Conflict Detection ─── */

export function detectCrossSectionConflicts(client: TenantOnboarding): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const br = client.businessRules;
  const cd = client.clientDetails;
  const qs = client.queueSetup;
  const sk = client.scriptKnowledgeBase;
  const bk = client.bookingRules;

  // After-hours enabled but no business hours defined to determine what "after hours" means
  if (br.afterHoursEnabled && (!cd.businessHours || cd.businessHours.length === 0)) {
    issues.push({ section: 'Cross-Section', field: 'businessHours+afterHours', message: 'After-hours rules are enabled but no business hours are defined to determine after-hours boundaries', severity: 'blocker' });
  }

  // After-hours transfer enabled but no transfer number
  if (br.afterHoursEnabled && br.afterHoursAction === 'transfer' && !br.afterHoursTransferNumber?.trim() && !cd.afterHoursPhone?.trim()) {
    issues.push({ section: 'Cross-Section', field: 'afterHoursTransfer', message: 'After-hours transfer is configured but no after-hours phone number exists in Client Details or Business Rules', severity: 'blocker' });
  }

  // Urgent keywords exist but no urgent routing path in any queue
  if (br.urgentKeywords.length > 0 && qs.queues.length > 0) {
    const hasUrgentRouting = qs.queues.some((q) => q.purpose?.toLowerCase().includes('urgent') || q.purpose?.toLowerCase().includes('emergency'));
    if (!hasUrgentRouting) {
      issues.push({ section: 'Cross-Section', field: 'urgentKeywords+queues', message: 'Urgent keywords are configured but no queue has an urgent/emergency routing purpose', severity: 'blocker' });
    }
  }

  // Script references services not in allowed services
  if (sk.servicesScript?.trim() && br.allowedServices.length > 0) {
    for (const excluded of br.excludedServices) {
      if (sk.servicesScript.toLowerCase().includes(excluded.toLowerCase())) {
        issues.push({ section: 'Cross-Section', field: 'script+excludedServices', message: `Script references excluded service: "${excluded}"`, severity: 'blocker' });
      }
    }
  }

  // Queues exist but no script
  if (qs.queues.length > 0 && !sk.greeting?.trim()) {
    issues.push({ section: 'Cross-Section', field: 'queues+script', message: 'Queues are configured but no greeting script exists for agents to use', severity: 'blocker' });
  }

  // Complaint escalation enabled but no escalation wording in script
  if (br.complaintEscalationEnabled && !sk.escalationWording?.trim()) {
    issues.push({ section: 'Cross-Section', field: 'complaintEscalation+script', message: 'Complaint escalation is enabled but no escalation wording exists in the script', severity: 'blocker' });
  }

  // Booking rules require manager approval but no manager contact in client details either
  if (bk.managerApprovalRequired && !bk.managerContactPhone?.trim() && !cd.primaryManagerPhone?.trim()) {
    issues.push({ section: 'Cross-Section', field: 'bookingApproval+manager', message: 'Booking manager approval is required but no manager contact exists in Booking Rules or Client Details', severity: 'blocker' });
  }

  // Multiple locations with different hours but queues dont account for it
  if (cd.locations && cd.locations.length > 1 && qs.queues.length > 0) {
    const multiLocationQueues = qs.queues.filter((q) => q.businessHoursRule?.toLowerCase().includes('location'));
    if (multiLocationQueues.length === 0) {
      issues.push({ section: 'Cross-Section', field: 'locations+queues', message: 'Multiple locations exist with potentially different hours but no queue rules reference location-specific routing', severity: 'warning' });
    }
  }

  return issues;
}

/* ─── Go-Live Blocker Check ─── */

export function getGoLiveBlockers(client: TenantOnboarding): ValidationIssue[] {
  const allIssues: ValidationIssue[] = [
    ...validateClientDetails(client),
    ...validateBusinessRules(client),
    ...validateQueueSetup(client),
    ...validateScriptKnowledgeBase(client),
    ...validateBookingRules(client),
    ...validateTestingGoLive(client),
    ...detectCrossSectionConflicts(client),
  ];
  return allIssues.filter((i) => i.severity === 'blocker');
}

export function getGoLiveWarnings(client: TenantOnboarding): ValidationIssue[] {
  const allIssues: ValidationIssue[] = [
    ...validateClientDetails(client),
    ...validateBusinessRules(client),
    ...validateQueueSetup(client),
    ...validateScriptKnowledgeBase(client),
    ...validateBookingRules(client),
    ...validateTestingGoLive(client),
    ...detectCrossSectionConflicts(client),
  ];
  return allIssues.filter((i) => i.severity === 'warning');
}

/* ─── Stage Transition Validation ─── */

export function getStageIndex(stage: OnboardingStage): number {
  if (stage === 'needs-revision') return -1;
  return ONBOARDING_STAGES.indexOf(stage);
}

export function getNextStage(current: OnboardingStage): OnboardingStage | null {
  if (current === 'needs-revision') return null; // must be explicitly set
  const idx = ONBOARDING_STAGES.indexOf(current);
  if (idx < 0 || idx >= ONBOARDING_STAGES.length - 1) return null;
  return ONBOARDING_STAGES[idx + 1];
}

export function validateStageTransition(client: TenantOnboarding, targetStage: OnboardingStage): StageTransitionResult {
  const blockers: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Cannot advance from 'live' (terminal)
  if (client.onboardingStage === 'live' && targetStage !== 'needs-revision') {
    blockers.push({ section: 'Stage', field: 'onboardingStage', message: 'Client is already live — can only move to Needs Revision', severity: 'blocker' });
  }

  // Validate prerequisites for specific stages
  switch (targetStage) {
    case 'contacted': {
      // Must have basic contact info
      if (!client.contactName?.trim()) {
        blockers.push({ section: 'Stage', field: 'contactName', message: 'Contact name is required before marking as contacted', severity: 'blocker' });
      }
      if (!client.contactPhone?.trim() && !client.contactEmail?.trim()) {
        blockers.push({ section: 'Stage', field: 'contactPhone', message: 'At least one contact method (phone or email) is required', severity: 'blocker' });
      }
      break;
    }
    case 'discovery-complete': {
      const cdIssues = validateClientDetails(client);
      blockers.push(...cdIssues.filter((i) => i.severity === 'blocker'));
      warnings.push(...cdIssues.filter((i) => i.severity === 'warning'));
      break;
    }
    case 'tenant-created': {
      if (!client.id?.trim()) {
        blockers.push({ section: 'Stage', field: 'tenantId', message: 'Tenant must be created in the system', severity: 'blocker' });
      }
      break;
    }
    case 'queue-setup-complete': {
      const qIssues = validateQueueSetup(client);
      blockers.push(...qIssues.filter((i) => i.severity === 'blocker'));
      warnings.push(...qIssues.filter((i) => i.severity === 'warning'));
      break;
    }
    case 'script-setup-complete': {
      const sIssues = validateScriptKnowledgeBase(client);
      blockers.push(...sIssues.filter((i) => i.severity === 'blocker'));
      warnings.push(...sIssues.filter((i) => i.severity === 'warning'));
      break;
    }
    case 'testing': {
      // All setup sections must be complete
      const brIssues = validateBusinessRules(client);
      const bkIssues = validateBookingRules(client);
      blockers.push(...brIssues.filter((i) => i.severity === 'blocker'));
      blockers.push(...bkIssues.filter((i) => i.severity === 'blocker'));
      warnings.push(...brIssues.filter((i) => i.severity === 'warning'));
      warnings.push(...bkIssues.filter((i) => i.severity === 'warning'));
      break;
    }
    case 'awaiting-approval': {
      const tIssues = validateTestingGoLive(client);
      // For awaiting-approval, test calls must exist and pass, but client approval not yet needed
      const testBlockers = tIssues.filter((i) => i.severity === 'blocker' && !i.field.startsWith('client') && !i.field.startsWith('script'));
      blockers.push(...testBlockers);
      break;
    }
    case 'live': {
      // ALL blockers from ALL sections must be resolved
      const goLiveBlockers = getGoLiveBlockers(client);
      blockers.push(...goLiveBlockers);
      const goLiveWarnings = getGoLiveWarnings(client);
      warnings.push(...goLiveWarnings);
      break;
    }
    case 'needs-revision': {
      // Always allowed — this is a regression
      break;
    }
    default:
      break;
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings,
    targetStage,
  };
}

/* ─── Full Validation Summary ─── */

export function validateOnboarding(client: TenantOnboarding): ValidationResult {
  const allIssues: ValidationIssue[] = [
    ...validateClientDetails(client),
    ...validateBusinessRules(client),
    ...validateQueueSetup(client),
    ...validateScriptKnowledgeBase(client),
    ...validateBookingRules(client),
    ...validateTestingGoLive(client),
    ...detectCrossSectionConflicts(client),
  ];

  return {
    valid: allIssues.filter((i) => i.severity === 'blocker').length === 0,
    blockers: allIssues.filter((i) => i.severity === 'blocker'),
    warnings: allIssues.filter((i) => i.severity === 'warning'),
  };
}
