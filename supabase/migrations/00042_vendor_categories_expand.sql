-- Adds 3 new vendor categories: bridal_wear, live_music, carts.
-- Preserves all 10 existing categories (no removals — photobooth + invitations
-- stay valid in the DB so existing vendor rows survive; they're just no longer
-- featured on the homepage strip).
--
-- Bridal Wear ships as "Coming Soon" Day 1; future flat-fee listing sub-project
-- will onboard real vendors via a different business model (vendors pay a yearly
-- listing fee rather than per-booking commission).

ALTER TABLE vendor_profiles DROP CONSTRAINT IF EXISTS vendor_profiles_category_check;
ALTER TABLE vendor_profiles ADD CONSTRAINT vendor_profiles_category_check
  CHECK (category = ANY (ARRAY[
    'photography'::text,
    'videography'::text,
    'mehndi'::text,
    'hair_makeup'::text,
    'dj'::text,
    'photobooth'::text,
    'catering'::text,
    'venue'::text,
    'decor'::text,
    'invitations'::text,
    'bridal_wear'::text,
    'live_music'::text,
    'carts'::text
  ]));
