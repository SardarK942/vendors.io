import { test, expect } from '@playwright/test';
import { createServiceRoleClient } from '../../src/lib/supabase/server';
import { mintTokenString, hashTokenString } from '../../scripts/scraper/lib/claim-token';
import { seedCouple, cleanup, type TestUser } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('claim flow', () => {
  let user: TestUser | null = null;
  let scrapedVendorId: string | null = null;

  test.afterEach(async () => {
    if (user) await cleanup(user);
    user = null;
    if (scrapedVendorId) {
      const supabase = await createServiceRoleClient();
      await supabase.from('scraped_vendors').delete().eq('id', scrapedVendorId);
      await supabase.from('claim_tokens').delete().eq('scraped_vendor_id', scrapedVendorId);
      scrapedVendorId = null;
    }
  });

  async function seedScrapedVendor(): Promise<string> {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('scraped_vendors')
      .insert({
        source: 'hand_curated',
        business_name: 'E2E Test Cart',
        category: 'carts',
        tags: ['__e2e_claim__'],
        city: 'Chicago',
        state: 'IL',
        photos: [],
        raw: {},
      })
      .select('id')
      .single();
    if (!data) throw new Error('seedScrapedVendor failed');
    return data.id;
  }

  test('valid token → redirects to setup with profile created', async ({ page }) => {
    scrapedVendorId = await seedScrapedVendor();
    user = await seedCouple();
    const token = mintTokenString(scrapedVendorId);
    const supabase = await createServiceRoleClient();
    await supabase.from('claim_tokens').insert({
      scraped_vendor_id: scrapedVendorId,
      token_hash: hashTokenString(token),
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    });
    await loginAs(page, user);
    await page.goto(`/claim/${token}`);
    await expect(page).toHaveURL(/\/dashboard\/profile\/setup/);
  });

  test('expired token → renders expired error', async ({ page }) => {
    scrapedVendorId = await seedScrapedVendor();
    user = await seedCouple();
    const token = mintTokenString(scrapedVendorId);
    const supabase = await createServiceRoleClient();
    await supabase.from('claim_tokens').insert({
      scraped_vendor_id: scrapedVendorId,
      token_hash: hashTokenString(token),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    await loginAs(page, user);
    await page.goto(`/claim/${token}`);
    await expect(page.getByText(/expired/i)).toBeVisible();
  });

  test('invalid token → renders invalid error', async ({ page }) => {
    user = await seedCouple();
    await loginAs(page, user);
    await page.goto('/claim/garbage-token-12345');
    await expect(page.getByText(/not valid/i)).toBeVisible();
  });

  test('unauthenticated → redirects to signup with return_to', async ({ page }) => {
    scrapedVendorId = await seedScrapedVendor();
    const token = mintTokenString(scrapedVendorId);
    const supabase = await createServiceRoleClient();
    await supabase.from('claim_tokens').insert({
      scraped_vendor_id: scrapedVendorId,
      token_hash: hashTokenString(token),
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    });
    await page.goto(`/claim/${token}`);
    await expect(page).toHaveURL(/\/signup\?return_to=/);
  });
});
