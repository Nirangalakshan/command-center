-- Distinguish inbound vs outbound CDR rows for dashboard / Calls tab.
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'inbound';

ALTER TABLE public.calls
  DROP CONSTRAINT IF EXISTS calls_direction_check;

ALTER TABLE public.calls
  ADD CONSTRAINT calls_direction_check
  CHECK (direction IN ('inbound', 'outbound'));

COMMENT ON COLUMN public.calls.direction IS 'inbound: customer on callfrom, agent extension on callto. outbound: agent extension on callfrom, customer on callto (Yeastar CDR).';
