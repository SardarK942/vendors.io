// src/__tests__/services/orders-create.service.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/stripe/client', () => ({ stripe: { paymentIntents: {} } }));
const notifyShopOutOfStock = vi.fn();
vi.mock('@/services/shop-notifications.service', () => ({
  notifyShopOrderPlaced: vi.fn(),
  notifyShopOrderConfirmed: vi.fn(),
  notifyShopOrderCancelled: vi.fn(),
  notifyShopOutOfStock: (...a: unknown[]) => notifyShopOutOfStock(...a),
}));

import { createOrderFromSession, type ShippingAddress } from '@/services/orders.service';

type Row = Record<string, unknown>;

/**
 * In-memory fake modelling just enough of the supabase query builder:
 * select/eq/in filters, update (returns affected rows via .select()),
 * insert, delete, maybeSingle/single. Update/delete filters really apply, so
 * affected-row counts (the stock guard) behave like Postgres.
 */
function fakeOrderClient(seed: {
  snapshot?: Row | null;
  variants?: Record<string, { product_id: string; stock: number }>;
  existingOrder?: boolean;
  failOrderItems?: boolean;
}) {
  const tables: Record<string, Row[]> = {
    checkout_snapshots: seed.snapshot ? [{ ...seed.snapshot }] : [],
    orders: seed.existingOrder ? [{ id: 'o_existing', stripe_checkout_session_id: 'cs_1' }] : [],
    order_items: [],
    carts: [{ id: 'c1', user_id: 'u1', vendor_profile_id: 'vp1' }],
    products: Array.from(new Set(Object.values(seed.variants ?? {}).map((v) => v.product_id))).map(
      (id) => ({ id, status: 'active' })
    ),
    product_variants: Object.entries(seed.variants ?? {}).map(([id, v]) => ({
      id,
      product_id: v.product_id,
      stock_quantity: v.stock,
    })),
  };
  const inserted: Record<string, Row[]> = {};
  const stockWrites: Array<{ id: unknown; value: unknown }> = [];

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let mode: 'select' | 'update' | 'delete' | 'insert' = 'select';
    let patch: Row = {};
    let insertRows: Row[] = [];
    let wantRows = false;

    const run = (): { data: Row[] | null; error: { message: string } | null } => {
      const rows = tables[table] ?? (tables[table] = []);
      if (mode === 'insert') {
        if (table === 'order_items' && seed.failOrderItems)
          return { data: null, error: { message: 'boom' } };
        const withIds = insertRows.map((r, i) => ({ id: `${table}_${rows.length + i + 1}`, ...r }));
        rows.push(...withIds);
        (inserted[table] ??= []).push(...withIds);
        return { data: withIds, error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') {
        matched.forEach((r) => {
          Object.assign(r, patch);
          if (table === 'product_variants' && 'stock_quantity' in patch)
            stockWrites.push({ id: r.id, value: patch.stock_quantity });
        });
        return { data: matched, error: null };
      }
      if (mode === 'delete') {
        tables[table] = rows.filter((r) => !matched.includes(r));
        return { data: matched, error: null };
      }
      return { data: matched, error: null };
    };

    const b = {
      select: () => {
        wantRows = true;
        return b;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return b;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]));
        return b;
      },
      update: (p: Row) => {
        mode = 'update';
        patch = p;
        return b;
      },
      delete: () => {
        mode = 'delete';
        return b;
      },
      insert: (v: Row | Row[]) => {
        mode = 'insert';
        insertRows = Array.isArray(v) ? v : [v];
        return b;
      },
      maybeSingle: async () => {
        const r = run();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      single: async () => {
        const r = run();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      then: (resolve: (v: unknown) => unknown) => {
        void wantRows;
        return Promise.resolve(run()).then(resolve);
      },
    };
    return b;
  }

  return {
    tables,
    stockWrites,
    from: (t: string) => builder(t),
    inserted: (t: string) => inserted[t] ?? [],
    stock: (id: string) =>
      tables.product_variants.find((v) => v.id === id)?.stock_quantity as number,
  };
}

