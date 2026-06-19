-- supabase/migrations/00058_drop_payment_mode_and_stripe_columns.sql
-- Bucket F: single-mode payment model. Drop dual-mode + Stripe Connect plumbing.
--
-- Verified against prod 2026-06-19: only payment_mode + stripe_account_id exist
-- on vendor_profiles. No vendor_payment_accounts table. 0 confirmed bookings.
--
-- All statements single-line for Supabase web editor compatibility.

ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS payment_mode;
ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS stripe_account_id;
