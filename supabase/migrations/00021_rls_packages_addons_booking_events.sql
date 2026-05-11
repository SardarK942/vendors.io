-- ============================================================================
-- Sub-project A · Phase A1 · Step 7/7
-- RLS policies for packages, package_addons, booking_events
-- ============================================================================
-- packages: vendor manages their own (auth.uid() → vendor_profiles.user_id).
--   Anyone (public) can SELECT active packages — feeds the browse + search
--   experience for anonymous and logged-in couples alike.
--
-- package_addons: same shape, scoped via the parent package.
--
-- booking_events: mirrors parent bookings access — both parties (couple +
--   vendor of the parent booking) can SELECT; only the couple can INSERT
--   (at booking creation time). UPDATE and DELETE on booking_events are
--   intentionally not granted to either party — events are snapshots and
--   should not be edited post-creation. Vendor adjustments operate on the
--   parent bookings.adjustment_amount_cents instead.
--
-- See docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md §2.6.

-- ---------------------------------------------------------------------------
-- packages
-- ---------------------------------------------------------------------------
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors manage own packages" ON packages
  FOR ALL TO authenticated
  USING (vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid()))
  WITH CHECK (vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Anyone views active packages" ON packages
  FOR SELECT
  USING (is_active = true);

-- ---------------------------------------------------------------------------
-- package_addons
-- ---------------------------------------------------------------------------
ALTER TABLE package_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors manage own package addons" ON package_addons
  FOR ALL TO authenticated
  USING (package_id IN (
    SELECT id FROM packages WHERE vendor_profile_id IN
      (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  ))
  WITH CHECK (package_id IN (
    SELECT id FROM packages WHERE vendor_profile_id IN
      (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  ));

CREATE POLICY "Anyone views addons of active packages" ON package_addons
  FOR SELECT
  USING (package_id IN (SELECT id FROM packages WHERE is_active = true));

-- ---------------------------------------------------------------------------
-- booking_events
-- ---------------------------------------------------------------------------
ALTER TABLE booking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couple sees own booking events" ON booking_events
  FOR SELECT TO authenticated
  USING (booking_id IN (SELECT id FROM bookings WHERE couple_user_id = auth.uid()));

CREATE POLICY "Vendor sees their booking events" ON booking_events
  FOR SELECT TO authenticated
  USING (booking_id IN (
    SELECT b.id FROM bookings b
    JOIN vendor_profiles vp ON vp.id = b.vendor_profile_id
    WHERE vp.user_id = auth.uid()
  ));

CREATE POLICY "Couple inserts booking events on own bookings" ON booking_events
  FOR INSERT TO authenticated
  WITH CHECK (booking_id IN (SELECT id FROM bookings WHERE couple_user_id = auth.uid()));
