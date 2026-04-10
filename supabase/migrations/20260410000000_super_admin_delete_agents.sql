-- Allow super-admins to delete agent rows (UI: Agents tab).
CREATE POLICY "Super admin deletes agents" ON public.agents
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'::app_role));
