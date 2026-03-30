-- ═══════════════════════════════════════════════════════════
-- Customer Context Tables for Incoming Calls
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  primary_phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customers_tenant_phone_unique UNIQUE (tenant_id, phone_normalized)
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  rego TEXT NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT,
  color TEXT,
  vin TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vehicles_tenant_rego_unique UNIQUE (tenant_id, rego)
);

CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  service_type TEXT NOT NULL,
  odometer_km INT,
  amount NUMERIC(10,2),
  advisor_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_tenant_id_idx
  ON public.customers (tenant_id);

CREATE INDEX IF NOT EXISTS customers_phone_normalized_idx
  ON public.customers (phone_normalized);

CREATE INDEX IF NOT EXISTS vehicles_tenant_id_idx
  ON public.vehicles (tenant_id);

CREATE INDEX IF NOT EXISTS vehicles_customer_id_idx
  ON public.vehicles (customer_id);

CREATE INDEX IF NOT EXISTS services_tenant_id_idx
  ON public.services (tenant_id);

CREATE INDEX IF NOT EXISTS services_customer_id_idx
  ON public.services (customer_id);

CREATE INDEX IF NOT EXISTS services_vehicle_id_idx
  ON public.services (vehicle_id);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read customers" ON public.customers;
CREATE POLICY "Read customers" ON public.customers FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

DROP POLICY IF EXISTS "Read vehicles" ON public.vehicles;
CREATE POLICY "Read vehicles" ON public.vehicles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

DROP POLICY IF EXISTS "Read services" ON public.services;
CREATE POLICY "Read services" ON public.services FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

DROP POLICY IF EXISTS "Super admin manages customers" ON public.customers;
CREATE POLICY "Super admin manages customers" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super-admin'));

DROP POLICY IF EXISTS "Super admin manages vehicles" ON public.vehicles;
CREATE POLICY "Super admin manages vehicles" ON public.vehicles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super-admin'));

DROP POLICY IF EXISTS "Super admin manages services" ON public.services;
CREATE POLICY "Super admin manages services" ON public.services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super-admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super-admin'));

DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
