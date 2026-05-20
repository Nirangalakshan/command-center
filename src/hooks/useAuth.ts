import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { UserSession, UserRole, Permissions } from '@/services/types';
import { derivePermissions } from '@/utils/permissions';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { logSystemActivity } from '@/services/auditLogApi';
import {
  clearAuthSession,
  getStoredAuthSession,
  isAuthSessionExpired,
  loginWithAuthApi,
  saveAuthSession,
  syncAuthSessionFromSupabase,
} from '@/services/authApi';

interface AuthState {
  user: SupabaseUser | null;
  session: UserSession | null;
  permissions: Permissions;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const EMPTY_PERMISSIONS: Permissions = {
  canViewAllTenants: false, canSwitchTenant: false, canViewSipInfrastructure: false,
  canViewTenantNames: false, canViewCallsTab: false, canViewBookingsTab: false, canViewAgentsTab: false,
  canViewChatTab: false,
  canViewOverviewTab: false, canViewSipTab: false, canViewClientsTab: false,
  canSignUpClients: false, canAdvanceOnboarding: false, canEditClientDetails: false,
  canApproveGoLive: false, canRegressStage: false, canViewShiftPanel: false,
  canViewAttendanceTab: false,
  canOnboardAgents: false, canViewAgentOnboarding: false, canViewAgentOnboardingTab: false,
  canViewAuditLogs: false,
  canManageAgents: false,
  canManageDIDMappings: false,
  canViewSalesAdminSuite: false,
  canViewSalesAgentSuite: false,
  allowedTenantId: null, allowedQueueIds: [],
};

export function useAuth(): AuthState {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const updateSessionIfChanged = useCallback((newSession: UserSession) => {
    setSession((prev) => {
      if (
        prev &&
        prev.userId === newSession.userId &&
        prev.role === newSession.role &&
        prev.tenantId === newSession.tenantId &&
        prev.displayName === newSession.displayName &&
        prev.authEmail === newSession.authEmail &&
        prev.allowedQueueIds.length === newSession.allowedQueueIds.length &&
        prev.allowedQueueIds.every((id, i) => id === newSession.allowedQueueIds[i])
      ) {
        return prev;
      }
      return newSession;
    });
  }, []);

  const loadUserSession = useCallback(async (authUser: SupabaseUser) => {
    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('display_name, tenant_id').eq('id', authUser.id).single(),
        supabase.from('user_roles').select('role').eq('user_id', authUser.id).single(),
      ]);

      const profile = profileRes.data;
      const role = (roleRes.data?.role as UserRole) || 'agent';
      const tenantId = profile?.tenant_id || null;

      let allowedQueueIds: string[] = [];
      if (role === 'agent') {
        const { data: agentData } = await supabase
          .from('agents')
          .select('allowed_queue_ids')
          .eq('user_id', authUser.id)
          .maybeSingle();
        allowedQueueIds = agentData?.allowed_queue_ids || [];
        await supabase
          .from('agents')
          .update({ status: 'available' })
          .eq('user_id', authUser.id);
      }

      updateSessionIfChanged({
        userId: authUser.id,
        role,
        tenantId,
        allowedQueueIds,
        displayName: profile?.display_name || authUser.email || '',
        authEmail: authUser.email ?? null,
      });
    } catch {
      setSession(null);
    }
  }, [updateSessionIfChanged]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, authSession) => {
      if (authSession?.access_token && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
        syncAuthSessionFromSupabase(authSession);
      }
      if (authSession?.user) {
        setUser(authSession.user);
        setTimeout(() => loadUserSession(authSession.user), 0);
      } else {
        setUser(null);
        setSession(null);
      }
      setLoading(false);
    });

    void (async () => {
      const stored = getStoredAuthSession();
      if (stored && !isAuthSessionExpired(stored)) {
        const { error } = await supabase.auth.setSession({
          access_token: stored.access_token,
          refresh_token: stored.refresh_token,
        });
        if (error) clearAuthSession();
      } else if (stored) {
        clearAuthSession();
      }

      const { data: { session: existingSession } } = await supabase.auth.getSession();
      if (existingSession?.user) {
        setUser(existingSession.user);
        await loadUserSession(existingSession.user);
      } else {
        setLoading(false);
      }
    })();

    return () => subscription.unsubscribe();
  }, [loadUserSession]);

  const permissions = useMemo(() => {
    if (!session) return EMPTY_PERMISSIONS;
    return derivePermissions(session);
  }, [session]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const loginResponse = await loginWithAuthApi(email, password);
      saveAuthSession(loginResponse);

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: loginResponse.access_token,
        refresh_token: loginResponse.refresh_token,
      });
      if (sessionError || !sessionData.user) {
        clearAuthSession();
        return { error: sessionError?.message || 'Could not establish session after login' };
      }

      const authUser = sessionData.user;
      const role = (loginResponse.roles?.[0] as UserRole) || 'agent';

      setUser(authUser);
      await loadUserSession(authUser);

      setTimeout(async () => {
        try {
          const profileRes = await supabase
            .from('profiles')
            .select('display_name, tenant_id')
            .eq('id', authUser.id)
            .single();
          const userSession: UserSession = {
            userId: authUser.id,
            role,
            tenantId: profileRes.data?.tenant_id || null,
            allowedQueueIds: [],
            displayName:
              profileRes.data?.display_name ||
              loginResponse.user.user_metadata?.display_name ||
              authUser.email ||
              '',
            authEmail: authUser.email ?? null,
          };
          await logSystemActivity(userSession, 'LOGIN', 'SESSION', authUser.id, {
            email,
            agentType: loginResponse.agentType,
          });
        } catch {
          /* audit optional */
        }
      }, 0);

      return { error: null };
    } catch (apiErr: unknown) {
      const apiMsg = apiErr instanceof Error ? apiErr.message : 'Login failed';
      return { error: apiMsg };
    }
  }, [loadUserSession]);

  const signOut = useCallback(async () => {
    if (session?.role === 'agent') {
      await supabase
        .from('agents')
        .update({ status: 'offline' })
        .eq('user_id', session.userId);
    }

    clearAuthSession();
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setSession(null);
  }, [session]);

  return { user, session, permissions, loading, signIn, signOut };
}
