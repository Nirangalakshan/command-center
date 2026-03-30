-- ═══════════════════════════════════════════════════════════
-- 🧪 TEST SEED DATA — Fake Tenant, Queue & DID for Call Testing
-- Run this in: Supabase Dashboard → SQL Editor
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING)
-- ═══════════════════════════════════════════════════════════

-- 1. Test Tenant
INSERT INTO public.tenants (id, name, industry, status, brand_color, did_numbers)
VALUES (
  't-test-001',
  'Demo Client (Test)',
  'Technology',
  'active',
  '#00d4f5',
  ARRAY['0291234567']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Test Queue (linked to the tenant)
INSERT INTO public.queues (id, tenant_id, name, type, color, icon, active_calls, waiting_calls, available_agents, total_agents, avg_wait_seconds, sla_percent)
VALUES (
  'q-test-001',
  't-test-001',
  'Inbound Support',
  'inbound',
  '#00d4f5',
  '📞',
  0, 0, 1, 1, 0, 95
)
ON CONFLICT (id) DO NOTHING;

-- 3. DID Mapping — this is what Yeastar sends and the webhook looks up
INSERT INTO public.did_mappings (did, tenant_id, queue_id, label)
VALUES (
  '0291234567',
  't-test-001',
  'q-test-001',
  'Main Support Line'
)
ON CONFLICT (did) DO NOTHING;

-- 4. Verify everything inserted correctly
SELECT 'tenant' AS type, id, name FROM public.tenants WHERE id = 't-test-001'
UNION ALL
SELECT 'queue', id, name FROM public.queues WHERE id = 'q-test-001'
UNION ALL
SELECT 'did', did, label FROM public.did_mappings WHERE did = '0291234567';
