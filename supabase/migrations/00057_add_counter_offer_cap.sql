-- supabase/migrations/00057_add_counter_offer_cap.sql
-- Sub-project D.1: couple-counter feature with 2-round-trip cap.
--
-- bookings.status and notifications.type are TEXT with CHECK constraints
-- (not Postgres enums). Adding 'couple_countered' requires dropping the
-- existing CHECK and recreating it with the appended value. The new IN list
-- mirrors the current TS types BookingStatus and NotificationType in
-- src/types/database.types.ts.
--
-- Written as single-line statements for Supabase SQL editor compatibility.
-- (Note: 00056 was already taken by scraped_vendors_source_add_tiktok.sql.)

ALTER TABLE bookings ADD COLUMN vendor_adjustment_count SMALLINT NOT NULL DEFAULT 0 CHECK (vendor_adjustment_count BETWEEN 0 AND 2);
ALTER TABLE bookings ADD COLUMN couple_counter_count SMALLINT NOT NULL DEFAULT 0 CHECK (couple_counter_count BETWEEN 0 AND 2);
ALTER TABLE bookings ADD COLUMN couple_counter_amount INTEGER;
ALTER TABLE bookings ADD COLUMN couple_counter_note TEXT;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending', 'pending_quote', 'deposit_paid', 'couple_cancelled', 'vendor_cancelled', 'cancelled_mutual', 'completed', 'expired', 'disputed', 'accepted', 'adjusted_quote_sent', 'adjusted_quote_declined', 'couple_countered'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('booking_request_received', 'vendor_accepted', 'vendor_adjusted_quote', 'couple_accepted_adjusted', 'couple_declined_adjusted', 'deposit_paid', 'booking_confirmed', 'booking_auto_cancelled', 'booking_cancelled', 'event_completed', 'booking_completed', 'review_received', 'custom_request_received', 'couple_countered'));
