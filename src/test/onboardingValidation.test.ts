import { describe, it, expect } from 'vitest';
import type {
  TenantOnboarding,
  OnboardingStage,
  ClientDetails,
  BusinessRules,
  QueueSetup,
  ScriptKnowledgeBase,
  BookingRules,
  TestingGoLive,
} from '@/services/types';
import {
  validateClientDetails,
  validateBusinessRules,
  validateQueueSetup,
  validateScriptKnowledgeBase,
  validateBookingRules,
  validateTestingGoLive,
  detectCrossSectionConflicts,
  getGoLiveBlockers,
  getGoLiveWarnings,
  validateStageTransition,
  getNextStage,
  getStageIndex,
  isValidEmail,
  isValidPhone,
  ONBOARDING_STAGES,
} from '@/utils/onboardingValidation';
import { derivePermissions } from '@/utils/permissions';
import type { UserSession } from '@/services/types';

/* ─── Test Helpers ─── */

function createEmptyClientDetails(): ClientDetails {
  return {
    businessName: '', abn: '', industry: '', timezone: '',
    primaryContactName: '', primaryContactPhone: '', primaryContactEmail: '',
    billingContactName: '', billingContactEmail: '',
    primaryManagerName: '', primaryManagerPhone: '', primaryManagerEmail: '',
    afterHoursPhone: '', businessHours: [], locations: [], serviceArea: '', website: '',
  };
}

function createEmptyBusinessRules(): BusinessRules {
  return {
    urgentKeywords: [], escalationContactName: '', escalationContactPhone: '', escalationContactEmail: '',
    afterHoursEnabled: false, afterHoursAction: 'none', afterHoursTransferNumber: '', afterHoursVoicemailGreeting: '',
    approvalRequired: false, approverName: '', approverPhone: '', approverEmail: '',
    complaintEscalationEnabled: false, complaintEscalationPath: '', complaintEscalationContact: '',
    transferRules: [], allowedServices: [], excludedServices: [],
  };
}

function createEmptyQueueSetup(): QueueSetup {
  return { queues: [] };
}

function createEmptyScript(): ScriptKnowledgeBase {
  return {
    greeting: '', faqAnswers: [], objectionHandling: '', complianceWording: '',
    escalationWording: '', pricingNotes: '', servicesScript: '', closingScript: '',
    approvedByClient: false, approvedAt: '', approvedBy: '',
  };
}

function createEmptyBookingRules(): BookingRules {
  return {
    requiredCallerFields: [], requiredJobFields: [],
    depositRequired: false, depositAmount: '', depositWorkflow: '',
    managerApprovalRequired: false, managerContactName: '', managerContactPhone: '',
    calendarIntegrationEnabled: false, calendarConnected: false, calendarProvider: '',
    smsConfirmationEnabled: false, smsSenderConfigured: false, smsSenderId: '',
    cancellationPolicy: '', rescheduleRules: '',
    allowBookingsOutsideHours: false, outsideHoursBookingRule: '',
  };
}

function createEmptyTestingGoLive(): TestingGoLive {
  return {
    testCalls: [], allTestsPassed: false, routingVerified: false, queueConfigVerified: false,
    clientApprovalReceived: false, clientApprovalTimestamp: '', clientApprovalBy: '',
    scriptApprovalReceived: false, scriptApprovalTimestamp: '',
    rollbackPlan: '', handoverNotes: '', assignedLiveOpsTeam: '', goLiveDate: '',
  };
}

