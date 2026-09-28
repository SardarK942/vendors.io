-- ============================================================================
-- Made-to-measure · reusable per-buyer body-measurement profiles
-- Create user_measurement_profiles table
-- ============================================================================
-- A buyer (couple) saves reusable body-measurement profiles ("Bride", "Groom")
-- once and reuses them across made-to-measure orders, instead of re-entering
-- their measurements on every purchase. The measurement field taxonomy (which
-- numbers, ranges, how-to copy, cross-field sanity checks) lives in the pure
-- libs src/lib/products/measurement-schemas.ts + measurement-validation.ts, so
-- this table is deliberately schema-light: a jsonb bag keyed by machine key.
--
-- BODY vs GARMENT: `measurements` stores BODY measurements ONLY (around_bust,
-- chest, height, …), keyed by machine key, values canonically in INCHES. It is
-- NOT the finished-garment spec — the tailor derives that. `unit` is a display
-- preference only; stored numbers are always inches.
--
-- SCOPE: this is the reusable-profile slice. The made-to-measure PURCHASE
-- wiring (customization_type on a product/order, alteration_claim) is a later
-- slice and is NOT in this migration.
--
-- RLS: private to the owning buyer (owner-only + admin), mirroring the
-- vendor_profiles owner/admin template. No public SELECT — nobody but the buyer
-- (and admins) should read someone's body measurements.
--
-- updated_at: kept fresh by the app layer (service sets updated_at on write);
-- no DB trigger, matching the products/packages template tables.
--
-- See docs/superpowers/specs/2026-09-27-measurement-profiles.md

CREATE TABLE user_measurement_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,
  -- Extensible later (kurta, gown, …); constrained to the two prototype
  -- garments today. Kept in sync with MeasurementGarment in database.types.ts.
  garment text NOT NULL CHECK (garment IN ('lehenga', 'sherwani')),
  -- Body measurements ONLY, keyed by machine key, values in INCHES canonically.
  measurements jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Display preference only; stored measurement values are always inches.
  unit text NOT NULL DEFAULT 'in' CHECK (unit IN ('in', 'cm')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_measurement_profiles_user_id_idx ON user_measurement_profiles(user_id);

-- ---------------------------------------------------------------------------
-- RLS — owner-only + admin (mirrors the vendor_profiles owner/admin template)
-- ---------------------------------------------------------------------------
ALTER TABLE user_measurement_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers manage own measurement profiles" ON user_measurement_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all measurement profiles" ON user_measurement_profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );
