-- ═══════════════════════════════════════════════════════════════
-- Sales workspace — leads, campaigns, trials, site visits, commissions
-- Tenant-scoped. Agents see/update only assigned leads (via RLS + RPC).
-- ═══════════════════════════════════════════════════════════════

CREATE TYPE public.lead_journey_stage AS ENUM (
  'assigned',
  'called',
  'answered',
  'interested',
  'trial_offered',
  'trial_started',
  'site_visit_booked',
  'converted'
);

CREATE TYPE public.lead_call_outcome AS ENUM (
  'no_answer',
  'answered_short',
  'not_interested',
  'interested',
  'trial_offered',
  'trial_started',
  'site_visit_booked',
  'call_back_later',
  'converted'
);

CREATE OR REPLACE FUNCTION public.lead_journey_stage_rank(s public.lead_journey_stage)
RETURNS INT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE s
    WHEN 'assigned' THEN 1
    WHEN 'called' THEN 2
    WHEN 'answered' THEN 3
    WHEN 'interested' THEN 4
    WHEN 'trial_offered' THEN 5
    WHEN 'trial_started' THEN 6
    WHEN 'site_visit_booked' THEN 7
    WHEN 'converted' THEN 8
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_agent_id_for_auth()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.agents WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.sales_tenant_staff_access(_tenant_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super-admin'::public.app_role)
    OR (
      _tenant_id = public.get_user_tenant(auth.uid())
      AND (
        public.has_role(auth.uid(), 'client-admin'::public.app_role)
        OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
      )
    );
$$;

-- ─── Campaigns ─────────────────────────────────────────────────────
CREATE TABLE public.sales_campaigns (
  id TEXT PRIMARY KEY DEFAULT ('sales-campaign-'::text || gen_random_uuid()::text),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_campaigns ENABLE ROW LEVEL SECURITY;

CREATE INDEX sales_campaigns_tenant_idx ON public.sales_campaigns(tenant_id);

-- ─── Leads ───────────────────────────────────────────────────────────
CREATE TABLE public.sales_leads (
  id TEXT PRIMARY KEY DEFAULT ('sales-lead-'::text || gen_random_uuid()::text),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES public.sales_campaigns(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT,
  suburb TEXT NOT NULL DEFAULT '',
  do_not_call BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_agent_id TEXT REFERENCES public.agents(id) ON DELETE SET NULL,
  journey_stage public.lead_journey_stage NOT NULL DEFAULT 'assigned',
  follow_up_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  customer_response_summary TEXT NOT NULL DEFAULT '',
  first_called_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;

CREATE INDEX sales_leads_tenant_idx ON public.sales_leads(tenant_id);
CREATE INDEX sales_leads_campaign_idx ON public.sales_leads(campaign_id);
CREATE INDEX sales_leads_assigned_idx ON public.sales_leads(assigned_agent_id);

CREATE OR REPLACE FUNCTION public.sales_leads_prevent_dnc_assignment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.do_not_call = TRUE AND NEW.assigned_agent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot assign a lead marked do-not-call';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_leads_prevent_dnc_assignment_trg
  BEFORE INSERT OR UPDATE OF do_not_call, assigned_agent_id ON public.sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.sales_leads_prevent_dnc_assignment();

CREATE OR REPLACE FUNCTION public.sales_leads_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

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

  IF OLD.assigned_agent_id IS DISTINCT FROM NEW.assigned_agent_id
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.campaign_id IS DISTINCT FROM NEW.campaign_id
    OR OLD.do_not_call IS DISTINCT FROM NEW.do_not_call THEN
    RAISE EXCEPTION 'Agents cannot change assignment, tenancy, campaign, or do-not-call from this dashboard';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_leads_touch_updated_trg
  BEFORE UPDATE ON public.sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.sales_leads_touch_updated();

CREATE TRIGGER sales_leads_agent_update_guard_trg
  BEFORE UPDATE ON public.sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.sales_leads_agent_update_guard();

-- ─── Interactions (customer responses / call logs) ────────────────────
CREATE TABLE public.sales_lead_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES public.agents(id) ON DELETE SET NULL,
  outcome public.lead_call_outcome NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  customer_response TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_lead_interactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX sales_interactions_lead_idx ON public.sales_lead_interactions(lead_id);
CREATE INDEX sales_interactions_tenant_idx ON public.sales_lead_interactions(tenant_id);

-- ─── Trials ───────────────────────────────────────────────────────────
CREATE TABLE public.sales_trials (
  id TEXT PRIMARY KEY DEFAULT ('sales-trial-'::text || gen_random_uuid()::text),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL UNIQUE REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES public.agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_trials ENABLE ROW LEVEL SECURITY;

CREATE INDEX sales_trials_tenant_idx ON public.sales_trials(tenant_id);

-- ─── Site visits ─────────────────────────────────────────────────────
CREATE TABLE public.sales_site_visits (
  id TEXT PRIMARY KEY DEFAULT ('sales-visit-'::text || gen_random_uuid()::text),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES public.agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  booked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_site_visits ENABLE ROW LEVEL SECURITY;

CREATE INDEX sales_site_visits_tenant_idx ON public.sales_site_visits(tenant_id);
CREATE INDEX sales_site_visits_lead_idx ON public.sales_site_visits(lead_id);

-- ─── Commission ──────────────────────────────────────────────────────
CREATE TABLE public.sales_commission_events (
  id TEXT PRIMARY KEY DEFAULT ('sales-commission-'::text || gen_random_uuid()::text),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES public.agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Pending Review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_commission_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX sales_commission_tenant_idx ON public.sales_commission_events(tenant_id);

-- ─── Suburb → agent ───────────────────────────────────────────────────
CREATE TABLE public.sales_agent_suburb_assignments (
  id TEXT PRIMARY KEY DEFAULT ('sales-suburb-'::text || gen_random_uuid()::text),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  suburb TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent_id, suburb)
);
ALTER TABLE public.sales_agent_suburb_assignments ENABLE ROW LEVEL SECURITY;

CREATE INDEX sales_suburb_assignment_tenant_idx ON public.sales_agent_suburb_assignments(tenant_id);

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════════════════════

-- sales_campaigns
CREATE POLICY sales_campaigns_select ON public.sales_campaigns FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.tenant_id = sales_campaigns.tenant_id AND sl.assigned_agent_id = public.get_agent_id_for_auth()
    )
  );

CREATE POLICY sales_campaigns_insert ON public.sales_campaigns FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_campaigns_update ON public.sales_campaigns FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id))
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_campaigns_delete ON public.sales_campaigns FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

-- sales_leads
CREATE POLICY sales_leads_select_staff ON public.sales_leads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_leads_select_agent ON public.sales_leads FOR SELECT TO authenticated
  USING (assigned_agent_id = public.get_agent_id_for_auth() AND NOT do_not_call);

CREATE POLICY sales_leads_write_staff ON public.sales_leads FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_leads_update_staff ON public.sales_leads FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id))
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_leads_update_assigned_agent ON public.sales_leads FOR UPDATE TO authenticated
  USING (assigned_agent_id = public.get_agent_id_for_auth() AND NOT do_not_call)
  WITH CHECK (assigned_agent_id = public.get_agent_id_for_auth() AND NOT do_not_call);

