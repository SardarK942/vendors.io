import { describe, it, expect } from 'vitest';
import {
  computeCommissionCents,
  computeOrderAmounts,
  computeEscrowNetCents,
  resolveChargeMode,
} from '@/lib/shop/money';

describe('shop money', () => {
  it('commission is 10% of subtotal, rounded', () => {
    expect(computeCommissionCents(2720_00)).toBe(272_00);
    expect(computeCommissionCents(99_99)).toBe(1000); // round(999.9)
  });
  it('total adds shipping + tax; commission excludes them', () => {
    const r = computeOrderAmounts({ subtotalCents: 2720_00, shippingCents: 0, taxCents: 238_00 });
    expect(r.commissionCents).toBe(272_00);
    expect(r.totalCents).toBe(2720_00 + 238_00);
  });
  it('escrow net = subtotal - commission + shipping - stripe fee, tax excluded', () => {
    expect(
      computeEscrowNetCents({
        subtotalCents: 2720_00,
        shippingCents: 0,
        commissionCents: 272_00,
        stripeFeeCents: 80_00,
      })
    ).toBe(2720_00 - 272_00 - 80_00);
  });
  it('charge mode follows charges_enabled', () => {
    expect(resolveChargeMode(true)).toBe('direct');
    expect(resolveChargeMode(false)).toBe('escrow');
  });
});
