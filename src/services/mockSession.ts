import type { UserSession } from './types';

/**
 * Mock authenticated session.
 * Swap this with a real GET /api/session call later.
 *
 * Uncomment different blocks below to test role-based UI:
 */

// ─── Super Admin (default) ───
const SUPER_ADMIN_SESSION: UserSession = {
  userId: 'u-sa-001',
  role: 'super-admin',
  tenantId: null,        // null = access to all tenants
  allowedQueueIds: [],   // empty = all queues
  displayName: 'Sarah Mitchell',
};

// ─── Client Admin (Melbourne Plumbing Co) ───
const CLIENT_ADMIN_SESSION: UserSession = {
  userId: 'u-ca-001',
  role: 'client-admin',
  tenantId: 't-001',
  allowedQueueIds: ['q-s1', 'q-h1', 'q-b1'],
  displayName: 'James Wilson',
};

// ─── Agent (Sunrise Dental, limited queues) ───
// const AGENT_SESSION: UserSession = {
//   userId: 'u-ag-001',
//   role: 'agent',
//   tenantId: 't-002',
//   allowedQueueIds: ['q-s2'],
//   displayName: 'Ben Torres',
// };

/** Returns the current mock session. Replace with real auth. */
export function getCurrentSession(): UserSession {
  return SUPER_ADMIN_SESSION;
  // return CLIENT_ADMIN_SESSION;
  // return AGENT_SESSION;
}
