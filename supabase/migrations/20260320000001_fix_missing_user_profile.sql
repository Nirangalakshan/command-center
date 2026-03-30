-- ═══════════════════════════════════════════════════════════
-- Fix: Insert missing profile + role rows for existing users
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1) Insert missing profile (if not already there)
INSERT INTO public.profiles (id, display_name, tenant_id)
VALUES (
  '0295081a-4dd0-4e7b-8d3d-5bdeb2799a22',
  'Admin',   -- change to your actual name if you like
  NULL       -- super-admins don't need a tenant_id
)
ON CONFLICT (id) DO NOTHING;

-- 2) Insert super-admin role (if not already there)
INSERT INTO public.user_roles (user_id, role)
VALUES (
  '0295081a-4dd0-4e7b-8d3d-5bdeb2799a22',
  'super-admin'
)
ON CONFLICT (user_id, role) DO NOTHING;
