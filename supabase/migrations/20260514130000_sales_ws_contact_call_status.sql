-- Call outcome status per agent + workshop (confirmed / rejected).
-- Replaces the previous localStorage-only approach so the outcome is
-- stored server-side and visible across devices.

ALTER TABLE public.sales_suburb_workshop_agent_contact
  ADD COLUMN IF NOT EXISTS call_status TEXT
    CHECK (call_status IS NULL OR call_status IN ('confirmed', 'rejected'));

COMMENT ON COLUMN public.sales_suburb_workshop_agent_contact.call_status IS
  'Agent outcome after marking a workshop as called: confirmed or rejected. NULL means no outcome set yet.';

-- ─── RPC ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_sales_suburb_workshop_call_status(
  p_workshop_id text,
  p_status      text        -- 'confirmed' | 'rejected' | NULL to clear
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_agent  text;
  v_tenant text;
  v_now    timestamptz := now();
BEGIN
  -- Validate input
  IF p_status IS NOT NULL AND p_status NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'call_status must be confirmed, rejected, or NULL';
  END IF;

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

  -- Agent must be assigned to the workshop's suburb
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
    tenant_id, workshop_id, agent_id, call_status, updated_at
  )
  VALUES (
    v_tenant, p_workshop_id, v_agent, p_status, v_now
  )
  ON CONFLICT (workshop_id, agent_id) DO UPDATE SET
    call_status = EXCLUDED.call_status,
    updated_at  = v_now;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_sales_suburb_workshop_call_status(text, text) TO authenticated;
