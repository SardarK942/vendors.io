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

  test('adjust-quote ping-pong: vendor adjusts → couple declines → vendor re-quotes → couple accepts', async ({
    browser,
  }) => {
    couple = await seedCouple();
    vendor = await seedVendor({ chargesEnabled: true });
    const pkg = await seedPackage(vendor, { basePriceCents: 150_000 });
    const supabase = getServiceClient();

    // ── Couple submits a booking ────────────────────────────────────────────
    const coupleCtx = await browser.newContext();
    const couplePage = await coupleCtx.newPage();
    await loginAs(couplePage, couple);

    const eventDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const createRes = await couplePage.request.post('/api/bookings', {
      data: {
        vendor_profile_id: vendor.vendorProfileId,
        package_id: pkg.id,
        selected_addons: [],
        guest_count: 100,
        couple_full_name: 'E2E Couple',
        couple_contact_phone: '(312) 555-0100',
        events: [
          {
            sequence: 1,
            event_date: eventDate,
            event_start_time: `${eventDate}T16:00:00Z`,
            event_end_time: `${eventDate}T22:00:00Z`,
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
    expect(createRes.status()).toBe(201);
    const bookingId = (await createRes.json()).data.booking.id;

    // Status starts at pending
    const { data: initial } = await supabase
      .from('bookings')
      .select('status, total_price_cents, negotiation_round_count')
      .eq('id', bookingId)
      .single();
    expect(initial?.status).toBe('pending');
    expect(initial?.total_price_cents).toBe(150_000);
    expect(initial?.negotiation_round_count).toBe(0);

    // ── Round 1: Vendor adjusts +$200 (travel reason) ───────────────────────
    const vendorCtx = await browser.newContext();
    const vendorPage = await vendorCtx.newPage();
    await loginAs(vendorPage, vendor);

    const adjust1 = await vendorPage.request.post(`/api/bookings/${bookingId}/adjust`, {
      data: {
        adjustment_amount_cents: 20_000,
        reason: 'travel',
        explanation: null,
      },
    });
    expect(adjust1.status()).toBe(200);

    // Verify state: adjusted_quote_sent, total = base + adjustment = 170000, round = 1
    const { data: afterAdjust1 } = await supabase
      .from('bookings')
      .select(
        'status, total_price_cents, adjustment_amount_cents, adjustment_reason, negotiation_round_count'
      )
      .eq('id', bookingId)
      .single();
    expect(afterAdjust1?.status).toBe('adjusted_quote_sent');
    expect(afterAdjust1?.adjustment_amount_cents).toBe(20_000);
    expect(afterAdjust1?.adjustment_reason).toBe('travel');
    expect(afterAdjust1?.total_price_cents).toBe(170_000);
    expect(afterAdjust1?.negotiation_round_count).toBe(1);

    // ── UI assertion: couple's detail page shows the AdjustmentReview ──────
    await couplePage.goto(`/dashboard/bookings/${bookingId}`);
    await expect(couplePage.getByText(/adjusted quote/i).first()).toBeVisible();
    // The reason chip should render (label "Travel distance" per our reason map)
    await expect(couplePage.getByText(/travel/i).first()).toBeVisible();

    // ── Couple declines the adjustment ──────────────────────────────────────
    const decline = await couplePage.request.post(`/api/bookings/${bookingId}/decline-adjusted`);
    expect(decline.status()).toBe(200);

    const { data: afterDecline } = await supabase
      .from('bookings')
      .select('status, expires_at')
      .eq('id', bookingId)
      .single();
    expect(afterDecline?.status).toBe('adjusted_quote_declined');
    expect(afterDecline?.expires_at).toBeTruthy(); // reset to NOW+72h

    // ── Round 2: Vendor sends a revised quote (-$100 discount) ─────────────
    const adjust2 = await vendorPage.request.post(`/api/bookings/${bookingId}/adjust`, {
      data: {
        adjustment_amount_cents: -10_000,
        reason: 'discount',
        explanation: null,
      },
    });
    expect(adjust2.status()).toBe(200);

    const { data: afterAdjust2 } = await supabase
      .from('bookings')
      .select(
        'status, total_price_cents, adjustment_amount_cents, adjustment_reason, negotiation_round_count'
      )
      .eq('id', bookingId)
      .single();
    expect(afterAdjust2?.status).toBe('adjusted_quote_sent');
    expect(afterAdjust2?.adjustment_amount_cents).toBe(-10_000);
    expect(afterAdjust2?.adjustment_reason).toBe('discount');
    // Trigger recomputes: base 150000 + (-10000) = 140000
    expect(afterAdjust2?.total_price_cents).toBe(140_000);
    // Round counter incremented again
    expect(afterAdjust2?.negotiation_round_count).toBe(2);

    // ── Couple accepts the revised quote ────────────────────────────────────
    const accept = await couplePage.request.post(`/api/bookings/${bookingId}/accept-adjusted`);
    expect(accept.status()).toBe(200);

    const { data: final } = await supabase
      .from('bookings')
      .select('status, total_price_cents')
      .eq('id', bookingId)
      .single();
    expect(final?.status).toBe('accepted');
    expect(final?.total_price_cents).toBe(140_000);

    // ── Negative-path: explanation required when reason='other' ────────────
    // (We're past 'accepted' for the main booking, so test the constraint
    // by trying to re-adjust — server should reject the transition AND the
    // missing-explanation case.)
    const badAdjust = await vendorPage.request.post(`/api/bookings/${bookingId}/adjust`, {
      data: { adjustment_amount_cents: 5_000, reason: 'other', explanation: null },
    });
    // Either: 400 (Zod refinement rejects) or 409 (invalid state from 'accepted')
    expect([400, 409]).toContain(badAdjust.status());

    await coupleCtx.close();
    await vendorCtx.close();
  });
});
