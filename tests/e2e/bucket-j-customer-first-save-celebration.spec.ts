// tests/e2e/bucket-j-customer-first-save-celebration.spec.ts
//
// Spec 3: First heart → ❤️ confetti toast; second heart → silent.
//
// Selector adaptations:
// - VendorCard renders <Link data-vendor-slug={slug}> wrapping the card.
// - Heart button is `button[aria-label="Save vendor"]` or "Unsave vendor" (toggled).
// - Toast text is: `❤️ First save! Find ${vendorName} in your Saved →`
//   so we match getByText(/first save/i) and getByText(/❤️/).
import { test, expect } from '@playwright/test';
import { seedCouple, seedVendor, cleanup, type TestUser, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket J — first save confetti toast', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple);
    await cleanup(vendor);
    couple = null;
    vendor = null;
  });

  test('first heart → ❤️ confetti toast; second heart → silent', async ({ browser }) => {
    couple = await seedCouple({ markOnboardingComplete: true });
    vendor = await seedVendor({ chargesEnabled: false, publish: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, couple);

    await page.goto('/vendors');

    // Wait for vendor grid to load — the vendor card for our seeded vendor
    const vendorCard = page.locator(`[data-vendor-slug="${vendor.vendorSlug}"]`);
    await expect(vendorCard).toBeVisible({ timeout: 15_000 });

    // Save heart button — inside the vendor card
    const heartBtn = vendorCard.locator('button[aria-label="Save vendor"]').first();
    await expect(heartBtn).toBeVisible({ timeout: 5_000 });
    await heartBtn.click();

    // First save toast should appear with ❤️ emoji
    await expect(page.getByText(/first save/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/❤️/)).toBeVisible({ timeout: 5_000 });

    // Wait for the first toast to auto-dismiss (sonner duration: 6 seconds)
    await expect(page.getByText(/first save/i)).not.toBeVisible({ timeout: 10_000 });

    // Unheart — button now shows "Unsave vendor"
    const unsaveBtn = vendorCard.locator('button[aria-label="Unsave vendor"]').first();
    await expect(unsaveBtn).toBeVisible({ timeout: 3_000 });
    await unsaveBtn.click();

    // Re-heart — should NOT show "First save" toast again
    const saveBtn2 = vendorCard.locator('button[aria-label="Save vendor"]').first();
    await expect(saveBtn2).toBeVisible({ timeout: 3_000 });
    await saveBtn2.click();

    // Wait briefly for any potential toast
    await page.waitForTimeout(1_500);

    // The "First save" toast should not be present a second time
    const firstSaveToasts = await page.getByText(/first save/i).count();
    expect(firstSaveToasts).toBe(0);

    await ctx.close();
  });
});
