-- Switch sales_leads_agent_update_guard to SECURITY INVOKER to satisfy security warnings.

CREATE OR REPLACE FUNCTION public.sales_leads_agent_update_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_staff BOOLEAN;
BEGIN
  v_staff := public.has_role(auth.uid(), 'super-admin'::public.app_role)
    OR public.sales_tenant_staff_access(NEW.tenant_id);

  IF v_staff THEN
    RETURN NEW;
  END IF;

  IF OLD.assigned_agent_id IS DISTINCT FROM NEW.assigned_agent_id THEN
    IF OLD.assigned_agent_id IS NULL
       AND NEW.assigned_agent_id IS NOT NULL
       AND NEW.assigned_agent_id = public.get_agent_id_for_auth() THEN
      IF NOT public.sales_lead_in_agent_suburb_patch(OLD.tenant_id, OLD.suburb) THEN
        RAISE EXCEPTION 'Agents cannot claim leads outside their suburb patch';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Agents cannot change assignment, tenancy, campaign, or do-not-call from this dashboard';
  END IF;

  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.campaign_id IS DISTINCT FROM NEW.campaign_id
    OR OLD.do_not_call IS DISTINCT FROM NEW.do_not_call THEN
    RAISE EXCEPTION 'Agents cannot change assignment, tenancy, campaign, or do-not-call from this dashboard';
  END IF;

  RETURN NEW;
END;
$$;
