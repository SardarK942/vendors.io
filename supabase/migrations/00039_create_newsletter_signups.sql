-- newsletter_signups: capture-only table for "The Bazaar Letter" footer form
-- and any future signup surfaces (homepage hero, post-booking, etc.). Idempotent
-- on email (UNIQUE constraint). RLS allows INSERT for anon + authenticated;
-- SELECT/UPDATE/DELETE are service-role only so the table never reveals which
-- emails are subscribed (privacy + anti-enumeration).

-- Enables case-insensitive text type used for email deduplication.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS newsletter_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'footer',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS newsletter_signups_created_at_idx ON newsletter_signups (created_at DESC);

ALTER TABLE newsletter_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can subscribe"
  ON newsletter_signups
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
