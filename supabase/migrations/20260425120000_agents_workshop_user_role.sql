-- BMS-side role for the person at this Yeastar extension (distinct from call-centre `agents.role`).
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS workshop_user_role TEXT;

COMMENT ON COLUMN public.agents.workshop_user_role IS
  'Workshop user role for this extension: owner, branch_admin, staff.';

ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_workshop_user_role_check;

ALTER TABLE public.agents
  ADD CONSTRAINT agents_workshop_user_role_check
  CHECK (
    workshop_user_role IS NULL
    OR workshop_user_role IN ('owner', 'branch_admin', 'staff')
  );
