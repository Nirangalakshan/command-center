-- Allow logged-in agents to set calls.agent_id to their own agents row when they
-- answer/reject on Linkus (before or after the PBX CDR is written).

CREATE POLICY "Calls: agents update own agent_id"
ON public.calls FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super-admin')
  OR public.has_role(auth.uid(), 'agent')
  OR tenant_id = public.get_user_tenant(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'super-admin')
  OR agent_id IN (
    SELECT id FROM public.agents WHERE user_id = auth.uid() AND id IS NOT NULL
  )
);

-- Minimal stub row when the CDR has not arrived yet (same id as webhook: yeastar-<call_id>).
CREATE POLICY "Calls: agents insert softphone stub"
ON public.calls FOR INSERT TO authenticated
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
