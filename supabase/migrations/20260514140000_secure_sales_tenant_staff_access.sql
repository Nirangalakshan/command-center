-- Switch sales_tenant_staff_access to SECURITY INVOKER to satisfy security warnings
-- since the underlying functions (has_role, get_user_tenant) are already SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.sales_tenant_staff_access(_tenant_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
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
