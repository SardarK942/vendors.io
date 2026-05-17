/**
 * G6 — Calendar / Double-Booking Prevention — E2E spec (4 tests)
 *
 * Tests exercise the full stack: booking API → status-sync trigger → vendor_calendar_holds.
 * Run locally with `.env.local` present. CI skips gracefully (env-vars absent).
 *
 * Test summary:
 *  1. Couple submits booking; same time slot rejected; different time accepted
 *  2. Concurrency: capacity=1 vendor, two parallel accepts — exactly 1 wins
 *  3. Multi-team: capacity=2 allows 2 overlapping, rejects 3rd
 *  4. Vendor blocks date; availability endpoint reflects it as fully_blocked
 *
 * Tests 2 + 3 bypass-capacity-check workaround:
 *  The /api/bookings POST runs a pre-check — a second submit for the same time
 *  slot returns 409 before the booking reaches pending state.  To test the
 *  accept-time trigger atomicity we instead create the pending bookings + events
 *  directly via service-role INSERTs (seedPendingBooking), then call the accept
 *  endpoint. This isolates the trigger's SELECT … FOR UPDATE serialisation logic.
 */

import { test, expect } from '@playwright/test';
import {
  seedCouple,
  seedVendor,
  seedVendorWithCapacity,
  seedPackage,
  seedPendingBooking,
  cleanup,
  getServiceClient,
  type TestUser,
  type TestVendor,
  type SeededPackage,
} from './helpers/seed';
import { loginAs } from './helpers/login';

// ─── Test 1 ───────────────────────────────────────────────────────────────────
// Couple submits booking; same time slot rejected after accept; different time accepted.
test('calendar: couple submits booking; overlapping slot rejected; different slot accepted', async ({
  browser,
}) => {
  let vendor: TestVendor | null = null;
  let coupleA: TestUser | null = null;
  let coupleB: TestUser | null = null;

  try {
    vendor = await seedVendor({ chargesEnabled: false });
    coupleA = await seedCouple();
    coupleB = await seedCouple();
    const pkg = await seedPackage(vendor);
    const supabase = getServiceClient();

    // ── coupleA submits booking for 2026-08-15 10:00–12:00 ────────────────
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await loginAs(pageA, coupleA);

    const resA = await pageA.request.post('/api/bookings', {
      data: {
        vendor_profile_id: vendor.vendorProfileId,
        package_id: pkg.id,
        selected_addons: [],
        guest_count: 100,
        couple_full_name: 'Couple A',
        couple_contact_phone: '(312) 555-0001',
        events: [
          {
            sequence: 1,
            event_date: '2026-08-15',
            event_start_time: '2026-08-15T10:00:00Z',
            event_end_time: '2026-08-15T12:00:00Z',
            event_type_label: 'Wedding Ceremony',
            address_line_1: '140 E Walton Pl',
            city: 'Chicago',
            state: 'IL',
            postal_code: '60611',
            location_overridden: false,
          },
        ],
      },
    });
    expect(resA.status(), 'coupleA submit should return 201').toBe(201);
    const bookingAId = (await resA.json()).data.booking.id as string;
    await ctxA.close();

    // ── Vendor accepts coupleA's booking → trigger inserts hold ───────────
    const vendorCtx = await browser.newContext();
    const vendorPage = await vendorCtx.newPage();
    await loginAs(vendorPage, vendor);

    const acceptRes = await vendorPage.request.post(`/api/bookings/${bookingAId}/accept`);
    expect(acceptRes.status(), 'vendor accept should succeed').toBe(200);

    // Verify hold was inserted in DB
    const { data: holdsAfterAccept } = await supabase
      .from('vendor_calendar_holds')
      .select('id')
      .eq('vendor_profile_id', vendor.vendorProfileId);
    expect(holdsAfterAccept?.length, 'one hold should exist after accept').toBe(1);

    await vendorCtx.close();

    // ── coupleB tries same overlapping slot (11:00–13:00) → must get 409 ─
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await loginAs(pageB, coupleB);

    const resB1 = await pageB.request.post('/api/bookings', {
      data: {
        vendor_profile_id: vendor.vendorProfileId,
        package_id: pkg.id,
        selected_addons: [],
        guest_count: 80,
        couple_full_name: 'Couple B',
        couple_contact_phone: '(312) 555-0002',
        events: [
          {
            sequence: 1,
            event_date: '2026-08-15',
            event_start_time: '2026-08-15T11:00:00Z',
            event_end_time: '2026-08-15T13:00:00Z',
            event_type_label: 'Wedding Ceremony',
            address_line_1: '140 E Walton Pl',
            city: 'Chicago',
            state: 'IL',
            postal_code: '60611',
            location_overridden: false,
          },
        ],
      },
    });
    expect(resB1.status(), 'overlapping slot submit should return 409').toBe(409);

    // ── coupleB submits a non-overlapping slot (14:00–16:00) → 201 ────────
    const resB2 = await pageB.request.post('/api/bookings', {
      data: {
        vendor_profile_id: vendor.vendorProfileId,
        package_id: pkg.id,
        selected_addons: [],
        guest_count: 80,
        couple_full_name: 'Couple B',
        couple_contact_phone: '(312) 555-0002',
        events: [
          {
            sequence: 1,
            event_date: '2026-08-15',
            event_start_time: '2026-08-15T14:00:00Z',
            event_end_time: '2026-08-15T16:00:00Z',
            event_type_label: 'Wedding Ceremony',
            address_line_1: '140 E Walton Pl',
            city: 'Chicago',
            state: 'IL',
            postal_code: '60611',
            location_overridden: false,
          },
        ],
      },
    });
    expect(resB2.status(), 'non-overlapping slot submit should return 201').toBe(201);

    await ctxB.close();
  } finally {
    // Explicit hold cleanup before cascade-delete, to avoid FK ordering issues
    if (vendor) {
      const sb = getServiceClient();
      await sb.from('vendor_calendar_holds').delete().eq('vendor_profile_id', vendor.vendorProfileId);
    }
    await cleanup(vendor, coupleA, coupleB);
  }
});

