-- Package archetype foundation — Phase 1, Slice 1.
--
-- Additive, backward-compatible groundwork for the per-category package-model
-- redesign (see docs/superpowers/specs/2026-09-17-package-model-locked-decisions.md).
-- Nothing here changes existing pricing math, the editor, display, booking, or
-- payment paths; the new column defaults reproduce today's behavior exactly.
--
-- 1) max_guests / duration_hours — these were NOT NULL because every legacy
--    category priced by headcount + time. Time-based (photography, dj, …) and
--    goods (invitations, gifts) categories have no meaningful guest count, and
--    several categories have no duration. Dropping NOT NULL lets the archetype
--    layer hide those fields per category. Existing rows are unaffected (they
--    already carry values); the existing positive CHECKs stay in place — a NULL
--    trivially satisfies a CHECK, so no data or constraint change is needed.
--
-- 2) pricing_unit — generalizes the display axis (capacity_unit stays as-is for
--    the carts guests/servings toggle). Display-only in Phase 1; per-unit
--    pricing math lands in Phase 2. Defaults to 'flat', which matches the
--    current single-scalar base_price behavior for every existing row.
--
-- 3) attributes — per-archetype structured display chips (photographers count,
--    turnaround, unlimited_prints, …). Defaults to an empty object so existing
--    rows and current render paths see no change.

ALTER TABLE packages ALTER COLUMN max_guests DROP NOT NULL;

ALTER TABLE packages ALTER COLUMN duration_hours DROP NOT NULL;

ALTER TABLE packages ADD COLUMN pricing_unit text NOT NULL DEFAULT 'flat'
  CHECK (pricing_unit IN ('flat','per_hour','per_person','per_guest','per_serving','per_item','per_day'));

ALTER TABLE packages ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
