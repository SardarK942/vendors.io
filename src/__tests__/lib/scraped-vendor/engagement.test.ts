import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../../../lib/supabase/server';
import { logEngagement } from '../../../lib/scraped-vendor/engagement';

const skip = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_TAG = `__engagement_test_${Date.now()}__`;
const TEST_IP = '127.0.0.1';

describe.skipIf(skip)('logEngagement (integration)', () => {
  let vendorId: string;

  beforeEach(async () => {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('scraped_vendors')
      .insert({
        source: 'hand_curated',
        business_name: 'Engagement Test Cart',
        category: 'carts',
        tags: [TEST_TAG],
        city: 'Chicago',
        state: 'IL',
        photos: [],
        raw: {},
        slug: `engagement-test-${Date.now()}`,
      })
      .select('id')
      .single();
    vendorId = data!.id;
  });

  afterEach(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').delete().contains('tags', [TEST_TAG]);
  });

  it('records a view event', async () => {
    await logEngagement(vendorId, 'view', TEST_IP, 'Mozilla/5.0');
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('scraped_vendor_engagement')
      .select('event_type, ip_hash')
      .eq('scraped_vendor_id', vendorId);
    expect(data?.length).toBe(1);
    expect(data![0].event_type).toBe('view');
  });

  it('dedupes same IP+UA+day for the same event type', async () => {
    await logEngagement(vendorId, 'view', TEST_IP, 'Mozilla/5.0');
    await logEngagement(vendorId, 'view', TEST_IP, 'Mozilla/5.0');
    await logEngagement(vendorId, 'view', TEST_IP, 'Mozilla/5.0');
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('scraped_vendor_engagement')
      .select('id')
      .eq('scraped_vendor_id', vendorId)
      .eq('event_type', 'view');
    expect(data?.length).toBe(1);
  });

  it('different event types from same IP do NOT dedupe', async () => {
    await logEngagement(vendorId, 'view', TEST_IP, 'Mozilla/5.0');
    await logEngagement(vendorId, 'ig_click', TEST_IP, 'Mozilla/5.0');
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('scraped_vendor_engagement')
      .select('event_type')
      .eq('scraped_vendor_id', vendorId);
    expect(data?.length).toBe(2);
  });
});
