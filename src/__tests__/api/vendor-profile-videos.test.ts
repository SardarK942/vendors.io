import { describe, it, expect } from 'vitest';
import { vendorProfileUpdateSchema } from '@/app/api/vendor-profile/schema';

describe('vendorProfileUpdateSchema portfolio_videos', () => {
  it('accepts up to 3 video uids', () => {
    const r = vendorProfileUpdateSchema.safeParse({ portfolio_videos: ['a', 'b', 'c'] });
    expect(r.success).toBe(true);
  });

  it('rejects more than 3 video uids', () => {
    const r = vendorProfileUpdateSchema.safeParse({ portfolio_videos: ['a', 'b', 'c', 'd'] });
    expect(r.success).toBe(false);
  });

  it('accepts subcategories: null (categories without a subcategory taxonomy)', () => {
    const r = vendorProfileUpdateSchema.safeParse({
      business_name: 'Mehndi By Priya',
      subcategories: null,
    });
    expect(r.success).toBe(true);
  });
});
