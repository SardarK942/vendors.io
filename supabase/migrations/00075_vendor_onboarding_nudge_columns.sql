-- Vendor onboarding nudge tracking (spec 2026-08-21-vendor-onboarding-nudge-design).
-- Per-user send markers so the daily `tick` cron never double-nudges a vendor.
--   confirm_nudge_sent_at        — Segment A: re-sent email confirmation (once)
--   onboarding_nudge_24h_sent_at — Segment B step 1: first "finish your profile" reminder
--   onboarding_nudge_7d_sent_at  — Segment B step 2: last-call reminder
-- On `users` (not `vendor_profiles`) because a candidate may have no profile row at all.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS confirm_nudge_sent_at        timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_nudge_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_nudge_7d_sent_at  timestamptz;
