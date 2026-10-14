// src/__tests__/services/cart.service.test.ts
import { describe, it, expect } from 'vitest';
import { addItem, updateItem, getCartsForBuyer } from '@/services/cart.service';

type Row = Record<string, unknown> | null;
interface TableCfg {
  one?: Row; // result of maybeSingle()/single()
  many?: Row[]; // result of awaiting the chain directly
}

// Generic chainable fake: every filter method returns the chain; maybeSingle/single
// resolve `one`; awaiting the chain resolves `many`. Writes are recorded.
function fakeCartClient(tables: Record<string, TableCfg>) {
  const writes: Array<{ table: string; op: string; value: unknown }> = [];
  const client = {
    writes,
    from(table: string) {
      const cfg = tables[table] ?? {};
      const chain: Record<string, unknown> = {};
      let inserted = false;
      const passthrough = () => chain;
      for (const m of ['select', 'eq', 'in', 'order']) chain[m] = passthrough;
      chain.maybeSingle = async () => ({ data: cfg.one ?? null, error: null });
      chain.single = async () => ({
        data: inserted ? { id: `new-${table}` } : (cfg.one ?? null),
        error: null,
      });
      chain.then = (res: (v: unknown) => unknown) => res({ data: cfg.many ?? [], error: null });
      chain.insert = (v: unknown) => {
        writes.push({ table, op: 'insert', value: v });
        inserted = true;
        return chain;
      };
      chain.update = (v: unknown) => {
        writes.push({ table, op: 'update', value: v });
        return chain;
      };
      chain.delete = () => {
        writes.push({ table, op: 'delete', value: null });
        return chain;
      };
      return chain;
    },
  };
  return client as unknown as Parameters<typeof addItem>[0] & { writes: typeof writes };
}

const localBridalProduct = {
  id: 'p1',
  status: 'active',
  vendor_profile_id: 'v1',
  vendor: { category: 'bridal_wear', vendor_origin: 'local' },
};

describe('addItem — gating', () => {
  it('rejects a product whose vendor is not local bridal with 403', async () => {
    const c = fakeCartClient({
      products: {
        one: {
          ...localBridalProduct,
          vendor: { category: 'bridal_wear', vendor_origin: 'international' },
        },
      },
    });
    const r = await addItem(c, 'u1', { productId: 'p1', variantId: 'var1', quantity: 1 });
    expect(r.status).toBe(403);
    expect(c.writes).toHaveLength(0);
  });

  it('rejects an inactive product with 403', async () => {
    const c = fakeCartClient({ products: { one: { ...localBridalProduct, status: 'draft' } } });
    const r = await addItem(c, 'u1', { productId: 'p1', variantId: 'var1', quantity: 1 });
    expect(r.status).toBe(403);
  });

  it('adds a new line for a local bridal product', async () => {
    const c = fakeCartClient({
      products: { one: localBridalProduct },
      product_variants: { one: { id: 'var1', product_id: 'p1' } },
      carts: { one: { id: 'c1' } },
      cart_items: { one: null },
    });
    const r = await addItem(c, 'u1', { productId: 'p1', variantId: 'var1', quantity: 2 });
    expect(r.status).toBe(201);
    expect(c.writes.some((w) => w.table === 'cart_items' && w.op === 'insert')).toBe(true);
  });
});

describe('updateItem — measurement profile attach', () => {
  const base = {
    cart_items: { one: { id: 'ci1', product_id: 'p1', cart: { user_id: 'u1' } } },
    products: { one: { garment_type: 'lehenga' } },
  };

  it('rejects a profile for the wrong garment with 400', async () => {
    const c = fakeCartClient({
      ...base,
      user_measurement_profiles: { one: { id: 'mp1', user_id: 'u1', garment: 'sherwani' } },
    });
    const r = await updateItem(c, 'u1', 'ci1', { measurement_profile_id: 'mp1' });
    expect(r.status).toBe(400);
  });

  it('rejects a profile not owned by the buyer with 403', async () => {
    const c = fakeCartClient({
      ...base,
      user_measurement_profiles: {
        one: { id: 'mp1', user_id: 'someone-else', garment: 'lehenga' },
      },
    });
    const r = await updateItem(c, 'u1', 'ci1', { measurement_profile_id: 'mp1' });
    expect(r.status).toBe(403);
  });

  it('rejects an item in another buyer cart with 403', async () => {
    const c = fakeCartClient({
      ...base,
      cart_items: { one: { id: 'ci1', product_id: 'p1', cart: { user_id: 'other' } } },
    });
    const r = await updateItem(c, 'u1', 'ci1', { quantity: 2 });
    expect(r.status).toBe(403);
  });

  it('attaches a matching owned profile', async () => {
    const c = fakeCartClient({
      ...base,
      user_measurement_profiles: { one: { id: 'mp1', user_id: 'u1', garment: 'lehenga' } },
    });
    const r = await updateItem(c, 'u1', 'ci1', { measurement_profile_id: 'mp1' });
    expect(r.status).toBe(200);
    expect(c.writes.some((w) => w.op === 'update')).toBe(true);
  });
});

describe('getCartsForBuyer', () => {
  it('groups by boutique and flags unresolved made-to-measure lines', async () => {
    const c = fakeCartClient({
      carts: {
        many: [
          {
            id: 'c1',
            vendor_profile_id: 'v1',
            vendor: { business_name: 'Boutique A' },
            items: [
              {
                id: 'ci1',
                variant_id: 'var1',
                quantity: 2,
                measurement_profile_id: null,
                product: {
                  id: 'p1',
                  title: 'Red Lehenga',
                  base_price_cents: 100000,
                  garment_type: 'lehenga',
                  customization_types: ['made_to_measure'],
                },
                variant: {
                  id: 'var1',
                  size_label: 'M',
                  price_delta_cents: 5000,
                  stock_quantity: 0,
                },
              },
            ],
          },
        ],
      },
    });
    const r = await getCartsForBuyer(c, 'u1');
    expect(r.status).toBe(200);
    const cart = r.data![0];
    expect(cart.vendorName).toBe('Boutique A');
    expect(cart.subtotalCents).toBe(210000);
    expect(cart.ready).toBe(false);
    expect(cart.lines[0].measurementResolved).toBe(false);
  });
});
