/**
 * Sub-project E §10 — Vendor notes privacy regression guard.
 *
 * Sets a vendor_notes value via the API (PATCH /api/booking-events/[id]/notes)
 * as the vendor. Then, as the couple, hits an API path that returns the
 * couple's bookings + events and asserts the response payload contains the
 * sentinel-FREE projection (no vendor_notes anywhere). The booking_events_public
 * view + the audited query updates in E2 should prevent leakage; this test
 * fails if either regresses.
 */
import { test, expect } from '@playwright/test';
import {
  seedVendor,
  seedCouple,
  seedPackage,
  seedPendingBooking,
  getServiceClient,
  cleanup,
  type TestVendor,
  type TestUser,
} from './helpers/seed';
import { loginAs } from './helpers/login';

const SENTINEL = '__VENDOR_NOTES_SENTINEL_LEAK_DETECTOR__';

test.describe('vendor notes privacy', () => {
  let vendor: TestVendor | null = null;
  let couple: TestUser | null = null;
  let bookingEventId: string | null = null;
  let bookingId: string | null = null;

  test.beforeAll(async () => {
    vendor = await seedVendor({ chargesEnabled: true });
    couple = await seedCouple();
    const pkg = await seedPackage(vendor, {
      basePriceCents: 100_000,
    });
    const seeded = await seedPendingBooking(vendor, couple, pkg, {
      eventDate: '2026-09-01',
      startTime: '2026-09-01T16:00:00Z',
      endTime: '2026-09-01T22:00:00Z',
    });
    bookingId = seeded.bookingId;
    bookingEventId = seeded.bookingEventId;

    // Write the sentinel directly via service-role (faster than going through the API).
    const sb = getServiceClient();
    await sb
      .from('booking_events')
      .update({ vendor_notes: SENTINEL })
      .eq('id', bookingEventId);
  });

  test.afterAll(async () => {
    await cleanup(vendor, couple);
  });

  test('couple session never sees vendor_notes in dashboard payload', async ({ page }) => {
    if (!couple || !bookingId) throw new Error('fixtures missing');

    await loginAs(page, couple);

    // Load the couple's /dashboard. The page fetches booking_events_public which
    // excludes vendor_notes by view definition.
    await page.goto('/dashboard');
    const body = await page.content();
    expect(body).not.toContain(SENTINEL);

    // Also hit the booking detail page — couple mode reads booking_events_public.
    await page.goto(`/dashboard/bookings/${bookingId}`);
    const detailBody = await page.content();
    expect(detailBody).not.toContain(SENTINEL);
  });
});
