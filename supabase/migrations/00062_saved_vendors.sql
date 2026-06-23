-- supabase/migrations/00062_saved_vendors.sql
-- Bucket J: shortlist persistence — saved_vendors join table with RLS.
-- All single-line statements (Supabase web SQL editor compatibility).

CREATE TABLE saved_vendors (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE, saved_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, vendor_profile_id));
CREATE INDEX idx_saved_vendors_user ON saved_vendors (user_id, saved_at DESC);
ALTER TABLE saved_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own saves" ON saved_vendors FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own saves" ON saved_vendors FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own saves" ON saved_vendors FOR DELETE USING (user_id = auth.uid());
