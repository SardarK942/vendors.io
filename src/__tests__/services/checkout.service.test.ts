import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BoutiqueCart, CartLineView } from '@/services/cart.service';

const sessionsCreate = vi.fn();
const sessionsExpire = vi.fn();
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: (...a: unknown[]) => sessionsCreate(...a),
        expire: (...a: unknown[]) => sessionsExpire(...a),
      },
    },
  },
}));

const getCartsForBuyer = vi.fn();
vi.mock('@/services/cart.service', () => ({
  getCartsForBuyer: (...a: unknown[]) => getCartsForBuyer(...a),
}));

import { createCheckoutSession } from '@/services/checkout.service';

function line(over: Partial<CartLineView> = {}): CartLineView {
  return {
    cartItemId: 'ci1',
    productId: 'p1',
    title: 'Red Lehenga',
    sizeLabel: 'M',
    garmentType: 'lehenga',
    measurementProfileId: null,
    imageUrl: null,
    variantId: 'v1',
    unitPriceCents: 1360_00,
    quantity: 2,
    stockQuantity: 5,
    isMadeToMeasure: false,
    measurementResolved: true,
    ...over,
  };
}

function cart(lines: CartLineView[], ready = true): BoutiqueCart {
  return {
    vendorProfileId: 'vp1',
    vendorName: 'Boutique',
    lines,
    subtotalCents: lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0),
    ready,
    offersPickup: true,
    offersShipping: true,
    shippingFeeCents: 0,
  };
}

function fakeClients(opts: {
  chargesEnabled: boolean | null;
  accountId?: string;
  shippingFee?: number;
  insertError?: { code: string; message: string };
  noProfiles?: boolean;
}) {
  const inserts: Array<Record<string, unknown>> = [];
  const rls = {
    from(table: string) {
      if (table === 'vendor_profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { shop_shipping_fee_cents: opts.shippingFee ?? 0 },
              }),
            }),
          }),
        };
      }
      // user_measurement_profiles
      return {
        select: () => ({
          in: async () => ({
            data: opts.noProfiles ? [] : [{ id: 'mp1', unit: 'in', measurements: { bust: 36 } }],
            error: null,
          }),
        }),
      };
    },
  };
  const svc = {
    from(table: string) {
      if (table === 'vendor_stripe_accounts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  opts.chargesEnabled === null
                    ? null
                    : {
                        stripe_account_id: opts.accountId ?? 'acct_1',
                        charges_enabled: opts.chargesEnabled,
                      },
              }),
            }),
          }),
        };
      }
      return {
        insert: async (v: Record<string, unknown>) => {
          inserts.push(v);
          return { error: opts.insertError ?? null };
        },
      };
    },
  };
  return {
    inserts,
    rls: rls as unknown as Parameters<typeof createCheckoutSession>[0],
    svc: svc as unknown as Parameters<typeof createCheckoutSession>[1],
  };
}

const input = { vendor_profile_id: 'vp1', fulfillment_type: 'pickup' as const };