// ─── Test 2 ───────────────────────────────────────────────────────────────────
// Concurrency: capacity=1 vendor, two pending bookings for same slot, both accepted in
// parallel — exactly 1 wins (the DB trigger's FOR UPDATE serialises them).
//
// Bypass-capacity-check: we use seedPendingBooking() (direct service-role INSERT) to
// create two pending bookings for the same slot without going through /api/bookings
// (which would reject the second submit with 409 due to the pre-check).
test('calendar: concurrency — capacity=1, parallel accepts, exactly one wins', async ({
  browser,
}) => {
  let vendor: TestVendor | null = null;
  let coupleA: TestUser | null = null;
  let coupleB: TestUser | null = null;
  let pkg: SeededPackage | null = null;

  try {
    vendor = await seedVendorWithCapacity(1);
    coupleA = await seedCouple();
    coupleB = await seedCouple();
    pkg = await seedPackage(vendor);

    // Seed 2 pending bookings for the same time slot directly (bypasses API pre-check)
    const { bookingId: bookingId1 } = await seedPendingBooking(vendor, coupleA, pkg, {
      eventDate: '2026-09-10',
      startTime: '2026-09-10T10:00:00Z',
      endTime: '2026-09-10T12:00:00Z',
    });
    const { bookingId: bookingId2 } = await seedPendingBooking(vendor, coupleB, pkg, {
      eventDate: '2026-09-10',
      startTime: '2026-09-10T10:00:00Z',
      endTime: '2026-09-10T12:00:00Z',
    });

    // Vendor logs in; fire both accept calls in parallel
    const vendorCtx = await browser.newContext();
    const vendorPage = await vendorCtx.newPage();
    await loginAs(vendorPage, vendor);

    const [res1, res2] = await Promise.all([
      vendorPage.request.post(`/api/bookings/${bookingId1}/accept`),
      vendorPage.request.post(`/api/bookings/${bookingId2}/accept`),
    ]);

    const statuses = [res1.status(), res2.status()];
    const successes = statuses.filter((s) => s === 200).length;
    const conflicts = statuses.filter((s) => s === 409).length;

    expect(successes, 'exactly 1 accept should succeed').toBe(1);
    expect(conflicts, 'exactly 1 accept should fail with 409').toBe(1);

    // Verify only 1 hold exists for this vendor+slot
    const supabase = getServiceClient();
    const { data: holds } = await supabase
      .from('vendor_calendar_holds')
      .select('id')
      .eq('vendor_profile_id', vendor.vendorProfileId);
    expect(holds?.length, 'exactly 1 hold should exist in DB').toBe(1);

    await vendorCtx.close();
  } finally {
    if (vendor) {
      const sb = getServiceClient();
      await sb.from('vendor_calendar_holds').delete().eq('vendor_profile_id', vendor.vendorProfileId);
    }
    await cleanup(vendor, coupleA, coupleB);
  }
});

