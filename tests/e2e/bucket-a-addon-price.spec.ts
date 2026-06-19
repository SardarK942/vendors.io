import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, getServiceClient, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket A — addon price input', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('empty initial state, $1 arrow step, negative clamped to 0', async ({ browser }) => {
    vendor = await seedVendor({ chargesEnabled: false });

    // Mark onboarding complete so the wizard modal doesn't intercept clicks.
    // The dashboard layout reads users.onboarding_completed_at (not vendor_profiles);
    // we update both to be safe.
    const sb = getServiceClient();
    await Promise.all([
      sb
        .from('vendor_profiles')
        .update({ onboarding_complete: true })
        .eq('id', vendor.vendorProfileId),
      sb
        .from('users')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', vendor.id),
    ]);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    await page.goto('/dashboard/profile/packages/new');

    // Click the add-on button — label is exactly "+ Add-on" (verified in PackageAddonsEditor.tsx)
    await page.getByRole('button', { name: '+ Add-on' }).click();

    // The addon price input is the last spinbutton on the page —
    // base_price, max_guests, duration_hours, events_count all appear above it
    // in the DOM and have explicit ids; the addon price input has no id/name.
    const priceInput = page.getByRole('spinbutton').last();

    // 1. No leading zero — field renders empty when price_delta_cents === 0
    await expect(priceInput).toHaveValue('');

    // 2. ArrowUp advances by $1 (step="1" in PackageAddonsEditor)
    await priceInput.focus();
    await page.keyboard.press('ArrowUp');
    await expect(priceInput).toHaveValue('1');

    // 3. Negative value clamped to 0 via safeDollars guard in onChange.
    // price_delta_cents becomes 0, which renders as '' (empty) because the
    // component uses value={cents === 0 ? '' : cents / 100} to avoid a leading zero.
    await priceInput.fill('-5');
    await priceInput.blur();
    await expect(priceInput).toHaveValue('');
  });
});
