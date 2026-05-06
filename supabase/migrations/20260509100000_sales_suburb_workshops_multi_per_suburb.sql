-- Allow multiple workshop CRM rows under the same suburb (same tenant).

ALTER TABLE public.sales_suburb_workshops
  DROP CONSTRAINT IF EXISTS sales_suburb_workshops_tenant_id_suburb_normalized_key;

CREATE INDEX IF NOT EXISTS sales_suburb_workshops_tenant_suburb_norm_idx
  ON public.sales_suburb_workshops (tenant_id, suburb_normalized);
