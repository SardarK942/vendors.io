import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../../../lib/supabase/server';
import { findMatches } from '../../../lib/scraped-vendor/match';

const skip = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_TAG = `__match_test_${Date.now()}__`;

describe.skipIf(skip)('findMatches (integration)', () => {
  beforeAll(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').insert([
      {
        source: 'hand_curated',
        business_name: 'Premium Chai Wallah',
        city: 'Chicago',
        state: 'IL',
        instagram_handle: 'premiumchaiwallah',
        tags: [TEST_TAG],
        photos: [],
        raw: {},
      },
      {
        source: 'hand_curated',
        business_name: 'Chai Cart Chicago',
        city: 'Chicago',
        state: 'IL',
        phone: '+13125559999',
        tags: [TEST_TAG],
        photos: [],
        raw: {},
      },
    ]);
  });

  afterAll(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').delete().contains('tags', [TEST_TAG]);
  });

  it('matches on exact IG handle', async () => {
    const matches = await findMatches({
      businessName: '',
      city: '',
      instagramHandle: 'premiumchaiwallah',
      phone: null,
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].business_name).toBe('Premium Chai Wallah');
  });

  it('matches on phone', async () => {
    const matches = await findMatches({
      businessName: '',
      city: '',
      instagramHandle: null,
      phone: '+13125559999',
    });
    expect(matches.find((m) => m.business_name === 'Chai Cart Chicago')).toBeDefined();
  });

  it('matches on fuzzy name+city via trigram', async () => {
    const matches = await findMatches({
      businessName: 'Premium Chai Walla', // missing trailing "h"
      city: 'Chicago',
      instagramHandle: null,
      phone: null,
    });
    expect(matches.find((m) => m.business_name === 'Premium Chai Wallah')).toBeDefined();
  });

  it('returns empty for no signals', async () => {
    const matches = await findMatches({
      businessName: '',
      city: '',
      instagramHandle: null,
      phone: null,
    });
    expect(matches).toEqual([]);
  });

  it('excludes already-claimed rows', async () => {
    const supabase = await createServiceRoleClient();
    await supabase
      .from('scraped_vendors')
      .update({ claimed_at: new Date().toISOString() })
      .eq('instagram_handle', 'premiumchaiwallah');
    const matches = await findMatches({
      businessName: '',
      city: '',
      instagramHandle: 'premiumchaiwallah',
      phone: null,
    });
    expect(matches.length).toBe(0);
  });
});