function createTestClient(overrides: Partial<TenantOnboarding> = {}): TenantOnboarding {
  return {
    id: 't-test', name: 'Test Business', industry: 'Trades', status: 'active', brandColor: '#00d4f5', didNumbers: [],
    onboardingStage: 'new', contactName: 'Test Contact', contactPhone: '0400000000', contactEmail: 'test@test.com',
    createdBy: 'u-test', createdAt: new Date().toISOString(), notes: '',
    clientDetails: createEmptyClientDetails(),
    businessRules: createEmptyBusinessRules(),
    queueSetup: createEmptyQueueSetup(),
    scriptKnowledgeBase: createEmptyScript(),
    bookingRules: createEmptyBookingRules(),
    testingGoLive: createEmptyTestingGoLive(),
    activityLog: [],
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════════════════
   TEST SUITE: Onboarding Validation Engine
   ═══════════════════════════════════════════════════════════════ */

describe('Field Validators', () => {
  // TC-01: Valid email
  it('TC-01: should accept valid email addresses', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('user.name@domain.com.au')).toBe(true);
  });

  // TC-02: Invalid email
  it('TC-02: should reject invalid email addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('@domain.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
  });

  // TC-03: Valid phone
  it('TC-03: should accept valid phone numbers', () => {
    expect(isValidPhone('0412345678')).toBe(true);
    expect(isValidPhone('04 1234 5678')).toBe(true);
    expect(isValidPhone('+61412345678')).toBe(true);
  });

  // TC-04: Invalid phone
  it('TC-04: should reject invalid phone numbers', () => {
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('abc')).toBe(false);
    expect(isValidPhone('12')).toBe(false);
  });
});

describe('Client Details Validation', () => {
  // TC-05: Missing business name blocks progression
  it('TC-05: should block when business name is missing', () => {
    const client = createTestClient();
    const issues = validateClientDetails(client);
    expect(issues.some((i) => i.field === 'businessName' && i.severity === 'blocker')).toBe(true);
  });

  // TC-06: Missing primary contact blocks progression
  it('TC-06: should block when primary contact details are missing', () => {
    const client = createTestClient();
    const issues = validateClientDetails(client);
    expect(issues.some((i) => i.field === 'primaryContactName' && i.severity === 'blocker')).toBe(true);
    expect(issues.some((i) => i.field === 'primaryContactPhone' && i.severity === 'blocker')).toBe(true);
    expect(issues.some((i) => i.field === 'primaryContactEmail' && i.severity === 'blocker')).toBe(true);
  });

  // TC-07: Missing billing contact blocks progression
  it('TC-07: should block when billing contact is missing', () => {
    const client = createTestClient();
    const issues = validateClientDetails(client);
    expect(issues.some((i) => i.field === 'billingContactEmail' && i.severity === 'blocker')).toBe(true);
    expect(issues.some((i) => i.field === 'billingContactName' && i.severity === 'blocker')).toBe(true);
  });

  // TC-08: Missing business hours blocks progression
  it('TC-08: should block when business hours are not configured', () => {
    const client = createTestClient();
    const issues = validateClientDetails(client);
    expect(issues.some((i) => i.field === 'businessHours' && i.severity === 'blocker')).toBe(true);
  });

  // TC-09: Missing timezone blocks progression
  it('TC-09: should block when timezone is missing', () => {
    const client = createTestClient();
    const issues = validateClientDetails(client);
    expect(issues.some((i) => i.field === 'timezone' && i.severity === 'blocker')).toBe(true);
  });
});

