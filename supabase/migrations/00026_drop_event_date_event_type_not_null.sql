-- ============================================================================
-- Fix — relax NOT NULL on legacy bookings.event_date + bookings.event_type
-- ============================================================================
-- Migration 00003 declared these as NOT NULL because the original budget-driven
-- flow always set them. The package-driven flow (createBooking in
-- booking.service.ts) puts event data in booking_events instead, so these
-- columns are NULL on new bookings — and the NOT NULL constraint rejects the
-- INSERT.
--
-- The full A-cleanup sub-project will drop these columns entirely once the
-- legacy code paths are removed. For now we just relax the NOT NULL so the
-- new flow works alongside the legacy data.
--
-- Caught during sub-project A smoke walk-through 2026-05-14.

ALTER TABLE bookings ALTER COLUMN event_date DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN event_type DROP NOT NULL;
