import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

vi.mock('@/lib/stripe/client', () => ({
  stripe: { transfers: { create: vi.fn() }, paymentIntents: { retrieve: vi.fn() } },
}));
import { stripe } from '@/lib/stripe/client';
import { transferHeldEarnings } from '@/services/escrow-transfer.service';

// Minimal supabase stub: one account row + held ledger rows, capturing the CAS update.
function makeDb(opts: {
  account: { stripe_account_id: string; payouts_enabled: boolean } | null;
  held: Array<{
    id: string;
    order_id: string;
    net_vendor_cents: number;
    source_charge_id: string | null;
  }>;
}) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const db = {
    from(table: string) {
      if (table === 'vendor_stripe_accounts') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.account }) }) }),
        };
      }
      if (table === 'vendor_ledger') {
        return {
          select: () => ({ eq: () => ({ eq: async () => ({ data: opts.held }) }) }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_c: string, id: string) => ({
              eq: () => ({
                select: async () => {
                  updates.push({ id, patch });
                  return { data: [{ id }], error: null };
                },
              }),
            }),
          }),
        };
      }
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { stripe_payment_intent_id: 'pi_x' } }),
            }),
          }),
        };
      }
      throw new Error('unexpected table ' + table);
    },
  } as never;
  return { db, updates };
}

beforeEach(() => vi.clearAllMocks());

it('transfers each held row with source_transaction + idempotency key, then stamps it', async () => {
  (stripe.transfers.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tr_1' });
  const { db, updates } = makeDb({
    account: { stripe_account_id: 'acct_1', payouts_enabled: true },
    held: [{ id: 'L1', order_id: 'o1', net_vendor_cents: 90000, source_charge_id: 'ch_1' }],
  });
  const res = await transferHeldEarnings(db, 'v1');
  expect(stripe.transfers.create).toHaveBeenCalledWith(
    expect.objectContaining({
      amount: 90000,
      currency: 'usd',
      destination: 'acct_1',
      source_transaction: 'ch_1',
    }),
    { idempotencyKey: 'escrow-transfer:L1' }
  );
  expect(updates[0].patch).toMatchObject({ status: 'transferred', stripe_transfer_id: 'tr_1' });
  expect(res).toMatchObject({ transferredCount: 1, transferredCents: 90000, failed: 0 });
});

it('no-op when not payouts-enabled', async () => {
  const { db } = makeDb({
    account: { stripe_account_id: 'acct_1', payouts_enabled: false },
    held: [{ id: 'L1', order_id: 'o1', net_vendor_cents: 1, source_charge_id: 'ch_1' }],
  });
  const res = await transferHeldEarnings(db, 'v1');
  expect(stripe.transfers.create).not.toHaveBeenCalled();
  expect(res.transferredCount).toBe(0);
});

it('no-op when no account row', async () => {
  const { db } = makeDb({ account: null, held: [] });
  await transferHeldEarnings(db, 'v1');
  expect(stripe.transfers.create).not.toHaveBeenCalled();
});

it('transfer failure leaves the row held (no stamp) and counts as failed', async () => {
  (stripe.transfers.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('stripe down'));
  const { db, updates } = makeDb({
    account: { stripe_account_id: 'acct_1', payouts_enabled: true },
    held: [{ id: 'L1', order_id: 'o1', net_vendor_cents: 90000, source_charge_id: 'ch_1' }],
  });
  const res = await transferHeldEarnings(db, 'v1');
  expect(updates).toHaveLength(0);
  expect(res).toMatchObject({ transferredCount: 0, failed: 1 });
});

it('resolves source_transaction from the PI when source_charge_id is null', async () => {
  (stripe.transfers.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tr_2' });
  (stripe.paymentIntents.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
    latest_charge: 'ch_resolved',
  });
  const { db } = makeDb({
    account: { stripe_account_id: 'acct_1', payouts_enabled: true },
    held: [{ id: 'L2', order_id: 'o2', net_vendor_cents: 5000, source_charge_id: null }],
  });
  await transferHeldEarnings(db, 'v1');
  expect(stripe.transfers.create).toHaveBeenCalledWith(
    expect.objectContaining({ source_transaction: 'ch_resolved' }),
    { idempotencyKey: 'escrow-transfer:L2' }
  );
});
