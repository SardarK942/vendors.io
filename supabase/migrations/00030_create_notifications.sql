-- ============================================================================
-- Sub-project F · Migration 00030
-- notifications table + RLS + realtime publication
-- ============================================================================
-- One row per notification, owned by one user (recipient). 12 notification
-- types cover the full booking lifecycle (see docs/superpowers/specs/
-- 2026-05-16-sub-project-f-notifications-design.md §2.1).
--
-- RLS scopes SELECT and UPDATE to auth.uid() = user_id. INSERT is service-
-- role only — notifications are always created server-side as a side effect
-- of state transitions in booking.service.ts / payment.service.ts.
--
-- The realtime publication entry enables clients to subscribe via
-- supabase-js channels filtered by user_id, so the bell badge updates live
-- without polling.

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'booking_request_received','vendor_accepted','vendor_adjusted_quote',
    'couple_accepted_adjusted','couple_declined_adjusted','deposit_paid',
    'booking_confirmed','booking_auto_cancelled','booking_cancelled',
    'event_completed','booking_completed','review_received'
  )),
  title text NOT NULL,
  body text NOT NULL,
  link text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_recent_idx
  ON notifications (user_id, created_at DESC);

CREATE INDEX notifications_user_unread_idx
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users mark own notifications read" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Enable realtime broadcasts so clients can subscribe via supabase-js channels.
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
