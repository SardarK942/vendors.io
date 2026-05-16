/**
 * Happy-path smoke for the package-driven booking flow (sub-project A).
 *
 * Exercises:
 *  - Unauthenticated marketplace pages render
 *  - Vendor + package can be seeded and surface on the vendor profile page
 *  - Couple can submit a booking against a package via the API route
 *    (uses authenticated fetch in the browser context — cookies carry the session)
 *  - Vendor can accept the booking via the UI Accept button
 *  - DB state reflects each transition correctly
 *
 * Does NOT cover:
 *  - Stripe deposit checkout (requires a real Connect account beyond the
 *    seeded fake; deposit-paid transitions live in the existing booking.spec
 *    legacy flow + Stripe listen suite)
 *  - 72h auto-cancel cron sweep
 *  - Email send delivery (Resend dashboard verification is manual)
 */
import { test, expect } from '@playwright/test';
import {
  seedCouple,
  seedVendor,
  seedPackage,
  cleanup,
  getServiceClient,
  type TestUser,
  type TestVendor,
} from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('package-driven booking flow — happy path', () => {
  let couple: TestUser | null = null;
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(couple, vendor);
    couple = null;
    vendor = null;
  });

  test('unauthenticated marketplace renders + dashboard is gated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/wedding|vendor|baazar/i);

    await page.goto('/vendors');
    await expect(page.locator('body')).not.toContainText(/application error/i);

    await page.goto('/dashboard');
    await page.waitForURL(/\/login/);
    expect(page.url()).toMatch(/\/login/);
  });

  test('vendor profile renders Packages section with seeded package', async ({ page }) => {
    vendor = await seedVendor({ chargesEnabled: true });
    const pkg = await seedPackage(vendor, {
      basePriceCents: 150_000,
      addons: [{ name: 'Drone footage', priceDeltaCents: 50_000 }],
    });

    await page.goto(`/vendors/${vendor.vendorSlug}`);
    // The Packages section header + the seeded package card
    await expect(page.getByRole('heading', { name: /packages/i })).toBeVisible();
    await expect(page.getByText('E2E Package')).toBeVisible();
    // Base price renders as $1,500
    await expect(page.getByText(/\$1,500/)).toBeVisible();
    expect(pkg.id).toBeTruthy();
  });

  test('couple books a package via API, vendor accepts via UI, status flips', async ({
    browser,
  }) => {
    couple = await seedCouple();
    vendor = await seedVendor({ chargesEnabled: true });
    const pkg = await seedPackage(vendor, {
      basePriceCents: 150_000,
      addons: [{ name: 'Drone footage', priceDeltaCents: 50_000 }],
    });

    // ── Couple session: log in + submit booking via API ─────────────────────
    const coupleCtx = await browser.newContext();
    const couplePage = await coupleCtx.newPage();
    await loginAs(couplePage, couple);

    const eventDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const bookingPayload = {
      vendor_profile_id: vendor.vendorProfileId,
      package_id: pkg.id,
      selected_addons: [
        {
          addon_id: pkg.addons[0].id,
          name: pkg.addons[0].name,
          price_delta_cents: pkg.addons[0].price_delta_cents,
        },
      ],
      guest_count: 120,
      special_requests: 'E2E test booking',
      couple_full_name: 'E2E Couple',
      couple_contact_phone: '(312) 555-0100',
      events: [
        {
          sequence: 1,
          event_date: eventDate,
          event_start_time: `${eventDate}T16:00:00Z`,
          event_end_time: `${eventDate}T22:00:00Z`,
          event_type_label: 'Wedding Ceremony',
          location_name: 'The Drake Hotel',
          address_line_1: '140 E Walton Pl',
          city: 'Chicago',
          state: 'IL',
          postal_code: '60611',
          google_place_id: 'e2e_place_id',
          location_overridden: false,
        },
      ],
    };

    const createResponse = await couplePage.request.post('/api/bookings', {
      data: bookingPayload,
    });
    expect(createResponse.status()).toBe(201);
    const createBody = await createResponse.json();
    const bookingId = createBody.data?.booking?.id;
    expect(bookingId).toBeTruthy();

    // Verify DB state — booking row + 1 booking_event + correct total_price_cents
    const supabase = getServiceClient();
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, status, total_price_cents, package_id, package_name_snapshot')
      .eq('couple_user_id', couple.id);
    expect(bookings?.length).toBe(1);
    expect(bookings![0].status).toBe('pending');
    // Trigger: base (150000) + addon (50000) + adjustment (0) = 200000
    expect(bookings![0].total_price_cents).toBe(200_000);
    expect(bookings![0].package_id).toBe(pkg.id);

    const { data: events } = await supabase
      .from('booking_events')
      .select('id, sequence, event_type_label')
      .eq('booking_id', bookingId);
    expect(events?.length).toBe(1);
    expect(events![0].event_type_label).toBe('Wedding Ceremony');

    await coupleCtx.close();

    // ── Vendor session: see booking + accept via UI ─────────────────────────
    const vendorCtx = await browser.newContext();
    const vendorPage = await vendorCtx.newPage();
    await loginAs(vendorPage, vendor);

    await vendorPage.goto(`/dashboard/bookings/${bookingId}`);
    // Vendor banner should say "Action needed" and the Accept button is present
    await expect(vendorPage.getByText(/action needed/i).first()).toBeVisible();

    // Click the "Accept at $X" button (rendered by VendorBookingActions)
    const acceptBtn = vendorPage.getByRole('button', { name: /accept at/i }).first();
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // The accept route may redirect or render a toast — either way, verify DB.
    // Poll for status flip (the route returns quickly; UI may take a moment).
    await expect
      .poll(
        async () => {
          const { data } = await supabase
            .from('bookings')
            .select('status')
            .eq('id', bookingId)
            .single();
          return data?.status;
        },
        { timeout: 10_000, intervals: [500, 1000, 2000] }
      )
      .toBe('accepted');

    await vendorCtx.close();
  });
});
