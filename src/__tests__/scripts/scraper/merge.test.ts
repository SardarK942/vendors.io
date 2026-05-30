import { afterEach, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../../../lib/supabase/server';
import { mergeRowsToScrapedVendors } from '../../../../scripts/scraper/merge';
import type { ScrapedRow } from '../../../../scripts/scraper/lib/schemas';

const skip = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(skip)('mergeRowsToScrapedVendors (integration)', () => {
  const TEST_TAG = `__merge_test_${Date.now()}__`;

  afterEach(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').delete().contains('tags', [TEST_TAG]);
  });

  it('inserts new rows', async () => {
    const row: ScrapedRow = {
      source: 'hand_curated',
      business_name: 'Merge Test Cart',
      category: 'carts',
      tags: [TEST_TAG],
      city: 'Chicago',
      state: 'IL',
      instagram_handle: `mergetest_${Date.now()}`,
      photos: [],
      raw: {},
    };
    const result = await mergeRowsToScrapedVendors([row]);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('updates existing rows on IG-handle conflict', async () => {
    const handle = `mergetest_dup_${Date.now()}`;
    const base: ScrapedRow = {
      source: 'hand_curated',
      business_name: 'First Name',
      category: 'carts',
      tags: [TEST_TAG],
      city: 'Chicago',
      state: 'IL',
      instagram_handle: handle,
      photos: [],
      raw: { v: 1 },
    };
    await mergeRowsToScrapedVendors([base]);
    const updated: ScrapedRow = { ...base, business_name: 'Updated Name', raw: { v: 2 } };
    const result = await mergeRowsToScrapedVendors([updated]);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);

    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('scraped_vendors')
      .select('business_name')
      .eq('instagram_handle', handle)
      .single();
    expect(data?.business_name).toBe('Updated Name');
  });
});
