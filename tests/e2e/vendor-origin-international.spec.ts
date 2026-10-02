/**
 * Vendor-origin fork (local vs international) — E2E spec.
 *
 * Bridal-wear vendors declare where they operate in Step 1 (StepBasics). An
 * INTERNATIONAL bridal vendor can build a catalog but can't sell yet, so the
 * Shop shows a "coming soon" state instead of the product editor. A LOCAL
 * bridal vendor gets the normal Shop.
 *
 * REQUIRES migration 00085 (vendor_origin / vendor_country / vendor_currency)
 * applied to the dev DB. Without it the basics PATCH that persists vendor_origin
 * fails and this spec cannot be green — that's expected until 00085 is applied.
 *
 * Google Places (Step 2) and UploadThing (Step 5) aren't exercised here; this
 * spec only touches Step 1 + the Shop page.
 */

import { test, expect } from '@playwright/test';
import { seedVendor, seedVendorWithPartialProfile, cleanup, type TestUser } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('vendor-origin international fork', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // International bridal vendor → Shop shows "coming soon", not the editor
  // ──────────────────────────────────────────────────────────────────────────
  test('international bridal vendor sees the coming-soon Shop state', async ({ page }) => {
    test.setTimeout(90_000);
    let vendor: TestUser | null = null;
    try {
      vendor = await seedVendorWithPartialProfile({
        businessName: 'E2E Intl Couture',
        category: 'bridal_wear',
      });
      await loginAs(page, vendor);

      await page.goto('/dashboard/profile/setup/basics');
      await expect(page.getByRole('heading', { name: 'Tell us about your business' })).toBeVisible({
        timeout: 15_000,
      });

      // The fork only renders for bridal_wear. Pick International.
      const intlRadio = page.getByRole('radio', { name: 'International' });
      await expect(intlRadio).toBeVisible();
      // Retry the click in case client hydration hasn't attached the handler yet.
      await expect(async () => {
        await intlRadio.click();
        await expect(intlRadio).toHaveAttribute('aria-checked', 'true', { timeout: 2_000 });
      }).toPass({ timeout: 15_000 });

      // The coming-soon notice reveals.
      await expect(page.getByText(/International selling is coming soon/)).toBeVisible();

      // Choose a country (Radix select).
      await page.locator('#vendor_country').click();
      await page.getByRole('option', { name: 'India' }).click();

      // Choose a currency.
      await page.locator('#vendor_currency').click();
      await page.getByRole('option', { name: 'INR — Indian Rupee' }).click();

      // Save & advance. The basics save persists vendor_origin='international'.
      // A pre-hydration click on Next is a no-op, so retry until the URL moves.
      await expect(async () => {
        await page.getByRole('button', { name: /^Next$/ }).click();
        await expect(page).toHaveURL(/\/setup\/location/, { timeout: 6_000 });
      }).toPass({ timeout: 30_000 });

      // The Shop now shows the coming-soon state, NOT the product editor.
      await page.goto('/dashboard/profile/shop');
      await expect(
        page.getByRole('heading', { name: 'International selling is coming soon' })
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/We.*saved your shop details/)).toBeVisible();
      // The product editor entry point is absent.
      await expect(page.getByRole('link', { name: /Add product/ })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /Add your first product/ })).toHaveCount(0);
    } finally {
      await cleanup(vendor);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Local bridal vendor → normal Shop (unchanged)
  // ──────────────────────────────────────────────────────────────────────────
  test('local bridal vendor still sees the normal Shop', async ({ page }) => {
    let vendor: TestUser | null = null;
    try {
      // seedVendor defaults vendor_origin to 'local' (DB default).
      vendor = await seedVendor({ publish: true, category: 'bridal_wear' });
      await loginAs(page, vendor);

      await page.goto('/dashboard/profile/shop');
      await expect(page.getByRole('heading', { name: 'Your Shop' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByRole('heading', { name: 'International selling is coming soon' })
      ).toHaveCount(0);
    } finally {
      await cleanup(vendor);
    }
  });
});
