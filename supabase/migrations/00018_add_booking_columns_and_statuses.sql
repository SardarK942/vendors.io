-- ============================================================================
-- Sub-project A · Phase A1 · Step 4/7
-- Add new bookings columns + expand status CHECK constraint
-- ============================================================================
-- New columns wire the package-driven booking model:
--   package_id              FK to selected package (SET NULL on package
--                           hard-delete so historical bookings survive)
--   package_name_snapshot   Frozen at booking creation; preserves the package
--                           name on the booking even if the source package is
--                           hard-deleted later
--   package_base_price_cents_snapshot
--                           Frozen at booking creation; immune to vendor
--                           repricing the source package
--   selected_addons         jsonb snapshot of toggled add-ons:
--                           [{addon_id, name, price_delta_cents}, ...]
--   adjustment_amount_cents Vendor's price delta from (base + addons)
--   adjustment_reason       One of 7 enumerated reasons (CHECK constraint)
--   adjustment_explanation  Required only when reason='other'
--   vendor_notes            Post-booking instructions; populated from package
--                           vendor_notes_template on accept; vendor may edit
--   total_price_cents       Denormalized; kept synced by trigger in 00020.
--                           total_price_positive constraint deferred to A5
--                           (legacy rows may have 0 until backfill)
--   negotiation_round_count +1 each adjusted_quote_sent; observability only,
--                           no cap in v1
--
-- Status CHECK constraint replaced: drop the old name 'booking_requests_status_check'
-- (which survived the table rename in 00017) and add the new constraint with
-- the three new states. Existing 10 states retained for backward-compat.
--
-- See docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md §2.2.

-- New columns
ALTER TABLE bookings ADD COLUMN package_id uuid REFERENCES packages(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN package_name_snapshot text;
ALTER TABLE bookings ADD COLUMN package_base_price_cents_snapshot integer;
ALTER TABLE bookings ADD COLUMN selected_addons jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bookings ADD COLUMN adjustment_amount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN adjustment_reason text
  CHECK (adjustment_reason IS NULL OR adjustment_reason IN
    ('travel','guest_count','peak_date','custom','setup_complexity','discount','other'));
ALTER TABLE bookings ADD COLUMN adjustment_explanation text;
ALTER TABLE bookings ADD COLUMN vendor_notes text;
ALTER TABLE bookings ADD COLUMN total_price_cents integer NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN negotiation_round_count integer NOT NULL DEFAULT 0;

-- Adjustment explanation required when reason='other'
ALTER TABLE bookings ADD CONSTRAINT adjustment_explanation_when_other
  CHECK (adjustment_reason IS DISTINCT FROM 'other' OR adjustment_explanation IS NOT NULL);

-- Expand status check constraint
-- The old constraint name was booking_requests_status_check (set in 00012, preserved across 00017 rename)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS booking_requests_status_check;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'quoted'::text,
    'rejected'::text,
    'deposit_paid'::text,
    'couple_cancelled'::text,
    'vendor_cancelled'::text,
    'cancelled_mutual'::text,
    'completed'::text,
    'expired'::text,
    'disputed'::text,
    -- new in sub-project A
    'accepted'::text,
    'adjusted_quote_sent'::text,
    'adjusted_quote_declined'::text
  ]));

-- NOTE: total_price_cents > 0 constraint deferred to A5 cleanup.
-- Legacy rows currently have total_price_cents=0 (the trigger in 00020 only
-- fires when new snapshot columns are written). A5 backfills + adds the
-- constraint.
