/* ═══════════════════════════════════════════════════════════════
   Activity Log Service

   Provides audit trail for all onboarding actions.
   Every stage change, section edit, approval, and test result
   must be logged with timestamp and user attribution.
   ═══════════════════════════════════════════════════════════════ */

import type { ActivityLogEntry, TenantOnboarding } from './types';

let logCounter = 0;

function generateLogId(): string {
  logCounter += 1;
  return `log-${String(logCounter).padStart(6, '0')}`;
}

export function createActivityLogEntry(
  userId: string,
  userName: string,
  action: string,
  section: string,
  details: string,
  previousValue: string = '',
  newValue: string = '',
): ActivityLogEntry {
  return {
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    userId,
    userName,
    action,
    section,
    details,
    previousValue,
    newValue,
  };
}

export function logStageChange(
  client: TenantOnboarding,
  userId: string,
  userName: string,
  fromStage: string,
  toStage: string,
): void {
  const entry = createActivityLogEntry(
    userId,
    userName,
    'stage_change',
    'Onboarding Stage',
    `Stage changed from "${fromStage}" to "${toStage}"`,
    fromStage,
    toStage,
  );
  client.activityLog.push(entry);
}

export function logSectionUpdate(
  client: TenantOnboarding,
  userId: string,
  userName: string,
  section: string,
  fieldName: string,
  previousValue: string,
  newValue: string,
): void {
  const entry = createActivityLogEntry(
    userId,
    userName,
    'section_update',
    section,
    `Field "${fieldName}" updated in ${section}`,
    previousValue,
    newValue,
  );
  client.activityLog.push(entry);
}

export function logApproval(
  client: TenantOnboarding,
  userId: string,
  userName: string,
  approvalType: string,
  details: string,
): void {
  const entry = createActivityLogEntry(
    userId,
    userName,
    'approval',
    'Approvals',
    `${approvalType}: ${details}`,
  );
  client.activityLog.push(entry);
}

export function logTestResult(
  client: TenantOnboarding,
  userId: string,
  userName: string,
  testScenario: string,
  result: string,
  notes: string,
): void {
  const entry = createActivityLogEntry(
    userId,
    userName,
    'test_result',
    'Testing & Go Live',
    `Test "${testScenario}" — Result: ${result}. ${notes}`,
  );
  client.activityLog.push(entry);
}

export function logClientCreation(
  client: TenantOnboarding,
  userId: string,
  userName: string,
): void {
  const entry = createActivityLogEntry(
    userId,
    userName,
    'client_created',
    'Client Details',
    `Client "${client.name}" created in ${client.industry} industry`,
  );
  client.activityLog.push(entry);
}
