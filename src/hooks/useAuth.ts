import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { UserSession, UserRole, Permissions } from '@/services/types';
import { derivePermissions } from '@/utils/permissions';
import type { User } from '@supabase/supabase-js';
import { logSystemActivity } from '@/services/auditLogApi';

interface AuthState {
  user: User | null;
  session: UserSession | null;
  permissions: Permissions;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const EMPTY_PERMISSIONS: Permissions = {
  canViewAllTenants: false, canSwitchTenant: false, canViewSipInfrastructure: false,
  canViewTenantNames: false, canViewCallsTab: false, canViewBookingsTab: false, canViewAgentsTab: false,
  canViewOverviewTab: false, canViewSipTab: false, canViewClientsTab: false,
  canSignUpClients: false, canAdvanceOnboarding: false, canEditClientDetails: false,
  canApproveGoLive: false, canRegressStage: false, canViewShiftPanel: false,
  canOnboardAgents: false, canViewAgentOnboarding: false, canViewAgentOnboardingTab: false,
  canViewAuditLogs: false,
  allowedTenantId: null, allowedQueueIds: [],
};

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserSession = useCallback(async (authUser: User) => {
    try {
      // Fetch profile and role in parallel
      const [profileRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('display_name, tenant_id').eq('id', authUser.id).single(),
        supabase.from('user_roles').select('role').eq('user_id', authUser.id).single(),
      ]);

      const profile = profileRes.data;
      const role = (roleRes.data?.role as UserRole) || 'agent';
      const tenantId = profile?.tenant_id || null;

      // For agents, try to fetch allowed queue IDs (row may not exist yet)
      let allowedQueueIds: string[] = [];
      if (role === 'agent') {
        const { data: agentData } = await supabase
          .from('agents')
          .select('allowed_queue_ids')
          .eq('user_id', authUser.id)
          .maybeSingle();
        allowedQueueIds = agentData?.allowed_queue_ids || [];
        // "Online" in this app is represented as "available".
        const { error: presenceErr } = await supabase
          .from('agents')
          .update({ status: 'available' })
          .eq('user_id', authUser.id);
        if (presenceErr) {
          console.warn('Failed to set agent online status:', presenceErr.message);
        }
      }

      const userSession: UserSession = {
        userId: authUser.id,
        role,
        tenantId,
        allowedQueueIds,
        displayName: profile?.display_name || authUser.email || '',
      };

      setSession(userSession);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, authSession) => {
        if (authSession?.user) {
          setUser(authSession.user);
          // Use setTimeout to avoid Supabase deadlock
          setTimeout(() => loadUserSession(authSession.user), 0);
        } else {
          setUser(null);
          setSession(null);
        }
        setLoading(false);
      }
    );

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (existingSession?.user) {
        setUser(existingSession.user);
        loadUserSession(existingSession.user);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUserSession]);

  const permissions = useMemo(() => {
    if (!session) return EMPTY_PERMISSIONS;
    return derivePermissions(session);
  }, [session]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && authData?.user) {
      setTimeout(async () => {
        try {
          const profileRes = await supabase.from('profiles').select('display_name, tenant_id').eq('id', authData.user.id).single();
          const roleRes = await supabase.from('user_roles').select('role').eq('user_id', authData.user.id).single();
          const userSession: UserSession = {
            userId: authData.user.id,
            role: (roleRes.data?.role as UserRole) || 'agent',
            tenantId: profileRes.data?.tenant_id || null,
            allowedQueueIds: [],
            displayName: profileRes.data?.display_name || authData.user.email || '',
          };
          await logSystemActivity(userSession, 'LOGIN', 'SESSION', authData.user.id, { email });
        } catch (e) {
          console.error('Failed to log login activity:', e);
        }
      }, 0);
    }
    return { error: error?.message || null };
  }, []);

  const signOut = useCallback(async () => {
    if (session?.role === 'agent') {
      const { error: presenceErr } = await supabase
        .from('agents')
        .update({ status: 'offline' })
        .eq('user_id', session.userId);
      if (presenceErr) {
        console.warn('Failed to set agent offline status:', presenceErr.message);
      }
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, [session]);

  return { user, session, permissions, loading, signIn, signOut };
}
