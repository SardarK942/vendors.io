/**
 * Vendor onboarding wizard — E2E spec (Phase B6).
 *
 * Tests:
 *   1. Fresh vendor signup → wizard → publish → marketplace visibility
 *   2. Prefilled profile (mimic scraper output) → wizard skips to location step
 *   3. Mid-wizard exit → resume resumes at the correct step
 *   4. Unpublished vendor invisible in marketplace + 404 on direct slug visit
 *
 * Google Places Autocomplete (Step 2) and UploadThing (Step 4) cannot be
 * driven through CI without external credentials. Workaround:
 *   - Step 2 (location): bypass the UI entirely — call PATCH
 *     /api/vendor-profile/setup/location via page.request (carries the
 *     authenticated session cookie) with a fake-but-valid payload, then
 *     navigate directly to /setup/online.
 *   - Step 4 (portfolio): same pattern — PATCH
 *     /api/vendor-profile/setup/portfolio with a placeholder utfs.io URL,
 *     then navigate directly to /setup/review.
 *
 * These tests will pass when run locally with .env.local present but will
 * fail in CI (no Supabase secrets), matching the pre-existing behaviour of
 * happy-path.spec.ts and notifications.spec.ts.
 */

import { test, expect } from '@playwright/test';
import {
  seedVendorOnly,
  seedVendorWithPartialProfile,
  seedVendorUnpublished,
  cleanup,
  getServiceClient,
  type TestUser,
} from './helpers/seed';
import { loginAs } from './helpers/login';

// ─── Shared location payload (no real Google Places needed) ──────────────────
const FAKE_LOCATION = {
  baseAddressLine1: '123 E2E Street',
  baseCity: 'Chicago',
  baseState: 'IL',
  basePostalCode: '60601',
  baseGooglePlaceId: 'ChIJe2eTestPlaceId',
  baseAddressPublic: false,
};

// ─── Bio long enough to pass the ≥50 char validation ────────────────────────
const VALID_BIO =
  'We bring intricate, story-rich henna to weddings across the Midwest. Two artists, ten years of bridal experience.';

// ─── Test suite ─────────────────────────────────────────────────────────────

