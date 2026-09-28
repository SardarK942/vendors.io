-- ============================================================================
-- Shop prototype · products customization types (stitching-level discriminator)
-- Add products.customization_types + products.mtm_surcharge_cents
-- ============================================================================
-- A garment can be sold at different STITCHING levels: fabric-only, part-
-- finished, standard-sized, made-to-measure, or ready-to-wear. This models that
-- axis per the sizing research and generalizes the inert `tailoring_available`
-- boolean from 00082 into a set of concrete offerings a vendor supports.
--
-- WHY an array: a single product may be offered at more than one stitching
-- level (e.g. standard_size AND made_to_measure), so this is a multi-value set,
-- not one enum column.
--
-- VALUE VALIDATION is app-layer, matching the established `subcategories text[]`
-- pattern (migration 00065): NO CHECK on array contents — the allowed values
-- (unstitched / semi_stitched / standard_size / made_to_measure / pre_stitched)
-- are enforced in Zod (createProductSchema) and centralized in the pure lib
-- src/lib/products/customization.ts. Adding a value later is a Zod/lib change,
-- not a migration.
--
-- mtm_surcharge_cents: optional flat upcharge (in cents, integers only — the
-- app-wide money convention) applied when a product is ordered made-to-measure.
-- NULL means "no separate surcharge". Guarded to be non-negative.
--
-- SCOPE: schema hook only. The required measurement fields for a made-to-measure
-- order are DERIVED from garment_type via garmentToMeasurementGarment +
-- measurement-schemas, so no per-product measurement spec table is added here.
-- Checkout/order wiring and alteration_claim are later slices.
--
-- See docs/superpowers/specs/2026-09-27-product-customization-types.md

ALTER TABLE products ADD COLUMN customization_types text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE products ADD COLUMN mtm_surcharge_cents integer CHECK (mtm_surcharge_cents IS NULL OR mtm_surcharge_cents >= 0);

-- Valid customization_types values (enforced in the app layer, not by a CHECK):
--   unstitched · semi_stitched · standard_size · made_to_measure · pre_stitched