describe('Business Rules Validation', () => {
  // TC-10: Urgent keywords with no escalation contact
  it('TC-10: should block when urgent keywords set but no escalation contact', () => {
    const client = createTestClient({
      businessRules: { ...createEmptyBusinessRules(), urgentKeywords: ['emergency', 'urgent'] },
    });
    const issues = validateBusinessRules(client);
    expect(issues.some((i) => i.field === 'escalationContactPhone' && i.severity === 'blocker')).toBe(true);
  });

  // TC-11: After-hours transfer with no number (plumber scenario)
  it('TC-11: should block after-hours transfer when no transfer number provided', () => {
    const client = createTestClient({
      businessRules: {
        ...createEmptyBusinessRules(),
        afterHoursEnabled: true,
        afterHoursAction: 'transfer',
        afterHoursTransferNumber: '',
      },
    });
    const issues = validateBusinessRules(client);
    expect(issues.some((i) => i.field === 'afterHoursTransferNumber' && i.severity === 'blocker')).toBe(true);
  });

  // TC-12: Approval required but no approver
  it('TC-12: should block when approval required but no approver configured', () => {
    const client = createTestClient({
      businessRules: { ...createEmptyBusinessRules(), approvalRequired: true },
    });
    const issues = validateBusinessRules(client);
    expect(issues.some((i) => i.field === 'approverName' && i.severity === 'blocker')).toBe(true);
  });

  // TC-13: Complaint escalation enabled but no path
  it('TC-13: should block when complaint escalation enabled but no escalation path', () => {
    const client = createTestClient({
      businessRules: { ...createEmptyBusinessRules(), complaintEscalationEnabled: true },
    });
    const issues = validateBusinessRules(client);
    expect(issues.some((i) => i.field === 'complaintEscalationPath' && i.severity === 'blocker')).toBe(true);
    expect(issues.some((i) => i.field === 'complaintEscalationContact' && i.severity === 'blocker')).toBe(true);
  });

  // TC-14: Excluded services contradict allowed services
  it('TC-14: should block when excluded services overlap with allowed services', () => {
    const client = createTestClient({
      businessRules: {
        ...createEmptyBusinessRules(),
        allowedServices: ['plumbing', 'drainage'],
        excludedServices: ['plumbing'],
      },
    });
    const issues = validateBusinessRules(client);
    expect(issues.some((i) => i.message.includes('plumbing'))).toBe(true);
  });
});

describe('Queue Setup Validation', () => {
  // TC-15: No queues configured
  it('TC-15: should block when no queues are configured', () => {
    const client = createTestClient();
    const issues = validateQueueSetup(client);
    expect(issues.some((i) => i.message.includes('No queues'))).toBe(true);
  });

  // TC-16: Queue with no assigned agents
  it('TC-16: should block when queue has no assigned agents', () => {
    const client = createTestClient({
      queueSetup: {
        queues: [{
          id: 'q-1', name: 'Sales', purpose: 'Sales calls',
          businessHoursRule: 'ring-all', afterHoursRule: 'voicemail',
          fallbackAction: 'voicemail', fallbackNumber: '0400000000',
          priority: 1, assignedAgentIds: [], routingPath: 'round-robin',
        }],
      },
    });
    const issues = validateQueueSetup(client);
    expect(issues.some((i) => i.message.includes('no assigned agents'))).toBe(true);
  });

  // TC-17: Duplicate queue names
  it('TC-17: should block when duplicate queue names exist', () => {
    const client = createTestClient({
      queueSetup: {
        queues: [
          { id: 'q-1', name: 'Sales', purpose: 'Sales', businessHoursRule: 'ring', afterHoursRule: 'vm', fallbackAction: 'vm', fallbackNumber: '0400', priority: 1, assignedAgentIds: ['a-1'], routingPath: 'rr' },
          { id: 'q-2', name: 'Sales', purpose: 'Also sales', businessHoursRule: 'ring', afterHoursRule: 'vm', fallbackAction: 'vm', fallbackNumber: '0400', priority: 2, assignedAgentIds: ['a-2'], routingPath: 'rr' },
        ],
      },
    });
    const issues = validateQueueSetup(client);
    expect(issues.some((i) => i.message.includes('Duplicate queue names'))).toBe(true);
  });

  // TC-18: Queue missing business hours rule
  it('TC-18: should block when queue has no business-hours routing rule', () => {
    const client = createTestClient({
      queueSetup: {
        queues: [{
          id: 'q-1', name: 'Sales', purpose: 'Sales',
          businessHoursRule: '', afterHoursRule: 'voicemail',
          fallbackAction: 'voicemail', fallbackNumber: '0400000000',
          priority: 1, assignedAgentIds: ['a-1'], routingPath: 'rr',
        }],
      },
    });
    const issues = validateQueueSetup(client);
    expect(issues.some((i) => i.message.includes('no business-hours routing rule'))).toBe(true);
  });
});

