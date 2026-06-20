-- supabase/migrations/00059_bucket_b_event_types_and_onboarding_backfill.sql
-- Bucket B: expand event_type CHECK constraint on bookings + backfill onboarding_completed_at.
-- All single-line statements (Supabase web SQL editor compatibility).
--
-- NOTE: booking_events uses event_type_label (free text), not event_type.
--       packages has no event_type column.
--       The event_type column lives on the bookings table (added in 00040, plain text, no prior CHECK).
--       booking_events_event_type_check and packages_event_type_check do NOT exist in prod;
--       the DROP IF EXISTS statements below are safe no-ops included for robustness.

ALTER TABLE booking_events DROP CONSTRAINT IF EXISTS booking_events_event_type_check;
ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_event_type_check;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_event_type_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_event_type_check CHECK (event_type IS NULL OR event_type IN ('engagement', 'roka', 'tilak', 'mehndi', 'sangeet', 'nikah', 'baraat', 'wedding', 'reception', 'walima', 'aqiqah', 'multiple', 'birthday_party', 'anniversary', 'corporate_event', 'baby_shower', 'bridal_shower', 'graduation', 'quinceanera', 'sweet_16'));
UPDATE users SET onboarding_completed_at = COALESCE(onboarding_completed_at, created_at) WHERE onboarding_completed_at IS NULL;
