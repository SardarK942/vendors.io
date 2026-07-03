// tests/e2e/sidebar-couple.spec.ts
//
// Verifies the couple dashboard sidebar shows couple-only links (Saved) plus
// the shared workspace links and Settings, and hides vendor-only links
// (Calendar, Packages, Business Analytics).
//
// Adapted from the task-12 brief's inline-login template to this repo's shared
// e2e fixtures (tests/e2e/helpers/seed.ts + tests/e2e/helpers/login.ts).
import { test, expect } from '@playwright/test';
import { seedCouple, cleanup, type TestUser } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('couple sidebar', () => {
  let couple: TestUser | null = null;

  test.afterEach(async () => {
    await cleanup(couple);
    couple = null;
  });

  test('renders couple-only links + Settings, hides vendor links', async ({ page }) => {
    couple = await seedCouple({ markOnboardingComplete: true });
    await loginAs(page, couple);

    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await expect(sidebar.getByRole('link', { name: /^Home$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Bookings$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Saved$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Notifications$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Settings$/ })).toBeVisible();

    await expect(sidebar.getByRole('link', { name: /^Calendar$/ })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: /^Packages$/ })).toHaveCount(0);
    await expect(sidebar.getByRole('link', { name: /^Business Analytics$/ })).toHaveCount(0);
  });
});
