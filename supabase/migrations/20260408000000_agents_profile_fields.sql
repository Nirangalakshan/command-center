-- Make tenant_id optional (agents can exist without a tenant assignment)
ALTER TABLE public.agents ALTER COLUMN tenant_id DROP NOT NULL;

-- Add allowed_queue_ids column (missing from live schema)
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS allowed_queue_ids text[] NOT NULL DEFAULT '{}';
