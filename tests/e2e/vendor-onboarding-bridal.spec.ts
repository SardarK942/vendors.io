/**
 * Bridal-wear vendor onboarding — E2E spec.
 *
 * Bridal-wear vendors onboard into the Shop (products), not service Packages.
 * Two behaviours:
 *   1. The vendor sidebar "Shop" link is visible for a bridal-wear vendor even
 *      with NEXT_PUBLIC_SHOP_ENABLED unset (the flag was dropped for the vendor
 *      Shop link), and clicking it lands on the real "Your Shop" editor (not the
 *      non-bridal gate).
 *   2. Publishing as a bridal-wear vendor redirects to
 *      /dashboard/profile/shop?just_onboarded=1 (not /packages), and the shop
 *      page renders the "You're live" welcome state.
 *
 * Mirrors vendor-shop-editor.spec.ts (bridal seed) and vendor-onboarding.spec.ts
 * Test 1 (driving the wizard → publish). Google Places (Step 2) and UploadThing
 * (Step 5) are bypassed via authenticated PATCH calls, same as the onboarding
 * spec.
 */

import { test, expect } from '@playwright/test';
import { seedVendor, seedVendorWithPartialProfile, cleanup, type TestUser } from './helpers/seed';
import { loginAs } from './helpers/login';

// Shared location payload (no real Google Places needed) — mirrors vendor-onboarding.spec.ts.
const FAKE_LOCATION = {
  baseAddressLine1: '123 E2E Street',
  baseCity: 'Chicago',
  baseState: 'IL',
  basePostalCode: '60601',
  baseGooglePlaceId: 'ChIJe2eTestPlaceId',
  baseAddressPublic: false,
};

test.describe('bridal-wear vendor onboarding', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: Shop sidebar link visible (flag OFF) + reachable for bridal vendor
  // ──────────────────────────────────────────────────────────────────────────
  test('bridal-wear vendor sees the Shop link and reaches Your Shop', async ({ page }) => {
    let vendor: TestUser | null = null;
    try {
      vendor = await seedVendor({ publish: true, category: 'bridal_wear' });
      await loginAs(page, vendor);

      await page.goto('/dashboard');
      const sidebar = page.locator('[data-sidebar="sidebar"]');
      const shopLink = sidebar.getByRole('link', { name: /^Shop$/ });
      // Visible even though NEXT_PUBLIC_SHOP_ENABLED is unset in the e2e env.
      await expect(shopLink).toBeVisible({ timeout: 10_000 });

      // Retry the click → URL until it lands: a pre-hydration click on the
      // sidebar link can be a no-op before Next's client router attaches.
      await expect(async () => {
        await shopLink.click();
        await expect(page).toHaveURL(/\/dashboard\/profile\/shop$/, { timeout: 5_000 });
      }).toPass({ timeout: 20_000 });
      await expect(page.getByRole('heading', { name: 'Your Shop' })).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page.getByText('The Shop is only available for bridal-wear vendors')
      ).toHaveCount(0);
    } finally {
      await cleanup(vendor);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Publish as a bridal-wear vendor → redirect to shop?just_onboarded=1
  // ──────────────────────────────────────────────────────────────────────────
  test('publish → redirects to the Shop with the welcome state', async ({ page }) => {
    // The SSR-heavy review page + a real publish is slow on the dev server; give
    // it room (mirrors bucket-f-wizard-six-steps.spec.ts).
    test.setTimeout(120_000);
    let vendor: TestUser | null = null;
    try {
      // Seed a bridal-wear profile with basics + online + portfolio already set
      // (mirrors vendor-onboarding.spec.ts Test 2, which is reliable against the
      // dev server — driving the basics/details form UIs races hydration). Then
      // fill the two remaining publish-gate gaps (location + details) via API and
      // exercise the real Publish click, which is the code path under test.
      const seeded = await seedVendorWithPartialProfile({
        businessName: 'E2E Bridal Couture',
        category: 'bridal_wear',
      });
      vendor = seeded;
      await loginAs(page, vendor);

      // Resume lands on /setup/location (the first gap).
      await page.goto('/dashboard/profile/setup');
      await expect(page).toHaveURL(/\/setup\/location/, { timeout: 10_000 });

      const locationRes = await page.request.patch('/api/vendor-profile/setup/location', {
        data: FAKE_LOCATION,
      });
      expect(locationRes.status()).toBe(200);

      const detailsRes = await page.request.patch('/api/vendor-profile/setup/details', {
        data: { languages: ['hindi'], years_in_business: 10, response_sla_hours: 24 },
      });
      expect(detailsRes.status()).toBe(200);

      // ── Step 6: Review & publish ──────────────────────────────────────────
      await page.goto('/dashboard/profile/setup/review');
      await expect(page).toHaveURL(/\/setup\/review/, { timeout: 10_000 });

      // Bridal vendors land on the Shop, NOT packages. A pre-hydration click on
      // Publish is a no-op (onPublish isn't attached yet), so retry the click
      // until the redirect happens. Guarded so we never double-submit: once a
      // publish is in flight the button relabels to "Publishing…" and, on
      // success, the page navigates away — in both cases the enabled
      // "Publish Profile" button is gone, so we stop clicking and just wait.
      await expect(async () => {
        const btn = page.getByRole('button', { name: /^publish profile$/i });
        if (await btn.isEnabled().catch(() => false)) {
          await btn.click();
        }
        await expect(page).toHaveURL(/\/dashboard\/profile\/shop\?just_onboarded=1/, {
          timeout: 6_000,
        });
      }).toPass({ timeout: 45_000 });
      // The just_onboarded welcome state renders.
      await expect(page.getByText('Your profile is published. Add your first outfit.')).toBeVisible(
        { timeout: 10_000 }
      );
      await expect(page.getByRole('heading', { name: 'Your Shop' })).toBeVisible();
    } finally {
      await cleanup(vendor);
    }
  });
});
