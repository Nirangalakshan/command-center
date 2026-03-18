
-- Enum for agent onboarding stages
CREATE TYPE public.agent_onboarding_stage AS ENUM ('invited', 'account-created', 'training', 'shadowing', 'live');

-- Agent onboarding table
CREATE TABLE public.agent_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stage agent_onboarding_stage NOT NULL DEFAULT 'invited',
  invited_by uuid,
  invited_at timestamptz NOT NULL DEFAULT now(),
  personal_email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  training_checklist jsonb NOT NULL DEFAULT '{"pbxLogin": false, "scriptReview": false, "testCalls": false, "systemNav": false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_onboarding ENABLE ROW LEVEL SECURITY;

-- RLS: Super-admin full access
CREATE POLICY "Super admin full access agent_onboarding" ON public.agent_onboarding
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super-admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super-admin'::app_role));

-- RLS: Client-admin/supervisor read agents in their tenant
CREATE POLICY "Tenant scoped read agent_onboarding" ON public.agent_onboarding
  FOR SELECT TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM public.agents WHERE tenant_id = get_user_tenant(auth.uid())
    )
    AND (has_role(auth.uid(), 'client-admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  );

-- RLS: Client-admin can update agent onboarding in their tenant
CREATE POLICY "Client admin update agent_onboarding" ON public.agent_onboarding
  FOR UPDATE TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM public.agents WHERE tenant_id = get_user_tenant(auth.uid())
    )
    AND has_role(auth.uid(), 'client-admin'::app_role)
  );

-- Add INSERT/UPDATE policies on agents table for super-admin
CREATE POLICY "Super admin inserts agents" ON public.agents
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super-admin'::app_role));

CREATE POLICY "Super admin updates agents" ON public.agents
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super-admin'::app_role));

-- Updated_at trigger for agent_onboarding
CREATE TRIGGER update_agent_onboarding_updated_at
  BEFORE UPDATE ON public.agent_onboarding
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
