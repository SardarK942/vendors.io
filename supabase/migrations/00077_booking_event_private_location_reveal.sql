-- 00077: reveal-after-deposit for private at_vendor event addresses
--
-- When a package is `at_vendor` and the vendor keeps their base address private
-- (base_address_public = false, the default — often a home address), the couple
-- should not see the exact street/ZIP until they've committed (paid the 5%
-- deposit) — mirroring how vendor phone/email are gated on couple_contact_revealed.
--
-- The privacy decision is snapshotted onto the booking_event at creation
-- (booking.service.ts), so the couple-facing view needs to join only
-- booking_events → bookings (which the couple always reads) — NOT packages,
-- whose RLS ("Anyone views active packages") would drop the row if a vendor
-- later deactivated the package.

ALTER TABLE booking_events
  ADD COLUMN IF NOT EXISTS location_is_private boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN booking_events.location_is_private IS
  'True when address_line_1/postal_code/google_place_id hold a vendor''s private base address (at_vendor, base_address_public=false, not overridden). booking_events_public redacts these until the couple''s deposit is paid.';

-- Recreate the couple-facing view: still excludes vendor_notes (its original
-- purpose), and now redacts the private street / ZIP / place_id until deposit.
CREATE OR REPLACE VIEW booking_events_public
  WITH (security_invoker = on)
  AS
  SELECT
    be.id, be.booking_id, be.sequence, be.event_date, be.event_start_time, be.event_end_time,
    be.event_type_label, be.location_name,
    CASE WHEN be.location_is_private AND b.couple_contact_revealed IS NOT TRUE
         THEN NULL ELSE be.address_line_1 END AS address_line_1,
    be.city, be.state,
    CASE WHEN be.location_is_private AND b.couple_contact_revealed IS NOT TRUE
         THEN NULL ELSE be.postal_code END AS postal_code,
    CASE WHEN be.location_is_private AND b.couple_contact_revealed IS NOT TRUE
         THEN NULL ELSE be.google_place_id END AS google_place_id,
    be.guest_count_override, be.location_overridden,
    be.completed_at, be.created_at
  FROM booking_events be
  JOIN bookings b ON b.id = be.booking_id;

COMMENT ON VIEW booking_events_public IS
  'Couple-facing booking_events: excludes vendor_notes, and redacts a private at_vendor address (street/ZIP/place_id) until the couple''s deposit is paid.';