CREATE POLICY sales_leads_delete_staff ON public.sales_leads FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

-- sales_lead_interactions
CREATE POLICY sales_interactions_select ON public.sales_lead_interactions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id AND sl.assigned_agent_id = public.get_agent_id_for_auth() AND NOT sl.do_not_call
    )
  );

CREATE POLICY sales_interactions_insert_staff ON public.sales_lead_interactions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_interactions_insert_agent ON public.sales_lead_interactions FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.sales_leads WHERE id = lead_id LIMIT 1)
    AND EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id
        AND sl.assigned_agent_id = public.get_agent_id_for_auth()
        AND NOT sl.do_not_call
    )
    AND (agent_id IS NULL OR agent_id = public.get_agent_id_for_auth())
  );

-- trials / site visits / commission / suburb (staff + agent read via lead)
CREATE POLICY sales_trials_select ON public.sales_trials FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id AND sl.assigned_agent_id = public.get_agent_id_for_auth() AND NOT sl.do_not_call
    )
  );

CREATE POLICY sales_trials_insert_staff ON public.sales_trials FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_trials_update_staff ON public.sales_trials FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id))
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_trials_delete_staff ON public.sales_trials FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_trials_insert_agent ON public.sales_trials FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id AND sl.tenant_id = tenant_id AND sl.assigned_agent_id = public.get_agent_id_for_auth() AND NOT sl.do_not_call
    )
    AND (agent_id IS NULL OR agent_id = public.get_agent_id_for_auth())
  );

CREATE POLICY sales_visits_select ON public.sales_site_visits FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id AND sl.assigned_agent_id = public.get_agent_id_for_auth() AND NOT sl.do_not_call
    )
  );

CREATE POLICY sales_visits_insert_staff ON public.sales_site_visits FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_visits_update_staff ON public.sales_site_visits FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id))
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_visits_delete_staff ON public.sales_site_visits FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_visits_insert_agent ON public.sales_site_visits FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id AND sl.tenant_id = tenant_id AND sl.assigned_agent_id = public.get_agent_id_for_auth() AND NOT sl.do_not_call
    )
    AND (agent_id IS NULL OR agent_id = public.get_agent_id_for_auth())
  );

CREATE POLICY sales_commission_select ON public.sales_commission_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id AND sl.assigned_agent_id = public.get_agent_id_for_auth() AND NOT sl.do_not_call
    )
  );

CREATE POLICY sales_commission_insert_staff ON public.sales_commission_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_commission_update_staff ON public.sales_commission_events FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id))
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_commission_delete_staff ON public.sales_commission_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

CREATE POLICY sales_commission_insert_agent ON public.sales_commission_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales_leads sl
      WHERE sl.id = lead_id AND sl.tenant_id = tenant_id AND sl.assigned_agent_id = public.get_agent_id_for_auth() AND NOT sl.do_not_call
    )
    AND (agent_id IS NULL OR agent_id = public.get_agent_id_for_auth())
    AND status = 'Pending Review'
  );

CREATE POLICY sales_suburb_select ON public.sales_agent_suburb_assignments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR public.sales_tenant_staff_access(tenant_id)
    OR agent_id = public.get_agent_id_for_auth()
  );

CREATE POLICY sales_suburb_write ON public.sales_agent_suburb_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id))
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.sales_tenant_staff_access(tenant_id));

-- ═══════════════════════════════════════════════════════════════
-- Atomic outcome application (validations + side effects)
-- ═══════════════════════════════════════════════════════════════

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

  IF NOT v_staff AND (v_lead.assigned_agent_id IS DISTINCT FROM v_actor OR v_lead.do_not_call) THEN
    RAISE EXCEPTION 'Not allowed to update this lead';
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

GRANT EXECUTE ON FUNCTION public.apply_sales_lead_outcome(TEXT, public.lead_call_outcome, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
