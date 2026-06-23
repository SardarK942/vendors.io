-- supabase/migrations/00063_first_action_tracking.sql
-- Bucket J: first-action timestamps for celebrations + 48h cron + served event types.
-- All single-line statements. All idempotent with IF NOT EXISTS guards.

ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS first_booking_at timestamptz NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_save_at timestamptz NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_booking_at timestamptz NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_welcome_dismissed_at timestamptz NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS followup_48h_sent_at timestamptz NULL;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS followup_48h_sent_at timestamptz NULL;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS published_at timestamptz NULL;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS served_event_types text[] NOT NULL DEFAULT '{}';
UPDATE vendor_profiles SET published_at = updated_at WHERE onboarding_complete = true AND published_at IS NULL;
