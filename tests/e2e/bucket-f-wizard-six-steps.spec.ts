// tests/e2e/bucket-f-wizard-six-steps.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket F — wizard is 6 steps', () => {
  // The review page (Step 6) is SSR-heavy and Next.js RSC can be slow on first load.
  test.setTimeout(120_000);
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('step counter shows N of 6 on each step; /payment-mode redirects to /review', async ({
    browser,
  }) => {
    vendor = await seedVendor({ chargesEnabled: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    // Step 1
    await page.goto('/dashboard/profile/setup/basics');
    await expect(page.getByText(/Step 1 of 6/i)).toBeVisible();

    // Step 2
    await page.goto('/dashboard/profile/setup/location');
    await expect(page.getByText(/Step 2 of 6/i)).toBeVisible();

    // Step 3
    await page.goto('/dashboard/profile/setup/online');
    await expect(page.getByText(/Step 3 of 6/i)).toBeVisible();

    // Step 4
    await page.goto('/dashboard/profile/setup/details');
    await expect(page.getByText(/Step 4 of 6/i)).toBeVisible();

    // Step 5
    await page.goto('/dashboard/profile/setup/portfolio');
    await expect(page.getByText(/Step 5 of 6/i)).toBeVisible();

    // Step 6 (review page is the heaviest — give it extra time to SSR)
    await page.goto('/dashboard/profile/setup/review', {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText(/Step 6 of 6/i)).toBeVisible({ timeout: 15_000 });

    // /payment-mode redirects (server-side redirect → use domcontentloaded to avoid ERR_ABORTED)
    await page.goto('/dashboard/profile/setup/payment-mode', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/review/, { timeout: 15_000 });

    await ctx.close();
  });
});
