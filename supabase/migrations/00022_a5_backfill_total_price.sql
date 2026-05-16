-- ============================================================================
-- Sub-project A · Phase A5 · Step 1/4
-- Backfill total_price_cents on legacy bookings rows
-- ============================================================================
-- Legacy bookings (rows created before the package-driven flow) have:
--   total_price_cents = 0 (default from migration 00018)
--   package_base_price_cents_snapshot IS NULL
--   selected_addons = '[]'
--   adjustment_amount_cents = 0
--
-- They were created via the old POST /api/bookings/request flow which sets
-- vendor_quote_amount (the legacy single-quote field). Backfill total to
-- match: if vendor_quote_amount is set, use it; otherwise fall back to a
-- minimum non-zero placeholder (1 cent) so the next migration's > 0 check
-- constraint can be added without rejecting these rows.
--
-- The trigger sync_booking_total_price() only fires when the snapshot or
-- adjustment columns are updated, NOT when total_price_cents is updated
-- directly — so this UPDATE is safe and won't be overwritten by the trigger.
--
-- See docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md §10.

UPDATE bookings
SET total_price_cents = COALESCE(vendor_quote_amount, 1)
WHERE total_price_cents = 0;

-- Sanity: confirm zero rows remain with total_price_cents = 0
DO $$
DECLARE
  zero_count integer;
BEGIN
  SELECT COUNT(*) INTO zero_count FROM bookings WHERE total_price_cents = 0;
  IF zero_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % rows still have total_price_cents = 0', zero_count;
  END IF;
END $$;
