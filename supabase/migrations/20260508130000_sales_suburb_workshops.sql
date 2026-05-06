-- Suburb-linked workshop registry (CRM context for agents routed by suburb).

CREATE TABLE public.sales_suburb_workshops (
  id TEXT PRIMARY KEY DEFAULT ('sales-workshop-'::text || gen_random_uuid()::text),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  suburb TEXT NOT NULL DEFAULT '',
  suburb_normalized TEXT GENERATED ALWAYS AS (lower(trim(suburb))) STORED,
  workshop_name TEXT NOT NULL DEFAULT '',
  phone_number TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT '',
  owner_email TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_suburb_workshops_suburb_nonempty CHECK (length(trim(suburb)) > 0),
  UNIQUE (tenant_id, suburb_normalized)
);

CREATE INDEX sales_suburb_workshops_tenant_idx ON public.sales_suburb_workshops(tenant_id);

ALTER TABLE public.sales_suburb_workshops ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sales_suburb_workshops_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_suburb_workshops_touch_trg
  BEFORE UPDATE ON public.sales_suburb_workshops
  FOR EACH ROW EXECUTE FUNCTION public.sales_suburb_workshops_touch_updated();

CREATE POLICY sales_workshops_select_staff ON public.sales_suburb_workshops FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(tenant_id)
  );

CREATE POLICY sales_workshops_select_agent ON public.sales_suburb_workshops FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales_agent_suburb_assignments a
      WHERE a.tenant_id = public.sales_suburb_workshops.tenant_id
        AND lower(trim(a.suburb)) = public.sales_suburb_workshops.suburb_normalized
        AND a.agent_id = public.get_agent_id_for_auth()
    )
  );

CREATE POLICY sales_workshops_insert ON public.sales_suburb_workshops FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_workshops_update ON public.sales_suburb_workshops FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id))
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_workshops_delete ON public.sales_suburb_workshops FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));
