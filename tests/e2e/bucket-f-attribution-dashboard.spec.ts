// tests/e2e/bucket-f-attribution-dashboard.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, getServiceClient, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket F — Money attribution dashboard', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('shows total + count + fees + net + 20x ROI for 3 seeded bookings', async ({ browser }) => {
    vendor = await seedVendor({ chargesEnabled: false });
    const sb = getServiceClient();

    // Seed 3 bookings: $1,000 + $2,500 + $4,500 = $8,000 total
    // Fees = 5% = $400; net = $7,600; ROI = 20x
    // NOTE: total_price_cents is computed by a BEFORE INSERT trigger from
    // package_base_price_cents_snapshot + addons + adjustment. Setting
    // total_price_cents directly is overridden. Use package_base_price_cents_snapshot
    // to drive the final total (no addons or adjustments → total = snapshot).
    const snapshots = [100_000, 250_000, 450_000];
    for (const snapshot of snapshots) {
      await sb.from('bookings').insert({
        vendor_profile_id: vendor.vendorProfileId,
        couple_user_id: vendor.id, // self-booking is fine for test purposes
        status: 'accepted',
        package_base_price_cents_snapshot: snapshot,
        guest_count: 50,
        couple_full_name: 'Test Customer',
        couple_contact_phone: '(312) 555-0100',
      });
    }

    // Onboarding bypass — only set users.onboarding_completed_at (NOT vendor_profiles.onboarding_complete which redirects)
    await sb
      .from('users')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', vendor.id);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    // Analytics (the redesign replaced the old EarningsCard with the Business
    // Analytics page) lives on /dashboard/money. Attribution range is fixed to
    // 'all' server-side, so the 3 seeded bookings are always included.
    await page.goto('/dashboard/money');

    await expect(page.getByRole('heading', { name: 'Business Analytics' })).toBeVisible();

    // KPI stat cards — amounts render via formatPrice ($X,XXX.00). Use .first()
    // because the Revenue Breakdown donut legend echoes the same figures.
    await expect(page.getByText('$8,000.00').first()).toBeVisible(); // Booking Value (total)
    await expect(page.getByText('$400.00').first()).toBeVisible(); // Platform Fees (5%)
    await expect(page.getByText('$7,600.00').first()).toBeVisible(); // Net Earnings

    // Total Bookings count card shows 3 (scope to first to avoid digit collisions).
    await expect(page.locator('text=/^3$/').first()).toBeVisible();

    await ctx.close();
  });
});
