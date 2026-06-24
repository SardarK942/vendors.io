// tests/e2e/bucket-j-customer-first-booking-celebration.spec.ts
//
// Spec 4: First booking → ?welcome=true overlay modal → dismiss removes param.
//
// Strategy: POST /api/bookings as the couple, capture the returned booking id,
// then navigate to /dashboard/bookings/{id}?welcome=true to trigger
// FirstBookingCelebration. Assert the modal renders and dismiss clears the param.
import { test, expect } from '@playwright/test';
import {
  seedCouple,
  seedVendor,
  seedPackage,
  cleanup,
  type TestUser,
  type TestVendor,
  type SeededPackage,
} from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket J — first booking celebration modal', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple);
    await cleanup(vendor);
    couple = null;
    vendor = null;
  });

  test('first booking → ?welcome=true overlay; dismiss removes param', async ({ browser }) => {
    couple = await seedCouple({ markOnboardingComplete: true });
    vendor = await seedVendor({ chargesEnabled: false, publish: true });
    const pkg: SeededPackage = await seedPackage(vendor, { basePriceCents: 100_000 });

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, couple);

    // Submit booking via API using Playwright's request context (inherits session cookies)
    const res = await page.request.post('/api/bookings', {
      data: {
        vendor_profile_id: vendor.vendorProfileId,
        package_id: pkg.id,
        guest_count: 100,
        couple_full_name: 'Test Customer',
        couple_contact_phone: '(555) 555-0100',
        events: [
          {
            sequence: 1,
            event_date: '2026-12-25',
            event_start_time: '2026-12-25T16:00:00Z',
            event_end_time: '2026-12-25T22:00:00Z',
            event_type_label: 'Wedding',
            address_line_1: '123 Main',
            city: 'Chicago',
            state: 'IL',
            postal_code: '60611',
            location_overridden: false,
          },
        ],
      },
    });
    expect(res.status()).toBe(201);

    const j = await res.json();
    const bookingId = j.data?.booking?.id as string;
    expect(bookingId).toBeTruthy();
    // Confirm the API returned is_first_booking: true (this is the couple's first booking)
    expect(j.data?.is_first_booking).toBe(true);

    // Navigate to booking detail with ?welcome=true
    await page.goto(`/dashboard/bookings/${bookingId}?welcome=true`);

    // FirstBookingCelebration dialog should appear
    await expect(page.getByText(/your first booking request is in/i)).toBeVisible({
      timeout: 10_000,
    });
    // Key content from the modal
    await expect(page.getByText(/reviews and responds/i)).toBeVisible();
    await expect(page.getByText(/5% deposit/i)).toBeVisible();

    // Dismiss via "Got it →" button
    await page.getByRole('button', { name: /got it/i }).click();

    // Wait for router.replace to remove ?welcome=true from the URL
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('welcome'), {
      timeout: 5_000,
    });

    // URL should no longer contain ?welcome=true
    const finalUrl = new URL(page.url());
    expect(finalUrl.searchParams.has('welcome')).toBe(false);

    await ctx.close();
  });
});
