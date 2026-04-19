import { test, expect } from '@playwright/test';
import { seedCouple, seedVendor, cleanup, type TestUser, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('auth', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple, vendor);
    couple = null;
    vendor = null;
  });

  test('couple login lands on dashboard', async ({ page }) => {
    couple = await seedCouple();
    await loginAs(page, couple);
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    // Couple dashboard shows "Account Type: couple"
    await expect(page.getByText(/couple/i).first()).toBeVisible();
  });

  test('vendor login shows vendor-scoped dashboard', async ({ page }) => {
    vendor = await seedVendor({ chargesEnabled: true });
    await loginAs(page, vendor);
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    // EarningsCard is vendor-only
    await expect(page.getByText(/pending|available|escrow/i).first()).toBeVisible();
  });

  test('wrong password fails', async ({ page }) => {
    couple = await seedCouple();
    await page.goto('/login');
    await page.getByLabel('Email').first().fill(couple.email);
    await page.getByLabel('Password').first().fill('wrong-password-123');
    await page
      .getByRole('button', { name: /sign in/i })
      .first()
      .click();
    // Should stay on /login and surface an error toast.
    await expect(page).toHaveURL(/\/login/);
  });
});
