-- Package capacity unit + vendor-controlled "most popular" flag.
--
-- 1) capacity_unit — packages had a single, hardcoded "guests" capacity axis
--    (max_guests), which misrepresents cart vendors. A beverage/dessert cart
--    prices by *servings poured*, not headcount. We keep the existing numeric
--    max_guests as the capacity *value* and add a selectable *unit* (guests or
--    servings) so the customer-facing line can read "up to 300 servings". The
--    unit selector is surfaced only for cart vendors in the UI; every other
--    vendor stays on 'guests'. Existing rows default to 'guests' (no change).
--
-- 2) is_featured — the "Most popular" badge was purely computed (always the
--    cheapest package). Vendors want to choose which package is highlighted.
--    This flag lets them; getFeaturedPackage() prefers a flagged package and
--    falls back to cheapest when none is set. Single-featured-per-vendor is
--    enforced in the service layer (clears siblings on set), not the DB, so a
--    re-flag doesn't require a deferred-constraint dance.

ALTER TABLE packages
  ADD COLUMN capacity_unit text NOT NULL DEFAULT 'guests'
    CHECK (capacity_unit IN ('guests', 'servings'));

ALTER TABLE packages
  ADD COLUMN is_featured boolean NOT NULL DEFAULT false;

-- Speeds up the "clear other featured packages for this vendor" write and the
-- featured lookup. Partial index — only the handful of flagged rows are stored.
CREATE INDEX packages_vendor_featured_idx
  ON packages (vendor_profile_id)
  WHERE is_featured;
