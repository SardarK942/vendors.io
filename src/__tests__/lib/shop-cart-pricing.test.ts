import { describe, it, expect } from 'vitest';
import { computeBoutiqueSummary, isReadyToCheckout } from '@/lib/shop/cart-pricing';

const base = { stockQuantity: 5, isMadeToMeasure: false, measurementResolved: true };

describe('computeBoutiqueSummary', () => {
  it('sums unit price x quantity', () => {
    const s = computeBoutiqueSummary([
      { ...base, variantId: 'a', unitPriceCents: 2400_00, quantity: 1 },
      { ...base, variantId: 'b', unitPriceCents: 320_00, quantity: 2 },
    ]);
    expect(s.subtotalCents).toBe(2400_00 + 320_00 * 2);
  });
  it('flags an out-of-stock line and blocks checkout', () => {
    const s = computeBoutiqueSummary([
      { ...base, variantId: 'a', unitPriceCents: 100, quantity: 2, stockQuantity: 1 },
    ]);
    expect(s.outOfStockVariantIds).toEqual(['a']);
    expect(isReadyToCheckout(s)).toBe(false);
  });
  it('flags an unresolved MTM line and blocks checkout', () => {
    const s = computeBoutiqueSummary([
      {
        ...base,
        variantId: 'm',
        unitPriceCents: 100,
        quantity: 1,
        isMadeToMeasure: true,
        measurementResolved: false,
      },
    ]);
    expect(s.unresolvedMtmVariantIds).toEqual(['m']);
    expect(isReadyToCheckout(s)).toBe(false);
  });
  it('MTM lines ignore stock (made to order)', () => {
    const s = computeBoutiqueSummary([
      {
        ...base,
        variantId: 'm',
        unitPriceCents: 100,
        quantity: 9,
        stockQuantity: 0,
        isMadeToMeasure: true,
      },
    ]);
    expect(s.outOfStockVariantIds).toEqual([]);
  });
});
