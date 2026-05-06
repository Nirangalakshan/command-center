-- Allow multiple workshops per suburb: drop ANY unique constraint on sales_suburb_workshops
-- (PostgreSQL naming varies). Primary key is not contype 'u'.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname AS cname
    FROM pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'sales_suburb_workshops'
      AND con.contype = 'u'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.sales_suburb_workshops DROP CONSTRAINT IF EXISTS %I',
      r.cname,
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS sales_suburb_workshops_tenant_suburb_norm_idx
  ON public.sales_suburb_workshops (tenant_id, suburb_normalized);
