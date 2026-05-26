-- Adds onboarding state to the users table:
--   - onboarding_completed_at: timestamp when the user finishes (or skips)
--     the welcome onboarding modal. NULL = not yet completed; the dashboard
--     OnboardingGate auto-fires the modal on next render.
--   - onboarding_data: jsonb stash of the user's answers. Shape varies by role:
--       Couple: { event_date: 'YYYY-MM-DD' | null, categories: string[] }
--       Vendor: { years_in_business: '0-1' | '1-3' | '3-10' | '10+' }
--                (category is written directly to vendor_profiles.category
--                 so the existing Sub-project B wizard pre-fills it.)
--     For skipped sessions: NULL.
--
-- The partial index covers the lookup that runs on every dashboard render
-- ("is this user still in onboarding?") so we don't full-scan users.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_data jsonb;

CREATE INDEX IF NOT EXISTS users_onboarding_pending_idx
  ON users (id)
  WHERE onboarding_completed_at IS NULL;
