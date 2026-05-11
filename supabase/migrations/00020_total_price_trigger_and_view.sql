-- ============================================================================
-- Sub-project A · Phase A1 · Step 6/7
-- bookings.total_price_cents trigger + vendor price-band computed view
-- ============================================================================
-- total_price_cents is the single source of truth for Stripe deposit calcs,
-- emails, and the booking detail page. Denormalizing it (vs. computing on
-- every read) avoids joining + summing jsonb on every webhook fire, which
-- happens 3-4× per booking lifecycle.
--
-- The trigger fires BEFORE INSERT OR UPDATE of the three contributing
-- columns: package_base_price_cents_snapshot (frozen at booking creation),
-- selected_addons (jsonb snapshot), adjustment_amount_cents (set when the
-- vendor adjusts). Total = snapshot + sum(addon deltas) + adjustment.
--
-- The vendor_packages_price_band view replaces the manual price_min /
-- price_max on vendor_profiles. Used in browse/search to show the
-- "$X – $Y" band; auto-updates as packages are activated or deactivated.
--
-- See docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md §2.4–§2.5.

-- Trigger function: recompute total_price_cents on relevant changes
CREATE OR REPLACE FUNCTION sync_booking_total_price() RETURNS TRIGGER AS $$
DECLARE
  addons_sum integer;
BEGIN
  SELECT COALESCE(SUM((addon->>'price_delta_cents')::integer), 0)
  INTO addons_sum
  FROM jsonb_array_elements(NEW.selected_addons) AS addon;

  NEW.total_price_cents :=
    COALESCE(NEW.package_base_price_cents_snapshot, 0)
    + addons_sum
    + COALESCE(NEW.adjustment_amount_cents, 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_booking_total_price_trigger
  BEFORE INSERT OR UPDATE OF
    package_base_price_cents_snapshot, selected_addons, adjustment_amount_cents
  ON bookings
  FOR EACH ROW EXECUTE FUNCTION sync_booking_total_price();

-- Computed view: vendor's package pricing band (replaces price_min/price_max)
CREATE OR REPLACE VIEW vendor_packages_price_band AS
SELECT
  vendor_profile_id,
  MIN(base_price_cents) AS min_price_cents,
  MAX(base_price_cents) AS max_price_cents,
  COUNT(*)              AS active_package_count
FROM packages
WHERE is_active = true
GROUP BY vendor_profile_id;
