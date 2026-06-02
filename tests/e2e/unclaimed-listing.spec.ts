import { test, expect } from '@playwright/test';
import { createServiceRoleClient } from '../../src/lib/supabase/server';

test.describe('unclaimed listing surface', () => {
  let scrapedVendorId: string | null = null;
  let slug: string | null = null;

  test.afterEach(async () => {
    if (scrapedVendorId) {
      const supabase = await createServiceRoleClient();
      await supabase
        .from('scraped_vendor_engagement')
        .delete()
        .eq('scraped_vendor_id', scrapedVendorId);
      await supabase
        .from('scraped_vendor_requests')
        .delete()
        .eq('scraped_vendor_id', scrapedVendorId);
      await supabase.from('scraped_vendors').delete().eq('id', scrapedVendorId);
      scrapedVendorId = null;
      slug = null;
    }
  });

  async function seedUnclaimed(): Promise<{ id: string; slug: string }> {
    const supabase = await createServiceRoleClient();
    const s = `e2e-unclaimed-${Date.now()}`;
    const { data } = await supabase
      .from('scraped_vendors')
      .insert({
        source: 'hand_curated',
        business_name: 'E2E Unclaimed Cart',
        category: 'carts',
        tags: ['__e2e_unclaimed__'],
        city: 'Chicago',
        state: 'IL',
        instagram_handle: 'e2eunclaimedcart',
        photos: ['https://placehold.co/600x400'],
        raw: {},
        slug: s,
      })
      .select('id, slug')
      .single();
    return { id: data!.id, slug: data!.slug };
  }

  test('unclaimed listing renders + view event fires', async ({ page }) => {
    const seed = await seedUnclaimed();
    scrapedVendorId = seed.id;
    slug = seed.slug;

    await page.goto(`/vendors/${slug}`);
    await expect(page.getByRole('heading', { name: /E2E Unclaimed Cart/i })).toBeVisible();
    await expect(page.getByText(/hasn't joined Baazar/i)).toBeVisible();

    // Server-side track fires from useEffect; allow a moment
    await page.waitForTimeout(500);
    const supabase = await createServiceRoleClient();
    const { data: views } = await supabase
      .from('scraped_vendor_engagement')
      .select('event_type')
      .eq('scraped_vendor_id', seed.id)
      .eq('event_type', 'view');
    expect((views ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test('IG handle click logs ig_click event + reveals handle', async ({ page }) => {
    const seed = await seedUnclaimed();
    scrapedVendorId = seed.id;
    slug = seed.slug;

    await page.goto(`/vendors/${slug}`);
    const button = page.getByRole('button', { name: /Show on Instagram/i });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByText(/@e2eunclaimedcart/i)).toBeVisible();

    await page.waitForTimeout(500);
    const supabase = await createServiceRoleClient();
    const { data: clicks } = await supabase
      .from('scraped_vendor_engagement')
      .select('event_type')
      .eq('scraped_vendor_id', seed.id)
      .eq('event_type', 'ig_click');
    expect((clicks ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test('"I own this business" → remove submits to /request', async ({ page }) => {
    const seed = await seedUnclaimed();
    scrapedVendorId = seed.id;
    slug = seed.slug;

    await page.goto(`/vendors/${slug}`);
    await page.getByRole('button', { name: /I own this business/i }).click();
    await page.getByLabel(/Remove my listing/i).check();
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.getByLabel(/^Email$/i).fill('e2e@example.com');
    await page.getByRole('button', { name: /Send removal request/i }).click();
    await expect(page.getByText(/Removal request sent/i)).toBeVisible();

    const supabase = await createServiceRoleClient();
    const { data: requests } = await supabase
      .from('scraped_vendor_requests')
      .select('action, requester_email')
      .eq('scraped_vendor_id', seed.id);
    expect(requests).toHaveLength(1);
    expect(requests![0].action).toBe('remove');
    expect(requests![0].requester_email).toBe('e2e@example.com');
  });
});
