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
    console.warn('[AuditLog] No session provided, skipping audit log for action:', action);
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
      console.warn('[AuditLog] Failed to insert audit log. Ensure system_audit_logs table exists:', error);
    } else {
      console.info(`[AuditLog] Logged ${action} by ${session.displayName} (${session.role})`);
    }
  } catch (err) {
    console.error('[AuditLog] Exception logging audit activity:', err);
  }
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
    console.error('[AuditLog] Error fetching audit logs:', error);
    return [];
  }
  
  return data as AuditLogEntry[];
}
