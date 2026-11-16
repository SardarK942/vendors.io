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
    // The redesigned couple home greets with a personalized "Welcome back, {name}"
    // <h1> (the old "Home" PageTitle was removed in the couple-dashboard redesign).
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    // The couple's email (contains "couple") renders in the sidebar account menu,
    // proving the couple-scoped dashboard loaded.
    await expect(page.getByText(/couple/i).first()).toBeVisible();
  });

  test('vendor login shows vendor-scoped dashboard', async ({ page }) => {
    vendor = await seedVendor({ chargesEnabled: true });
    await loginAs(page, vendor);
    // The redesigned vendor home shows a personalized WelcomeBanner
    // ("Welcome back, {name}") instead of a "Home" title — the <h1> is the
    // vendor's name, so assert the banner copy rather than a "Home" heading.
    await expect(page.getByText(/welcome back/i)).toBeVisible();
    // Business Analytics is a vendor-only sidebar destination (couples have no
    // analytics nav), so its presence proves the dashboard is vendor-scoped.
    await expect(page.getByRole('link', { name: 'Business Analytics' })).toBeVisible();
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
