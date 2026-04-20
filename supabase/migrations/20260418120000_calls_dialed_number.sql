-- Inbound DID: the number the customer dialled to reach the tenant (from Yeastar CDR `did` / `callto`).

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS dialed_number TEXT;

COMMENT ON COLUMN public.calls.dialed_number IS 'Inbound DID / called number routing to this tenant (Yeastar).';
