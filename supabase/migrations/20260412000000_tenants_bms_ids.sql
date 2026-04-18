-- Per-tenant BMS Pro workshop identity (Firebase owner UID + default branch for API calls)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS bms_owner_uid TEXT,
  ADD COLUMN IF NOT EXISTS bms_default_branch_id TEXT;

COMMENT ON COLUMN public.tenants.bms_owner_uid IS 'BMS workshop Firebase owner UID (X-Tenant-Id / ownerUid for call-center API)';
COMMENT ON COLUMN public.tenants.bms_default_branch_id IS 'Default BMS branch id when not supplied by DID mapping or navigation state';
