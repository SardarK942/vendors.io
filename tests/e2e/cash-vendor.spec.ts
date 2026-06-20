/**
 * Cash vendor E2E spec — Phase C5.
 *
 * Tests 1–3 (cash payment_mode flow) were deleted in CI hygiene P1 because
 * migration 00058 dropped the payment_mode column from vendor_profiles. The
 * dual-mode cash/stripe model no longer exists in the schema.
 *
 * Remaining test:
 *   4. Vendor onboarding wizard → DirectPaymentsCard rendered on /dashboard
 *
 * Google Places Autocomplete (Step 2) and UploadThing (Step 4) are bypassed via
 * direct PATCH API calls, matching the pattern used in vendor-onboarding.spec.ts.
 */

import { test, expect } from '@playwright/test';
import { seedVendorOnly, cleanup, type TestUser } from './helpers/seed';
import { loginAs } from './helpers/login';

// ─── Shared location payload (no real Google Places needed) ──────────────────
const FAKE_LOCATION = {
  baseAddressLine1: '123 E2E Cash Street',
  baseCity: 'Chicago',
  baseState: 'IL',
  basePostalCode: '60601',
  baseGooglePlaceId: 'ChIJe2eCashTestPlaceId',
  baseAddressPublic: false,
};

const VALID_BIO =
  'We bring stunning wedding photography to celebrations across the Midwest. Ten years of experience capturing your best moments.';

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('cash vendor — C end-to-end', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: Vendor onboarding wizard → DirectPaymentsCard on /dashboard
  // ──────────────────────────────────────────────────────────────────────────
  test('cash vendor onboarding wizard → DirectPaymentsCard rendered on /dashboard', async ({
    page,
  }) => {
    let vendor: TestUser | null = null;

    try {
      // Seed: user only, no vendor_profiles row
      vendor = await seedVendorOnly();
      await loginAs(page, vendor);

      // Visit /setup — should redirect to /setup/basics (no profile exists)
      await page.goto('/dashboard/profile/setup');
      await expect(page).toHaveURL(/\/setup\/basics/, { timeout: 10_000 });

      // ── Step 1: Basics ────────────────────────────────────────────────────
      await page.getByLabel('Business name').fill('E2E Cash Henna Co');
      await page.getByRole('combobox').click();
      await page.getByRole('option', { name: /mehndi/i }).click();
      await page.getByLabel('Bio').fill(VALID_BIO);
      await page.getByRole('button', { name: /next/i }).click();
      await expect(page).toHaveURL(/\/setup\/location/, { timeout: 10_000 });

      // ── Step 2: Location — API bypass ────────────────────────────────────
      const locationRes = await page.request.patch('/api/vendor-profile/setup/location', {
        data: FAKE_LOCATION,
      });
      expect(locationRes.status()).toBe(200);
      await page.goto('/dashboard/profile/setup/online');

      // ── Step 3: Online ────────────────────────────────────────────────────
      await page.getByLabel(/instagram handle/i).fill('e2e_cash_henna');
      await page.getByRole('button', { name: /next/i }).click();
      await expect(page).toHaveURL(/\/setup\/portfolio/, { timeout: 10_000 });

      // ── Step 4: Portfolio — API bypass ────────────────────────────────────
      const portfolioRes = await page.request.patch('/api/vendor-profile/setup/portfolio', {
        data: { portfolioImages: ['https://utfs.io/f/e2e-fake-cash-portfolio.jpg'] },
      });
      expect(portfolioRes.status()).toBe(200);
      await page.goto('/dashboard/profile/setup/payment-mode');

      // ── Step 5: Payment mode — click "Cash" card ──────────────────────────
      // The component renders two cards: "Through Baazar" and "Direct payments"
      // Click the "Direct payments" / Cash card
      await expect(page).toHaveURL(/\/setup\/payment-mode/, { timeout: 10_000 });
      // Click the card labelled "Direct payments" (StepPaymentMode renders a button with this heading)
      const cashCard = page.getByRole('button', { name: /direct payments/i }).first();
      await expect(cashCard).toBeVisible({ timeout: 5_000 });
      await cashCard.click();
      // Click Next to save the payment mode choice
      await page.getByRole('button', { name: /next/i }).click();
      await expect(page).toHaveURL(/\/setup\/review/, { timeout: 10_000 });

      // ── Step 6: Review & publish ──────────────────────────────────────────
      await page.getByRole('button', { name: /publish profile/i }).click();
      await expect(page).toHaveURL(/just_onboarded=1/, { timeout: 10_000 });

      // ── Visit /dashboard — assert DirectPaymentsCard rendered ─────────────
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

      // DirectPaymentsCard renders "Direct payments" heading
      await expect(page.getByText('Direct payments').first()).toBeVisible({ timeout: 10_000 });
      // EarningsCard should NOT be present for cash vendors
      await expect(page.getByText(/earnings/i).first()).not.toBeVisible();
    } finally {
      await cleanup(vendor);
    }
  });
});
