-- Optional callback time per agent + workshop (separate from lead follow_up_at).

ALTER TABLE public.sales_suburb_workshop_agent_contact
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sales_ws_contact_follow_up_idx
  ON public.sales_suburb_workshop_agent_contact (tenant_id, follow_up_at)
  WHERE follow_up_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_sales_suburb_workshop_follow_up(
  p_workshop_id text,
  p_follow_up_at timestamptz
)
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
    tenant_id, workshop_id, agent_id, follow_up_at, updated_at
  )
  VALUES (
    v_tenant, p_workshop_id, v_agent, p_follow_up_at, v_now
  )
  ON CONFLICT (workshop_id, agent_id) DO UPDATE SET
    follow_up_at = EXCLUDED.follow_up_at,
    updated_at = v_now;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_sales_suburb_workshop_follow_up(text, timestamptz) TO authenticated;
