/**
 * Sub-project E §10 — Vendor inbox E2E flow.
 *
 * Seeds a vendor (with package) + couple + pending booking, signs in as the
 * vendor, asserts the booking appears in the Home Inbox's "Needs your reply"
 * section, clicks the row, asserts the side panel opens with the booking
 * detail. Acceptance and panel close behaviors are covered separately if
 * needed; this spec proves the new inbox surface lights up end-to-end.
 */
import { test, expect } from '@playwright/test';
import { seedVendor, seedCouple, seedPackage, seedPendingBooking, cleanup, type TestVendor, type TestUser, type SeededPackage } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('vendor inbox', () => {
  let vendor: TestVendor | null = null;
  let couple: TestUser | null = null;
  let pkg: SeededPackage | null = null;
  let booking: { bookingId: string; bookingEventId: string } | null = null;

  test.beforeAll(async () => {
    vendor = await seedVendor({ chargesEnabled: true });
    couple = await seedCouple();
    pkg = await seedPackage(vendor, {
      basePriceCents: 200_000,
    });

    booking = await seedPendingBooking(vendor, couple, pkg, {
      eventDate: '2026-08-15',
      startTime: '2026-08-15T16:00:00Z',
      endTime: '2026-08-15T22:00:00Z',
      eventTypeLabel: 'Wedding Ceremony',
    });
  });

  test.afterAll(async () => {
    await cleanup(vendor, couple);
  });

  test('vendor sees pending booking in Inbox; side panel opens on click', async ({ page }) => {
    if (!vendor || !booking) throw new Error('fixtures not seeded');

    await loginAs(page, vendor);
    await page.goto('/dashboard');

    // Inbox heading
    await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();

    // "Needs your reply" subsection should be visible with count
    await expect(page.getByText(/Needs your reply/i)).toBeVisible();

    // The seeded booking's couple name appears as a row (we control it from
    // seedPendingBooking → couple_full_name = 'E2E Couple').
    const row = page.getByRole('link').filter({ hasText: 'E2E Couple' });
    await expect(row).toBeVisible();

    // Click → intercepting route opens the side panel
    await row.click();

    // Panel announces itself as a dialog with "Booking details"
    await expect(page.getByRole('dialog', { name: /booking details/i })).toBeVisible();
  });
});
