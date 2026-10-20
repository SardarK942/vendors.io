import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stripe/client', () => ({
  stripe: { paymentIntents: { retrieve: vi.fn() } },
}));
import { stripe } from '@/lib/stripe/client';
import { ensureEscrowLedgerForTest as ensureEscrowLedger } from '@/services/orders.service';

const ESCROW_ORDER = {
  id: 'o1',
  vendor_profile_id: 'v1',
  charge_mode: 'escrow',
  item_subtotal_cents: 100000,
  shipping_cents: 2000,
  commission_cents: 10000,
  stripe_payment_intent_id: 'pi_1',
} as unknown as import('@/services/orders.service').PendingOrder;

function dbWithInsertSpy() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  return { db: { from: () => ({ insert }) } as never, insert };
}

describe('ensureEscrowLedger source_charge_id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stamps the supplied charge id', async () => {
    const { db, insert } = dbWithInsertSpy();
    await ensureEscrowLedger(db, ESCROW_ORDER, 'ch_supplied');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ source_charge_id: 'ch_supplied' })
    );
  });

  it('falls back to the PI latest_charge when not supplied', async () => {
    (stripe.paymentIntents.retrieve as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      latest_charge: 'ch_fallback',
    });
    const { db, insert } = dbWithInsertSpy();
    await ensureEscrowLedger(db, ESCROW_ORDER);
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_1');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ source_charge_id: 'ch_fallback' })
    );
  });
});
