-- supabase/migrations/00090_esign_contracts.sql
-- E-signature contracts (backend): auto-send a DocuSeal contract on deposit.
-- Plan: docs/superpowers/plans/2026-11-01-esign-contracts-backend.md
-- Spec: see the esign contracts design doc committed in e789348
--       (docs(esign): add backend design for auto contract e-signature on deposit), section 6.
-- Adds: vendor_profiles.docuseal_template_id, booking_contracts (1:1 with bookings),
--       docuseal_events (webhook audit/idempotency, mirrors stripe_events).

ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS docuseal_template_id text;

CREATE TABLE IF NOT EXISTS booking_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  vendor_profile_id uuid REFERENCES vendor_profiles(id),
  docuseal_submission_id text,
  template_id_used text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY(ARRAY['pending','sent_vendor','sent_couple','completed','declined','expired','voided','failed']::text[])),
  vendor_slug text,
  couple_slug text,
  signed_pdf_key text,
  certificate_key text,
  vendor_signed_at timestamptz,
  couple_signed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  declined_at timestamptz,
  voided_at timestamptz,
  last_reminder_at timestamptz,
  attempt_count int NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  error text,
  error_permanent boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_contracts_vendor_idx ON booking_contracts(vendor_profile_id);
CREATE INDEX IF NOT EXISTS booking_contracts_submission_idx ON booking_contracts(docuseal_submission_id);

ALTER TABLE booking_contracts ENABLE ROW LEVEL SECURITY;

-- Service-role-only for now: rows carry sensitive signing slugs (capability URLs). A future read UI
-- should expose a slug-free view/columns rather than reopening owner SELECT on this table.
CREATE POLICY "Service role manages booking contracts" ON booking_contracts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Webhook audit + replay detection (mirrors stripe_events, 00011).
CREATE TABLE IF NOT EXISTS docuseal_events (
  event_id    text PRIMARY KEY,  -- unique: replays are detected and skipped
  event_type  text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  handled_at  timestamptz,
  error       text,
  payload     jsonb
);

CREATE INDEX IF NOT EXISTS idx_docuseal_events_received_at ON docuseal_events(received_at DESC);

ALTER TABLE docuseal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages docuseal events" ON docuseal_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
