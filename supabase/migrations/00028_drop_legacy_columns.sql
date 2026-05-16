-- ============================================================================
-- A-cleanup · Migration 00028
-- Drop unambiguously dead columns from the legacy budget-driven flow
-- ============================================================================
-- IMPORTANT: Apply AFTER the app-code migration is committed and deployed.
--            The legacy API routes (/api/bookings/request, /api/bookings/[id]/quote)
--            and the service functions that write to these columns have been
--            removed in the A-cleanup code commit. Verify that before running.
--
-- Columns dropped from bookings:
--   event_date, event_type, budget_min, budget_max,
--   vendor_quote_amount, vendor_quote_notes, vendor_responded_at
--
-- Columns dropped from vendor_profiles:
--   starting_price_min, starting_price_max
--
-- Status check constraint: 'quoted' and 'rejected' values removed.
--   Run AFTER verifying no rows exist in those states:
--   SELECT COUNT(*) FROM bookings WHERE status IN ('quoted', 'rejected');
--   (Expected: 0 — migration 00029 deletes the remaining smoke-test rows first.)

-- ── bookings ─────────────────────────────────────────────────────────────────

ALTER TABLE bookings
  DROP COLUMN event_date,
  DROP COLUMN event_type,
  DROP COLUMN budget_min,
  DROP COLUMN budget_max,
  DROP COLUMN vendor_quote_amount,
  DROP COLUMN vendor_quote_notes,
  DROP COLUMN vendor_responded_at;

-- ── vendor_profiles ───────────────────────────────────────────────────────────

ALTER TABLE vendor_profiles
  DROP COLUMN starting_price_min,
  DROP COLUMN starting_price_max;

-- ── bookings_status_check: rebuild without 'quoted' + 'rejected' ──────────────
-- PostgreSQL doesn't support DROP CONSTRAINT IF EXISTS on check constraints in
-- all versions; the constraint name was set in migration 00018.

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check CHECK (
    status IN (
      'pending',
      'deposit_paid',
      'couple_cancelled',
      'vendor_cancelled',
      'cancelled_mutual',
      'completed',
      'expired',
      'disputed',
      'accepted',
      'adjusted_quote_sent',
      'adjusted_quote_declined'
    )
  );
