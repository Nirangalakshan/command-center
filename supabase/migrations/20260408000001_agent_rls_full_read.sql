-- Allow agents to read all tenants, queues, agents, calls, and agent_groups
-- (needed for full Overview access when agents have no tenant_id assigned)

-- Tenants: agents can read all
DROP POLICY IF EXISTS "Read tenants" ON public.tenants;
CREATE POLICY "Read tenants" ON public.tenants FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.has_role(auth.uid(), 'agent')
    OR id = public.get_user_tenant(auth.uid())
  );

-- Queues: agents can read all
DROP POLICY IF EXISTS "Read queues" ON public.queues;
CREATE POLICY "Read queues" ON public.queues FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.has_role(auth.uid(), 'agent')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

-- Agents table: agents can read all
DROP POLICY IF EXISTS "Read agents" ON public.agents;
CREATE POLICY "Read agents" ON public.agents FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.has_role(auth.uid(), 'agent')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

-- Calls: agents can read all
DROP POLICY IF EXISTS "Read calls" ON public.calls;
CREATE POLICY "Read calls" ON public.calls FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.has_role(auth.uid(), 'agent')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

-- Agent groups: agents can read all
DROP POLICY IF EXISTS "Read agent_groups" ON public.agent_groups;
CREATE POLICY "Read agent_groups" ON public.agent_groups FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.has_role(auth.uid(), 'agent')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

-- DID mappings: agents can read all
DROP POLICY IF EXISTS "Read did_mappings" ON public.did_mappings;
CREATE POLICY "Read did_mappings" ON public.did_mappings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.has_role(auth.uid(), 'agent')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );
