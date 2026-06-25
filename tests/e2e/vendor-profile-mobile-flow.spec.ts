// tests/e2e/vendor-profile-mobile-flow.spec.ts
//
// T11 — vendor profile mobile sticky bottom bar + package picker flow.
// Covers: bottom bar visible on mobile viewport with featured package info,
// 5% deposit math, tapping package pill opens Sheet drawer, selecting a
// different package updates the bar, and "Request Booking" CTA routes to /book.
//
// NOT executed locally — deferred to T13 smoke test (requires running dev server + DB).

import { test, expect } from '@playwright/test';
import { seedVendor, seedPackage, cleanup, type TestVendor } from './helpers/seed';

test.describe('Vendor profile — mobile flow', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('sticky bottom bar visible; tapping Request Booking routes to /book', async ({
    browser,
  }) => {
    // Seed vendor without Stripe (chargesEnabled: false avoids stripe_accounts insert)
    vendor = await seedVendor({ chargesEnabled: false, publish: true });

    // Seed 2 packages; cheapest = Standard ($1,200) → featured; 5% deposit = $60
    await seedPackage(vendor, { name: 'Standard', basePriceCents: 120_000, durationHours: 4 });
    await seedPackage(vendor, { name: '360°', basePriceCents: 180_000, durationHours: 4 });

    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();

    await page.goto(`/vendors/${vendor.vendorSlug}`);

    // ── Bottom bar visible on mobile viewport ──────────────────────────────
    const bottomBar = page.getByTestId('vendor-bottom-bar');
    await expect(bottomBar).toBeVisible();

    // Must show featured package price, 5% deposit ($60), and package pill
    await expect(bottomBar.getByText(/From \$1,200/)).toBeVisible();
    await expect(bottomBar.getByText(/Pay \$60 deposit/)).toBeVisible();
    await expect(bottomBar.getByText(/Standard.*most popular/i)).toBeVisible();

    // ── Tap the package pill to open the picker drawer ─────────────────────
    await bottomBar.getByText(/Standard.*most popular/i).click();

    // The shadcn Sheet opens — assert by the drawer title text
    await expect(page.getByText(/Choose a package/i)).toBeVisible();

    // ── Select the 360° package row in the picker ──────────────────────────
    await page.getByRole('button', { name: /360°/ }).click();

    // Bottom bar should update to show the new package price
    await expect(bottomBar.getByText(/From \$1,800/)).toBeVisible();

    // ── Tap "Request Booking →" → routes to /book ─────────────────────────
    await bottomBar.getByRole('button', { name: /Request Booking/i }).click();
    await page.waitForURL(/\/book/);

    await ctx.close();
  });
});
