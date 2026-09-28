# Product Customization Types — stitching-level discriminator (WS-1)

**Date:** 2026-09-27
**Status:** Data + pure lib implemented (WS-1). No React UI (that's a later workstream).
**Branch:** `feat/shop-prototype`

## Scope

A Shop garment can be sold at different **stitching levels**. This slice adds a
`customization_types` discriminator to the `products` model so a vendor can
declare which levels they offer per product, plus an optional made-to-measure
surcharge. It generalizes the inert `tailoring_available` boolean from migration
00082 into a concrete set of offerings.

This slice ships the DATA + LIB foundation only:

- Migration `00084_products_customization_types.sql`
- Pure taxonomy lib (`src/lib/products/customization.ts`)
- Zod schema extension (`createProductSchema` / `updateProductSchema`)
- Types (`CustomizationType` union + `products` Row/Insert/Update columns)
- Service persistence (`createProduct` / `updateProduct` already spread the
  validated input, so both new fields persist)
- Unit tests (`src/__tests__/lib/products-customization.test.ts`)

**Explicitly deferred to later slices:** any React components/pages (the vendor
product editor + buyer UI are WS-2), checkout/order wiring that captures the
chosen customization level, and any post-delivery `alteration_claim` flow.

## The five values

Stored in `products.customization_types text[]`; validated in the app layer
(Zod + `src/lib/products/customization.ts`), NOT by a DB CHECK — mirroring the
`subcategories text[]` pattern (migration 00065).

| value             | label           | meaning                                             |
| ----------------- | --------------- | --------------------------------------------------- |
| `unstitched`      | Unstitched      | Fabric only, stitched by your own tailor.           |
| `semi_stitched`   | Semi-stitched   | Ships part-finished for a local tailor to complete. |
| `standard_size`   | Standard size   | Finished to a standard size chart.                  |
| `made_to_measure` | Made to measure | Stitched to the wearer's exact measurements.        |
| `pre_stitched`    | Pre-stitched    | Pre-draped and ready to wear.                       |

`mtm_surcharge_cents` (`integer`, nullable, `>= 0`): optional flat upcharge in
cents applied when a product is ordered made-to-measure. `NULL` = no surcharge.

## Required measurement fields are DERIVED, not stored per product

There is deliberately **no** `product_measurement_specs` table. When a product
offers `made_to_measure`, the required measurement fields are derived from the
product's `garment_type`:

```
garmentToMeasurementGarment(garment_type) -> 'lehenga' | 'sherwani' | null
```

`null` means no vetted measurement schema exists for that garment yet. When a
schema does apply, the field taxonomy (which numbers, ranges, how-to copy) comes
from `src/lib/products/measurement-schemas.ts` — the same source the reusable
measurement profiles (migration 00083) use. Adding more garments is a lookup
change in `customization.ts` + a schema in `measurement-schemas.ts`, not a
migration. A per-product measurement spec table is therefore deferred.

## Migration SQL

```sql
ALTER TABLE products ADD COLUMN customization_types text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE products ADD COLUMN mtm_surcharge_cents integer CHECK (mtm_surcharge_cents IS NULL OR mtm_surcharge_cents >= 0);
```

**Not applied to any database in this workstream** (no dev creds). The user
applies dev + prod per the migration-apply policy.
