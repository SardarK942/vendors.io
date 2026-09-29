-- ============================================================================
-- Shop prototype · Slice 1 · catalog + inventory (bridal_wear only)
-- Create products + product_variants tables
-- ============================================================================
-- This introduces a new *physical-goods* product line for the marketplace: a
-- bridal/groom wear "Shop" where bridal_wear vendors list garments (sarees,
-- lehengas, sherwanis, …) with sizes + stock, distinct from the existing
-- service-booking `packages` model.
--
-- WHY it's separate from packages: packages are time/headcount-priced SERVICES
-- booked via the request→quote→deposit flow. Products are inventoried goods
-- with per-size stock. Different pricing axis, different fulfillment.
--
-- PROTOTYPE SCOPE: this is a catalog + inventory foundation only. It is NOT
-- wired to payments/checkout, carrier/shipping APIs, tailoring measurement, or
-- product search — those are explicitly deferred (see spec §Deferred). The
-- `ships_internationally` / `tailoring_available` / `lead_time_days` columns are
-- forward hooks for later phases and carry inert defaults today.
--
-- Mirrors the packages/package_addons shapes (parent + child, cascade delete,
-- vendor-scoped RLS) and the archetype `attributes jsonb` display-chip pattern
-- from 00079. Gating to bridal_wear vendors is enforced in the service layer
-- (products.service.ts createProduct), not in SQL — the DB permits any vendor
-- to own a row, matching how category is an app-layer concern elsewhere.
--
-- updated_at: mirrors `packages` exactly — kept fresh by the app layer
-- (services set updated_at on write); no DB trigger, deliberately matching the
-- template table rather than the trigger-driven legacy tables (00006).
--
-- See docs/superpowers/specs/2026-09-25-shop-slice-1-catalog-inventory.md

-- ---------------------------------------------------------------------------
-- products (parent) — mirrors packages
-- ---------------------------------------------------------------------------
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  garment_type text NOT NULL CHECK (garment_type IN (
    'saree','lehenga','bridal_gown','sherwani','groom_suit','kurta','anarkali','accessories','other'
  )),
  base_price_cents integer NOT NULL CHECK (base_price_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  -- UploadThing URLs; index 0 = primary (same convention as
  -- vendor_profiles.portfolio_images).
  images text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- Cloudflare Stream uids (optional short clips).
  video_uids text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- Free-form display chips (color / fabric / work-type).
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Forward hooks for a later phase; inert defaults today.
  ships_internationally boolean NOT NULL DEFAULT false,
  tailoring_available boolean NOT NULL DEFAULT false,
  lead_time_days integer,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','active','out_of_stock','archived'
  )),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX products_vendor_profile_id_idx ON products(vendor_profile_id);
CREATE INDEX products_active_idx ON products(status) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- product_variants (child) — sizes + stock; mirrors package_addons
-- ---------------------------------------------------------------------------
CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size_label text NOT NULL,
  sku text,
  price_delta_cents integer NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_variants_product_id_idx ON product_variants(product_id);

-- ---------------------------------------------------------------------------
-- RLS — products (mirrors packages RLS in 00021 + vendor_profiles admin policy)
-- ---------------------------------------------------------------------------
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors manage own products" ON products
  FOR ALL TO authenticated
  USING (vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid()))
  WITH CHECK (vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Anyone views active products" ON products
  FOR SELECT
  USING (status = 'active');

CREATE POLICY "Admins can manage all products" ON products
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- RLS — product_variants (scoped through the parent product)
-- ---------------------------------------------------------------------------
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors manage own product variants" ON product_variants
  FOR ALL TO authenticated
  USING (product_id IN (
    SELECT p.id FROM products p
    JOIN vendor_profiles vp ON vp.id = p.vendor_profile_id
    WHERE vp.user_id = auth.uid()
  ))
  WITH CHECK (product_id IN (
    SELECT p.id FROM products p
    JOIN vendor_profiles vp ON vp.id = p.vendor_profile_id
    WHERE vp.user_id = auth.uid()
  ));

CREATE POLICY "Anyone views variants of active products" ON product_variants
  FOR SELECT
  USING (product_id IN (SELECT id FROM products WHERE status = 'active'));
