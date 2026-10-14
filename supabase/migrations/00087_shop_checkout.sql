-- Shop SP2a: checkout core purchase path (carts, orders, ledger, snapshots)
-- + vendor fulfillment config. Additive only.

CREATE TABLE carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, vendor_profile_id)
);

CREATE TABLE cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  measurement_profile_id uuid NULL REFERENCES user_measurement_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id uuid NOT NULL REFERENCES auth.users(id),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id),
  status text NOT NULL DEFAULT 'pending_confirmation'
    CHECK (status IN ('pending_confirmation','confirmed','cancelled')),
  stripe_payment_intent_id text UNIQUE,
  stripe_checkout_session_id text UNIQUE,
  charge_mode text NOT NULL CHECK (charge_mode IN ('direct','escrow')),
  item_subtotal_cents integer NOT NULL,
  shipping_cents integer NOT NULL DEFAULT 0,
  tax_cents integer NOT NULL DEFAULT 0,
  commission_cents integer NOT NULL,
  total_cents integer NOT NULL,
  fulfillment_type text NOT NULL CHECK (fulfillment_type IN ('pickup','ship')),
  shipping_address jsonb NULL,
  confirm_deadline_at timestamptz NOT NULL,
  confirmed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  cancel_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  product_name_snapshot text NOT NULL,
  variant_label_snapshot text NULL,
  unit_price_cents integer NOT NULL,
  quantity integer NOT NULL,
  line_subtotal_cents integer NOT NULL,
  customization_type text NULL,
  measurement_snapshot jsonb NULL
);

CREATE TABLE vendor_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  gross_cents integer NOT NULL,
  commission_cents integer NOT NULL,
  stripe_fee_cents integer NOT NULL DEFAULT 0,
  net_vendor_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','transferred')),
  transferred_at timestamptz NULL,
  stripe_transfer_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE checkout_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_checkout_session_id text NOT NULL UNIQUE,
  buyer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  charge_mode text NOT NULL CHECK (charge_mode IN ('direct','escrow')),
  fulfillment_type text NOT NULL CHECK (fulfillment_type IN ('pickup','ship')),
  lines jsonb NOT NULL,
  subtotal_cents integer NOT NULL,
  shipping_cents integer NOT NULL,
  commission_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendor_profiles
  ADD COLUMN shop_offers_pickup boolean NOT NULL DEFAULT true,
  ADD COLUMN shop_offers_shipping boolean NOT NULL DEFAULT false,
  ADD COLUMN shop_shipping_fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN shop_pickup_note text NULL;

CREATE INDEX cart_items_cart_idx ON cart_items(cart_id);
CREATE INDEX orders_vendor_status_idx ON orders(vendor_profile_id, status);
CREATE INDEX orders_buyer_idx ON orders(buyer_user_id);
CREATE INDEX order_items_order_idx ON order_items(order_id);
CREATE INDEX vendor_ledger_vendor_status_idx ON vendor_ledger(vendor_profile_id, status);

-- RLS
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers manage own carts" ON carts
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Buyers manage own cart items" ON cart_items
  FOR ALL TO authenticated
  USING (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()))
  WITH CHECK (cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid()));

CREATE POLICY "Buyer or vendor views order" ON orders
  FOR SELECT TO authenticated
  USING (
    buyer_user_id = auth.uid()
    OR vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  );
CREATE POLICY "Service role manages orders" ON orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Buyer or vendor views order items" ON order_items
  FOR SELECT TO authenticated
  USING (order_id IN (
    SELECT id FROM orders
    WHERE buyer_user_id = auth.uid()
      OR vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  ));
CREATE POLICY "Service role manages order items" ON order_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Vendors view own ledger" ON vendor_ledger
  FOR SELECT TO authenticated
  USING (vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Service role manages ledger" ON vendor_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- checkout_snapshots: RLS enabled, intentionally NO policies (service-role only).
