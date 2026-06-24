// tests/e2e/bucket-j-customer-just-browsing.spec.ts
//
// Spec 2: "Just browsing" path — skips Step 1, lands on Step 2 generic vendors.
import { test, expect } from '@playwright/test';
import { seedCouple, cleanup, type TestUser } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket J — just browsing path', () => {
  let couple: TestUser | null = null;

  test.afterEach(async () => {
    await cleanup(couple);
    couple = null;
  });

  test('Step 0 "Just browsing" → skips Step 1 → Step 2 generic vendors', async ({ browser }) => {
    couple = await seedCouple({ markOnboardingComplete: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, couple);

    await page.goto('/signup/success');
    await expect(page.getByText(/are you planning an event/i)).toBeVisible({ timeout: 10_000 });

    // Click "Just browsing"
    await page.getByRole('button', { name: /just browsing/i }).click();

    // Step 1 should NOT appear
    await expect(page.getByText(/tell us about your event/i)).not.toBeVisible();

    // Step 2 — generic vendor preview should appear
    await expect(page.getByText(/here's what we found/i)).toBeVisible({ timeout: 10_000 });

    // [data-vendor-slug] cards rendered (0 OK in empty CI DB)
    const vendorCards = page.locator('[data-vendor-slug]');
    await expect(vendorCards.first().or(page.getByText(/loading vendors/i))).toBeVisible({
      timeout: 10_000,
    });

    await ctx.close();
  });
});
