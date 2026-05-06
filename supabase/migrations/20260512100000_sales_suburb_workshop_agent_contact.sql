-- Per-agent call tracking + remarks on suburb workshop directory rows (agents keep their own notes).

CREATE TABLE public.sales_suburb_workshop_agent_contact (
  id TEXT PRIMARY KEY DEFAULT ('sales-ws-contact-'::text || gen_random_uuid()::text),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workshop_id TEXT NOT NULL REFERENCES public.sales_suburb_workshops(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  first_called_at TIMESTAMPTZ,
  remarks TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workshop_id, agent_id)
);

CREATE INDEX sales_ws_contact_tenant_idx ON public.sales_suburb_workshop_agent_contact(tenant_id);
CREATE INDEX sales_ws_contact_agent_idx ON public.sales_suburb_workshop_agent_contact(agent_id);

CREATE OR REPLACE FUNCTION public.sales_ws_contact_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_ws_contact_touch_trg
  BEFORE UPDATE ON public.sales_suburb_workshop_agent_contact
  FOR EACH ROW EXECUTE FUNCTION public.sales_ws_contact_touch_updated();

ALTER TABLE public.sales_suburb_workshop_agent_contact ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_ws_contact_select ON public.sales_suburb_workshop_agent_contact FOR SELECT TO authenticated
  USING (
    agent_id = public.get_agent_id_for_auth()
    OR public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(tenant_id)
  );

CREATE POLICY sales_ws_contact_insert ON public.sales_suburb_workshop_agent_contact FOR INSERT TO authenticated
  WITH CHECK (
    agent_id = public.get_agent_id_for_auth()
    AND tenant_id = (
      SELECT w.tenant_id FROM public.sales_suburb_workshops w WHERE w.id = workshop_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.sales_suburb_workshops w
      INNER JOIN public.sales_agent_suburb_assignments a
        ON a.tenant_id = w.tenant_id
        AND lower(trim(a.suburb)) = w.suburb_normalized
      WHERE w.id = workshop_id
        AND a.agent_id = public.get_agent_id_for_auth()
    )
  );

CREATE POLICY sales_ws_contact_update ON public.sales_suburb_workshop_agent_contact FOR UPDATE TO authenticated
  USING (agent_id = public.get_agent_id_for_auth())
  WITH CHECK (
    agent_id = public.get_agent_id_for_auth()
    AND tenant_id = (
      SELECT w.tenant_id FROM public.sales_suburb_workshops w WHERE w.id = workshop_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.sales_suburb_workshops w
      INNER JOIN public.sales_agent_suburb_assignments a
        ON a.tenant_id = w.tenant_id
        AND lower(trim(a.suburb)) = w.suburb_normalized
      WHERE w.id = workshop_id
        AND a.agent_id = public.get_agent_id_for_auth()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.sales_suburb_workshop_agent_contact TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_sales_suburb_workshop_called(p_workshop_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_agent text;
  v_tenant text;
  v_now timestamptz := now();
BEGIN
  v_agent := public.get_agent_id_for_auth();
  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT w.tenant_id INTO v_tenant
  FROM public.sales_suburb_workshops w
  WHERE w.id = p_workshop_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Workshop not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_suburb_workshops w
    INNER JOIN public.sales_agent_suburb_assignments a
      ON a.tenant_id = w.tenant_id
      AND lower(trim(a.suburb)) = w.suburb_normalized
    WHERE w.id = p_workshop_id
      AND a.agent_id = v_agent
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO public.sales_suburb_workshop_agent_contact (
    tenant_id, workshop_id, agent_id, first_called_at, remarks, updated_at
  )
  VALUES (
    v_tenant, p_workshop_id, v_agent, v_now, '', v_now
  )
  ON CONFLICT (workshop_id, agent_id) DO UPDATE SET
    first_called_at = COALESCE(
      sales_suburb_workshop_agent_contact.first_called_at,
      EXCLUDED.first_called_at
    ),
    updated_at = v_now;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_sales_suburb_workshop_remarks(p_workshop_id text, p_remarks text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_agent text;
  v_tenant text;
  v_now timestamptz := now();
  v_clean text := left(trim(coalesce(p_remarks, '')), 8000);
BEGIN
  v_agent := public.get_agent_id_for_auth();
  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT w.tenant_id INTO v_tenant
  FROM public.sales_suburb_workshops w
  WHERE w.id = p_workshop_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Workshop not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_suburb_workshops w
    INNER JOIN public.sales_agent_suburb_assignments a
      ON a.tenant_id = w.tenant_id
      AND lower(trim(a.suburb)) = w.suburb_normalized
    WHERE w.id = p_workshop_id
      AND a.agent_id = v_agent
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO public.sales_suburb_workshop_agent_contact (
    tenant_id, workshop_id, agent_id, remarks, updated_at
  )
  VALUES (
    v_tenant, p_workshop_id, v_agent, v_clean, v_now
  )
  ON CONFLICT (workshop_id, agent_id) DO UPDATE SET
    remarks = EXCLUDED.remarks,
    updated_at = v_now;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_sales_suburb_workshop_called(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_sales_suburb_workshop_remarks(text, text) TO authenticated;
