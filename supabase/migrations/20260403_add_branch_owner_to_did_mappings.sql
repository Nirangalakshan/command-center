-- ═══════════════════════════════════════════════════════════
-- Add branch and owner fields to DID mappings
-- When a call comes in on a specific DID, we can now identify
-- which BMS branch it belongs to and the owner UID.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.did_mappings 
  ADD COLUMN IF NOT EXISTS branch_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS branch_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT '';
