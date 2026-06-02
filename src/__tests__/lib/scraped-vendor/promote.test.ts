import { afterEach, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../../../lib/supabase/server';
import { promoteScrapedVendor } from '../../../lib/scraped-vendor/promote';

const skip = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_TAG = `__promote_test_${Date.now()}__`;

describe.skipIf(skip)('promoteScrapedVendor (integration)', () => {
  afterEach(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').delete().contains('tags', [TEST_TAG]);
    await supabase.from('vendor_profiles').delete().like('business_name', 'Promote Test%');
  });

  it('copies scraped fields into a new vendor_profile, marks scraped row claimed', async () => {
    const supabase = await createServiceRoleClient();
    const {
      data: { user },
    } = await supabase.auth.admin.createUser({
      email: `promote-test-${Date.now()}@example.com`,
      password: 'TestPwd1!',
      email_confirm: true,
    });
    if (!user) throw new Error('seed user creation failed');

    // Also create the public.users row that vendor_profiles.user_id likely references.
    // Trigger handle_new_user usually does this on signup, but admin.createUser may skip it.
    await supabase.from('users').upsert({
      id: user.id,
      email: user.email!,
      role: 'vendor',
    });

    const { data: scraped } = await supabase
      .from('scraped_vendors')
      .insert({
        source: 'hand_curated',
        business_name: 'Promote Test Cart',
        slug: `promote-test-cart-${Date.now()}`,
        category: 'carts',
        tags: [TEST_TAG],
        city: 'Chicago',
        state: 'IL',
        instagram_handle: `promote_${Date.now()}`,
        bio: 'A test cart for promotion.',
        photos: ['https://cdn.test/x.jpg'],
        raw: {},
      })
      .select()
      .single();

    try {
      const profile = await promoteScrapedVendor(scraped!.id, user.id);

      expect(profile.business_name).toBe('Promote Test Cart');
      expect(profile.category).toBe('carts');
      expect(profile.user_id).toBe(user.id);

      const { data: refreshed } = await supabase
        .from('scraped_vendors')
        .select('claimed_at, claimed_vendor_profile_id')
        .eq('id', scraped!.id)
        .single();
      expect(refreshed?.claimed_at).not.toBeNull();
      expect(refreshed?.claimed_vendor_profile_id).toBe(profile.id);
    } finally {
      await supabase.auth.admin.deleteUser(user.id);
    }
  });

  it('throws when scraped row has null category', async () => {
    const supabase = await createServiceRoleClient();
    const {
      data: { user },
    } = await supabase.auth.admin.createUser({
      email: `promote-null-cat-${Date.now()}@example.com`,
      password: 'TestPwd1!',
      email_confirm: true,
    });
    if (!user) throw new Error('seed user creation failed');
    await supabase.from('users').upsert({ id: user.id, email: user.email!, role: 'vendor' });

    const { data: scraped } = await supabase
      .from('scraped_vendors')
      .insert({
        source: 'hand_curated',
        business_name: 'Promote Test NoCat',
        slug: `promote-test-nocat-${Date.now()}`,
        tags: [TEST_TAG],
        city: 'Chicago',
        state: 'IL',
        photos: [],
        raw: {},
      })
      .select()
      .single();

    try {
      await expect(promoteScrapedVendor(scraped!.id, user.id)).rejects.toThrow(/category/i);
    } finally {
      await supabase.auth.admin.deleteUser(user.id);
    }
  });
});
