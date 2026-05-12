-- ============================================================================
-- Sub-project A · Phase A5 · Step 2/4
-- Add total_price_positive check constraint on bookings
-- ============================================================================
-- This constraint was deferred from A1 (migration 00018) to A5 because legacy
-- bookings had total_price_cents = 0 at the time and would have blocked the
-- constraint. Migration 00022 backfills those rows; this migration adds the
-- constraint now that the data is safe.
--
-- Application layer also enforces this via the create_booking flow (rejects
-- zero-priced bookings with a clear error), so the DB constraint is the
-- defense-in-depth safety net.
--
-- See docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md §5.1.

ALTER TABLE bookings
  ADD CONSTRAINT total_price_positive CHECK (total_price_cents > 0);
