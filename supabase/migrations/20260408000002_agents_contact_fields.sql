-- Store agent contact details directly on agents table
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_number text NOT NULL DEFAULT '';
