// tests/e2e/bucket-a-form-errors.spec.ts
//
// T19: Playwright E2E spec covering:
//   1. Step 1 (Basics) — submitting with empty businessName (cleared via UI) +
//      short bio (seeded to 28 chars, below the 50-char min) surfaces 2 errors
//      and the summary count simultaneously.
//   2. Step 2 (Location) — checking "I don't have a fixed address" unblocks Next
//      and advances to /setup/online.
//
// Onboarding bypass pattern (same as T17 + T18):
//   - vendor_profiles.onboarding_complete stays FALSE so the /setup/* layout
//     does NOT redirect away.
//   - users.onboarding_completed_at is set to NOW to suppress the
//     OnboardingGate modal overlay that would intercept pointer events.
//
// Test 1 uses seedVendor() with the following precondition:
//   - business_name: cleared to '' via UI (type + clear)
//   - category: 'Photography' (seeded valid value → passes Zod)
//   - bio: 'Seeded vendor for E2E tests.' (28 chars < 50 → fails Zod min(50))
//   → exactly 2 field errors → summary shows "2 fields need attention"
//
// Test 2 uses seedVendor() (full profile) so /setup/location renders without
// being auto-redirected to basics.

import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, getServiceClient, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket A — form errors + address optional', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('Step 1: missing business name + short bio surfaces 2 errors simultaneously', async ({
    browser,
  }) => {
    vendor = await seedVendor({ chargesEnabled: false });
    const sb = getServiceClient();

    // Suppress the OnboardingGate modal (T17/T18 pattern).
    await sb
      .from('users')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', vendor.id);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    await page.goto('/dashboard/profile/setup/basics');

    // Clear the business name field (seeded as 'E2E Test Vendor').
    // After clearing: businessName='' → fails z.string().min(1)
    // category='Photography' (seeded) → passes z.string().min(1)
    // bio='Seeded vendor for E2E tests.' (28 chars) → fails z.string().min(50)
    // → 2 errors total
    const businessNameInput = page.getByLabel(/Business name/i);
    await businessNameInput.fill('');

    // Click Next without fixing either failing field.
    await page.getByRole('button', { name: /next/i }).click();

    // Summary count: "2 fields need attention"
    // (StepBasics renders this when total >= 2)
    await expect(page.getByText(/2 fields need attention/i)).toBeVisible({ timeout: 10_000 });

    // Inline error below Business name: Zod v4 default message for min(1)
    await expect(
      page.getByText(/Too small: expected string to have >=1 characters/i).first()
    ).toBeVisible();

    // Inline error below Bio: custom Zod message from basicsSchema
    await expect(page.getByText(/Bio must be at least 50 characters/i)).toBeVisible();

    await ctx.close();
  });

  test('Step 2: skip-address checkbox unblocks Next and advances to /online', async ({
    browser,
  }) => {
    vendor = await seedVendor({ chargesEnabled: false });
    const sb = getServiceClient();

    // Onboarding bypass: suppress the OnboardingGate modal.
    // vendor_profiles.onboarding_complete stays false → wizard layout stays open.
    await sb
      .from('users')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', vendor.id);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    // Navigate directly to Step 2. The setup layout doesn't enforce step order
    // (it only redirects if onboarding_complete=true in 'first' mode).
    await page.goto('/dashboard/profile/setup/location');

    // The skip checkbox label in StepLocation:
    //   "I don't have a fixed address (I travel to clients)"
    // Rendered as a plain <input type="checkbox"> inside a <label> element.
    const skipCheckbox = page.getByLabel(/I don't have a fixed address/i);
    await skipCheckbox.check();

    // Click Next — with skipAddress=true the place state is cleared to empty
    // strings. locationSchema treats all address fields as optional, so Zod
    // passes. The PATCH saves, then router.push advances to /setup/online.
    await page.getByRole('button', { name: /next/i }).click();

    // The dev server can be slow (PATCH + page render takes ~5–10s each).
    // Use a generous timeout so the assertion doesn't race against slow SSR.
    await expect(page).toHaveURL(/\/online/, { timeout: 30_000 });

    await ctx.close();
  });
});
