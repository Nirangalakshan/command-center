-- ═══════════════════════════════════════════════════════════
-- Add BMS + Agent fields to the existing bookings table
-- ═══════════════════════════════════════════════════════════

-- BMS identifiers
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS bms_booking_id TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS owner_uid TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS branch_id TEXT;

-- Agent who created the booking from the dashboard
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS agent_firebase_uid TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS agent_email TEXT;

-- Services as JSON (array of {serviceId, serviceName, price, duration})
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb;

-- Vehicle details as JSON
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS vehicle_details JSONB;

-- Full BMS API response for auditing
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS bms_response JSONB;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_bms_booking_id ON public.bookings(bms_booking_id);
CREATE INDEX IF NOT EXISTS idx_bookings_agent_uid ON public.bookings(agent_firebase_uid);
CREATE INDEX IF NOT EXISTS idx_bookings_owner_uid ON public.bookings(owner_uid);

-- Open RLS for anon inserts (dashboard doesn't use Supabase auth)
DROP POLICY IF EXISTS "Allow anon insert bookings" ON public.bookings;
CREATE POLICY "Allow anon insert bookings" ON public.bookings
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read bookings" ON public.bookings;
CREATE POLICY "Allow anon read bookings" ON public.bookings
  FOR SELECT TO anon USING (true);