// ─── Test 3 ───────────────────────────────────────────────────────────────────
// Multi-team: capacity=2 allows 2 overlapping bookings, rejects the 3rd.
//
// Bypass-capacity-check: same as Test 2 — 3 pending bookings seeded directly
// via service-role to bypass the /api/bookings pre-check.
test('calendar: multi-team capacity=2 — accepts 2 overlapping, rejects 3rd', async ({
  browser,
}) => {
  let vendor: TestVendor | null = null;
  let coupleA: TestUser | null = null;
  let coupleB: TestUser | null = null;
  let coupleC: TestUser | null = null;
  let pkg: SeededPackage | null = null;

  try {
    vendor = await seedVendorWithCapacity(2);
    coupleA = await seedCouple();
    coupleB = await seedCouple();
    coupleC = await seedCouple();
    pkg = await seedPackage(vendor);

    // Seed 3 pending bookings for the same slot (bypass pre-check)
    const { bookingId: bookingId1 } = await seedPendingBooking(vendor, coupleA, pkg, {
      eventDate: '2026-09-20',
      startTime: '2026-09-20T14:00:00Z',
      endTime: '2026-09-20T17:00:00Z',
    });
    const { bookingId: bookingId2 } = await seedPendingBooking(vendor, coupleB, pkg, {
      eventDate: '2026-09-20',
      startTime: '2026-09-20T14:00:00Z',
      endTime: '2026-09-20T17:00:00Z',
    });
    const { bookingId: bookingId3 } = await seedPendingBooking(vendor, coupleC, pkg, {
      eventDate: '2026-09-20',
      startTime: '2026-09-20T14:00:00Z',
      endTime: '2026-09-20T17:00:00Z',
    });

    const vendorCtx = await browser.newContext();
    const vendorPage = await vendorCtx.newPage();
    await loginAs(vendorPage, vendor);

    // Accept sequentially to get deterministic ordering
    const res1 = await vendorPage.request.post(`/api/bookings/${bookingId1}/accept`);
    expect(res1.status(), 'first accept (capacity slot 1) should succeed').toBe(200);

    const res2 = await vendorPage.request.post(`/api/bookings/${bookingId2}/accept`);
    expect(res2.status(), 'second accept (capacity slot 2) should succeed').toBe(200);

    const res3 = await vendorPage.request.post(`/api/bookings/${bookingId3}/accept`);
    expect(res3.status(), 'third accept should fail — capacity exceeded').toBe(409);

    // Verify exactly 2 holds in DB
    const supabase = getServiceClient();
    const { data: holds } = await supabase
      .from('vendor_calendar_holds')
      .select('id')
      .eq('vendor_profile_id', vendor.vendorProfileId);
    expect(holds?.length, 'exactly 2 holds should exist in DB (one per accepted booking)').toBe(2);

    await vendorCtx.close();
  } finally {
    if (vendor) {
      const sb = getServiceClient();
      await sb.from('vendor_calendar_holds').delete().eq('vendor_profile_id', vendor.vendorProfileId);
    }
    await cleanup(vendor, coupleA, coupleB, coupleC);
  }
});

// ─── Test 4 ───────────────────────────────────────────────────────────────────
// Vendor blocks a date → availability API reflects it as fully_blocked.
test('calendar: vendor blocks full day → availability endpoint shows date as fully_blocked', async ({
  browser,
}) => {
  let vendor: TestVendor | null = null;

  try {
    // Must be is_active + onboarding_complete for the availability endpoint
    vendor = await seedVendorWithCapacity(1);

    // Vendor logs in and POSTs a full-day block for 2026-10-05
    const vendorCtx = await browser.newContext();
    const vendorPage = await vendorCtx.newPage();
    await loginAs(vendorPage, vendor);

    const blockRes = await vendorPage.request.post('/api/vendor-calendar/block', {
      data: { mode: 'full_day', date: '2026-10-05' },
    });
    expect(blockRes.status(), 'block POST should return 201').toBe(201);

    await vendorCtx.close();

    // Anonymous request: open a new context with no session
    const anonCtx = await browser.newContext();
    const anonPage = await anonCtx.newPage();

    const availRes = await anonPage.request.get(
      `/api/vendors/${vendor.vendorSlug}/availability`
    );
    expect(availRes.status(), 'availability GET should return 200').toBe(200);

    const body = await availRes.json();
    const unavailable: Array<{ date: string; fully_blocked: boolean }> = body.unavailable ?? [];

    const blockedDay = unavailable.find((d) => d.date === '2026-10-05');
    expect(blockedDay, 'blocked date should appear in unavailable array').toBeTruthy();
    expect(
      blockedDay?.fully_blocked,
      '2026-10-05 should be marked fully_blocked'
    ).toBe(true);

    // Optional UI assertion: AvailabilityCalendar renders the date as disabled.
    // Skipped here because the calendar fetches availability on mount and greys
    // dates client-side — asserting a specific disabled CSS state is fragile.
    // The API assertion above is the authoritative check.

    await anonCtx.close();
  } finally {
    if (vendor) {
      const sb = getServiceClient();
      await sb.from('vendor_calendar_holds').delete().eq('vendor_profile_id', vendor.vendorProfileId);
    }
    await cleanup(vendor);
  }
});
