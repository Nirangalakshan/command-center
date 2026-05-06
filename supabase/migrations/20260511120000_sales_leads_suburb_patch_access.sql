-- Agents can see and work leads in their assigned suburb patches, not only rows
-- with assigned_agent_id = self. Suburb match uses normalized text like workshop matching.

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
        AND lower(trim(a.suburb)) = lower(trim(p_suburb))
    )
  END;
$$;

-- ─── sales_leads: widen agent select/update ───────────────────────────

DROP POLICY IF EXISTS sales_leads_select_agent ON public.sales_leads;
CREATE POLICY sales_leads_select_agent ON public.sales_leads FOR SELECT TO authenticated
  USING (
    NOT do_not_call
    AND (
      assigned_agent_id = public.get_agent_id_for_auth()
      OR (
        assigned_agent_id IS NULL
        AND public.sales_lead_in_agent_suburb_patch(tenant_id, suburb)
      )
    )
  );

DROP POLICY IF EXISTS sales_leads_update_assigned_agent ON public.sales_leads;
CREATE POLICY sales_leads_update_assigned_agent ON public.sales_leads FOR UPDATE TO authenticated
  USING (
    NOT do_not_call
    AND (
      assigned_agent_id = public.get_agent_id_for_auth()
      OR (
        assigned_agent_id IS NULL
        AND public.sales_lead_in_agent_suburb_patch(tenant_id, suburb)
      )
    )
  )
  WITH CHECK (
    NOT do_not_call
    AND (
      assigned_agent_id = public.get_agent_id_for_auth()
      OR assigned_agent_id IS NULL
    )
  );

-- Allow an agent to claim an unassigned row only by setting assigned_agent_id to themselves.
CREATE OR REPLACE FUNCTION public.sales_leads_agent_update_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- ─── Related tables: same visibility for inserts tied to a lead ───────

DROP POLICY IF EXISTS sales_interactions_select ON public.sales_lead_interactions;
CREATE POLICY sales_interactions_select ON public.sales_lead_interactions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id
        AND NOT sl.do_not_call
        AND (
          sl.assigned_agent_id = public.get_agent_id_for_auth()
          OR (
            sl.assigned_agent_id IS NULL
            AND public.sales_lead_in_agent_suburb_patch(sl.tenant_id, sl.suburb)
          )
        )
    )
  );

DROP POLICY IF EXISTS sales_interactions_insert_agent ON public.sales_lead_interactions;
CREATE POLICY sales_interactions_insert_agent ON public.sales_lead_interactions FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.sales_leads WHERE id = lead_id LIMIT 1)
    AND EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id
        AND NOT sl.do_not_call
        AND (
          sl.assigned_agent_id = public.get_agent_id_for_auth()
          OR (
            sl.assigned_agent_id IS NULL
            AND public.sales_lead_in_agent_suburb_patch(sl.tenant_id, sl.suburb)
          )
        )
    )
    AND (agent_id IS NULL OR agent_id = public.get_agent_id_for_auth())
  );

DROP POLICY IF EXISTS sales_trials_select ON public.sales_trials;
CREATE POLICY sales_trials_select ON public.sales_trials FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id
        AND NOT sl.do_not_call
        AND (
          sl.assigned_agent_id = public.get_agent_id_for_auth()
          OR (
            sl.assigned_agent_id IS NULL
            AND public.sales_lead_in_agent_suburb_patch(sl.tenant_id, sl.suburb)
          )
        )
    )
  );

DROP POLICY IF EXISTS sales_trials_insert_agent ON public.sales_trials;
CREATE POLICY sales_trials_insert_agent ON public.sales_trials FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id
        AND sl.tenant_id = tenant_id
        AND NOT sl.do_not_call
        AND (
          sl.assigned_agent_id = public.get_agent_id_for_auth()
          OR (
            sl.assigned_agent_id IS NULL
            AND public.sales_lead_in_agent_suburb_patch(sl.tenant_id, sl.suburb)
          )
        )
    )
    AND (agent_id IS NULL OR agent_id = public.get_agent_id_for_auth())
  );

DROP POLICY IF EXISTS sales_visits_select ON public.sales_site_visits;
CREATE POLICY sales_visits_select ON public.sales_site_visits FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id
        AND NOT sl.do_not_call
        AND (
          sl.assigned_agent_id = public.get_agent_id_for_auth()
          OR (
            sl.assigned_agent_id IS NULL
            AND public.sales_lead_in_agent_suburb_patch(sl.tenant_id, sl.suburb)
          )
        )
    )
  );

DROP POLICY IF EXISTS sales_visits_insert_agent ON public.sales_site_visits;
CREATE POLICY sales_visits_insert_agent ON public.sales_site_visits FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id
        AND sl.tenant_id = tenant_id
        AND NOT sl.do_not_call
        AND (
          sl.assigned_agent_id = public.get_agent_id_for_auth()
          OR (
            sl.assigned_agent_id IS NULL
            AND public.sales_lead_in_agent_suburb_patch(sl.tenant_id, sl.suburb)
          )
        )
    )
    AND (agent_id IS NULL OR agent_id = public.get_agent_id_for_auth())
  );

DROP POLICY IF EXISTS sales_commission_select ON public.sales_commission_events;
CREATE POLICY sales_commission_select ON public.sales_commission_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id
        AND NOT sl.do_not_call
        AND (
          sl.assigned_agent_id = public.get_agent_id_for_auth()
          OR (
            sl.assigned_agent_id IS NULL
            AND public.sales_lead_in_agent_suburb_patch(sl.tenant_id, sl.suburb)
          )
        )
    )
  );

-- ─── Outcome RPC: allow patch agents; claim unassigned lead on first touch ─

