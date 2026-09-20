-- 00080: custom-request exact event-location capture
--
-- Additive only. The couple-side custom / quote request now captures the exact
-- event location via Google Places (venue OR street address). We store the
-- composed formatted address and the Google place_id alongside the existing
-- event_city / venue_name (added in 00070). Both nullable — legacy rows and the
-- no-API-key text fallback simply leave them null. Shown to the vendor
-- immediately (no deposit gating); this is not a private at_vendor base address.

ALTER TABLE bookings ADD COLUMN event_address text;
ALTER TABLE bookings ADD COLUMN event_google_place_id text;

COMMENT ON COLUMN bookings.event_address IS
  'Composed formatted event address from the couple''s Google Places selection (custom-request flow). Nullable; null for legacy rows and the no-key text fallback.';
COMMENT ON COLUMN bookings.event_google_place_id IS
  'Google place_id for the couple''s selected event location (custom-request flow). Nullable; used to build a precise "View on map" link.';
