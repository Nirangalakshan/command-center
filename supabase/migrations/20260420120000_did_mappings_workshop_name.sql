-- ═══════════════════════════════════════════════════════════
-- DID Mappings: add workshop_name column
-- Mirrors the workshop (owner) display name so webhook screen-pop
-- can show "Workshop - Branch" without an extra Firestore lookup.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.did_mappings
  ADD COLUMN IF NOT EXISTS workshop_name TEXT NOT NULL DEFAULT '';