describe('Script & Knowledge Base Validation', () => {
  // TC-19: No greeting script
  it('TC-19: should block when no greeting is configured', () => {
    const client = createTestClient();
    const issues = validateScriptKnowledgeBase(client);
    expect(issues.some((i) => i.field === 'greeting' && i.severity === 'blocker')).toBe(true);
  });

  // TC-20: Compliance wording missing for healthcare
  it('TC-20: should block compliance wording missing for Healthcare industry', () => {
    const client = createTestClient({ industry: 'Healthcare' });
    const issues = validateScriptKnowledgeBase(client);
    expect(issues.some((i) => i.field === 'complianceWording' && i.severity === 'blocker')).toBe(true);
  });

  // TC-21: Compliance wording NOT required for Trades
  it('TC-21: should NOT block compliance wording for Trades industry', () => {
    const client = createTestClient({ industry: 'Trades' });
    const issues = validateScriptKnowledgeBase(client);
    expect(issues.some((i) => i.field === 'complianceWording' && i.severity === 'blocker')).toBe(false);
  });

  // TC-22: Script references pricing but pricing notes missing
  it('TC-22: should block when script references pricing but no pricing notes', () => {
    const client = createTestClient({
      scriptKnowledgeBase: {
        ...createEmptyScript(),
        greeting: 'Welcome! Ask about our prices today!',
      },
    });
    const issues = validateScriptKnowledgeBase(client);
    expect(issues.some((i) => i.field === 'pricingNotes' && i.severity === 'blocker')).toBe(true);
  });
});

describe('Booking Rules Validation', () => {
  // TC-23: Deposit required but no workflow
  it('TC-23: should block when deposit required but no deposit workflow', () => {
    const client = createTestClient({
      bookingRules: { ...createEmptyBookingRules(), depositRequired: true },
    });
    const issues = validateBookingRules(client);
    expect(issues.some((i) => i.field === 'depositWorkflow' && i.severity === 'blocker')).toBe(true);
    expect(issues.some((i) => i.field === 'depositAmount' && i.severity === 'blocker')).toBe(true);
  });

  // TC-24: Calendar integration enabled but not connected
  it('TC-24: should block when calendar integration enabled but not connected', () => {
    const client = createTestClient({
      bookingRules: { ...createEmptyBookingRules(), calendarIntegrationEnabled: true, calendarConnected: false },
    });
    const issues = validateBookingRules(client);
    expect(issues.some((i) => i.field === 'calendarConnected' && i.severity === 'blocker')).toBe(true);
  });

  // TC-25: SMS confirmation enabled but sender not configured
  it('TC-25: should block when SMS enabled but sender not configured', () => {
    const client = createTestClient({
      bookingRules: { ...createEmptyBookingRules(), smsConfirmationEnabled: true, smsSenderConfigured: false },
    });
    const issues = validateBookingRules(client);
    expect(issues.some((i) => i.field === 'smsSenderConfigured' && i.severity === 'blocker')).toBe(true);
  });

  // TC-26: Manager approval required but no manager contact
  it('TC-26: should block when manager approval required but no contact (insurance scenario)', () => {
    const client = createTestClient({
      bookingRules: { ...createEmptyBookingRules(), managerApprovalRequired: true },
    });
    const issues = validateBookingRules(client);
    expect(issues.some((i) => i.field === 'managerContactPhone' && i.severity === 'blocker')).toBe(true);
  });
});

