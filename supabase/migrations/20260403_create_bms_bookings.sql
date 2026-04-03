-- ═══════════════════════════════════════════════════════════════
-- bms_bookings — local mirror of bookings created via BMS API
-- Stores agent context, BMS booking ID, and full payload
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bms_bookings (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Link to BMS
  bms_booking_id  text,                         -- ID returned by POST /bookings
  owner_uid       text NOT NULL,                -- BMS workshop ownerUid
  branch_id       text,                         -- BMS branchId

  -- Agent who created this booking (from our dashboard)
  agent_id        text,                         -- our agents.id
  agent_uid       text,                         -- Firebase UID of the agent
  agent_email     text,                         -- Firebase email of the agent

  -- Customer details (snapshot at time of booking)
  client_name     text NOT NULL,
  client_phone    text,
  client_email    text,
  customer_id     text,                         -- BMS customerId if known

  -- Vehicle
  vehicle_number  text,
  vehicle_details text,

  -- Booking details
  booking_date    date NOT NULL,
  booking_time    text NOT NULL,                -- HH:mm
  pickup_time     text,
  services        jsonb DEFAULT '[]'::jsonb,    -- [{serviceId, name?, ...}]
  notes           text,

  -- Status tracking
  bms_status      text DEFAULT 'Pending',       -- mirrors BMS status
  bms_response    jsonb,                        -- full JSON response from BMS API

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_bms_bookings_agent_uid ON bms_bookings(agent_uid);
CREATE INDEX IF NOT EXISTS idx_bms_bookings_owner_uid ON bms_bookings(owner_uid);
CREATE INDEX IF NOT EXISTS idx_bms_bookings_date      ON bms_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bms_bookings_bms_id    ON bms_bookings(bms_booking_id);

-- Enable RLS (open for now — tighten later)
ALTER TABLE bms_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to bms_bookings"
  ON bms_bookings FOR ALL
  USING (true)
  WITH CHECK (true);
