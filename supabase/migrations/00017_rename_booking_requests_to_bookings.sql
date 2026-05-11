-- ============================================================================
-- Sub-project A · Phase A1 · Step 3/7
-- Rename booking_requests → bookings, then wire booking_events FK
-- ============================================================================
-- Semantic clarity: this table represents a booking (a contract) once
-- accepted, not just a request. The old name was meaningful when the model
-- was budget → quote; now packages flip it to commitment-first.
--
-- Postgres RENAME TABLE preserves RLS policies, triggers, constraints, and
-- foreign keys automatically. Existing indexes survive the rename but keep
-- their old names. We rename the primary-key index for hygiene; other index
-- names retain the booking_requests_ prefix and remain functional.
--
-- This migration also wires the booking_events foreign key that was deferred
-- from migration 00016 (since the renamed target table didn't exist yet).
--
-- See docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md §2.2.

ALTER TABLE booking_requests RENAME TO bookings;

-- Rename primary-key index for clarity (other indexes retain old names)
ALTER INDEX IF EXISTS booking_requests_pkey RENAME TO bookings_pkey;

-- Wire booking_events FK now that bookings exists with the right name
ALTER TABLE booking_events
  ADD CONSTRAINT booking_events_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
