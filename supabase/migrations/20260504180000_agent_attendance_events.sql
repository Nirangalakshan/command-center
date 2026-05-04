-- ═══════════════════════════════════════════════════════════════
-- Agent attendance — event log (clock in / break / clock out)
-- Realtime-enabled for super-admin roster + agent self-service UI
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agent_attendance_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id           text REFERENCES public.tenants (id) ON DELETE SET NULL,
  agent_display_name  text,
  event_type          text NOT NULL CHECK (event_type IN (
                        'clock_in',
                        'break_start',
                        'break_end',
                        'clock_out'
                      )),
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_attendance_events_user_occurred_idx
  ON public.agent_attendance_events (user_id, occurred_at DESC);

-- Range scans by time (e.g. “today” for super-admin). Avoid (occurred_at::date)—that cast is not IMMUTABLE.
CREATE INDEX IF NOT EXISTS agent_attendance_events_occurred_idx
  ON public.agent_attendance_events (occurred_at DESC);

ALTER TABLE public.agent_attendance_events ENABLE ROW LEVEL SECURITY;

-- Agents read only their own events
CREATE POLICY "agent_attendance_select_own"
  ON public.agent_attendance_events
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.has_role(auth.uid(), 'agent')
  );

-- Super-admins read all (live roster)
CREATE POLICY "agent_attendance_select_super_admin"
  ON public.agent_attendance_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'));

-- Agents append events only for themselves
CREATE POLICY "agent_attendance_insert_own"
  ON public.agent_attendance_events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_role(auth.uid(), 'agent')
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_attendance_events;

GRANT SELECT, INSERT ON public.agent_attendance_events TO authenticated;
