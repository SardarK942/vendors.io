-- Allow 'custom_request_received' in the notifications.type CHECK.
-- Dispatched when a couple submits a Custom Request booking (status='pending_quote').

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'booking_request_received'::text,
    'vendor_accepted'::text,
    'vendor_adjusted_quote'::text,
    'couple_accepted_adjusted'::text,
    'couple_declined_adjusted'::text,
    'deposit_paid'::text,
    'booking_confirmed'::text,
    'booking_auto_cancelled'::text,
    'booking_cancelled'::text,
    'event_completed'::text,
    'booking_completed'::text,
    'review_received'::text,
    'custom_request_received'::text
  ]));
