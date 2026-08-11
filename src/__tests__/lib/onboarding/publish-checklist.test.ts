import { describe, it, expect } from 'vitest';
import { getPublishBlockers } from '@/lib/onboarding/publish-checklist';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

// A profile that satisfies every publish requirement. Cast through unknown —
// the test only exercises the fields getPublishBlockers reads.
const complete = {
  business_name: 'Kulfi Cart Co.',
  category: 'carts',
  bio: 'Mobile kulfi and chai carts for South Asian weddings.',
  instagram_handle: 'kulficartco',
  portfolio_images: ['https://utfs.io/f/a.jpg'],
  languages: ['english', 'hindi'],
  years_in_business: 4,
  response_sla_hours: 24,
  base_address_line_1: null,
  base_address_skipped: true,
} as unknown as VendorRow;

describe('getPublishBlockers', () => {
  it('returns no blockers for a complete profile', () => {
    expect(getPublishBlockers(complete)).toEqual([]);
  });

  it('does NOT block on a missing address (optional)', () => {
    const p = { ...complete, base_address_line_1: null, base_address_skipped: false } as VendorRow;
    expect(getPublishBlockers(p)).toEqual([]);
  });

  it('blocks on an empty bio → basics', () => {
    const p = { ...complete, bio: '' } as VendorRow;
    const b = getPublishBlockers(p);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ field: 'bio', step: 'basics' });
  });

  it('blocks on a missing instagram handle → online', () => {
    const p = { ...complete, instagram_handle: null } as VendorRow;
    expect(getPublishBlockers(p)).toEqual([
      { field: 'instagram_handle', label: 'Add your Instagram handle', step: 'online' },
    ]);
  });

  it('blocks on an invalid instagram handle', () => {
    const p = { ...complete, instagram_handle: 'not a handle!' } as VendorRow;
    expect(getPublishBlockers(p).map((x) => x.field)).toContain('instagram_handle');
  });

  it('blocks on zero portfolio images → portfolio', () => {
    const p = { ...complete, portfolio_images: [] } as VendorRow;
    expect(getPublishBlockers(p)).toEqual([
      { field: 'portfolio_images', label: 'Upload at least one photo', step: 'portfolio' },
    ]);
  });

  it('blocks on missing languages, years, and response time → details', () => {
    const p = {
      ...complete,
      languages: [],
      years_in_business: null,
      response_sla_hours: 0,
    } as unknown as VendorRow;
    const steps = getPublishBlockers(p).map((x) => x.field);
    expect(steps).toEqual(['languages', 'years_in_business', 'response_sla_hours']);
  });

  it('accumulates multiple blockers in step order', () => {
    const p = { ...complete, bio: '', portfolio_images: [] } as VendorRow;
    expect(getPublishBlockers(p).map((x) => x.field)).toEqual(['bio', 'portfolio_images']);
  });
});
