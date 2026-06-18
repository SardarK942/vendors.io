-- supabase/migrations/00055_add_notification_delivery_status.sql
-- Sub-project D.1: track email delivery state per notification.
-- Reason: we need to know when emails silently fail. Pairs with the
-- deliver('email', ...) wrapper introduced in src/lib/notifications/deliver.ts.
--
-- Note: written as four standalone single-line statements so the same SQL
-- pastes cleanly into the Supabase SQL editor for manual prod application.
-- A multi-line ALTER TABLE ... ADD COLUMN ..., ADD COLUMN ... form is valid
-- Postgres but the web editor trips on it during paste.

ALTER TABLE notifications ADD COLUMN email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped'));
ALTER TABLE notifications ADD COLUMN email_error TEXT;
ALTER TABLE notifications ADD COLUMN email_attempted_at TIMESTAMPTZ;
CREATE INDEX notifications_failed_emails_idx ON notifications (user_id, email_attempted_at DESC) WHERE email_status = 'failed';
