import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { UserSession, UserRole, Permissions } from '@/services/types';
import { derivePermissions } from '@/utils/permissions';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { auth, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged as firebaseOnAuthStateChange, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { logSystemActivity } from '@/services/auditLogApi';

interface AuthState {
  user: SupabaseUser | FirebaseUser | null;
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
  canOnboardAgents: false, canViewAgentOnboarding: false,   canViewAgentOnboardingTab: false,
  canViewAuditLogs: false,
  canManageAgents: false,
  canManageDIDMappings: false,
  allowedTenantId: null, allowedQueueIds: [],
};

export function useAuth(): AuthState {
  const [user, setUser] = useState<SupabaseUser | FirebaseUser | null>(null);
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserSession = useCallback(async (authUser: SupabaseUser) => {
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
        await supabase
          .from('agents')
          .update({ status: 'available' })
          .eq('user_id', authUser.id);
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
        } else if (!auth.currentUser) {
          setUser(null);
          setSession(null);
        }
        setLoading(false);
      }
    );

    // Firebase Auth State Listener
    const unsubscribeFirebase = firebaseOnAuthStateChange(auth, async (firebaseUser) => {
      // Ignore the background service account used for data querying
      if (firebaseUser && firebaseUser.email === import.meta.env.VITE_FIREBASE_AGENT_EMAIL) {
        return;
      }

      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const agentDoc = await getDoc(doc(db, 'call_center_agents', firebaseUser.uid));
          if (agentDoc.exists()) {
            const data = agentDoc.data();
            const userSession: UserSession = {
              userId: firebaseUser.uid,
              role: 'agent',
              tenantId: data.tenantId || null,
              allowedQueueIds: data.queueIds || [],
              displayName: data.name || firebaseUser.email || '',
            };
            // Set status to available
            await updateDoc(doc(db, 'call_center_agents', firebaseUser.uid), { status: 'available' }).catch(() => {});
            setSession(userSession);
          } else {
             // If not in our custom collection, log them out
             await firebaseSignOut(auth);
             setUser(null);
             setSession(null);
          }
        } catch {
            // console.error('Failed to load firebase user info:', e);
            setSession(null);
        }
        setLoading(false);
      } else {
         // Wait for supabase checked
      }
    });

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (existingSession?.user) {
        setUser(existingSession.user);
        loadUserSession(existingSession.user);
      } else {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      unsubscribeFirebase();
    };
  }, [loadUserSession]);

  const permissions = useMemo(() => {
    if (!session) return EMPTY_PERMISSIONS;
    return derivePermissions(session);
  }, [session]);

  const signIn = useCallback(async (email: string, password: string) => {
    // Attempt Supabase first
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
        } catch {
          // console.error('Failed to log login activity:', e);
        }
      }, 0);
      return { error: null };
    }

    // If Supabase failed, try Firebase (for Agent Accounts)
    try {
      const fbCred = await signInWithEmailAndPassword(auth, email, password);
      const agentDoc = await getDoc(doc(db, 'call_center_agents', fbCred.user.uid));
      
      if (agentDoc.exists()) {
        const data = agentDoc.data();
        const userSession: UserSession = {
          userId: fbCred.user.uid,
          role: 'agent',
          tenantId: data.tenantId || null,
          allowedQueueIds: data.queueIds || [],
          displayName: data.name || fbCred.user.email || '',
        };
        await logSystemActivity(userSession, 'LOGIN', 'SESSION', fbCred.user.uid, { email, from: 'firebase' });
        // setUser and setSession will be handled by the onAuthStateChanged listener
        return { error: null };
      } else {
        await firebaseSignOut(auth);
        return { error: 'Agent profile not found in Firebase.' };
      }
    } catch (fbErr: any) {
      // If Firebase also fails, return the error
      return { error: fbErr.message || 'Invalid login credentials' };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (session?.role === 'agent') {
      // Offline status for supabase agents
      const { error: presenceErr } = await supabase
        .from('agents')
        .update({ status: 'offline' })
        .eq('user_id', session.userId);

      // Offline status for firebase agents
      if (auth.currentUser) {
         await updateDoc(doc(db, 'call_center_agents', session.userId), { status: 'offline' }).catch(() => {});
      }
    }
    
    await supabase.auth.signOut().catch(() => {});
    await firebaseSignOut(auth).catch(() => {});
    setUser(null);
    setSession(null);
  }, [session]);

  return { user, session, permissions, loading, signIn, signOut };
}
