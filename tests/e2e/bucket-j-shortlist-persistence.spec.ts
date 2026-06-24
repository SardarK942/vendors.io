// tests/e2e/bucket-j-shortlist-persistence.spec.ts
//
// Spec 6: Shortlist persists across sessions.
// heart vendor → log out → log in → /dashboard/saved shows vendor → unheart → empty state.
//
// Selector adaptations:
// - TestVendor uses `vendorSlug` (not `slug`) and has no `businessName` field;
//   business_name in DB is always 'E2E Test Vendor'.
// - VendorCard wraps in <Link data-vendor-slug={slug}> so we locate by vendorSlug.
// - Heart button aria-label: "Save vendor" / "Unsave vendor".
// - Empty state text: "No saved vendors yet" (h2).
import { test, expect } from '@playwright/test';
import { seedCouple, seedVendor, cleanup, type TestUser, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket J — shortlist persists across sessions', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple);
    await cleanup(vendor);
    couple = null;
    vendor = null;
  });

  test('heart vendor → log out → log in → still hearted → unheart removes', async ({ browser }) => {
    couple = await seedCouple({ markOnboardingComplete: true });
    vendor = await seedVendor({ chargesEnabled: false, publish: true });

    // Session 1 — log in and heart the vendor
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await loginAs(page1, couple);
    await page1.goto('/vendors');

    const vendorCard1 = page1.locator(`[data-vendor-slug="${vendor.vendorSlug}"]`);
    await expect(vendorCard1).toBeVisible({ timeout: 15_000 });

    const heartBtn1 = vendorCard1.locator('button[aria-label="Save vendor"]').first();
    await heartBtn1.click();

    // Wait for optimistic update + API persist (button toggles to "Unsave vendor" on success)
    await expect(vendorCard1.locator('button[aria-label="Unsave vendor"]')).toBeVisible({
      timeout: 5_000,
    });
    // Extra settle time for the API to complete
    await page1.waitForTimeout(1_000);
    await ctx1.close();

    // Session 2 — fresh context (no stored auth) → log back in
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await loginAs(page2, couple);

    // Saved page should list the hearted vendor
    await page2.goto('/dashboard/saved');
    // The vendor's business_name is 'E2E Test Vendor'
    await expect(page2.getByText('E2E Test Vendor')).toBeVisible({ timeout: 10_000 });

    // Unheart from saved page — the VendorCard heart button is now "Unsave vendor"
    const unsaveBtn = page2.locator('button[aria-label="Unsave vendor"]').first();
    await expect(unsaveBtn).toBeVisible({ timeout: 5_000 });
    await unsaveBtn.click();

    // Wait for the button to toggle back to "Save vendor" indicating the DELETE completed
    await expect(page2.locator('button[aria-label="Save vendor"]').first()).toBeVisible({
      timeout: 5_000,
    });

    // Reload → empty state (SSR re-queries getSavedVendorsForUser)
    await page2.reload();
    await expect(page2.getByText(/no saved vendors yet/i)).toBeVisible({ timeout: 8_000 });

    await ctx2.close();
  });
});
