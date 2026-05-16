-- ============================================================================
-- A-cleanup · Migration 00027
-- Add booking_events.completed_at for per-event completion tracking
-- ============================================================================
-- Each event in a multi-day booking is independently marked complete by the
-- 48h-past-event cron (autoCompleteBookings). The booking itself is marked
-- 'completed' only when ALL events have completed_at set.
--
-- A partial index on (booking_id) WHERE completed_at IS NULL lets the cron
-- sweep efficiently: it only visits rows still awaiting completion.

ALTER TABLE booking_events
  ADD COLUMN completed_at timestamptz NULL;

-- Partial index for efficient sweep: only unfinished events
CREATE INDEX booking_events_pending_completion_idx
  ON booking_events (booking_id)
  WHERE completed_at IS NULL;
