# Shop prototype — Slice 1: Catalog + Inventory

**Date:** 2026-09-25
**Status:** Prototype (feature branch `feat/shop-prototype`)
**Workstream:** WS-1 (Data + Backend foundation). WS-2/WS-3 (UI, pages, components) are separate and NOT part of this slice.

## Summary

A new **physical-goods product line** for the marketplace: a bridal/groom wear
"Shop" where **bridal_wear** vendors list garments (sarees, lehengas, sherwanis,
…) with per-size stock. This is deliberately distinct from the existing
service-booking `packages` model — packages are time/headcount-priced services
booked via request → quote → deposit; products are inventoried goods.

This slice builds the **catalog + inventory foundation only**. It is a prototype
and is **NOT wired to payments/checkout**.

## Scope (built in this slice)

- `products` table (parent) + `product_variants` table (sizes + stock, child) —
  migration `00082_create_products_and_variants.sql`. Mirrors the
  packages/package_addons shapes (parent + child, cascade delete, vendor-scoped
  RLS) and the `attributes jsonb` display-chip pattern from 00079.
- RLS mirroring packages: vendors manage own (via
  `vendor_profiles.user_id = auth.uid()`), anyone views `status = 'active'`,
  admin FOR ALL, variants scoped through the parent product.
- Hand-patched TS DB types (`products`, `product_variants` blocks + `ProductStatus`
  / `GarmentType` unions) in `src/types/database.types.ts`.
- Zod schemas (`createProductSchema`, `updateProductSchema`,
  `productVariantInputSchema`) in `src/types/index.ts`.
- Service `src/services/products.service.ts`: `getActiveProducts`,
  `getProductById`, `getProductsByVendor`, `createProduct`, `updateProduct`,
  `deleteProduct`. All DB access via the RLS-enforced client; no service-role.
- API routes: `POST /api/products`, `PATCH|DELETE /api/products/[id]`.
- Taxonomy helpers: `bridal_wear` entry in `SUBCATEGORIES_BY_CATEGORY`
  (`src/lib/vendor-subcategories.ts`); `GARMENT_TYPES` + `GARMENT_TYPE_LABELS`
  (`src/lib/products/garment-types.ts`).

## Schema

### `products`

| column                  | type                 | notes                                                                                             |
| ----------------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| id                      | uuid PK              | `gen_random_uuid()`                                                                               |
| vendor_profile_id       | uuid FK              | → `vendor_profiles(id)` ON DELETE CASCADE                                                         |
| title                   | text NOT NULL        |                                                                                                   |
| description             | text NOT NULL        |                                                                                                   |
| garment_type            | text NOT NULL        | CHECK IN (saree, lehenga, bridal_gown, sherwani, groom_suit, kurta, anarkali, accessories, other) |
| base_price_cents        | integer NOT NULL     | CHECK > 0 (cents, never float)                                                                    |
| currency                | text NOT NULL        | DEFAULT 'usd'                                                                                     |
| images                  | text[] NOT NULL      | DEFAULT `{}`; UploadThing URLs, index 0 = primary                                                 |
| video_uids              | text[] NOT NULL      | DEFAULT `{}`; Cloudflare Stream uids (optional)                                                   |
| attributes              | jsonb NOT NULL       | DEFAULT `{}`; color/fabric/work-type display chips                                                |
| ships_internationally   | boolean NOT NULL     | DEFAULT false (forward hook)                                                                      |
| tailoring_available     | boolean NOT NULL     | DEFAULT false (forward hook)                                                                      |
| lead_time_days          | integer NULL         | made-to-order lead time (forward hook)                                                            |
| status                  | text NOT NULL        | DEFAULT 'draft'; CHECK IN (draft, active, out_of_stock, archived)                                 |
| display_order           | integer NOT NULL     | DEFAULT 0                                                                                         |
| created_at / updated_at | timestamptz NOT NULL | DEFAULT now()                                                                                     |

Indexes: `products_vendor_profile_id_idx (vendor_profile_id)`, partial
`products_active_idx (status) WHERE status = 'active'`.

### `product_variants`

| column            | type                 | notes                              |
| ----------------- | -------------------- | ---------------------------------- |
| id                | uuid PK              | `gen_random_uuid()`                |
| product_id        | uuid FK              | → `products(id)` ON DELETE CASCADE |
| size_label        | text NOT NULL        |                                    |
| sku               | text NULL            |                                    |
| price_delta_cents | integer NOT NULL     | DEFAULT 0                          |
| stock_quantity    | integer NOT NULL     | DEFAULT 0; CHECK >= 0              |
| display_order     | integer NOT NULL     | DEFAULT 0                          |
| created_at        | timestamptz NOT NULL | DEFAULT now()                      |

Index: `product_variants_product_id_idx (product_id)`.

`updated_at` is kept fresh by the **app layer** (services set it on write) —
mirroring `packages`, which has no DB trigger. This deliberately does not adopt
the trigger-driven `update_updated_at_column()` used by the older tables.

## Gating

The Shop is **bridal_wear-only** in this prototype. Enforced in the **service
layer** (`createProduct`): it first reads the vendor profile's `category`; if it
is not `'bridal_wear'` it returns `{ error: 'Shop is only available to bridal
wear vendors', status: 403 }` before any insert. This is an app-layer concern —
the DB does not constrain product ownership by category (matching how category
gating lives in the app elsewhere).

## Deferred (explicitly NOT in this slice)

- **Checkout / payments** — no Stripe wiring, no cart, no orders table. Products
  are a catalog only.
- **Carrier / shipping APIs** — `ships_internationally` is an inert boolean hook.
- **Tailoring / measurement UI** — `tailoring_available` + `lead_time_days` are
  inert hooks; no measurement capture.
- **Product search** — no semantic/full-text indexing of products; browse is
  simple filtering only.
- **UI: pages / components** — WS-2 and WS-3.

## Verification (WS-1)

`npm run typecheck` + `npm run lint` clean. Dev DB migration apply + psql smoke
(schema, FKs, insert/select) — see WS-1 self-assessment.
