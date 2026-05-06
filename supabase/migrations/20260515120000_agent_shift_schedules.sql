-- ═══════════════════════════════════════════════════════════════
-- Agent Shift Schedules
-- Allows admins to define Mon-Sun shifts for each agent.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agent_shift_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    monday TEXT,
    tuesday TEXT,
    wednesday TEXT,
    thursday TEXT,
    friday TEXT,
    saturday TEXT,
    sunday TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(agent_id)
);

-- Enable RLS
ALTER TABLE public.agent_shift_schedules ENABLE ROW LEVEL SECURITY;

-- Policies
-- Super-admins can do everything
CREATE POLICY "Super admins can manage all shift schedules"
ON public.agent_shift_schedules
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super-admin'));

-- Agents can view their own shift schedule
CREATE POLICY "Agents can view their own shift schedule"
ON public.agent_shift_schedules
FOR SELECT
TO authenticated
USING (
    agent_id IN (
        SELECT id FROM public.agents WHERE user_id = auth.uid()
    )
);

-- Trigger for updated_at
CREATE TRIGGER update_agent_shift_schedules_updated_at 
BEFORE UPDATE ON public.agent_shift_schedules 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Grant access to authenticated users
GRANT ALL ON public.agent_shift_schedules TO authenticated;
GRANT ALL ON public.agent_shift_schedules TO service_role;