describe('Testing & Go Live Validation', () => {
  // TC-27: No test calls completed
  it('TC-27: should block when no test calls have been made', () => {
    const client = createTestClient();
    const issues = validateTestingGoLive(client);
    expect(issues.some((i) => i.field === 'testCalls' && i.severity === 'blocker')).toBe(true);
  });

  // TC-28: Test calls failed but still trying to advance
  it('TC-28: should block when test calls have failures', () => {
    const client = createTestClient({
      testingGoLive: {
        ...createEmptyTestingGoLive(),
        testCalls: [
          { id: 'tc-1', timestamp: new Date().toISOString(), testerName: 'Admin', scenario: 'Inbound', result: 'fail', notes: 'Routing broken', queueTested: 'Sales' },
        ],
      },
    });
    const issues = validateTestingGoLive(client);
    expect(issues.some((i) => i.message.includes('test call(s) failed'))).toBe(true);
  });

  // TC-29: Client approval marked but no timestamp/approver
  it('TC-29: should block when client approval has no record', () => {
    const client = createTestClient({
      testingGoLive: {
        ...createEmptyTestingGoLive(),
        testCalls: [{ id: 'tc-1', timestamp: new Date().toISOString(), testerName: 'Admin', scenario: 'Test', result: 'pass', notes: '', queueTested: 'Sales' }],
        allTestsPassed: true,
        routingVerified: true,
        queueConfigVerified: true,
        clientApprovalReceived: true,
        clientApprovalTimestamp: '',
        clientApprovalBy: '',
      },
    });
    const issues = validateTestingGoLive(client);
    expect(issues.some((i) => i.field === 'clientApprovalTimestamp' && i.severity === 'blocker')).toBe(true);
    expect(issues.some((i) => i.field === 'clientApprovalBy' && i.severity === 'blocker')).toBe(true);
  });

  // TC-30: No rollback plan
  it('TC-30: should block when no rollback plan is defined', () => {
    const client = createTestClient();
    const issues = validateTestingGoLive(client);
    expect(issues.some((i) => i.field === 'rollbackPlan' && i.severity === 'blocker')).toBe(true);
  });

  // TC-31: No assigned live ops team
  it('TC-31: should block when no live operations team is assigned', () => {
    const client = createTestClient();
    const issues = validateTestingGoLive(client);
    expect(issues.some((i) => i.field === 'assignedLiveOpsTeam' && i.severity === 'blocker')).toBe(true);
  });
});

describe('Cross-Section Conflict Detection', () => {
  // TC-32: After-hours enabled but no business hours defined
  it('TC-32: should detect after-hours without business hours', () => {
    const client = createTestClient({
      businessRules: { ...createEmptyBusinessRules(), afterHoursEnabled: true, afterHoursAction: 'voicemail' },
    });
    const issues = detectCrossSectionConflicts(client);
    expect(issues.some((i) => i.message.includes('no business hours'))).toBe(true);
  });

  // TC-33: Urgent keywords but no urgent queue
  it('TC-33: should detect urgent keywords without urgent queue routing', () => {
    const client = createTestClient({
      businessRules: { ...createEmptyBusinessRules(), urgentKeywords: ['emergency'] },
      queueSetup: {
        queues: [{
          id: 'q-1', name: 'General', purpose: 'General enquiries',
          businessHoursRule: 'ring', afterHoursRule: 'vm', fallbackAction: 'vm',
          fallbackNumber: '0400', priority: 1, assignedAgentIds: ['a-1'], routingPath: 'rr',
        }],
      },
    });
    const issues = detectCrossSectionConflicts(client);
    expect(issues.some((i) => i.message.includes('Urgent keywords are configured but no queue'))).toBe(true);
  });

  // TC-34: Queues exist but no greeting script
  it('TC-34: should detect queues configured without any greeting script', () => {
    const client = createTestClient({
      queueSetup: {
        queues: [{
          id: 'q-1', name: 'Sales', purpose: 'Sales',
          businessHoursRule: 'ring', afterHoursRule: 'vm', fallbackAction: 'vm',
          fallbackNumber: '0400', priority: 1, assignedAgentIds: ['a-1'], routingPath: 'rr',
        }],
      },
    });
    const issues = detectCrossSectionConflicts(client);
    expect(issues.some((i) => i.message.includes('no greeting script'))).toBe(true);
  });
});

