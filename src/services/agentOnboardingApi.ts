import { supabase } from '@/integrations/supabase/client';
import type { AgentOnboarding, AgentOnboardingStage, TrainingChecklist } from './types';
import { db } from '@/lib/firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

/* ─── Fetch ─── */

export async function fetchAgentOnboarding(tenantId?: string | null): Promise<AgentOnboarding[]> {
  let query = supabase
    .from('agent_onboarding')
    .select('*, agents!inner(id, name, extension, tenant_id, queue_ids, group_ids, status, tenants!inner(name))');

  if (tenantId) {
    query = query.eq('agents.tenant_id', tenantId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (data || []).map((row: any) => ({
    id: row.id,
    agentId: row.agent_id,
    userId: row.user_id,
    stage: row.stage as AgentOnboardingStage,
    invitedBy: row.invited_by,
    invitedAt: row.invited_at,
    personalEmail: row.personal_email,
    phone: row.phone,
    notes: row.notes,
    trainingChecklist: row.training_checklist as TrainingChecklist,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Joined agent data
    agentName: row.agents?.name || '',
    agentExtension: row.agents?.extension || '',
    agentTenantId: row.agents?.tenant_id || '',
    agentQueueIds: row.agents?.queue_ids || [],
    agentGroupIds: row.agents?.group_ids || [],
    agentStatus: row.agents?.status || 'offline',
    tenantName: row.agents?.tenants?.name || '',
  }));
}

/* ─── Create Agent (via edge function) ─── */

export async function createAgentViaEdge(params: {
  name: string;
  email: string;
  phone: string;
  password: string;
  extension: string;
  notes: string;
}): Promise<{ agentId: string; userId: string }> {
  // 1. Supabase Creation
  const { data, error } = await supabase.functions.invoke('create-agent', {
    body: params,
  });
  if (error) {
    let serverMessage = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx instanceof Response) {
        const body = await ctx.json();
        if (body?.error) serverMessage = body.error;
      }
    } catch { /* ignore parse failures */ }
    throw new Error(serverMessage);
  }
  if (data?.error) throw new Error(data.error);

  const { agentId, userId } = data;

  // 2. Firebase Creation
  const secondaryApp = initializeApp({
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  }, `AgentCreationApp_${Date.now()}`);
  
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, params.email, params.password);
    const firebaseUid = userCredential.user.uid;
    
    await setDoc(doc(db, 'call_center_agents', firebaseUid), {
      name: params.name,
      email: params.email,
      phone: params.phone || '',
      extension: params.extension || '',
      notes: params.notes || '',
      tenantId: '',
      queueIds: [],
      groupIds: [],
      supabaseUserId: userId,
      invitedAt: new Date().toISOString(),
      role: 'agent',
      status: 'offline'
    });
  } catch (err: any) {
    console.error('Firebase agent creation failed', err);
    throw new Error(`Agent created in Supabase but failed in Firebase: ${err.message}`);
  } finally {
    await signOut(secondaryAuth);
  }

  return { agentId, userId };
}

/* ─── Advance Stage ─── */

export async function advanceAgentStage(
  onboardingId: string,
  currentStage: AgentOnboardingStage,
): Promise<AgentOnboardingStage | null> {
  const ORDER: AgentOnboardingStage[] = ['invited', 'account-created', 'training', 'shadowing', 'live'];
  const idx = ORDER.indexOf(currentStage);
  if (idx < 0 || idx >= ORDER.length - 1) return null;
  const next = ORDER[idx + 1];

  const { error } = await supabase
    .from('agent_onboarding')
    .update({ stage: next })
    .eq('id', onboardingId);

  if (error) throw new Error(error.message);
  return next;
}

/* ─── Update Training Checklist ─── */

export async function updateTrainingChecklist(
  onboardingId: string,
  checklist: TrainingChecklist,
): Promise<void> {
  const { error } = await supabase
    .from('agent_onboarding')
    .update({ training_checklist: checklist as any })
    .eq('id', onboardingId);

  if (error) throw new Error(error.message);
}
