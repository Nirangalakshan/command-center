-- Linkus answer/reject: store which agent touched the call (Linkus callId from SDK).
-- Merged in fetchCalls so the Calls tab shows the correct agent even when calls.agent_id
-- is wrong or Linkus id !== PBX CDR id.

CREATE TABLE public.softphone_call_dispositions (
  linkus_call_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('answered', 'rejected')),
  caller_number TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX softphone_call_dispositions_tenant_created_idx
  ON public.softphone_call_dispositions (tenant_id, created_at DESC);

ALTER TABLE public.softphone_call_dispositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read softphone_call_dispositions"
  ON public.softphone_call_dispositions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.has_role(auth.uid(), 'agent')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

CREATE POLICY "Insert softphone_call_dispositions"
  ON public.softphone_call_dispositions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super-admin')
    OR (
      agent_id IN (
        SELECT id FROM public.agents WHERE user_id = auth.uid() AND id IS NOT NULL
      )
      AND (
        public.has_role(auth.uid(), 'agent')
        OR tenant_id = public.get_user_tenant(auth.uid())
      )
    )
  );

CREATE POLICY "Update softphone_call_dispositions"
  ON public.softphone_call_dispositions FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR agent_id IN (
      SELECT id FROM public.agents WHERE user_id = auth.uid() AND id IS NOT NULL
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super-admin')
    OR agent_id IN (
      SELECT id FROM public.agents WHERE user_id = auth.uid() AND id IS NOT NULL
    )
  );
