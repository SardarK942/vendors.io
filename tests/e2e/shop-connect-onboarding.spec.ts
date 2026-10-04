/**
 * Shop Connect onboarding — E2E spec.
 *
 * Status page states for a local bridal-wear vendor. The "ready" state is
 * proven by seeding a charges-enabled vendor_stripe_accounts row; we do NOT
 * drive Stripe-hosted onboarding. Requires migration 00086 on the target DB.
 */

import { test, expect } from '@playwright/test';
import {
  seedVendor,
  seedStripeAccount,
  getServiceClient,
  cleanup,
  type TestVendor,
} from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Shop Connect onboarding', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('ready local bridal vendor sees the "set up to get paid" state', async ({ page }) => {
    vendor = await seedVendor({ publish: true, category: 'bridal_wear', vendorOrigin: 'local' });
    await seedStripeAccount(getServiceClient(), vendor.vendorProfileId, {
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });
    await loginAs(page, vendor);
    await page.goto('/dashboard/profile/payments');
    await expect(page.getByText(/set up to get paid/i)).toBeVisible({ timeout: 10_000 });
  });

  test('un-connected local bridal vendor sees the setup CTA', async ({ page }) => {
    vendor = await seedVendor({ publish: true, category: 'bridal_wear', vendorOrigin: 'local' });
    await loginAs(page, vendor);
    await page.goto('/dashboard/profile/payments');
    await expect(page.getByRole('button', { name: /set up payouts/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
