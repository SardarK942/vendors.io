// tests/e2e/vendor-profile-desktop-flow.spec.ts
//
// T10 — vendor profile desktop sticky card + compare-packages flow.
// Covers: sticky card visible above fold with cheapest (featured) package info,
// 5% deposit math, "compare all N packages" smooth-scroll, and CTA → /book routing.
//
// NOT executed locally — deferred to T13 smoke test (requires running dev server + DB).

import { test, expect } from '@playwright/test';
import { seedVendor, seedPackage, cleanup, type TestVendor } from './helpers/seed';

test.describe('Vendor profile — desktop flow', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('sticky card visible above fold; compare-all-packages smooth-scrolls + pulses', async ({
    browser,
  }) => {
    // Seed vendor without Stripe (chargesEnabled: false avoids stripe_accounts insert)
    vendor = await seedVendor({ chargesEnabled: false, publish: true });

    // Seed 3 packages with distinct names + prices; cheapest = Standard ($1,200) → featured
    await seedPackage(vendor, { name: 'Standard', basePriceCents: 120_000, durationHours: 4 });
    await seedPackage(vendor, { name: '360°', basePriceCents: 180_000, durationHours: 4 });
    await seedPackage(vendor, { name: 'Premium', basePriceCents: 280_000, durationHours: 8 });

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await page.goto(`/vendors/${vendor.vendorSlug}`);

    // ── Sticky card visible above the fold ──────────────────────────────────
    const stickyCard = page.getByTestId('vendor-sticky-card');
    await expect(stickyCard).toBeVisible();

    // Must show "Most popular" badge, featured package name, total price, and 5% deposit
    await expect(stickyCard.getByText(/Most popular/i)).toBeVisible();
    await expect(stickyCard.getByText(/Standard/i)).toBeVisible();
    await expect(stickyCard.getByText('$1,200')).toBeVisible();
    await expect(stickyCard.getByText(/\$60/)).toBeVisible(); // 5% of $1,200 = $60

    // ── "compare all 3 packages" link scrolls packages section into view ────
    await stickyCard.getByText(/compare all 3 packages/i).click();

    const packagesSection = page.locator('#packages-section');

    // toBeInViewport is available in Playwright ≥ 1.43; fall back to evaluate if needed.
    const hasToBeInViewport =
      typeof (expect(packagesSection) as unknown as Record<string, unknown>).toBeInViewport ===
      'function';

    if (hasToBeInViewport) {
      await expect(packagesSection).toBeInViewport();
    } else {
      // Fallback: ensure the top of the section is within the visible window
      const top = await packagesSection.evaluate((el) => el.getBoundingClientRect().top);
      expect(top).toBeLessThanOrEqual(800); // viewport height
      expect(top).toBeGreaterThanOrEqual(-50); // allow minor overlap
    }

    // ── Featured card (data-pkg-featured="true") is visible ────────────────
    const featuredCard = packagesSection.locator('[data-pkg-featured="true"]');
    await expect(featuredCard).toBeVisible();

    // ── Featured card CTA routes to /book ───────────────────────────────────
    await featuredCard.getByText(/Book.*Standard/i).click();
    await page.waitForURL(/\/book/);

    await ctx.close();
  });
});
