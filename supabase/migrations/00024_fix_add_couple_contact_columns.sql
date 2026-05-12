-- ============================================================================
-- Sub-project A · Fix — add couple contact snapshot columns to bookings
-- ============================================================================
-- A3's createBooking writes input.couple_full_name and input.couple_contact_phone
-- to the bookings table, but these columns were never added (spec §8.2 lists them
-- as API inputs but the spec's §2.2 schema doesn't add columns for them).
--
-- Adding them now as snapshot columns — captured at booking creation so future
-- changes to the user's profile don't retroactively modify the booking record.
-- Mirrors the same pattern as couple_phone / couple_email (legacy fields).
--
-- Caught by the smoke test (scripts/smoke-packages.mjs) during A5.8 verification.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS couple_full_name text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS couple_contact_phone text;
