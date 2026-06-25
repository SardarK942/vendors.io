// tests/e2e/vendor-profile-zero-packages.spec.ts
//
// T12 — vendor profile zero-packages fallback.
// Covers: sticky card shows custom-request fallback when vendor has no packages,
// and clicking the button routes to /request.
//
// NOT executed locally — deferred to T13 smoke test (requires running dev server + DB).

import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, type TestVendor } from './helpers/seed';

test.describe('Vendor profile — zero packages fallback', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('sticky card shows custom-request fallback; routes to /request', async ({ browser }) => {
    // Seed vendor without Stripe and without any packages
    vendor = await seedVendor({ chargesEnabled: false, publish: true });
    // No packages seeded

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    await page.goto(`/vendors/${vendor.vendorSlug}`);

    // ── Sticky card visible above the fold ──────────────────────────────────
    const stickyCard = page.getByTestId('vendor-sticky-card');
    await expect(stickyCard).toBeVisible();

    // Must show fallback message
    await expect(stickyCard.getByText(/hasn't listed packages yet/i)).toBeVisible();

    // ── Custom request button present and clickable ─────────────────────────
    await stickyCard.getByRole('button', { name: /custom request/i }).click();
    await page.waitForURL(/\/request/);

    await ctx.close();
  });
});
