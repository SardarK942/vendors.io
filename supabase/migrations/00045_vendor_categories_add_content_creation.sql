-- Adds `content_creation` to the vendor_profiles category CHECK constraint
-- for TikTok / Reels wedding creators (a distinct deliverable from videography).
-- Tracked in sub-project K spec.

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
    'carts'::text,
    'content_creation'::text
  ]));
