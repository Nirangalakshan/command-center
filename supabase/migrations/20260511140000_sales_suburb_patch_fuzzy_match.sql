-- Loosen suburb patch matching so CRM lead suburbs like "Melbourne, VIC" still match
-- an assignment row "Melbourne" (exact equality was too strict).

CREATE OR REPLACE FUNCTION public.sales_lead_in_agent_suburb_patch(
  p_tenant_id text,
  p_suburb text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN length(trim(coalesce(p_suburb, ''))) = 0 THEN false
    WHEN public.get_agent_id_for_auth() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.sales_agent_suburb_assignments a
      WHERE a.agent_id = public.get_agent_id_for_auth()
        AND a.tenant_id = p_tenant_id
        AND (
          lower(trim(a.suburb)) = lower(trim(p_suburb))
          OR lower(trim(p_suburb)) LIKE lower(trim(a.suburb)) || ' %'
          OR lower(trim(p_suburb)) LIKE lower(trim(a.suburb)) || ',%'
          OR lower(trim(p_suburb)) LIKE lower(trim(a.suburb)) || ' (%'
        )
    )
  END;
$$;