test.describe('vendor onboarding wizard', () => {
  // Each test manages its own user(s) and calls cleanup at the end.
  // Using afterEach as a safety net isn't possible with per-test let bindings,
  // so every test is responsible for its own cleanup.

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: Fresh vendor signup → wizard → publish → marketplace visibility
  // ──────────────────────────────────────────────────────────────────────────
  test('fresh vendor signup → wizard → publish → visible in marketplace', async ({ page }) => {
    let vendor: TestUser | null = null;

    try {
      // Seed: user only, no vendor_profiles row
      vendor = await seedVendorOnly();

      await loginAs(page, vendor);

      // Visit /setup — should redirect to /setup/basics (no profile exists)
      await page.goto('/dashboard/profile/setup');
      await expect(page).toHaveURL(/\/setup\/basics/, { timeout: 10_000 });

      // ── Step 1: Basics ────────────────────────────────────────────────────
      await page.getByLabel('Business name').fill('E2E Henna Co');

      // The category is a shadcn Select — click the trigger, then the option
      await page.getByRole('combobox').click();
      await page.getByRole('option', { name: /mehndi/i }).click();

      await page.getByLabel('Bio').fill(VALID_BIO);
      await page.getByRole('button', { name: /next/i }).click();

      // Should redirect to /setup/location after saving
      await expect(page).toHaveURL(/\/setup\/location/, { timeout: 10_000 });

      // ── Step 2: Location — API bypass (Google Places can't run in CI) ────
      const locationRes = await page.request.patch('/api/vendor-profile/setup/location', {
        data: FAKE_LOCATION,
      });
      expect(locationRes.status()).toBe(200);
      // Navigate directly to Step 3 (skipping the Places UI)
      await page.goto('/dashboard/profile/setup/online');

      // ── Step 3: Online ────────────────────────────────────────────────────
      await page.getByLabel(/instagram handle/i).fill('e2e_henna_co');
      await page.getByRole('button', { name: /next/i }).click();
      await expect(page).toHaveURL(/\/setup\/portfolio/, { timeout: 10_000 });

      // ── Step 4: Portfolio — API bypass (UploadThing needs network) ────────
      const portfolioRes = await page.request.patch('/api/vendor-profile/setup/portfolio', {
        data: { portfolioImages: ['https://utfs.io/f/e2e-fake-portfolio.jpg'] },
      });
      expect(portfolioRes.status()).toBe(200);
      await page.goto('/dashboard/profile/setup/review');

      // ── Step 5: Review & publish ──────────────────────────────────────────
      await expect(page).toHaveURL(/\/setup\/review/, { timeout: 10_000 });
      await page.getByRole('button', { name: /publish profile/i }).click();

      // After publish, redirected to packages page with just_onboarded=1
      await expect(page).toHaveURL(/just_onboarded=1/, { timeout: 10_000 });

      // ── Marketplace visibility (anonymous context) ────────────────────────
      // Clear cookies to simulate an anonymous visitor
      await page.context().clearCookies();
      await page.goto('/vendors');
      await expect(page.getByText('E2E Henna Co')).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup(vendor);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Prefilled profile (mimic scraper output) → skips to location step
  // ──────────────────────────────────────────────────────────────────────────
  test('prefilled profile (scraper output) → skips basics/online/portfolio, resumes at location', async ({
    page,
  }) => {
    let vendor: ReturnType<typeof seedVendorWithPartialProfile> extends Promise<infer T> ? T : never;
    // @ts-ignore — assigned below inside try
    vendor = null;

    try {
      // Seed: vendor_profiles row with basics + online + portfolio filled, but NO location
      vendor = await seedVendorWithPartialProfile({
        businessName: 'E2E Scraper Henna',
        category: 'mehndi',
      });

      await loginAs(page, vendor);

      // Visit /setup — resume logic should skip to location (first gap)
      await page.goto('/dashboard/profile/setup');
      await expect(page).toHaveURL(/\/setup\/location/, { timeout: 10_000 });

      // ── Fill location via API bypass ──────────────────────────────────────
      const locationRes = await page.request.patch('/api/vendor-profile/setup/location', {
        data: FAKE_LOCATION,
      });
      expect(locationRes.status()).toBe(200);

      // Navigate to review (basics/online/portfolio already populated)
      await page.goto('/dashboard/profile/setup/review');
      await expect(page).toHaveURL(/\/setup\/review/, { timeout: 10_000 });

      // Publish
      await page.getByRole('button', { name: /publish profile/i }).click();
      await expect(page).toHaveURL(/just_onboarded=1/, { timeout: 10_000 });

      // Verify marketplace visibility (anonymous)
      await page.context().clearCookies();
      await page.goto('/vendors');
      await expect(page.getByText('E2E Scraper Henna')).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup(vendor);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: Mid-wizard exit → resume resumes at the correct step
  // ──────────────────────────────────────────────────────────────────────────
  test('mid-wizard exit → re-visit resumes at first incomplete step', async ({ page }) => {
    let vendor: TestUser | null = null;

    try {
      vendor = await seedVendorOnly();
      await loginAs(page, vendor);

      // Go directly to basics
      await page.goto('/dashboard/profile/setup/basics');
      await expect(page).toHaveURL(/\/setup\/basics/, { timeout: 10_000 });

      // Fill basics and click Next → saves + moves to location
      await page.getByLabel('Business name').fill('E2E Mid-Exit Vendor');
      await page.getByRole('combobox').click();
      await page.getByRole('option', { name: /mehndi/i }).click();
      await page.getByLabel('Bio').fill(VALID_BIO);
      await page.getByRole('button', { name: /next/i }).click();
      await expect(page).toHaveURL(/\/setup\/location/, { timeout: 10_000 });

      // Exit: navigate away to /dashboard
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

      // Re-visit /setup — should resume at /setup/location (basics is done, location is not)
      await page.goto('/dashboard/profile/setup');
      await expect(page).toHaveURL(/\/setup\/location/, { timeout: 10_000 });

      // Don't complete — the URL assertion above is the success criterion.
    } finally {
      await cleanup(vendor);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: Unpublished vendor invisible in marketplace + 404 on slug page
  // ──────────────────────────────────────────────────────────────────────────
  test('unpublished vendor not visible in marketplace, 404 on direct slug visit', async ({
    page,
  }) => {
    let vendor: ReturnType<typeof seedVendorUnpublished> extends Promise<infer T> ? T : never;
    // @ts-ignore — assigned below inside try
    vendor = null;

    try {
      vendor = await seedVendorUnpublished();

      // Anonymous visit to /vendors — business_name must NOT appear
      await page.goto('/vendors');
      await expect(page.getByText('E2E Unpublished Vendor Biz')).not.toBeVisible({
        timeout: 10_000,
      });

      // Direct slug visit — should 404 (Next.js renders its not-found page)
      await page.goto(`/vendors/${vendor.vendorSlug}`);
      // Next.js not-found pages typically contain "404" or "not found" in the body.
      // Accept either a 404 status (checked via DB-layer) or a page containing "not found".
      const supabase = getServiceClient();
      const { data: profile } = await supabase
        .from('vendor_profiles')
        .select('onboarding_complete, is_active')
        .eq('slug', vendor.vendorSlug)
        .single();

      // Confirm the DB row is still marked unpublished (the gate didn't flip it)
      expect(profile?.onboarding_complete).toBe(false);
      expect(profile?.is_active).toBe(false);

      // The page should either show a 404 indicator or redirect away
      // Next.js notFound() renders a page with "404" or "This page could not be found"
      const bodyText = await page.locator('body').textContent();
      const is404 =
        bodyText?.toLowerCase().includes('404') ||
        bodyText?.toLowerCase().includes('not found') ||
        bodyText?.toLowerCase().includes('could not be found');
      expect(is404).toBe(true);
    } finally {
      await cleanup(vendor);
    }
  });
});
