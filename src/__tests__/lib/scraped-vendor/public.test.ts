import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../../../lib/supabase/server';
import { getUnclaimedBySlug, listUnclaimed } from '../../../lib/scraped-vendor/public';

const skip = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_TAG = `__public_test_${Date.now()}__`;

describe.skipIf(skip)('public scraped vendor reads (integration)', () => {
  const fakeSlug = `e2e-public-test-${Date.now()}`;

  beforeEach(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').insert({
      source: 'hand_curated',
      business_name: 'E2E Public Test Cart',
      category: 'carts',
      tags: [TEST_TAG],
      city: 'Chicago',
      state: 'IL',
      photos: ['https://example.test/x.jpg'],
      raw: {},
      slug: fakeSlug,
    });
  });

  afterEach(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').delete().contains('tags', [TEST_TAG]);
  });

  it('getUnclaimedBySlug returns the row', async () => {
    const row = await getUnclaimedBySlug(fakeSlug);
    expect(row).not.toBeNull();
    expect(row?.business_name).toBe('E2E Public Test Cart');
  });

  it('getUnclaimedBySlug returns null for missing slugs', async () => {
    const row = await getUnclaimedBySlug('does-not-exist-zzz');
    expect(row).toBeNull();
  });

  it('listUnclaimed includes the test row when filtered by category', async () => {
    const rows = await listUnclaimed({ category: 'carts', city: 'Chicago', limit: 60 });
    expect(rows.find((r) => r.slug === fakeSlug)).toBeDefined();
  });

  it('getUnclaimedBySlug returns null after the row is claimed', async () => {
    const supabase = await createServiceRoleClient();
    await supabase
      .from('scraped_vendors')
      .update({ claimed_at: new Date().toISOString() })
      .eq('slug', fakeSlug);
    const row = await getUnclaimedBySlug(fakeSlug);
    expect(row).toBeNull();
  });
});