function snapshot(lines: Row[]): Row {
  return {
    id: 's1',
    stripe_checkout_session_id: 'cs_1',
    buyer_user_id: 'u1',
    vendor_profile_id: 'vp1',
    charge_mode: 'escrow',
    fulfillment_type: 'ship',
    lines,
    subtotal_cents: 10000,
    shipping_cents: 500,
    commission_cents: 800,
  };
}

const line = (variantId: string, qty: number, mtm = false): Row => ({
  variant_id: variantId,
  product_id: 'p1',
  name: 'Lehenga',
  variant_label: 'M',
  unit_price_cents: 5000,
  quantity: qty,
  customization_type: mtm ? 'made_to_measure' : 'standard',
  measurement_snapshot: mtm ? { bust: 36 } : null,
});

const args = {
  sessionId: 'cs_1',
  paymentIntentId: 'pi_1',
  chargeMode: 'escrow' as const,
  account: null,
  taxCents: 0,
  totalCents: 10500,
};
const call = (
  c: ReturnType<typeof fakeOrderClient>,
  extra: Partial<typeof args> & { shippingAddress?: ShippingAddress | null } = {}
) => createOrderFromSession(c as never, { ...args, ...extra });

describe('createOrderFromSession', () => {
  it('creates order + items, decrements non-MTM variants, clears snapshot and cart', async () => {
    const c = fakeOrderClient({
      snapshot: snapshot([line('v1', 2), line('v2', 1, true)]),
      variants: { v1: { product_id: 'p1', stock: 5 }, v2: { product_id: 'p1', stock: 0 } },
    });
    const before = Date.now();
    const r = await call(c);
    expect(r.status).toBe(201);
    expect(r.data).toHaveProperty('orderId');
    const [order] = c.inserted('orders');
    expect(order).toMatchObject({
      status: 'pending_confirmation',
      stripe_payment_intent_id: 'pi_1',
      stripe_checkout_session_id: 'cs_1',
      charge_mode: 'escrow',
      item_subtotal_cents: 10000,
      shipping_cents: 500,
      commission_cents: 800,
      total_cents: 10500,
      fulfillment_type: 'ship',
    });
    const deadline = new Date(order.confirm_deadline_at as string).getTime();
    expect(Math.abs(deadline - (before + 48 * 3600 * 1000))).toBeLessThan(60_000);
    const items = c.inserted('order_items');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      product_name_snapshot: 'Lehenga',
      variant_label_snapshot: 'M',
      line_subtotal_cents: 10000,
      quantity: 2,
    });
    expect(items[1]).toMatchObject({ measurement_snapshot: { bust: 36 } });
    expect(c.stock('v1')).toBe(3);
    expect(c.stock('v2')).toBe(0); // MTM never decrements
    expect(c.tables.checkout_snapshots).toHaveLength(0);
    expect(c.tables.carts).toHaveLength(0);
  });

  it('voids when a non-mtm line is short on stock, rolls back earlier decrements', async () => {
    const c = fakeOrderClient({
      snapshot: snapshot([line('v1', 2), line('v2', 2)]),
      variants: { v1: { product_id: 'p1', stock: 5 }, v2: { product_id: 'p1', stock: 1 } },
    });
    const r = await call(c);
    expect(r.data).toEqual({ voided: 'out_of_stock' });
    expect(c.inserted('orders')).toHaveLength(0);
    expect(c.stock('v1')).toBe(5);
    expect(c.stock('v2')).toBe(1);
    expect(c.stockWrites.length).toBeGreaterThan(0); // v1 was decremented then restored
    expect(notifyShopOutOfStock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ buyerUserId: 'u1', vendorProfileId: 'vp1' })
    );
  });

  it('does not throw if the out-of-stock notification fails', async () => {
    notifyShopOutOfStock.mockRejectedValueOnce(new Error('mail down'));
    const c = fakeOrderClient({
      snapshot: snapshot([line('v1', 2)]),
      variants: { v1: { product_id: 'p1', stock: 1 } },
    });
    const r = await call(c);
    expect(r.data).toEqual({ voided: 'out_of_stock' });
  });

  it('stores the shipping address for ship orders and null for pickup', async () => {
    const addr = {
      name: 'Asha Rao',
      address: {
        line1: '1 Main St',
        line2: null,
        city: 'Chicago',
        state: 'IL',
        postal_code: '60601',
        country: 'US',
      },
    };
    const c = fakeOrderClient({
      snapshot: snapshot([line('v1', 1)]),
      variants: { v1: { product_id: 'p1', stock: 5 } },
    });
    await call(c, { shippingAddress: addr });
    expect(c.inserted('orders')[0].shipping_address).toEqual(addr);

    const c2 = fakeOrderClient({
      snapshot: { ...snapshot([line('v1', 1)]), fulfillment_type: 'pickup' },
      variants: { v1: { product_id: 'p1', stock: 5 } },
    });
    await call(c2, { shippingAddress: addr });
    expect(c2.inserted('orders')[0].shipping_address).toBeNull();
  });

  it('stores charge_mode from the snapshot, not the event-derived mode', async () => {
    const c = fakeOrderClient({
      snapshot: { ...snapshot([line('v1', 1)]), charge_mode: 'direct' },
      variants: { v1: { product_id: 'p1', stock: 5 } },
    });
    await call(c, { chargeMode: 'escrow' });
    expect(c.inserted('orders')[0].charge_mode).toBe('direct');
  });

  it('is idempotent when an order already exists for the session', async () => {
    const c = fakeOrderClient({
      snapshot: snapshot([line('v1', 2)]),
      variants: { v1: { product_id: 'p1', stock: 5 } },
      existingOrder: true,
    });
    const r = await call(c);
    expect(r.data).toEqual({ skipped: 'duplicate' });
    expect(c.stock('v1')).toBe(5);
    expect(c.stockWrites).toHaveLength(0);
    expect(c.inserted('orders')).toHaveLength(0);
  });

  it('returns duplicate when the snapshot is already consumed', async () => {
    const c = fakeOrderClient({ snapshot: null });
    const r = await call(c);
    expect(r).toEqual({ data: { skipped: 'duplicate' }, status: 200 });
  });

  it('marks product out_of_stock when all variants reach zero', async () => {
    const c = fakeOrderClient({
      snapshot: snapshot([line('v1', 1)]),
      variants: { v1: { product_id: 'p1', stock: 1 }, v2: { product_id: 'p1', stock: 0 } },
    });
    await call(c);
    expect(c.tables.products[0].status).toBe('out_of_stock');
  });

  it('keeps product active while another variant has stock', async () => {
    const c = fakeOrderClient({
      snapshot: snapshot([line('v1', 1)]),
      variants: { v1: { product_id: 'p1', stock: 1 }, v2: { product_id: 'p1', stock: 4 } },
    });
    await call(c);
    expect(c.tables.products[0].status).toBe('active');
  });

  it('rolls back stock and removes the order if order_items insert fails', async () => {
    const c = fakeOrderClient({
      snapshot: snapshot([line('v1', 2)]),
      variants: { v1: { product_id: 'p1', stock: 5 } },
      failOrderItems: true,
    });
    const r = await call(c);
    expect(r.status).toBe(500);
    expect(c.stock('v1')).toBe(5);
    expect(c.tables.orders).toHaveLength(0);
  });

  it('stores Stripe-authoritative tax and total; other amounts come from the snapshot', async () => {
    const c = fakeOrderClient({
      snapshot: snapshot([line('v1', 2)]),
      variants: { v1: { product_id: 'p1', stock: 5 } },
    });
    await call(c, { taxCents: 1023, totalCents: 11523 });
    expect(c.inserted('orders')[0]).toMatchObject({
      tax_cents: 1023,
      total_cents: 11523,
      item_subtotal_cents: 10000,
      shipping_cents: 500,
      commission_cents: 800,
    });
  });
});
