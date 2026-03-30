-- ═══════════════════════════════════════════════════════════
-- Yeastar PBX Integration — Config & Audit Tables
-- Phase 2 Migration
-- ═══════════════════════════════════════════════════════════

-- Store Yeastar connection configuration
CREATE TABLE IF NOT EXISTS public.yeastar_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  pbx_url TEXT NOT NULL DEFAULT '',
  client_id TEXT NOT NULL DEFAULT '',
  recording_base_url TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT false,
  last_event_at TIMESTAMPTZ,
  last_connected_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.yeastar_config ENABLE ROW LEVEL SECURITY;

-- Only super-admin can read/write Yeastar config
CREATE POLICY "Super admin manages yeastar_config"
  ON public.yeastar_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super-admin'));

-- Trigger: updated_at
CREATE TRIGGER update_yeastar_config_updated_at
  BEFORE UPDATE ON public.yeastar_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Webhook Event Log (optional, for debugging) ───────────
CREATE TABLE IF NOT EXISTS public.yeastar_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error TEXT
);

ALTER TABLE public.yeastar_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin reads yeastar_event_log"
  ON public.yeastar_event_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'));

-- Service role can insert (edge function uses service role key)
CREATE POLICY "Service role inserts yeastar_event_log"
  ON public.yeastar_event_log FOR INSERT TO service_role
  WITH CHECK (true);

-- Index to allow fast recent-event queries
CREATE INDEX yeastar_event_log_processed_at_idx
  ON public.yeastar_event_log (processed_at DESC);

-- ─── Seed default config row ───────────────────────────────
INSERT INTO public.yeastar_config (id, pbx_url, client_id, enabled, notes)
VALUES ('default', '', '', false, 'Configure PBX URL and credentials to enable Yeastar integration.')
ON CONFLICT (id) DO NOTHING;
