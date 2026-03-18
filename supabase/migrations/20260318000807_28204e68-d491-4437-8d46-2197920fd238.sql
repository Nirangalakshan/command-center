
-- ═══════════════════════════════════════════════════════════
-- Phase 1: Full Database Schema for Multi-Tenant Call Centre
-- ═══════════════════════════════════════════════════════════

-- Enums
CREATE TYPE public.app_role AS ENUM ('super-admin', 'client-admin', 'supervisor', 'agent');
CREATE TYPE public.agent_status AS ENUM ('on-call', 'available', 'wrap-up', 'break', 'offline');
CREATE TYPE public.call_result AS ENUM ('answered', 'abandoned', 'missed', 'voicemail');
CREATE TYPE public.transcript_status AS ENUM ('pending', 'processing', 'ready', 'none');
CREATE TYPE public.sip_line_status AS ENUM ('active', 'idle', 'error');
CREATE TYPE public.onboarding_stage AS ENUM (
  'new', 'contacted', 'discovery-complete', 'tenant-created',
  'queue-setup-complete', 'script-setup-complete', 'testing',
  'awaiting-approval', 'live', 'needs-revision'
);
CREATE TYPE public.ring_strategy AS ENUM ('ring-all', 'round-robin', 'longest-idle');
CREATE TYPE public.agent_role AS ENUM ('agent', 'senior-agent', 'team-lead');

-- ═══════════════════════════════════════════════════════════
-- Profiles (linked to auth.users)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  tenant_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- User Roles (separate table, never on profiles)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- Security Definer Functions (avoids recursive RLS)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = _user_id LIMIT 1
$$;

-- ═══════════════════════════════════════════════════════════
-- Tenants
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  brand_color TEXT NOT NULL DEFAULT '#00d4f5',
  did_numbers TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- Queues
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.queues (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'inbound',
  color TEXT NOT NULL DEFAULT '#00d4f5',
  icon TEXT NOT NULL DEFAULT '📞',
  active_calls INT NOT NULL DEFAULT 0,
  waiting_calls INT NOT NULL DEFAULT 0,
  available_agents INT NOT NULL DEFAULT 0,
  total_agents INT NOT NULL DEFAULT 0,
  avg_wait_seconds INT NOT NULL DEFAULT 0,
  sla_percent INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- Agents
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.agents (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  queue_ids TEXT[] NOT NULL DEFAULT '{}',
  name TEXT NOT NULL,
  extension TEXT NOT NULL DEFAULT '',
  role public.agent_role NOT NULL DEFAULT 'agent',
  status public.agent_status NOT NULL DEFAULT 'offline',
  current_caller TEXT,
  call_start_time BIGINT,
  allowed_queue_ids TEXT[] NOT NULL DEFAULT '{}',
  assigned_tenant_ids TEXT[] NOT NULL DEFAULT '{}',
  group_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- Agent Groups
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.agent_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  queue_id TEXT NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  agent_ids TEXT[] NOT NULL DEFAULT '{}',
  ring_strategy public.ring_strategy NOT NULL DEFAULT 'ring-all',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_groups ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- DID Mappings
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.did_mappings (
  did TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  queue_id TEXT NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT ''
);
ALTER TABLE public.did_mappings ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- Calls
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.calls (
  id TEXT PRIMARY KEY DEFAULT 'call-' || gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  queue_id TEXT NOT NULL,
  agent_id TEXT,
  caller_number TEXT NOT NULL DEFAULT '',
  caller_name TEXT,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  answer_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_seconds INT NOT NULL DEFAULT 0,
  result public.call_result NOT NULL DEFAULT 'missed',
  recording_url TEXT,
  transcript_status public.transcript_status NOT NULL DEFAULT 'none',
  summary_status TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- SIP Lines
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.sip_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES public.tenants(id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  trunk_name TEXT NOT NULL DEFAULT '',
  status public.sip_line_status NOT NULL DEFAULT 'idle',
  active_caller TEXT,
  active_since BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sip_lines ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- Tenant Onboarding
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.tenant_onboarding (
  id TEXT PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  onboarding_stage public.onboarding_stage NOT NULL DEFAULT 'new',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  client_details JSONB NOT NULL DEFAULT '{}',
  business_rules JSONB NOT NULL DEFAULT '{}',
  queue_setup JSONB NOT NULL DEFAULT '{"queues":[]}',
  script_knowledge_base JSONB NOT NULL DEFAULT '{}',
  booking_rules JSONB NOT NULL DEFAULT '{}',
  testing_go_live JSONB NOT NULL DEFAULT '{}',
  activity_log JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_onboarding ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- Updated_at trigger
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_queues_updated_at BEFORE UPDATE ON public.queues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tenant_onboarding_updated_at BEFORE UPDATE ON public.tenant_onboarding FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════
-- Auto-create profile on signup
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, tenant_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email, ''),
    NEW.raw_user_meta_data->>'tenant_id'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════

-- Profiles
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'super-admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- User roles
CREATE POLICY "Users read own role" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super-admin'));

-- Tenants
CREATE POLICY "Read tenants" ON public.tenants FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR id = public.get_user_tenant(auth.uid())
  );
CREATE POLICY "Super admin manages tenants" ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super-admin'));
CREATE POLICY "Super admin updates tenants" ON public.tenants FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'));
CREATE POLICY "Super admin deletes tenants" ON public.tenants FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'));

-- Queues
CREATE POLICY "Read queues" ON public.queues FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

-- Agents
CREATE POLICY "Read agents" ON public.agents FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

-- Agent Groups
CREATE POLICY "Read agent_groups" ON public.agent_groups FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

-- DID Mappings
CREATE POLICY "Read did_mappings" ON public.did_mappings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

-- Calls
CREATE POLICY "Read calls" ON public.calls FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

-- SIP Lines (super-admin only)
CREATE POLICY "Super admin reads sip_lines" ON public.sip_lines FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'));

-- Tenant Onboarding
CREATE POLICY "Read onboarding" ON public.tenant_onboarding FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR id = public.get_user_tenant(auth.uid())
  );
CREATE POLICY "Super admin inserts onboarding" ON public.tenant_onboarding FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super-admin') OR public.has_role(auth.uid(), 'client-admin'));
CREATE POLICY "Update onboarding" ON public.tenant_onboarding FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR (id = public.get_user_tenant(auth.uid()) AND (public.has_role(auth.uid(), 'client-admin') OR public.has_role(auth.uid(), 'supervisor')))
  );
