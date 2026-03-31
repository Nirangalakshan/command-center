-- ═══════════════════════════════════════════════════════════
-- Bookings Table — created from live call sheet
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_rego TEXT,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year INT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  service_type TEXT NOT NULL,
  booking_date DATE NOT NULL,
  drop_off_time TIME NOT NULL,
  pickup_time TIME,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_tenant_id_idx ON public.bookings (tenant_id);
CREATE INDEX IF NOT EXISTS bookings_customer_id_idx ON public.bookings (customer_id);
CREATE INDEX IF NOT EXISTS bookings_booking_date_idx ON public.bookings (booking_date);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read bookings" ON public.bookings;
CREATE POLICY "Read bookings" ON public.bookings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

DROP POLICY IF EXISTS "Insert bookings" ON public.bookings;
CREATE POLICY "Insert bookings" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super-admin')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

DROP POLICY IF EXISTS "Update bookings" ON public.bookings;
CREATE POLICY "Update bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super-admin')
    OR tenant_id = public.get_user_tenant(auth.uid())
  );

DROP TRIGGER IF EXISTS update_bookings_updated_at ON public.bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