describe('createCheckoutSession', () => {
  beforeEach(() => {
    sessionsCreate.mockReset();
    sessionsExpire.mockReset();
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.test';
    getCartsForBuyer.mockReset();
    sessionsCreate.mockResolvedValue({ id: 'cs_1', url: 'https://stripe/x' });
  });

  it('returns 409 and never calls stripe for an unready cart', async () => {
    getCartsForBuyer.mockResolvedValue({
      data: [cart([line({ quantity: 9 })], false)],
      status: 200,
    });
    const c = fakeClients({ chargesEnabled: true });
    const r = await createCheckoutSession(c.rls, c.svc, 'u1', input);
    expect(r.status).toBe(409);
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(c.inserts).toHaveLength(0);
  });

  it('returns 404 when the buyer has no cart for the vendor', async () => {
    getCartsForBuyer.mockResolvedValue({ data: [], status: 200 });
    const c = fakeClients({ chargesEnabled: true });
    const r = await createCheckoutSession(c.rls, c.svc, 'u1', input);
    expect(r.status).toBe(404);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('builds a direct-charge session on the connected account with a 10% app fee', async () => {
    getCartsForBuyer.mockResolvedValue({
      data: [cart([line({ unitPriceCents: 1360_00, quantity: 2 })])],
      status: 200,
    });
    const c = fakeClients({ chargesEnabled: true, accountId: 'acct_1' });
    const r = await createCheckoutSession(c.rls, c.svc, 'u1', input);
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ url: 'https://stripe/x' });
    const [params, opts] = sessionsCreate.mock.calls[0];
    expect(opts.stripeAccount).toBe('acct_1');
    expect(params.payment_intent_data.capture_method).toBe('manual');
    expect(params.payment_intent_data.application_fee_amount).toBe(272_00);
    expect(params.automatic_tax).toEqual({ enabled: true });
    expect(params.line_items[0].price_data.unit_amount).toBe(1360_00);
    expect(params.shipping_address_collection).toBeUndefined();
    expect(c.inserts[0].charge_mode).toBe('direct');
    expect(c.inserts[0].commission_cents).toBe(272_00);
  });

  it('builds an escrow session (no stripeAccount, no app fee) for non-charge-enabled vendors', async () => {
    getCartsForBuyer.mockResolvedValue({ data: [cart([line()])], status: 200 });
    const c = fakeClients({ chargesEnabled: false });
    const r = await createCheckoutSession(c.rls, c.svc, 'u1', input);
    expect(r.status).toBe(200);
    const [params, opts] = sessionsCreate.mock.calls[0];
    expect(opts.stripeAccount).toBeUndefined();
    expect(params.payment_intent_data.application_fee_amount).toBeUndefined();
    expect(params.payment_intent_data.capture_method).toBe('manual');
    expect(c.inserts[0].charge_mode).toBe('escrow');
    expect(c.inserts[0].commission_cents).toBe(272_00);
  });

  it('adds shipping collection + flat rate for ship fulfillment', async () => {
    getCartsForBuyer.mockResolvedValue({ data: [cart([line()])], status: 200 });
    const c = fakeClients({ chargesEnabled: false, shippingFee: 15_00 });
    await createCheckoutSession(c.rls, c.svc, 'u1', { ...input, fulfillment_type: 'ship' });
    const [params] = sessionsCreate.mock.calls[0];
    expect(params.shipping_address_collection).toEqual({ allowed_countries: ['US'] });
    expect(params.shipping_options[0].shipping_rate_data.fixed_amount.amount).toBe(15_00);
    expect(c.inserts[0].shipping_cents).toBe(15_00);
  });

  it('persists a checkout_snapshots row with frozen lines and MTM measurement snapshot', async () => {
    getCartsForBuyer.mockResolvedValue({
      data: [
        cart([
          line(),
          line({
            variantId: 'v2',
            productId: 'p2',
            title: 'Blouse',
            isMadeToMeasure: true,
            measurementProfileId: 'mp1',
            quantity: 1,
            unitPriceCents: 200_00,
          }),
        ]),
      ],
      status: 200,
    });
    const c = fakeClients({ chargesEnabled: true });
    await createCheckoutSession(c.rls, c.svc, 'u1', input);
    const row = c.inserts[0];
    expect(row.stripe_checkout_session_id).toBe('cs_1');
    expect(row.buyer_user_id).toBe('u1');
    expect(row.vendor_profile_id).toBe('vp1');
    expect(row.subtotal_cents).toBe(2 * 1360_00 + 200_00);
    const lines = row.lines as Array<Record<string, unknown>>;
    expect(lines[0]).toMatchObject({
      variant_id: 'v1',
      product_id: 'p1',
      name: 'Red Lehenga',
      variant_label: 'M',
      unit_price_cents: 1360_00,
      quantity: 2,
      customization_type: 'standard_size',
      measurement_snapshot: null,
    });
    expect(lines[1]).toMatchObject({
      variant_id: 'v2',
      customization_type: 'made_to_measure',
      measurement_snapshot: { unit: 'in', measurements: { bust: 36 } },
    });
  });

  it('returns 409 for an unresolved made-to-measure cart without calling stripe', async () => {
    getCartsForBuyer.mockResolvedValue({
      data: [cart([line({ isMadeToMeasure: true, measurementResolved: false })], false)],
      status: 200,
    });
    const c = fakeClients({ chargesEnabled: true });
    const r = await createCheckoutSession(c.rls, c.svc, 'u1', input);
    expect(r.status).toBe(409);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('returns 409 before stripe when an MTM measurement profile cannot be found', async () => {
    getCartsForBuyer.mockResolvedValue({
      data: [cart([line({ isMadeToMeasure: true, measurementProfileId: 'mp1' })])],
      status: 200,
    });
    const c = fakeClients({ chargesEnabled: true, noProfiles: true });
    const r = await createCheckoutSession(c.rls, c.svc, 'u1', input);
    expect(r.status).toBe(409);
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(c.inserts).toHaveLength(0);
  });

  it('treats a duplicate snapshot (23505) as an idempotent retry and returns the url', async () => {
    getCartsForBuyer.mockResolvedValue({ data: [cart([line()])], status: 200 });
    const c = fakeClients({
      chargesEnabled: false,
      insertError: { code: '23505', message: 'duplicate key' },
    });
    const r = await createCheckoutSession(c.rls, c.svc, 'u1', input);
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ url: 'https://stripe/x' });
    expect(sessionsExpire).not.toHaveBeenCalled();
  });

  it('expires the session and returns 502 on a non-duplicate snapshot failure', async () => {
    getCartsForBuyer.mockResolvedValue({ data: [cart([line()])], status: 200 });
    sessionsExpire.mockRejectedValue(new Error('already expired'));
    const c = fakeClients({
      chargesEnabled: true,
      accountId: 'acct_1',
      insertError: { code: 'XX000', message: 'boom' },
    });
    const r = await createCheckoutSession(c.rls, c.svc, 'u1', input);
    expect(r.status).toBe(502);
    expect(sessionsExpire).toHaveBeenCalledWith('cs_1', {}, { stripeAccount: 'acct_1' });
  });

  it('includes charge mode and account in the idempotency key', async () => {
    getCartsForBuyer.mockResolvedValue({ data: [cart([line()])], status: 200 });
    const c = fakeClients({ chargesEnabled: true, accountId: 'acct_1' });
    await createCheckoutSession(c.rls, c.svc, 'u1', input);
    expect(sessionsCreate.mock.calls[0][1].idempotencyKey).toMatch(
      /^checkout:u1:vp1:direct-acct_1:/
    );
  });
});
