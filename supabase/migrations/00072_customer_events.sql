-- supabase/migrations/00072_customer_events.sql
-- Phase 1 customer events: celebration container + per-function vendor needs,
-- budget allocations, tasks, booking link, reminder notification types.
-- Spec: docs/superpowers/specs/2026-07-18-customer-events-design.md
-- All single-line statements (Supabase web SQL editor compatibility).

CREATE TABLE events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), couple_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, name text NOT NULL, celebration_type text NOT NULL, city text, total_budget_cents bigint, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_events_couple ON events (couple_user_id, created_at DESC);

CREATE TABLE event_functions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, sequence int NOT NULL, label text NOT NULL, event_type_id text, date date, start_time time, end_time time, venue_name text, city text, guest_estimate int, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (event_id, sequence));

CREATE TABLE event_vendor_needs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_function_id uuid NOT NULL REFERENCES event_functions(id) ON DELETE CASCADE, category text NOT NULL, booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL, manual_vendor_name text, manual_amount_cents bigint, manual_booked boolean NOT NULL DEFAULT false, notes text, sort int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_event_vendor_needs_function ON event_vendor_needs (event_function_id, sort);
CREATE INDEX idx_event_vendor_needs_booking ON event_vendor_needs (booking_id) WHERE booking_id IS NOT NULL;

CREATE TABLE event_budget_allocations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, category text NOT NULL, planned_cents bigint NOT NULL, UNIQUE (event_id, category));

CREATE TABLE event_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, event_function_id uuid REFERENCES event_functions(id) ON DELETE SET NULL, title text NOT NULL, due_date date, completed_at timestamptz, due_soon_notified_at timestamptz, overdue_notified_at timestamptz, sort int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_event_tasks_event ON event_tasks (event_id, sort);
CREATE INDEX idx_event_tasks_due ON event_tasks (due_date) WHERE completed_at IS NULL AND due_date IS NOT NULL;

ALTER TABLE bookings ADD COLUMN event_function_id uuid REFERENCES event_functions(id) ON DELETE SET NULL;
CREATE INDEX idx_bookings_event_function ON bookings (event_function_id) WHERE event_function_id IS NOT NULL;

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Couples manage own events" ON events FOR ALL USING (couple_user_id = auth.uid()) WITH CHECK (couple_user_id = auth.uid());

ALTER TABLE event_functions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Couples manage own event functions" ON event_functions FOR ALL USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_functions.event_id AND e.couple_user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM events e WHERE e.id = event_functions.event_id AND e.couple_user_id = auth.uid()));

ALTER TABLE event_vendor_needs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Couples manage own vendor needs" ON event_vendor_needs FOR ALL USING (EXISTS (SELECT 1 FROM event_functions f JOIN events e ON e.id = f.event_id WHERE f.id = event_vendor_needs.event_function_id AND e.couple_user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM event_functions f JOIN events e ON e.id = f.event_id WHERE f.id = event_vendor_needs.event_function_id AND e.couple_user_id = auth.uid()));

ALTER TABLE event_budget_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Couples manage own allocations" ON event_budget_allocations FOR ALL USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_budget_allocations.event_id AND e.couple_user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM events e WHERE e.id = event_budget_allocations.event_id AND e.couple_user_id = auth.uid()));

ALTER TABLE event_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Couples manage own event tasks" ON event_tasks FOR ALL USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_tasks.event_id AND e.couple_user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM events e WHERE e.id = event_tasks.event_id AND e.couple_user_id = auth.uid()));

-- Reminder notification types (mirror current NotificationType union + 3 new).
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY['booking_request_received'::text,'vendor_accepted'::text,'vendor_adjusted_quote'::text,'couple_accepted_adjusted'::text,'couple_declined_adjusted'::text,'deposit_paid'::text,'booking_confirmed'::text,'booking_auto_cancelled'::text,'booking_cancelled'::text,'event_completed'::text,'booking_completed'::text,'review_received'::text,'custom_request_received'::text,'couple_countered'::text,'event_task_due'::text,'event_task_overdue'::text,'event_countdown'::text]));
