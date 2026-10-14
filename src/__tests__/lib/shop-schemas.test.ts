import { describe, it, expect } from 'vitest';
import { addCartItemSchema, checkoutSchema } from '@/lib/shop/schemas';

describe('shop schemas', () => {
  it('accepts a valid add-item payload and defaults quantity to 1', () => {
    const r = addCartItemSchema.parse({ product_id: 'p1', variant_id: 'v1' });
    expect(r.quantity).toBe(1);
  });
  it('rejects quantity < 1', () => {
    expect(() =>
      addCartItemSchema.parse({ product_id: 'p1', variant_id: 'v1', quantity: 0 })
    ).toThrow();
  });
  it('rejects an unknown fulfillment_type', () => {
    expect(() =>
      checkoutSchema.parse({ vendor_profile_id: 'vp1', fulfillment_type: 'teleport' })
    ).toThrow();
  });
});
