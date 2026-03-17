import type { UserSession, UserRole } from './types';

const SESSIONS: Record<UserRole, UserSession> = {
  'super-admin': {
    userId: 'u-sa-001',
    role: 'super-admin',
    tenantId: null,
    allowedQueueIds: [],
    displayName: 'Sarah Mitchell',
  },
  'client-admin': {
    userId: 'u-ca-001',
    role: 'client-admin',
    tenantId: 't-001',
    allowedQueueIds: ['q-s1', 'q-h1', 'q-b1'],
    displayName: 'James Wilson',
  },
  'supervisor': {
    userId: 'u-sv-001',
    role: 'supervisor',
    tenantId: 't-001',
    allowedQueueIds: ['q-s1', 'q-h1', 'q-b1'],
    displayName: 'Lisa Chen',
  },
  'agent': {
    userId: 'u-ag-001',
    role: 'agent',
    tenantId: null,
    allowedQueueIds: ['q-s1', 'q-s2', 'q-h2'],
    displayName: 'Ben Torres',
  },
};

export const ALL_MOCK_SESSIONS = SESSIONS;

export function getSessionByRole(role: UserRole): UserSession {
  return SESSIONS[role];
}

export function getCurrentSession(): UserSession {
  return SESSIONS['agent'];
}
