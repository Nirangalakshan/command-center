import { supabase } from '@/integrations/supabase/client';
import type { UserSession } from './types';

export interface AuditLogEntry {
  id?: string;
  created_at?: string;
  user_id: string;
  user_name: string;
  user_role: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, any>;
}

/**
 * Logs a system activity for auditing and role-based tracking purposes.
 * Saves the action along with the user's role and details to the Supabase database.
 */
export async function logSystemActivity(
  session: UserSession | null | undefined,
  action: string,
  resourceType: string,
  resourceId?: string | null,
  details?: Record<string, any>
) {
  if (!session) {
    // console.warn('[AuditLog] No session provided, skipping audit log for action:', action);
    return;
  }
  
  try {
    const { error } = await (supabase as any).from('system_audit_logs').insert({
      user_id: session.userId,
      user_name: session.displayName,
      user_role: session.role,
      action,
      resource_type: resourceType,
      resource_id: resourceId ?? null,
      details: details ?? {}
    });

    if (error) {
      // console.warn('[AuditLog] Failed to insert audit log. Ensure system_audit_logs table exists:', error);
    } else {
      // console.info(`[AuditLog] Logged ${action} by ${session.displayName} (${session.role})`);
    }
  } catch {
    // console.error('[AuditLog] Exception logging audit activity:', err);
  }
}

/**
 * Fetches the notification IDs that a specific agent marked as "Customer Answered",
 * by querying audit logs for that agent's `notification_customer_answered` actions.
 */
export async function fetchAgentAnsweredNotificationIds(
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await (supabase as any)
    .from('system_audit_logs')
    .select('resource_id')
    .eq('user_id', userId)
    .eq('action', 'notification_customer_answered')
    .not('resource_id', 'is', null);

  if (error) {
    // console.error('[AuditLog] Error fetching agent answered notifications:', error);
    return new Set();
  }

  return new Set(
    (data as { resource_id: string }[]).map((r) => r.resource_id),
  );
}

/**
 * Fetches a map of notification_id → agent display name for all
 * `notification_call_customer` audit log entries (i.e. who clicked "Call Customer").
 * When multiple agents called the same notification, the most recent caller wins.
 */
export async function fetchCallCustomerAgentMap(): Promise<Map<string, string>> {
  const { data, error } = await (supabase as any)
    .from('system_audit_logs')
    .select('resource_id, user_name, created_at')
    .eq('action', 'notification_call_customer')
    .not('resource_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    // console.error('[AuditLog] Error fetching call-customer agent map:', error);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data as { resource_id: string; user_name: string }[]) {
    if (!map.has(row.resource_id)) {
      map.set(row.resource_id, row.user_name);
    }
  }
  return map;
}

/**
 * Fetches a map of notification_id → agent display name for all
 * `notification_customer_answered` audit log entries (i.e. who clicked "Customer Answered").
 * When multiple agents interacted, the most recent interaction wins.
 */
export async function fetchAnsweredCustomerAgentMap(): Promise<Map<string, string>> {
  const { data, error } = await (supabase as any)
    .from('system_audit_logs')
    .select('resource_id, user_name, created_at')
    .eq('action', 'notification_customer_answered')
    .not('resource_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    // console.error('[AuditLog] Error fetching answered agent map:', error);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data as { resource_id: string; user_name: string }[]) {
    if (!map.has(row.resource_id)) {
      map.set(row.resource_id, row.user_name);
    }
  }
  return map;
}

/**
 * Fetches recent audit logs for the dashboard.
 */
export async function fetchSystemAuditLogs(limit: number = 100): Promise<AuditLogEntry[]> {
  const { data, error } = await (supabase as any)
    .from('system_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
    
  if (error) {
    // console.error('[AuditLog] Error fetching audit logs:', error);
    return [];
  }
  
  return data as AuditLogEntry[];
}
