-- Add Linkus SDK sign storage to agents.
-- The sign (expire_time=0) is generated once from a Yeastar-whitelisted IP
-- and reused on every subsequent softphone login regardless of the client's IP.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS linkus_sdk_sign TEXT;
