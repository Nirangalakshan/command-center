-- ═══════════════════════════════════════════════════════════════
-- Agent leave requests — agents apply; super-admins approve/reject
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agent_leave_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id           text REFERENCES public.tenants (id) ON DELETE SET NULL,
  agent_display_name  text,
  start_date          date NOT NULL,
  end_date            date NOT NULL,
  duration_type       text NOT NULL CHECK (duration_type IN ('full_day', 'half_day')),
  half_day_part       text CHECK (half_day_part IS NULL OR half_day_part IN ('am', 'pm')),
  reason              text,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by         uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  review_comment      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_leave_requests_date_range_ok CHECK (end_date >= start_date),
  CONSTRAINT agent_leave_requests_half_day_ok CHECK (
    (duration_type = 'full_day' AND half_day_part IS NULL)
    OR (duration_type = 'half_day' AND half_day_part IN ('am', 'pm'))
  )
);

CREATE INDEX IF NOT EXISTS agent_leave_requests_user_created_idx
  ON public.agent_leave_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_leave_requests_status_created_idx
  ON public.agent_leave_requests (status, created_at DESC);

ALTER TABLE public.agent_leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_leave_requests_select_own"
  ON public.agent_leave_requests
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.has_role(auth.uid(), 'agent')
  );

CREATE POLICY "agent_leave_requests_select_super_admin"
  ON public.agent_leave_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'));

CREATE POLICY "agent_leave_requests_insert_own"
  ON public.agent_leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_role(auth.uid(), 'agent')
    AND status = 'pending'
  );

CREATE POLICY "agent_leave_requests_delete_own_pending"
  ON public.agent_leave_requests
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND public.has_role(auth.uid(), 'agent')
    AND status = 'pending'
  );

CREATE POLICY "agent_leave_requests_update_super_admin"
  ON public.agent_leave_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super-admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_leave_requests TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_leave_requests;
