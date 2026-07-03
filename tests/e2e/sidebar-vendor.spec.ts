// tests/e2e/sidebar-vendor.spec.ts
//
// Verifies the vendor dashboard sidebar shows vendor-only links (Calendar,
// Packages, Business Analytics, Profile) alongside the shared workspace links,
// plus Settings, and that clicking Settings routes to /dashboard/settings.
//
// Adapted from the task-12 brief's inline-login template to this repo's shared
// e2e fixtures (tests/e2e/helpers/seed.ts + tests/e2e/helpers/login.ts), which
// is the pattern every other spec in tests/e2e/ uses (see auth.spec.ts).
import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('vendor sidebar', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('renders vendor-only links + Settings, routes to Settings', async ({ page }) => {
    // publish:true sets is_active + onboarding_complete + users.onboarding_completed_at
    // so the OnboardingGate modal doesn't block the dashboard on first login.
    vendor = await seedVendor({ publish: true });
    await loginAs(page, vendor);

    const sidebar = page.getByRole('complementary').or(page.getByRole('navigation')).first();
    await expect(sidebar.getByRole('link', { name: /^Home$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Bookings$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Notifications$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Calendar$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Packages$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Business Analytics$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Profile$/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /^Settings$/ })).toBeVisible();

    await sidebar.getByRole('link', { name: /^Settings$/ }).click();
    await page.waitForURL('**/dashboard/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  });
});
