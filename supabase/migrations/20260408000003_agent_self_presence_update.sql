-- Allow agents to update their own presence fields on their own row.
-- This enables login/logout status sync from the frontend.

DROP POLICY IF EXISTS "Agent updates own presence" ON public.agents;
CREATE POLICY "Agent updates own presence" ON public.agents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