describe('Stage Transition Logic', () => {
  // TC-35: Stage ordering is correct
  it('TC-35: should have correct 9-stage linear progression', () => {
    expect(ONBOARDING_STAGES).toEqual([
      'new', 'contacted', 'discovery-complete', 'tenant-created',
      'queue-setup-complete', 'script-setup-complete', 'testing',
      'awaiting-approval', 'live',
    ]);
    expect(ONBOARDING_STAGES.length).toBe(9);
  });

  // TC-36: needs-revision is not in the linear flow
  it('TC-36: needs-revision should not be in the linear stage list', () => {
    expect(ONBOARDING_STAGES).not.toContain('needs-revision');
    expect(getStageIndex('needs-revision')).toBe(-1);
  });

  // TC-37: Cannot advance past live
  it('TC-37: should return null for next stage after live', () => {
    expect(getNextStage('live')).toBeNull();
  });

  // TC-38: Contacted requires contact info
  it('TC-38: should block advancement to contacted without contact info', () => {
    const client = createTestClient({ contactName: '', contactPhone: '', contactEmail: '' });
    const result = validateStageTransition(client, 'contacted');
    expect(result.allowed).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  // TC-39: Live stage requires ALL sections complete
  it('TC-39: should block go-live when any section has blockers', () => {
    const client = createTestClient();
    const result = validateStageTransition(client, 'live');
    expect(result.allowed).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  // TC-40: needs-revision is always allowed
  it('TC-40: should always allow regression to needs-revision', () => {
    const client = createTestClient({ onboardingStage: 'testing' });
    const result = validateStageTransition(client, 'needs-revision');
    expect(result.allowed).toBe(true);
  });
});

describe('Go-Live Blocker Aggregation', () => {
  // TC-41: Empty client has many go-live blockers
  it('TC-41: should return many blockers for empty client data', () => {
    const client = createTestClient();
    const blockers = getGoLiveBlockers(client);
    expect(blockers.length).toBeGreaterThan(10);
  });

  // TC-42: Warnings should exist for missing optional fields
  it('TC-42: should return warnings for missing optional fields', () => {
    const client = createTestClient();
    const warnings = getGoLiveWarnings(client);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('Permission Model', () => {
  // TC-43: Agent should NOT be able to sign up clients
  it('TC-43: should deny client signup to agent role', () => {
    const session: UserSession = { userId: 'u-1', role: 'agent', tenantId: 't-001', allowedQueueIds: ['q-1'], displayName: 'Agent' };
    const perms = derivePermissions(session);
    expect(perms.canSignUpClients).toBe(false);
  });

  // TC-44: Client-admin CAN sign up but CANNOT advance
  it('TC-44: should allow client-admin signup but deny stage advancement', () => {
    const session: UserSession = { userId: 'u-1', role: 'client-admin', tenantId: 't-001', allowedQueueIds: [], displayName: 'CA' };
    const perms = derivePermissions(session);
    expect(perms.canSignUpClients).toBe(true);
    expect(perms.canAdvanceOnboarding).toBe(false);
  });

  // TC-45: Only super-admin can approve go-live
  it('TC-45: should only allow super-admin to approve go-live', () => {
    const superAdmin: UserSession = { userId: 'u-1', role: 'super-admin', tenantId: null, allowedQueueIds: [], displayName: 'SA' };
    const clientAdmin: UserSession = { userId: 'u-2', role: 'client-admin', tenantId: 't-001', allowedQueueIds: [], displayName: 'CA' };
    expect(derivePermissions(superAdmin).canApproveGoLive).toBe(true);
    expect(derivePermissions(clientAdmin).canApproveGoLive).toBe(false);
  });

  // TC-46: Super-admin can see all tenants, client-admin cannot
  it('TC-46: should enforce tenant visibility by role', () => {
    const superAdmin: UserSession = { userId: 'u-1', role: 'super-admin', tenantId: null, allowedQueueIds: [], displayName: 'SA' };
    const clientAdmin: UserSession = { userId: 'u-2', role: 'client-admin', tenantId: 't-001', allowedQueueIds: [], displayName: 'CA' };
    expect(derivePermissions(superAdmin).canViewAllTenants).toBe(true);
    expect(derivePermissions(clientAdmin).canViewAllTenants).toBe(false);
    expect(derivePermissions(clientAdmin).allowedTenantId).toBe('t-001');
  });
});

describe('Mandatory Challenge Scenarios', () => {
  // Scenario 1: Mechanic workshop - bookings + urgent breakdowns, no after-hours voicemail
  it('Scenario 1: mechanic with urgent breakdowns and no after-hours voicemail should have urgent routing', () => {
    const client = createTestClient({
      industry: 'Trades',
      businessRules: {
        ...createEmptyBusinessRules(),
        urgentKeywords: ['breakdown', 'emergency', 'stuck'],
        afterHoursEnabled: true,
        afterHoursAction: 'transfer',
        afterHoursTransferNumber: '0400111222',
      },
      queueSetup: {
        queues: [{
          id: 'q-1', name: 'General', purpose: 'General bookings',
          businessHoursRule: 'ring-all', afterHoursRule: 'transfer',
          fallbackAction: 'voicemail', fallbackNumber: '0400111222',
          priority: 1, assignedAgentIds: ['a-1'], routingPath: 'round-robin',
        }],
      },
    });
    // Should detect urgent keywords but no urgent queue
    const crossIssues = detectCrossSectionConflicts(client);
    expect(crossIssues.some((i) => i.message.includes('Urgent keywords'))).toBe(true);
    // And missing escalation contact
    const brIssues = validateBusinessRules(client);
    expect(brIssues.some((i) => i.field === 'escalationContactPhone')).toBe(true);
  });

  // Scenario 2: Dental clinic with strict greeting and forgotten escalation contact
  it('Scenario 2: dental clinic with complaint escalation but missing contact', () => {
    const client = createTestClient({
      industry: 'Healthcare',
      businessRules: {
        ...createEmptyBusinessRules(),
        complaintEscalationEnabled: true,
        complaintEscalationPath: '',
        complaintEscalationContact: '',
      },
    });
    const issues = validateBusinessRules(client);
    expect(issues.some((i) => i.field === 'complaintEscalationPath' && i.severity === 'blocker')).toBe(true);
    expect(issues.some((i) => i.field === 'complaintEscalationContact' && i.severity === 'blocker')).toBe(true);
    // Also compliance wording required for healthcare
    const scriptIssues = validateScriptKnowledgeBase(client);
    expect(scriptIssues.some((i) => i.field === 'complianceWording' && i.severity === 'blocker')).toBe(true);
  });

  // Scenario 5: Plumber after-hours emergency transfer with no mobile number
  it('Scenario 5: after-hours transfer with missing mobile number', () => {
    const client = createTestClient({
      businessRules: {
        ...createEmptyBusinessRules(),
        afterHoursEnabled: true,
        afterHoursAction: 'transfer',
        afterHoursTransferNumber: '',
      },
    });
    const issues = validateBusinessRules(client);
    expect(issues.some((i) => i.field === 'afterHoursTransferNumber' && i.severity === 'blocker')).toBe(true);
  });

  // Scenario 9: Calendar integration toggled on but not connected
  it('Scenario 9: calendar integration enabled but not connected', () => {
    const client = createTestClient({
      bookingRules: { ...createEmptyBookingRules(), calendarIntegrationEnabled: true, calendarConnected: false },
    });
    const issues = validateBookingRules(client);
    expect(issues.some((i) => i.field === 'calendarConnected')).toBe(true);
  });

  // Scenario 10: SMS confirmation enabled but sender missing
  it('Scenario 10: SMS confirmation enabled but sender not configured', () => {
    const client = createTestClient({
      bookingRules: { ...createEmptyBookingRules(), smsConfirmationEnabled: true, smsSenderConfigured: false },
    });
    const issues = validateBookingRules(client);
    expect(issues.some((i) => i.field === 'smsSenderConfigured')).toBe(true);
  });

  // Scenario 11: Urgent keywords include "emergency" but no urgent route exists
  it('Scenario 11: urgent keywords with no emergency routing', () => {
    const client = createTestClient({
      businessRules: { ...createEmptyBusinessRules(), urgentKeywords: ['emergency'] },
      queueSetup: {
        queues: [{
          id: 'q-1', name: 'General', purpose: 'General enquiries',
          businessHoursRule: 'ring', afterHoursRule: 'vm', fallbackAction: 'vm',
          fallbackNumber: '0400', priority: 1, assignedAgentIds: ['a-1'], routingPath: 'rr',
        }],
      },
    });
    const conflicts = detectCrossSectionConflicts(client);
    expect(conflicts.some((i) => i.message.includes('no queue has an urgent/emergency'))).toBe(true);
  });
});
