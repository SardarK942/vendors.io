// tests/e2e/bucket-j-vendor-first-booking-received.spec.ts
//
// Spec 5: Vendor first booking received → notification row created for vendor.
//
// Strategy: couple POSTs booking via /api/bookings, then we assert on the DB directly.
//
// Known limitation (app bug — not test issue):
//   The vendor_profiles.first_booking_at atomic update in booking.service uses the
//   couple's RLS-scoped supabase client. RLS only allows vendors to UPDATE their own
//   vendor_profiles row ("Vendors can update own profile" policy). So the update
//   silently returns 0 rows and isVendorFirstBooking is always false when called from
//   the /api/bookings route (couple JWT). As a result, the 🎉 first-booking path is
//   unreachable via the HTTP API today — it would require a SECURITY DEFINER fn or
//   the service-role client in booking.service.createBooking.
//
//   This test asserts what actually happens: a booking_request_received notification
//   IS created for the vendor, and is_first is false (because of the RLS block).
//   The notification title is the standard "New booking request" (no 🎉).
//
//   To fix: createBooking should accept a service-role client (or use a SECURITY DEFINER
//   RPC) for the first_booking_at flips. Filed as a known gap.
import { test, expect } from '@playwright/test';
import {
  seedCouple,
  seedVendor,
  seedPackage,
  cleanup,
  getServiceClient,
  type TestUser,
  type TestVendor,
  type SeededPackage,
} from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket J — vendor first booking received', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple);
    await cleanup(vendor);
    couple = null;
    vendor = null;
  });

  test('booking created → booking_request_received notification sent to vendor', async ({
    browser,
  }) => {
    couple = await seedCouple({ markOnboardingComplete: true });
    vendor = await seedVendor({ chargesEnabled: false, publish: true });
    const pkg: SeededPackage = await seedPackage(vendor, { basePriceCents: 100_000 });

    const sb = getServiceClient();

    // Log in as couple and submit the booking via the API
    const ctx = await browser.newContext();
    const couplePage = await ctx.newPage();
    await loginAs(couplePage, couple);

    const res = await couplePage.request.post('/api/bookings', {
      data: {
        vendor_profile_id: vendor.vendorProfileId,
        package_id: pkg.id,
        guest_count: 100,
        couple_full_name: 'Test Couple',
        couple_contact_phone: '(555) 555-0100',
        events: [
          {
            sequence: 1,
            event_date: '2026-12-25',
            event_start_time: '2026-12-25T16:00:00Z',
            event_end_time: '2026-12-25T22:00:00Z',
            event_type_label: 'Wedding',
            address_line_1: '123 Main St',
            city: 'Chicago',
            state: 'IL',
            postal_code: '60611',
            location_overridden: false,
          },
        ],
      },
    });

    const resBody = await res.json();
    expect(res.status()).toBe(201);
    const bookingId = resBody.data?.booking?.id as string;
    expect(bookingId).toBeTruthy();

    // Give the fire-and-forget notification a moment to land
    await couplePage.waitForTimeout(2_500);

    // Verify a booking_request_received notification was sent to the vendor
    const { data: notif } = await sb
      .from('notifications')
      .select('metadata, title, type')
      .eq('user_id', vendor.id)
      .eq('type', 'booking_request_received')
      .single();

    expect(notif).not.toBeNull();
    expect(notif?.type).toBe('booking_request_received');

    // Vendor first-booking detection (T17 + post-T25 RLS fix): the booking
    // service uses createServiceRoleClient to flip vendor_profiles.first_booking_at,
    // so the celebration path actually fires.
    expect((notif?.metadata as { is_first?: boolean } | null)?.is_first).toBe(true);
    expect(notif?.title).toBe('🎉 Your first booking request!');

    // Confirm vendor_profiles.first_booking_at was set
    const { data: vp } = await sb
      .from('vendor_profiles')
      .select('first_booking_at')
      .eq('id', vendor.vendorProfileId)
      .single();
    expect(vp?.first_booking_at).not.toBeNull();

    await ctx.close();
  });
});
