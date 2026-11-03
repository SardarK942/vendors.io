-- Shop SP2b: escrow transfer on onboarding. Additive.
ALTER TABLE vendor_ledger ADD COLUMN source_charge_id text NULL;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY['booking_request_received'::text,'vendor_accepted'::text,'vendor_adjusted_quote'::text,'couple_accepted_adjusted'::text,'couple_declined_adjusted'::text,'deposit_paid'::text,'booking_confirmed'::text,'booking_auto_cancelled'::text,'booking_cancelled'::text,'event_completed'::text,'booking_completed'::text,'review_received'::text,'custom_request_received'::text,'couple_countered'::text,'event_task_due'::text,'event_task_overdue'::text,'event_countdown'::text,'shop_order_placed'::text,'shop_order_confirmed'::text,'shop_order_cancelled'::text,'shop_order_reminder'::text,'shop_funds_transferred'::text]));
