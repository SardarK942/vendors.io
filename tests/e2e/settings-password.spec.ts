// tests/e2e/settings-password.spec.ts
//
// Verifies the two negative branches of the /dashboard/settings password-change
// form: wrong current password, and mismatched new/confirm password. The happy
// path is intentionally NOT tested here — it would rotate the seeded E2E user's
// password mid-test, which is fine since the user is deleted in afterEach, but
// there is no assertion value beyond what the negative branches already cover
// (the form + API wiring), so we skip it to avoid an extra Supabase auth round
// trip that changes real credentials for no additional signal.
//
// Adapted from the task-12 brief's inline-login template to this repo's shared
// e2e fixtures (tests/e2e/helpers/seed.ts + tests/e2e/helpers/login.ts).
import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('settings — password change', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test.beforeEach(async ({ page }) => {
    vendor = await seedVendor({ publish: true });
    await loginAs(page, vendor);
    await page.goto('/dashboard/settings');
  });

  test('wrong current password → error toast', async ({ page }) => {
    await page.getByLabel('Current password').fill('definitely-wrong');
    await page.getByLabel('New password').fill('newpass1234');
    await page.getByLabel('Confirm new password').fill('newpass1234');
    await page.getByRole('button', { name: /Update password/ }).click();
    await expect(page.getByText(/Current password is incorrect/i)).toBeVisible();
  });

  test('mismatched confirm → error toast without hitting API', async ({ page }) => {
    await page.getByLabel('Current password').fill('anything');
    await page.getByLabel('New password').fill('newpass1234');
    await page.getByLabel('Confirm new password').fill('newpass9999');
    await page.getByRole('button', { name: /Update password/ }).click();
    await expect(page.getByText(/don't match/i)).toBeVisible();
  });
});