CREATE OR REPLACE FUNCTION public.apply_sales_lead_outcome(
  p_lead_id TEXT,
  p_outcome public.lead_call_outcome,
  p_notes TEXT DEFAULT '',
  p_customer_response TEXT DEFAULT '',
  p_follow_up_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_actor TEXT;
  v_staff BOOLEAN;
  v_target public.lead_journey_stage;
  v_merged public.lead_journey_stage;
  v_agent_for_link TEXT;
BEGIN
  v_actor := public.get_agent_id_for_auth();
  SELECT * INTO v_lead FROM public.sales_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  v_staff := public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(v_lead.tenant_id);

  IF NOT v_staff THEN
    IF v_lead.do_not_call THEN
      RAISE EXCEPTION 'Not allowed to update this lead';
    END IF;
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Not allowed to update this lead';
    END IF;
    IF v_lead.assigned_agent_id IS NOT NULL AND v_lead.assigned_agent_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Not allowed to update this lead';
    END IF;
    IF v_lead.assigned_agent_id IS NULL THEN
      IF NOT public.sales_lead_in_agent_suburb_patch(v_lead.tenant_id, v_lead.suburb) THEN
        RAISE EXCEPTION 'Not allowed to update this lead';
      END IF;
    END IF;
  END IF;

  IF p_outcome = 'call_back_later' THEN
    IF p_follow_up_at IS NULL OR trim(coalesce(p_notes, '')) = '' THEN
      RAISE EXCEPTION 'Follow-up date and notes are required for call-back-later';
    END IF;
  END IF;

  v_target := CASE p_outcome
    WHEN 'no_answer' THEN 'called'::public.lead_journey_stage
    WHEN 'answered_short' THEN 'answered'::public.lead_journey_stage
    WHEN 'not_interested' THEN 'answered'::public.lead_journey_stage
    WHEN 'interested' THEN 'interested'::public.lead_journey_stage
    WHEN 'trial_offered' THEN 'trial_offered'::public.lead_journey_stage
    WHEN 'trial_started' THEN 'trial_started'::public.lead_journey_stage
    WHEN 'site_visit_booked' THEN 'site_visit_booked'::public.lead_journey_stage
    WHEN 'call_back_later' THEN 'called'::public.lead_journey_stage
    WHEN 'converted' THEN 'converted'::public.lead_journey_stage
  END;

  IF public.lead_journey_stage_rank(v_target) >= public.lead_journey_stage_rank(v_lead.journey_stage) THEN
    v_merged := v_target;
  ELSE
    v_merged := v_lead.journey_stage;
  END IF;

  v_agent_for_link := COALESCE(v_actor, v_lead.assigned_agent_id);

  UPDATE public.sales_leads SET
    journey_stage = v_merged,
    first_called_at = COALESCE(first_called_at, now()),
    last_contacted_at = now(),
    notes = trim(coalesce(p_notes, '')),
    customer_response_summary = trim(coalesce(p_customer_response, '')),
    follow_up_at = CASE WHEN p_outcome = 'call_back_later' THEN p_follow_up_at ELSE follow_up_at END,
    assigned_agent_id = COALESCE(assigned_agent_id, v_actor),
    updated_at = now()
  WHERE id = p_lead_id;

  INSERT INTO public.sales_lead_interactions (
    lead_id, tenant_id, agent_id, outcome, notes, customer_response
  ) VALUES (
    p_lead_id, v_lead.tenant_id, v_agent_for_link, p_outcome,
    trim(coalesce(p_notes, '')), trim(coalesce(p_customer_response, ''))
  );

  IF p_outcome = 'trial_started' THEN
    INSERT INTO public.sales_trials (tenant_id, lead_id, agent_id, status, started_at)
    VALUES (v_lead.tenant_id, p_lead_id, v_agent_for_link, 'active', now())
    ON CONFLICT (lead_id) DO UPDATE SET
      agent_id = EXCLUDED.agent_id,
      status = 'active',
      started_at = EXCLUDED.started_at;
  END IF;

  IF p_outcome = 'site_visit_booked' THEN
    INSERT INTO public.sales_site_visits (tenant_id, lead_id, agent_id, status, booked_at)
    VALUES (v_lead.tenant_id, p_lead_id, v_agent_for_link, 'scheduled', now());
  END IF;

  IF p_outcome = 'converted' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.sales_commission_events WHERE lead_id = p_lead_id
    ) THEN
      INSERT INTO public.sales_commission_events (tenant_id, lead_id, agent_id, status)
      VALUES (v_lead.tenant_id, p_lead_id, v_agent_for_link, 'Pending Review');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'journey_stage', v_merged::text);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sales_lead_in_agent_suburb_patch(text, text) TO authenticated;

-- Single round-trip for “mark called” including claim when the lead is still unassigned.
CREATE OR REPLACE FUNCTION public.mark_sales_lead_called(p_lead_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_now timestamptz := now();
  n int;
BEGIN
  v_actor := public.get_agent_id_for_auth();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.sales_leads SET
    first_called_at = COALESCE(first_called_at, v_now),
    last_contacted_at = v_now,
    journey_stage = CASE WHEN journey_stage = 'assigned'::public.lead_journey_stage THEN 'called'::public.lead_journey_stage ELSE journey_stage END,
    assigned_agent_id = COALESCE(assigned_agent_id, v_actor),
    updated_at = v_now
  WHERE id = p_lead_id
    AND NOT do_not_call
    AND (
      assigned_agent_id = v_actor
      OR (
        assigned_agent_id IS NULL
        AND public.sales_lead_in_agent_suburb_patch(tenant_id, suburb)
      )
    );

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Lead not found or not allowed';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_sales_lead_called(text) TO authenticated;
