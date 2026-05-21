/**
 * Sub-project E §10 — Vendor money page E2E (both variants).
 *
 * Stripe variant: vendor with a chargesEnabled stripe_account → /dashboard/money
 *   renders the 3-card summary + payout history section + recent unlocks.
 * Cash variant: cash vendor → /dashboard/money renders the locked C-wording
 *   explainer + 2-card counts + cash-to-collect (empty when no events).
 */
import { test, expect } from '@playwright/test';
import { seedVendor, seedCashVendor, cleanup, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('vendor money page', () => {
  test('Stripe vendor sees 3-card summary + payout history', async ({ page }) => {
    const vendor = await seedVendor({ chargesEnabled: true });
    try {
      await loginAs(page, vendor);
      await page.goto('/dashboard/money');
      await expect(page.getByRole('heading', { name: 'Money' })).toBeVisible();
      await expect(page.getByText(/payout history/i)).toBeVisible();
      // EarningsCard renders the three summary numbers; their labels exist in the page.
      await expect(page.getByText(/pending|available/i).first()).toBeVisible();
    } finally {
      await cleanup(vendor);
    }
  });

  test('cash vendor sees the 95% explainer + cash-to-collect', async ({ page }) => {
    const vendor: TestVendor = await seedCashVendor();
    try {
      await loginAs(page, vendor);
      await page.goto('/dashboard/money');
      await expect(page.getByRole('heading', { name: 'Money' })).toBeVisible();
      // Locked C-wording (Sub-project E brainstorming locked verbatim).
      await expect(page.getByText('You and your client handle the 95%')).toBeVisible();
      await expect(
        page.getByText('Baazar holds a 5% deposit to lock in the booking')
      ).toBeVisible();
      await expect(page.getByText(/cash to collect/i)).toBeVisible();
    } finally {
      await cleanup(vendor);
    }
  });
});
