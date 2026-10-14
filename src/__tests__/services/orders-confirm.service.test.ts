import { describe, it, expect, vi, beforeEach } from 'vitest';

const piCapture = vi.hoisted(() => vi.fn());
const piCancel = vi.hoisted(() => vi.fn());
const piRetrieve = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/client', () => ({
  stripe: { paymentIntents: { capture: piCapture, cancel: piCancel, retrieve: piRetrieve } },
}));

import { confirmOrder, declineOrder, autoVoidExpired } from '@/services/orders.service';
import { computeEscrowNetCents } from '@/lib/shop/money';

type Row = Record<string, unknown>;

function fakeOrderClient(seed: {
  orders?: Row[];
  items?: Row[];
  variants?: Record<string, { product_id: string; stock: number }>;
  productStatus?: string;
  ledgerError?: { code?: string; message: string };
}) {
  const tables: Record<string, Row[]> = {
    orders: (seed.orders ?? []).map((o) => ({ ...o })),
    order_items: (seed.items ?? []).map((o) => ({ ...o })),
    vendor_stripe_accounts: [{ vendor_profile_id: 'vp1', stripe_account_id: 'acct_v1' }],
    vendor_ledger: [],
    products: Array.from(new Set(Object.values(seed.variants ?? {}).map((v) => v.product_id))).map(
      (id) => ({ id, status: seed.productStatus ?? 'active' })
    ),
    product_variants: Object.entries(seed.variants ?? {}).map(([id, v]) => ({
      id,
      product_id: v.product_id,
      stock_quantity: v.stock,
    })),
  };
  const updates: Record<string, Row[]> = {};

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let mode: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let insertRows: Row[] = [];
    const run = () => {
      const rows = tables[table] ?? (tables[table] = []);
      if (mode === 'insert') {
        if (table === 'vendor_ledger' && seed.ledgerError)
          return { data: null, error: seed.ledgerError };
        rows.push(...insertRows);
        return { data: insertRows, error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') {
        matched.forEach((r) => Object.assign(r, patch));
        (updates[table] ??= []).push(patch);
      }
      return { data: matched, error: null };
    };
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      lt: (c: string, v: string) => (filters.push((r) => (r[c] as string) < v), b),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
      update: (p: Row) => ((mode = 'update'), (patch = p), b),
      insert: (v: Row | Row[]) => ((mode = 'insert'), (insertRows = Array.isArray(v) ? v : [v]), b),
      maybeSingle: async () => ({ data: (run().data ?? [])[0] ?? null, error: null }),
      single: async () => ({ data: (run().data ?? [])[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return b;
  }
  return {
    tables,
    from: (t: string) => builder(t),
    updated: (t: string) => updates[t] ?? [],
  };
}

const order = (over: Row = {}): Row => ({
  id: 'o1',
  vendor_profile_id: 'vp1',
  status: 'pending_confirmation',
  charge_mode: 'escrow',
  stripe_payment_intent_id: 'pi_1',
  item_subtotal_cents: 10000,
  shipping_cents: 500,
  commission_cents: 1000,
  ...over,
});

beforeEach(() => {
  piCapture.mockReset().mockResolvedValue({});
  piCancel.mockReset().mockResolvedValue({});
  piRetrieve.mockReset().mockResolvedValue({ status: 'requires_capture' });
});

describe('confirmOrder', () => {
  it('captures escrow PI, confirms, inserts held ledger row', async () => {
    const c = fakeOrderClient({ orders: [order()] });
    const r = await confirmOrder(c as never, 'o1');
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ status: 'confirmed' });
    expect(piCapture).toHaveBeenCalledWith('pi_1', { idempotencyKey: 'order:o1:capture' });
    expect(c.tables.orders[0].status).toBe('confirmed');
    expect(c.tables.orders[0].confirmed_at).toBeTruthy();
    expect(c.tables.vendor_ledger).toHaveLength(1);
    expect(c.tables.vendor_ledger[0]).toMatchObject({
      vendor_profile_id: 'vp1',
      order_id: 'o1',
      gross_cents: 10500,
      commission_cents: 1000,
      stripe_fee_cents: 0,
      status: 'held',
      net_vendor_cents: computeEscrowNetCents({
        subtotalCents: 10000,
        shippingCents: 500,
        commissionCents: 1000,
        stripeFeeCents: 0,
      }),
    });
  });

  it('direct mode captures on the vendor connected account, no ledger', async () => {
    const c = fakeOrderClient({ orders: [order({ charge_mode: 'direct' })] });
    const r = await confirmOrder(c as never, 'o1');
    expect(r.status).toBe(200);
    expect(piCapture).toHaveBeenCalledWith('pi_1', {
      idempotencyKey: 'order:o1:capture',
      stripeAccount: 'acct_v1',
    });
    expect(c.tables.vendor_ledger).toHaveLength(0);
  });

  it('already confirmed -> 409, no capture', async () => {
    const c = fakeOrderClient({ orders: [order({ status: 'confirmed' })] });
    const r = await confirmOrder(c as never, 'o1');
    expect(r.status).toBe(409);
    expect(piCapture).not.toHaveBeenCalled();
  });

  it('capture failure keeps order pending and returns 502', async () => {
    piCapture.mockRejectedValue(new Error('payment_intent_unexpected_state'));
    const c = fakeOrderClient({ orders: [order({ charge_mode: 'direct' })] });
    const r = await confirmOrder(c as never, 'o1');
    expect(r.status).toBe(502);
    expect(c.tables.orders[0].status).toBe('pending_confirmation');
    expect(c.updated('orders').find((u) => u.status === 'confirmed')).toBeUndefined();
    expect(c.tables.vendor_ledger).toHaveLength(0);
  });
});

describe('confirmOrder ledger ordering', () => {
  it('tolerates duplicate ledger insert (23505) and still confirms', async () => {
    const c = fakeOrderClient({
      orders: [order()],
      ledgerError: { code: '23505', message: 'dup' },
    });
    const r = await confirmOrder(c as never, 'o1');
    expect(r.data).toEqual({ status: 'confirmed' });
    expect(c.tables.orders[0].status).toBe('confirmed');
  });

  it('ledger failure leaves order pending and returns an error', async () => {
    const c = fakeOrderClient({
      orders: [order()],
      ledgerError: { code: 'XX000', message: 'db down' },
    });
    const r = await confirmOrder(c as never, 'o1');
    expect(r.error).toBeTruthy();
    expect(r.data).toBeUndefined();
    expect(c.tables.orders[0].status).toBe('pending_confirmation');
  });
});

describe('declineOrder', () => {
  const seed = () =>
    fakeOrderClient({
      orders: [order()],
      items: [
        {
          order_id: 'o1',
          variant_id: 'v1',
          product_id: 'p1',
          quantity: 2,
          customization_type: null,
        },
        {
          order_id: 'o1',
          variant_id: 'v2',
          product_id: 'p1',
          quantity: 1,
          customization_type: 'made_to_measure',
        },
      ],
      variants: { v1: { product_id: 'p1', stock: 0 }, v2: { product_id: 'p1', stock: 0 } },
      productStatus: 'out_of_stock',
    });

  it('cancels PI, restores non-MTM stock, reactivates product, sets cancelled', async () => {
    const c = seed();
    const r = await declineOrder(c as never, 'o1', 'vendor_declined');
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ status: 'cancelled' });
    expect(piCancel).toHaveBeenCalledWith('pi_1', { idempotencyKey: 'order:o1:cancel' });
    expect(c.tables.product_variants.find((v) => v.id === 'v1')?.stock_quantity).toBe(2);
    expect(c.tables.product_variants.find((v) => v.id === 'v2')?.stock_quantity).toBe(0);
    expect(c.tables.products[0].status).toBe('active');
    expect(c.tables.orders[0]).toMatchObject({
      status: 'cancelled',
      cancel_reason: 'vendor_declined',
    });
    expect(c.tables.orders[0].cancelled_at).toBeTruthy();
  });

  it('non-pending -> 409, no cancel', async () => {
    const c = fakeOrderClient({ orders: [order({ status: 'cancelled' })] });
    const r = await declineOrder(c as never, 'o1');
    expect(r.status).toBe(409);
    expect(piCancel).not.toHaveBeenCalled();
  });

  it('cancel failure -> 502 and stays pending, stock untouched', async () => {
    piCancel.mockRejectedValue(new Error('boom'));
    const c = seed();
    const r = await declineOrder(c as never, 'o1');
    expect(r.status).toBe(502);
    expect(c.tables.orders[0].status).toBe('pending_confirmation');
    expect(c.tables.product_variants.find((v) => v.id === 'v1')?.stock_quantity).toBe(0);
  });

  it('already-canceled PI is treated as success', async () => {
    piCancel.mockRejectedValue(new Error('payment_intent_unexpected_state'));
    piRetrieve.mockResolvedValue({ status: 'canceled' });
    const c = seed();
    const r = await declineOrder(c as never, 'o1');
    expect(r.status).toBe(200);
    expect(c.tables.orders[0].status).toBe('cancelled');
    expect(c.tables.product_variants.find((v) => v.id === 'v1')?.stock_quantity).toBe(2);
  });

  it('direct mode cancels on connected account', async () => {
    const c = fakeOrderClient({ orders: [order({ charge_mode: 'direct' })] });
    await declineOrder(c as never, 'o1');
    expect(piCancel).toHaveBeenCalledWith('pi_1', {
      idempotencyKey: 'order:o1:cancel',
      stripeAccount: 'acct_v1',
    });
  });
});

describe('autoVoidExpired', () => {
  it('voids only overdue pending orders', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 100000).toISOString();
    const c = fakeOrderClient({
      orders: [
        order({ id: 'o1', confirm_deadline_at: past }),
        order({ id: 'o2', confirm_deadline_at: future }),
        order({ id: 'o3', confirm_deadline_at: past, status: 'confirmed' }),
      ],
    });
    const r = await autoVoidExpired(c as never);
    expect(r.data).toEqual({ voided: 1 });
    expect(c.tables.orders.find((o) => o.id === 'o1')).toMatchObject({
      status: 'cancelled',
      cancel_reason: 'auto_void_timeout',
    });
    expect(c.tables.orders.find((o) => o.id === 'o2')?.status).toBe('pending_confirmation');
  });
});
