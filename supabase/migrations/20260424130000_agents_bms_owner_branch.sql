-- Persist selected BMS workshop identity directly on agent rows.
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS bms_owner_uid TEXT,
  ADD COLUMN IF NOT EXISTS bms_branch_id TEXT;

COMMENT ON COLUMN public.agents.bms_owner_uid IS
  'BMS workshop owner UID selected when creating the agent.';
COMMENT ON COLUMN public.agents.bms_branch_id IS
  'BMS branch id selected when creating the agent.';
